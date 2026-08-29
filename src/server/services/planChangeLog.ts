import type { PlanChangeAction } from "@prisma/client";
import { prisma, type Db } from "../db";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatQty } from "@/lib/money";

/**
 * The delivery plan's audit trail.
 *
 * Delivery schedules and payment terms get renegotiated, and months later somebody has
 * to answer "who moved this date, and when?". Every change is appended here with the
 * old and new value; rows are never updated or deleted, so the history survives further
 * edits to the same milestone.
 */

export type PlanChangeEntry = {
  vendorPoId: string;
  planItemId?: string | null;
  action: PlanChangeAction;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  summary: string;
};

export async function logPlanChange(
  entry: PlanChangeEntry,
  userId: string | null,
  db: Db = prisma,
): Promise<void> {
  await db.deliveryPlanChange.create({
    data: {
      vendorPoId: entry.vendorPoId,
      planItemId: entry.planItemId ?? null,
      action: entry.action,
      field: entry.field ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      summary: entry.summary,
      changedById: userId,
    },
  });
}

export async function logPlanChanges(
  entries: PlanChangeEntry[],
  userId: string | null,
  db: Db = prisma,
): Promise<void> {
  if (entries.length === 0) return;
  await db.deliveryPlanChange.createMany({
    data: entries.map((entry) => ({
      vendorPoId: entry.vendorPoId,
      planItemId: entry.planItemId ?? null,
      action: entry.action,
      field: entry.field ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      summary: entry.summary,
      changedById: userId,
    })),
  });
}

type MilestoneSnapshot = {
  id: string;
  seq: number;
  label: string | null;
  plannedDate: Date;
  paymentBasis: string;
  paymentPercent: number | null;
  paymentAmountMinor: number | null;
  paymentDueDays: number;
  quantities: Map<string, number>;
};

/**
 * Compare a milestone before and after an edit and describe exactly what moved.
 *
 * Field-level rather than a blanket "updated": the point of the log is that someone can
 * see the date slipped from the 4th to the 18th, not merely that an edit happened.
 */
export function diffMilestone(
  before: MilestoneSnapshot,
  after: MilestoneSnapshot,
  lineNames: Map<string, string>,
  currency = "USD",
): PlanChangeEntry[] {
  const label = after.label ?? before.label ?? `Delivery ${after.seq}`;
  const changes: PlanChangeEntry[] = [];

  const push = (field: string, oldValue: string, newValue: string, what: string) => {
    changes.push({
      vendorPoId: "", // filled in by the caller, which knows the PO
      planItemId: after.id,
      action: "MILESTONE_UPDATED",
      field,
      oldValue,
      newValue,
      summary: `"${label}": ${what}`,
    });
  };

  if (before.plannedDate.getTime() !== after.plannedDate.getTime()) {
    push(
      "plannedDate",
      before.plannedDate.toISOString(),
      after.plannedDate.toISOString(),
      `date moved from ${formatDate(before.plannedDate)} to ${formatDate(after.plannedDate)}`,
    );
  }

  if ((before.label ?? "") !== (after.label ?? "")) {
    push("label", before.label ?? "", after.label ?? "", `renamed from "${before.label ?? "—"}"`);
  }

  if (before.paymentBasis !== after.paymentBasis) {
    push(
      "paymentBasis",
      before.paymentBasis,
      after.paymentBasis,
      `payment basis changed from ${before.paymentBasis.toLowerCase()} to ${after.paymentBasis.toLowerCase()}`,
    );
  }

  if ((before.paymentPercent ?? null) !== (after.paymentPercent ?? null)) {
    push(
      "paymentPercent",
      String(before.paymentPercent ?? ""),
      String(after.paymentPercent ?? ""),
      `payment changed from ${before.paymentPercent ?? 0}% to ${after.paymentPercent ?? 0}%`,
    );
  }

  if ((before.paymentAmountMinor ?? null) !== (after.paymentAmountMinor ?? null)) {
    push(
      "paymentAmountMinor",
      String(before.paymentAmountMinor ?? ""),
      String(after.paymentAmountMinor ?? ""),
      `payment changed from ${formatMoney(before.paymentAmountMinor ?? 0, currency)} to ${formatMoney(after.paymentAmountMinor ?? 0, currency)}`,
    );
  }

  if (before.paymentDueDays !== after.paymentDueDays) {
    push(
      "paymentDueDays",
      String(before.paymentDueDays),
      String(after.paymentDueDays),
      `payment terms changed from ${before.paymentDueDays} to ${after.paymentDueDays} days`,
    );
  }

  // Quantities, line by line — a schedule change is usually a quantity change.
  const lineIds = new Set([...before.quantities.keys(), ...after.quantities.keys()]);
  for (const lineId of lineIds) {
    const oldQty = before.quantities.get(lineId) ?? 0;
    const newQty = after.quantities.get(lineId) ?? 0;
    if (oldQty === newQty) continue;
    push(
      `quantity:${lineId}`,
      String(oldQty),
      String(newQty),
      `"${lineNames.get(lineId) ?? "line"}" quantity changed from ${formatQty(oldQty)} to ${formatQty(newQty)}`,
    );
  }

  return changes;
}

export type PlanHistoryRow = {
  id: string;
  action: PlanChangeAction;
  summary: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  changedBy: string | null;
};

export async function getPlanHistory(
  vendorPoId: string,
  limit = 100,
  db: Db = prisma,
): Promise<PlanHistoryRow[]> {
  const rows = await db.deliveryPlanChange.findMany({
    where: { vendorPoId },
    include: { changedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    summary: row.summary,
    field: row.field,
    oldValue: row.oldValue,
    newValue: row.newValue,
    createdAt: row.createdAt,
    changedBy: row.changedBy?.name ?? null,
  }));
}
