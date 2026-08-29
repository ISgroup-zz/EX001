import { prisma, type Db } from "../db";
import { lineTotalMinor, roundQty, sumMinor } from "@/lib/money";
import { addMonths, daysBetween, isPast, monthKey, monthLabel, monthRange, startOfDay, today } from "@/lib/dates";

/**
 * Forecasting.
 *
 * Delivery plans are promises with dates on them, which is exactly what a forecast needs:
 * planned value per month on the cost side, the client value of those same deliveries on
 * the revenue side, and expected cash-in once payment terms are applied.
 *
 * Cancelled tranches and unposted (draft) receipts are ignored everywhere here.
 */

export type ForecastBucket = {
  key: string;
  label: string;
  plannedMinor: number;
  actualMinor: number;
};

export type ForecastRange = { from: Date; to: Date };

export function defaultRange(monthsBack = 2, monthsForward = 6): ForecastRange {
  const now = today();
  return { from: addMonths(now, -monthsBack), to: addMonths(now, monthsForward) };
}

function emptyBuckets(range: ForecastRange): Map<string, ForecastBucket> {
  return new Map(
    monthRange(range.from, range.to).map((key) => [key, { key, label: monthLabel(key), plannedMinor: 0, actualMinor: 0 }]),
  );
}

function addToBucket(
  buckets: Map<string, ForecastBucket>,
  date: Date,
  field: "plannedMinor" | "actualMinor",
  amountMinor: number,
): void {
  const bucket = buckets.get(monthKey(date));
  if (bucket) bucket[field] += amountMinor;
}

/**
 * Cost forecast: what we have committed to receive, month by month, against what
 * actually arrived. A tranche still open after its planned date stays in its own month —
 * it is late, not moved.
 */
export async function getDeliveryForecast(
  options: { projectId?: string; range?: ForecastRange } = {},
  db: Db = prisma,
): Promise<ForecastBucket[]> {
  const range = options.range ?? defaultRange();
  const buckets = emptyBuckets(range);
  const projectFilter = options.projectId ? { projectId: options.projectId } : {};

  const planItems = await db.deliveryPlanItem.findMany({
    where: {
      status: { not: "CANCELLED" },
      plannedDate: { gte: range.from, lte: range.to },
      vendorPo: { status: { not: "CANCELLED" }, ...projectFilter },
    },
    include: { lines: { include: { vendorPoLine: { select: { unitCostMinor: true } } } } },
  });

  for (const item of planItems) {
    const value = sumMinor(
      item.lines.map((line) => lineTotalMinor(line.plannedQuantity, line.vendorPoLine.unitCostMinor)),
    );
    addToBucket(buckets, item.plannedDate, "plannedMinor", value);
  }

  const grns = await db.gRN.findMany({
    where: {
      status: "POSTED",
      receivedDate: { gte: range.from, lte: range.to },
      vendorPo: projectFilter,
    },
    include: { lines: { include: { vendorPoLine: { select: { unitCostMinor: true } } } } },
  });

  for (const grn of grns) {
    const value = sumMinor(
      grn.lines.map((line) => lineTotalMinor(line.quantityAccepted, line.vendorPoLine.unitCostMinor)),
    );
    addToBucket(buckets, grn.receivedDate, "actualMinor", value);
  }

  return [...buckets.values()];
}

/**
 * Revenue forecast: the CLIENT value of planned deliveries (via the client line each
 * vendor line is linked to) against what has actually been invoiced.
 */
export async function getBillingForecast(
  options: { projectId?: string; range?: ForecastRange } = {},
  db: Db = prisma,
): Promise<ForecastBucket[]> {
  const range = options.range ?? defaultRange();
  const buckets = emptyBuckets(range);
  const projectFilter = options.projectId ? { projectId: options.projectId } : {};

  const planItems = await db.deliveryPlanItem.findMany({
    where: {
      status: { not: "CANCELLED" },
      plannedDate: { gte: range.from, lte: range.to },
      vendorPo: { status: { not: "CANCELLED" }, ...projectFilter },
    },
    include: {
      lines: {
        include: {
          vendorPoLine: {
            select: {
              unitCostMinor: true,
              clientAgreementLine: { select: { unitPriceMinor: true } },
            },
          },
        },
      },
    },
  });

  for (const item of planItems) {
    const value = sumMinor(
      item.lines.map((line) =>
        lineTotalMinor(
          line.plannedQuantity,
          // Unlinked lines have no client price; fall back to cost so the forecast
          // shows the delivery rather than silently dropping it.
          line.vendorPoLine.clientAgreementLine?.unitPriceMinor ?? line.vendorPoLine.unitCostMinor,
        ),
      ),
    );
    addToBucket(buckets, item.plannedDate, "plannedMinor", value);
  }

  const invoices = await db.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] },
      issueDate: { gte: range.from, lte: range.to },
      ...projectFilter,
    },
    select: { issueDate: true, subtotalMinor: true },
  });

  for (const invoice of invoices) {
    addToBucket(buckets, invoice.issueDate, "actualMinor", invoice.subtotalMinor);
  }

  return [...buckets.values()];
}

/** Cash-in: invoice due dates as expected, payments as actual. */
export async function getCashForecast(
  options: { projectId?: string; range?: ForecastRange } = {},
  db: Db = prisma,
): Promise<ForecastBucket[]> {
  const range = options.range ?? defaultRange();
  const buckets = emptyBuckets(range);
  const projectFilter = options.projectId ? { projectId: options.projectId } : {};

  const invoices = await db.invoice.findMany({
    where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, ...projectFilter },
    include: { payments: { select: { amountMinor: true } } },
  });

  for (const invoice of invoices) {
    const outstanding = invoice.totalMinor - sumMinor(invoice.payments.map((payment) => payment.amountMinor));
    if (outstanding <= 0) continue;
    const due = invoice.dueDate ?? invoice.issueDate;
    addToBucket(buckets, due, "plannedMinor", outstanding);
  }

  const payments = await db.payment.findMany({
    where: { paidDate: { gte: range.from, lte: range.to }, invoice: projectFilter },
    select: { paidDate: true, amountMinor: true },
  });

  for (const payment of payments) {
    addToBucket(buckets, payment.paidDate, "actualMinor", payment.amountMinor);
  }

  return [...buckets.values()];
}

// ---------------------------------------------------------------- the PM work queue

export type UpcomingDelivery = {
  planItemId: string;
  vendorPoId: string;
  poNumber: string;
  vendorName: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  currency: string;
  label: string;
  plannedDate: Date;
  status: string;
  isOverdue: boolean;
  daysAway: number;
  valueMinor: number;
  outstandingQty: number;
};

/**
 * Every open tranche, soonest first. This is the list a PM works from — each row is
 * one click from a pre-filled receipt.
 */
export async function getUpcomingDeliveries(
  options: { projectId?: string; withinDays?: number; includeOverdue?: boolean; limit?: number } = {},
  db: Db = prisma,
): Promise<UpcomingDelivery[]> {
  const reference = today();
  const horizon = options.withinDays ?? 90;
  const projectFilter = options.projectId ? { projectId: options.projectId } : {};

  const items = await db.deliveryPlanItem.findMany({
    where: {
      status: { in: ["PLANNED", "PARTIAL"] },
      plannedDate: { lte: startOfDay(new Date(reference.getTime() + horizon * 86_400_000)) },
      vendorPo: { status: { notIn: ["CANCELLED", "CLOSED"] }, ...projectFilter },
    },
    include: {
      lines: { include: { vendorPoLine: { select: { unitCostMinor: true } } } },
      grns: { where: { status: "POSTED" }, include: { lines: true } },
      vendorPo: {
        select: {
          id: true,
          poNumber: true,
          vendor: { select: { name: true } },
          project: { select: { id: true, name: true, code: true, currency: true } },
        },
      },
    },
    orderBy: { plannedDate: "asc" },
    take: options.limit ?? 200,
  });

  return items
    .map((item) => {
      const received = new Map<string, number>();
      for (const grn of item.grns) {
        for (const line of grn.lines) {
          received.set(line.vendorPoLineId, roundQty((received.get(line.vendorPoLineId) ?? 0) + line.quantityAccepted));
        }
      }

      const outstandingQty = roundQty(
        item.lines.reduce(
          (sum, line) => sum + Math.max(0, line.plannedQuantity - (received.get(line.vendorPoLineId) ?? 0)),
          0,
        ),
      );
      const valueMinor = sumMinor(
        item.lines.map((line) =>
          lineTotalMinor(
            Math.max(0, line.plannedQuantity - (received.get(line.vendorPoLineId) ?? 0)),
            line.vendorPoLine.unitCostMinor,
          ),
        ),
      );

      return {
        planItemId: item.id,
        vendorPoId: item.vendorPo.id,
        poNumber: item.vendorPo.poNumber,
        vendorName: item.vendorPo.vendor.name,
        projectId: item.vendorPo.project.id,
        projectName: item.vendorPo.project.name,
        projectCode: item.vendorPo.project.code,
        currency: item.vendorPo.project.currency,
        label: item.label ?? `Delivery ${item.seq}`,
        plannedDate: item.plannedDate,
        status: item.status,
        isOverdue: isPast(item.plannedDate, reference),
        daysAway: daysBetween(reference, item.plannedDate),
        valueMinor,
        outstandingQty,
      };
    })
    .filter((item) => (options.includeOverdue === false ? !item.isOverdue : true));
}

export type ScheduleHealth = {
  overdueCount: number;
  overdueValueMinor: number;
  dueNext7: number;
  dueNext30: number;
  averageSlipDays: number | null;
  onTimePct: number | null;
  receiptsMeasured: number;
};

/** How well deliveries are actually tracking the plan. */
export async function getScheduleHealth(
  options: { projectId?: string } = {},
  db: Db = prisma,
): Promise<ScheduleHealth> {
  const upcoming = await getUpcomingDeliveries({ projectId: options.projectId, withinDays: 3650 }, db);
  const overdue = upcoming.filter((item) => item.isOverdue);

  const posted = await db.gRN.findMany({
    where: {
      status: "POSTED",
      deliveryPlanItemId: { not: null },
      ...(options.projectId ? { vendorPo: { projectId: options.projectId } } : {}),
    },
    select: { receivedDate: true, deliveryPlanItem: { select: { plannedDate: true } } },
  });

  const slips = posted
    .filter((grn) => grn.deliveryPlanItem)
    .map((grn) => daysBetween(grn.deliveryPlanItem!.plannedDate, grn.receivedDate));

  return {
    overdueCount: overdue.length,
    overdueValueMinor: sumMinor(overdue.map((item) => item.valueMinor)),
    dueNext7: upcoming.filter((item) => !item.isOverdue && item.daysAway <= 7).length,
    dueNext30: upcoming.filter((item) => !item.isOverdue && item.daysAway <= 30).length,
    averageSlipDays: slips.length ? slips.reduce((sum, slip) => sum + slip, 0) / slips.length : null,
    onTimePct: slips.length ? (slips.filter((slip) => slip <= 0).length / slips.length) * 100 : null,
    receiptsMeasured: slips.length,
  };
}

export type VendorPerformance = {
  vendorId: string;
  vendorName: string;
  receipts: number;
  onTimePct: number;
  averageSlipDays: number;
};

export async function getVendorPerformance(db: Db = prisma): Promise<VendorPerformance[]> {
  const grns = await db.gRN.findMany({
    where: { status: "POSTED", deliveryPlanItemId: { not: null } },
    select: {
      receivedDate: true,
      deliveryPlanItem: { select: { plannedDate: true } },
      vendorPo: { select: { vendor: { select: { id: true, name: true } } } },
    },
  });

  const byVendor = new Map<string, { name: string; slips: number[] }>();
  for (const grn of grns) {
    if (!grn.deliveryPlanItem) continue;
    const vendor = grn.vendorPo.vendor;
    const entry = byVendor.get(vendor.id) ?? { name: vendor.name, slips: [] };
    entry.slips.push(daysBetween(grn.deliveryPlanItem.plannedDate, grn.receivedDate));
    byVendor.set(vendor.id, entry);
  }

  return [...byVendor.entries()]
    .map(([vendorId, entry]) => ({
      vendorId,
      vendorName: entry.name,
      receipts: entry.slips.length,
      onTimePct: (entry.slips.filter((slip) => slip <= 0).length / entry.slips.length) * 100,
      averageSlipDays: entry.slips.reduce((sum, slip) => sum + slip, 0) / entry.slips.length,
    }))
    .sort((a, b) => b.receipts - a.receipts);
}
