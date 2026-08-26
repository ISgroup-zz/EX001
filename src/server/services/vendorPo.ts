import { prisma, type Db } from "../db";
import { nextDocumentNumber } from "../numbering";
import { roundQty, totalsForLines } from "@/lib/money";
import type { VendorPoInput } from "@/lib/validation/schemas";
import { createPlanItems, generateDefaultPlan, getPoCoverage, type PlanItemInput } from "./deliveryPlan";

/**
 * Vendor purchase orders — the cost side.
 *
 * Lines usually come from the client document (see `getOrderableAgreementLines`), which
 * both saves the PM typing and sets the client-line link that later makes billing automatic.
 */

export async function createVendorPo(input: VendorPoInput, db: Db = prisma): Promise<{ id: string; poNumber: string }> {
  const project = await db.project.findUnique({ where: { id: input.projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found.");

  const poNumber = input.poNumber ?? (await nextDocumentNumber(db, "PO", input.issueDate));
  const duplicate = await db.vendorPO.findUnique({ where: { poNumber }, select: { id: true } });
  if (duplicate) throw new Error(`Purchase order number ${poNumber} is already in use.`);

  const po = await db.vendorPO.create({
    data: {
      projectId: input.projectId,
      vendorId: input.vendorId,
      clientAgreementId: input.clientAgreementId,
      poNumber,
      status: "ISSUED",
      issueDate: input.issueDate,
      expectedDeliveryDate: input.expectedDeliveryDate,
      notes: input.notes,
      lines: {
        create: input.lines.map((line, index) => ({
          lineNo: index + 1,
          description: line.description,
          uom: line.uom || "EA",
          quantity: line.quantity,
          unitCostMinor: line.unitCostMinor,
          taxRatePct: line.taxRatePct,
          clientAgreementLineId: line.clientAgreementLineId,
          notes: line.notes,
        })),
      },
    },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });

  // Map the submitted plan (which addresses lines by position) onto the saved line ids.
  const planItems: PlanItemInput[] = input.planItems.map((item) => ({
    label: item.label,
    plannedDate: item.plannedDate,
    notes: item.notes,
    quantities: po.lines.map((line, index) => ({
      vendorPoLineId: line.id,
      quantity: item.quantities[index] ?? 0,
    })),
  }));

  const plan =
    planItems.length > 0
      ? planItems
      : // No plan entered: assume one delivery of everything on the expected date.
        generateDefaultPlan(
          po.lines.map((line) => ({ vendorPoLineId: line.id, quantity: line.quantity })),
          input.expectedDeliveryDate ?? input.issueDate,
        );

  await createPlanItems(po.id, plan, db);

  return { id: po.id, poNumber: po.poNumber };
}

export async function cancelVendorPo(vendorPoId: string, db: Db = prisma): Promise<void> {
  const posted = await db.gRN.count({ where: { vendorPoId, status: "POSTED" } });
  if (posted > 0) throw new Error("Goods have been received against this purchase order — it cannot be cancelled.");
  await db.vendorPO.update({ where: { id: vendorPoId }, data: { status: "CANCELLED" } });
  await db.deliveryPlanItem.updateMany({ where: { vendorPoId }, data: { status: "CANCELLED" } });
}

export async function closeVendorPo(vendorPoId: string, db: Db = prisma): Promise<void> {
  await db.vendorPO.update({ where: { id: vendorPoId }, data: { status: "CLOSED" } });
}

/** Recompute ISSUED / PARTIALLY_RECEIVED / RECEIVED from what has actually been received. */
export async function refreshVendorPoStatus(vendorPoId: string, db: Db = prisma): Promise<void> {
  const po = await db.vendorPO.findUnique({ where: { id: vendorPoId }, select: { status: true } });
  if (!po || po.status === "CANCELLED" || po.status === "CLOSED" || po.status === "DRAFT") return;

  const coverage = await getPoCoverage(vendorPoId, db);
  const anyReceived = coverage.some((line) => line.receivedQty > 0);
  const allReceived = coverage.length > 0 && coverage.every((line) => line.receivedQty >= line.orderedQty);

  const status = allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "ISSUED";
  if (status !== po.status) {
    await db.vendorPO.update({ where: { id: vendorPoId }, data: { status } });
  }
}

export async function getVendorPoDetail(vendorPoId: string, db: Db = prisma) {
  const po = await db.vendorPO.findUnique({
    where: { id: vendorPoId },
    include: {
      vendor: true,
      project: { select: { id: true, name: true, code: true, currency: true } },
      clientAgreement: { select: { id: true, reference: true, type: true } },
      lines: {
        orderBy: { lineNo: "asc" },
        include: { clientAgreementLine: { select: { id: true, description: true, agreement: { select: { reference: true } } } } },
      },
      grns: {
        orderBy: { receivedDate: "desc" },
        include: { lines: true, deliveryPlanItem: { select: { id: true, seq: true, label: true } } },
      },
    },
  });
  if (!po) return null;

  const totals = totalsForLines(
    po.lines.map((line) => ({ quantity: line.quantity, unitPriceMinor: line.unitCostMinor, taxRatePct: line.taxRatePct })),
  );

  return { ...po, totals, coverage: await getPoCoverage(vendorPoId, db) };
}

export async function listVendorPos(projectId: string, db: Db = prisma) {
  const pos = await db.vendorPO.findMany({
    where: { projectId },
    include: {
      vendor: { select: { id: true, name: true } },
      lines: true,
      planItems: { where: { status: { not: "CANCELLED" } }, select: { id: true, plannedDate: true, status: true } },
    },
    orderBy: { issueDate: "desc" },
  });

  return pos.map((po) => ({
    ...po,
    totals: totalsForLines(
      po.lines.map((line) => ({ quantity: line.quantity, unitPriceMinor: line.unitCostMinor, taxRatePct: line.taxRatePct })),
    ),
    nextDelivery: po.planItems
      .filter((item) => item.status !== "FULFILLED")
      .sort((a, b) => a.plannedDate.getTime() - b.plannedDate.getTime())[0]?.plannedDate ?? null,
  }));
}

export type OrderableAgreementLine = {
  clientAgreementLineId: string;
  agreementId: string;
  agreementReference: string;
  agreementType: string;
  lineNo: number;
  description: string;
  uom: string;
  clientQty: number;
  orderedQty: number;
  outstandingQty: number;
  clientUnitPriceMinor: number;
};

/**
 * The client lines a PM can pull into a vendor PO, with how much of each is still
 * unordered. Ticking these is the fast path — it fills the line AND sets the link
 * that makes the invoice self-populate later.
 */
export async function getOrderableAgreementLines(
  projectId: string,
  db: Db = prisma,
): Promise<OrderableAgreementLine[]> {
  const agreements = await db.clientAgreement.findMany({
    where: { projectId, status: { notIn: ["CANCELLED", "DRAFT"] } },
    include: {
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          vendorPoLines: {
            where: { vendorPo: { status: { notIn: ["CANCELLED"] } } },
            select: { quantity: true },
          },
        },
      },
    },
    orderBy: { issueDate: "asc" },
  });

  const result: OrderableAgreementLine[] = [];
  for (const agreement of agreements) {
    for (const line of agreement.lines) {
      const orderedQty = roundQty(line.vendorPoLines.reduce((sum, poLine) => sum + poLine.quantity, 0));
      result.push({
        clientAgreementLineId: line.id,
        agreementId: agreement.id,
        agreementReference: agreement.reference,
        agreementType: agreement.type,
        lineNo: line.lineNo,
        description: line.description,
        uom: line.uom,
        clientQty: roundQty(line.quantity),
        orderedQty,
        outstandingQty: roundQty(Math.max(0, line.quantity - orderedQty)),
        clientUnitPriceMinor: line.unitPriceMinor,
      });
    }
  }
  return result;
}

/** Committed cost: the value of every live vendor PO on a project. */
export async function getCommittedCostMinor(projectId: string, db: Db = prisma): Promise<number> {
  const lines = await db.vendorPOLine.findMany({
    where: { vendorPo: { projectId, status: { notIn: ["CANCELLED"] } } },
    select: { quantity: true, unitCostMinor: true },
  });
  return totalsForLines(lines.map((line) => ({ quantity: line.quantity, unitPriceMinor: line.unitCostMinor }))).subtotalMinor;
}

/** Value actually received (accepted GRN quantities × unit cost). */
export async function getReceivedCostMinor(projectId: string, db: Db = prisma): Promise<number> {
  const grnLines = await db.gRNLine.findMany({
    where: { grn: { status: "POSTED", vendorPo: { projectId } } },
    select: { quantityAccepted: true, vendorPoLine: { select: { unitCostMinor: true } } },
  });
  return totalsForLines(
    grnLines.map((line) => ({ quantity: line.quantityAccepted, unitPriceMinor: line.vendorPoLine.unitCostMinor })),
  ).subtotalMinor;
}
