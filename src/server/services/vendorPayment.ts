import type { PaymentBasis } from "@prisma/client";
import { prisma, type Db } from "../db";
import { addDays, isPast, today } from "@/lib/dates";
import { formatMoney, percentOf, sumMinor, totalsForLines } from "@/lib/money";

/**
 * Milestone payments — what we owe the vendor, and when.
 *
 * Each delivery milestone carries payment terms expressed either as a **percentage** of
 * the PO value or as a **fixed amount**. A percentage is deliberately not stored as a
 * figure: it is derived from the PO's current net total every time it is read, so
 * revising a line price cannot leave a payment schedule quietly disagreeing with the
 * order it belongs to. A fixed amount is stored as entered, which is what makes it
 * suitable for a mobilisation fee that should not move with the order.
 *
 * Money owed becomes payable when the milestone is actually met (its GRN is posted),
 * plus the milestone's payment terms in days — not when it was merely planned.
 */

export type MilestonePayment = {
  planItemId: string;
  seq: number;
  label: string;
  plannedDate: Date;
  status: string;
  basis: PaymentBasis;
  /** Present when the basis is PERCENTAGE. */
  percent: number | null;
  /** What is owed for this milestone, derived for percentages. */
  dueMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  /** Null until the milestone is fulfilled — nothing is payable before then. */
  payableFrom: Date | null;
  /** When the goods actually arrived, which is what payment terms run from. */
  fulfilledOn: Date | null;
  isPayable: boolean;
  isOverdue: boolean;
  paymentDueDays: number;
};

export type PaymentSchedule = {
  poNetMinor: number;
  scheduledMinor: number;
  /** Positive when the schedule covers less than the PO, negative when it exceeds it. */
  unscheduledMinor: number;
  paidMinor: number;
  payableNowMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  milestones: MilestonePayment[];
};

/** The PO's net value — the base every percentage is taken from. */
export async function getPoNetMinor(vendorPoId: string, db: Db = prisma): Promise<number> {
  const lines = await db.vendorPOLine.findMany({
    where: { vendorPoId },
    select: { quantity: true, unitCostMinor: true },
  });
  return totalsForLines(lines.map((line) => ({ quantity: line.quantity, unitPriceMinor: line.unitCostMinor })))
    .subtotalMinor;
}

/** What one milestone is worth, given the PO value its percentage applies to. */
export function milestoneDueMinor(
  item: { paymentBasis: PaymentBasis; paymentPercent: number | null; paymentAmountMinor: number | null },
  poNetMinor: number,
): number {
  if (item.paymentBasis === "FIXED") return Math.round(item.paymentAmountMinor ?? 0);
  return Math.round((poNetMinor * (item.paymentPercent ?? 0)) / 100);
}

export async function getPaymentSchedule(vendorPoId: string, db: Db = prisma): Promise<PaymentSchedule> {
  const [poNetMinor, items] = await Promise.all([
    getPoNetMinor(vendorPoId, db),
    db.deliveryPlanItem.findMany({
      where: { vendorPoId },
      include: {
        payments: { select: { amountMinor: true } },
        // The last posted receipt is the milestone's actual delivery date.
        grns: { where: { status: "POSTED" }, select: { receivedDate: true }, orderBy: { receivedDate: "desc" }, take: 1 },
      },
      orderBy: [{ plannedDate: "asc" }, { seq: "asc" }],
    }),
  ]);

  const reference = today();

  const milestones: MilestonePayment[] = items.map((item) => {
    const dueMinor = item.status === "CANCELLED" ? 0 : milestoneDueMinor(item, poNetMinor);
    const paidMinor = sumMinor(item.payments.map((payment) => payment.amountMinor));

    // Payable only once the goods have actually arrived, then after the agreed terms.
    // Terms run from the *actual* delivery date: rescheduling a milestone after the
    // goods have landed must not move money that is already owed.
    const isFulfilled = item.status === "FULFILLED";
    const fulfilledOn = item.grns[0]?.receivedDate ?? null;
    const payableFrom = isFulfilled ? addDays(fulfilledOn ?? item.plannedDate, item.paymentDueDays) : null;

    return {
      planItemId: item.id,
      seq: item.seq,
      label: item.label ?? `Delivery ${item.seq}`,
      plannedDate: item.plannedDate,
      status: item.status,
      basis: item.paymentBasis,
      percent: item.paymentBasis === "PERCENTAGE" ? item.paymentPercent : null,
      dueMinor,
      paidMinor,
      outstandingMinor: Math.max(0, dueMinor - paidMinor),
      payableFrom,
      fulfilledOn,
      isPayable: isFulfilled && dueMinor > paidMinor,
      isOverdue: Boolean(payableFrom && isPast(payableFrom, reference) && dueMinor > paidMinor),
      paymentDueDays: item.paymentDueDays,
    };
  });

  const scheduledMinor = sumMinor(milestones.map((m) => m.dueMinor));

  return {
    poNetMinor,
    scheduledMinor,
    unscheduledMinor: poNetMinor - scheduledMinor,
    paidMinor: sumMinor(milestones.map((m) => m.paidMinor)),
    payableNowMinor: sumMinor(milestones.filter((m) => m.isPayable).map((m) => m.outstandingMinor)),
    outstandingMinor: sumMinor(milestones.map((m) => m.outstandingMinor)),
    overdueMinor: sumMinor(milestones.filter((m) => m.isOverdue).map((m) => m.outstandingMinor)),
    milestones,
  };
}

export type MilestonePaymentInput = {
  basis: PaymentBasis;
  percent?: number | null;
  amountMinor?: number | null;
  dueDays?: number;
};

/**
 * A payment schedule may not promise the vendor more than the order is worth.
 *
 * Under-scheduling is allowed — a schedule is often agreed before every line is priced —
 * but it is surfaced in the UI rather than silently accepted.
 *
 * Each milestone's amount is rounded to the minor unit independently, so a schedule
 * that is exactly 100% on paper can land a unit or two above the order: three
 * milestones of 33.333% each round up. One minor unit per milestone is allowed for
 * that, since blocking an honest thirds-split over a cent is worse than the cent.
 */
export function assertScheduleWithinPoValue(
  milestones: MilestonePaymentInput[],
  poNetMinor: number,
): void {
  const scheduled = sumMinor(
    milestones.map((m) =>
      milestoneDueMinor(
        { paymentBasis: m.basis, paymentPercent: m.percent ?? null, paymentAmountMinor: m.amountMinor ?? null },
        poNetMinor,
      ),
    ),
  );

  const roundingTolerance = milestones.length;
  if (scheduled > poNetMinor + roundingTolerance) {
    throw new Error(
      `The payment schedule totals ${(scheduled / 100).toFixed(2)}, more than the order value of ${(poNetMinor / 100).toFixed(2)}.`,
    );
  }

  for (const milestone of milestones) {
    if (milestone.basis === "PERCENTAGE" && (milestone.percent ?? 0) < 0) {
      throw new Error("A milestone percentage cannot be negative.");
    }
    if (milestone.basis === "FIXED" && (milestone.amountMinor ?? 0) < 0) {
      throw new Error("A milestone payment cannot be negative.");
    }
    if ((milestone.dueDays ?? 0) < 0) {
      throw new Error("Payment terms cannot be a negative number of days.");
    }
  }
}

/** Record money actually paid to the vendor against a milestone. */
export async function recordVendorPayment(
  input: {
    planItemId: string;
    amountMinor: number;
    paidDate: Date;
    method: string | null;
    reference: string | null;
    notes: string | null;
  },
  userId: string | null,
  db: Db = prisma,
): Promise<void> {
  if (input.amountMinor <= 0) throw new Error("Enter a payment amount.");

  const item = await db.deliveryPlanItem.findUnique({
    where: { id: input.planItemId },
    include: {
      payments: { select: { amountMinor: true } },
      vendorPo: { select: { project: { select: { currency: true } } } },
    },
  });
  if (!item) throw new Error("Milestone not found.");
  if (item.status === "CANCELLED") throw new Error("This milestone has been cancelled.");

  const poNetMinor = await getPoNetMinor(item.vendorPoId, db);
  const dueMinor = milestoneDueMinor(item, poNetMinor);
  const alreadyPaid = sumMinor(item.payments.map((payment) => payment.amountMinor));

  if (alreadyPaid + input.amountMinor > dueMinor) {
    throw new Error(
      `That is more than the ${((dueMinor - alreadyPaid) / 100).toFixed(2)} still owed on this milestone.`,
    );
  }

  await db.vendorPayment.create({
    data: {
      planItemId: input.planItemId,
      vendorPoId: item.vendorPoId,
      amountMinor: input.amountMinor,
      paidDate: input.paidDate,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      recordedById: userId,
    },
  });

  const { logPlanChange } = await import("./planChangeLog");
  await logPlanChange(
    {
      vendorPoId: item.vendorPoId,
      planItemId: item.id,
      action: "PAYMENT_RECORDED",
      summary: `Paid ${formatMoney(input.amountMinor, item.vendorPo.project.currency)} against "${item.label ?? `Delivery ${item.seq}`}"`,
      newValue: String(input.amountMinor),
    },
    userId,
    db,
  );
}

/** Vendor payables across a project — the money-out counterpart to the receivables. */
export async function getProjectPayables(projectId: string, db: Db = prisma) {
  const pos = await db.vendorPO.findMany({
    where: { projectId, status: { not: "CANCELLED" } },
    select: { id: true },
  });

  const schedules = await Promise.all(pos.map((po) => getPaymentSchedule(po.id, db)));

  return {
    scheduledMinor: sumMinor(schedules.map((s) => s.scheduledMinor)),
    paidMinor: sumMinor(schedules.map((s) => s.paidMinor)),
    outstandingMinor: sumMinor(schedules.map((s) => s.outstandingMinor)),
    payableNowMinor: sumMinor(schedules.map((s) => s.payableNowMinor)),
    overdueMinor: sumMinor(schedules.map((s) => s.overdueMinor)),
  };
}

/** Share of the schedule already paid, for a progress bar. */
export function paidPct(schedule: PaymentSchedule): number {
  return percentOf(schedule.paidMinor, schedule.scheduledMinor);
}
