import type { AgreementStatus, AgreementType, ClientAgreement, ClientAgreementLine } from "@prisma/client";
import { prisma, type Db } from "../db";
import { sumMinor, totalsForLines } from "@/lib/money";

/**
 * The project budget.
 *
 * A project is opened on a client document and grows as more arrive. Budget is always
 * DERIVED from the agreements — there is no stored balance to drift out of sync.
 *
 *   PO         → adds its net line total
 *   CONTRACT   → adds its net line total, or its declared value when entered without lines
 *   FRAMEWORK  → adds its ceiling (declaredValue); its call-off POs add nothing further
 *   VARIATION  → adds its delta, which may be negative
 *
 * Budget figures are NET of tax: tax is not money we get to spend.
 */

export type AgreementWithLines = ClientAgreement & { lines: ClientAgreementLine[] };

/** Statuses that represent a real commitment. Drafts and cancellations contribute nothing. */
const COMMITTED_STATUSES: AgreementStatus[] = ["ACTIVE", "EXHAUSTED", "EXPIRED", "CLOSED"];

export function isCommitted(agreement: Pick<ClientAgreement, "status">): boolean {
  return COMMITTED_STATUSES.includes(agreement.status);
}

/** The value of a single document, ignoring its role in the hierarchy. */
export function agreementValueMinor(agreement: AgreementWithLines): number {
  if (agreement.type === "FRAMEWORK") {
    return agreement.declaredValueMinor ?? 0;
  }
  if (agreement.lines.length > 0) {
    return totalsForLines(
      agreement.lines.map((line) => ({
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        taxRatePct: line.taxRatePct,
      })),
    ).subtotalMinor;
  }
  return agreement.declaredValueMinor ?? 0;
}

/**
 * A call-off is a PO issued under a framework. Its value was already counted in the
 * framework's ceiling, so it must not raise the budget a second time — it draws the
 * ceiling down instead.
 */
export function isCallOff(
  agreement: Pick<ClientAgreement, "type" | "parentAgreementId">,
  parentType: AgreementType | null | undefined,
): boolean {
  return agreement.type === "PO" && agreement.parentAgreementId !== null && parentType === "FRAMEWORK";
}

/** What this document adds to (or takes off) the project budget. */
export function budgetDeltaMinor(
  agreement: AgreementWithLines,
  parentType: AgreementType | null | undefined,
): number {
  if (!isCommitted(agreement)) return 0;
  if (isCallOff(agreement, parentType)) return 0;
  return agreementValueMinor(agreement);
}

export async function loadProjectAgreements(projectId: string, db: Db = prisma) {
  return db.clientAgreement.findMany({
    where: { projectId },
    include: { lines: { orderBy: { lineNo: "asc" } }, parentAgreement: { select: { id: true, type: true, reference: true } } },
    orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }],
  });
}

type LoadedAgreement = Awaited<ReturnType<typeof loadProjectAgreements>>[number];

export type BudgetTimelineEntry = {
  agreementId: string;
  reference: string;
  title: string | null;
  type: AgreementType;
  status: AgreementStatus;
  issueDate: Date;
  isCallOff: boolean;
  isOriginating: boolean;
  parentReference: string | null;
  valueMinor: number;
  deltaMinor: number;
  runningBudgetMinor: number;
};

/**
 * Every client document in date order with its effect on the budget and the running
 * total after it — so "budget went from X to Y when PO-123 arrived" is visible at a glance.
 */
export async function getBudgetTimeline(projectId: string, db: Db = prisma): Promise<BudgetTimelineEntry[]> {
  const [agreements, project] = await Promise.all([
    loadProjectAgreements(projectId, db),
    db.project.findUnique({ where: { id: projectId }, select: { originatingAgreementId: true } }),
  ]);

  let running = 0;
  return agreements.map((agreement) => {
    const delta = budgetDeltaMinor(agreement, agreement.parentAgreement?.type);
    running += delta;
    return {
      agreementId: agreement.id,
      reference: agreement.reference,
      title: agreement.title,
      type: agreement.type,
      status: agreement.status,
      issueDate: agreement.issueDate,
      isCallOff: isCallOff(agreement, agreement.parentAgreement?.type),
      isOriginating: project?.originatingAgreementId === agreement.id,
      parentReference: agreement.parentAgreement?.reference ?? null,
      valueMinor: agreementValueMinor(agreement),
      deltaMinor: delta,
      runningBudgetMinor: running,
    };
  });
}

export function budgetFromAgreements(agreements: LoadedAgreement[]): number {
  return sumMinor(agreements.map((a) => budgetDeltaMinor(a, a.parentAgreement?.type)));
}

export async function getProjectBudgetMinor(projectId: string, db: Db = prisma): Promise<number> {
  return budgetFromAgreements(await loadProjectAgreements(projectId, db));
}

// ---------------------------------------------------------------- framework ceilings

export type FrameworkUsage = {
  ceilingMinor: number;
  calledOffMinor: number;
  remainingMinor: number;
  usedPct: number;
  callOffs: Array<{ id: string; reference: string; valueMinor: number; status: AgreementStatus }>;
};

/** How much of a framework's ceiling its call-off POs have consumed. */
export async function getFrameworkUsage(frameworkId: string, db: Db = prisma): Promise<FrameworkUsage> {
  const framework = await db.clientAgreement.findUnique({
    where: { id: frameworkId },
    include: {
      lines: true,
      children: { include: { lines: true } },
    },
  });
  if (!framework || framework.type !== "FRAMEWORK") {
    throw new Error("Framework agreement not found.");
  }

  const callOffs = framework.children
    .filter((child) => child.type === "PO" && isCommitted(child))
    .map((child) => ({
      id: child.id,
      reference: child.reference,
      valueMinor: agreementValueMinor(child),
      status: child.status,
    }));

  const ceilingMinor = framework.declaredValueMinor ?? 0;
  const calledOffMinor = sumMinor(callOffs.map((c) => c.valueMinor));
  return {
    ceilingMinor,
    calledOffMinor,
    remainingMinor: ceilingMinor - calledOffMinor,
    usedPct: ceilingMinor ? (calledOffMinor / ceilingMinor) * 100 : 0,
    callOffs,
  };
}

/**
 * Guard for adding or editing a call-off. Rejects anything that would overrun the
 * ceiling, and marks the framework EXHAUSTED once it is fully drawn down.
 */
export async function assertCallOffFitsCeiling(
  frameworkId: string,
  valueMinor: number,
  options: { excludeAgreementId?: string } = {},
  db: Db = prisma,
): Promise<void> {
  const usage = await getFrameworkUsage(frameworkId, db);
  let calledOff = usage.calledOffMinor;
  if (options.excludeAgreementId) {
    const existing = usage.callOffs.find((c) => c.id === options.excludeAgreementId);
    if (existing) calledOff -= existing.valueMinor;
  }
  const remaining = usage.ceilingMinor - calledOff;
  if (valueMinor > remaining) {
    throw new Error(
      `This call-off is more than the framework has left. Ceiling remaining: ${(remaining / 100).toFixed(2)}, this call-off: ${(valueMinor / 100).toFixed(2)}.`,
    );
  }
}

/** Flip a framework to EXHAUSTED (or back to ACTIVE) after its call-offs change. */
export async function refreshFrameworkStatus(frameworkId: string, db: Db = prisma): Promise<void> {
  const framework = await db.clientAgreement.findUnique({ where: { id: frameworkId } });
  if (!framework || framework.type !== "FRAMEWORK") return;
  if (framework.status === "CANCELLED" || framework.status === "CLOSED" || framework.status === "DRAFT") return;

  const usage = await getFrameworkUsage(frameworkId, db);
  const exhausted = usage.ceilingMinor > 0 && usage.remainingMinor <= 0;
  const nextStatus: AgreementStatus = exhausted ? "EXHAUSTED" : "ACTIVE";
  if (framework.status !== nextStatus) {
    await db.clientAgreement.update({ where: { id: frameworkId }, data: { status: nextStatus } });
  }
}
