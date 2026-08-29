import { prisma, type Db } from "../db";
import { nextDocumentNumber } from "../numbering";
import { roundQty } from "@/lib/money";
import { today } from "@/lib/dates";
import type { GrnInput } from "@/lib/validation/schemas";
import { getPoCoverage, receivedByPlanItem, recomputePlanItemStatus } from "./deliveryPlan";
import { refreshVendorPoStatus } from "./vendorPo";

/**
 * Goods receipt notes — the ACTUAL deliveries.
 *
 * A GRN normally points at the planned delivery it fulfils, which is what gives
 * plan-vs-actual reporting. Drafts are editable; posting is one-way, because a posted
 * receipt is what invoicing is allowed to bill against.
 */

export type GrnDraftLine = {
  vendorPoLineId: string;
  lineNo: number;
  description: string;
  uom: string;
  orderedQty: number;
  receivedQty: number;
  outstandingQty: number;
  /** What to pre-fill: the tranche's remaining planned quantity, capped at outstanding. */
  suggestedQty: number;
};

export type GrnDraft = {
  vendorPoId: string;
  poNumber: string;
  vendorName: string;
  projectId: string;
  projectName: string;
  currency: string;
  deliveryPlanItemId: string | null;
  planItemLabel: string | null;
  plannedDate: Date | null;
  receivedDate: Date;
  lines: GrnDraftLine[];
};

/**
 * Pre-fill a receipt. This is what makes one-click receiving possible: the PM opens
 * it from the delivery queue with the numbers already in place and only edits exceptions.
 */
export async function startGrnDraft(
  vendorPoId: string,
  planItemId: string | null,
  db: Db = prisma,
): Promise<GrnDraft> {
  const po = await db.vendorPO.findUnique({
    where: { id: vendorPoId },
    include: {
      vendor: { select: { name: true } },
      project: { select: { id: true, name: true, currency: true } },
      lines: { orderBy: { lineNo: "asc" } },
    },
  });
  if (!po) throw new Error("Purchase order not found.");

  const coverage = await getPoCoverage(vendorPoId, db);
  const coverageByLine = new Map(coverage.map((line) => [line.vendorPoLineId, line]));

  let planItem: { id: string; label: string | null; seq: number; plannedDate: Date; lines: Array<{ vendorPoLineId: string; plannedQuantity: number }> } | null = null;
  let outstandingOnPlan = new Map<string, number>();

  if (planItemId) {
    const item = await db.deliveryPlanItem.findUnique({
      where: { id: planItemId },
      include: { lines: true },
    });
    if (!item || item.vendorPoId !== vendorPoId) throw new Error("Planned delivery not found on this purchase order.");
    planItem = { id: item.id, label: item.label, seq: item.seq, plannedDate: item.plannedDate, lines: item.lines };

    const alreadyOnItem = await receivedByPlanItem(item.id, db);
    outstandingOnPlan = new Map(
      item.lines.map((line) => [
        line.vendorPoLineId,
        roundQty(Math.max(0, line.plannedQuantity - (alreadyOnItem.get(line.vendorPoLineId) ?? 0))),
      ]),
    );
  }

  const lines: GrnDraftLine[] = po.lines.map((line) => {
    const cover = coverageByLine.get(line.id);
    const outstandingQty = cover?.outstandingQty ?? roundQty(line.quantity);
    const plannedOutstanding = planItem ? outstandingOnPlan.get(line.id) ?? 0 : outstandingQty;
    return {
      vendorPoLineId: line.id,
      lineNo: line.lineNo,
      description: line.description,
      uom: line.uom,
      orderedQty: roundQty(line.quantity),
      receivedQty: cover?.receivedQty ?? 0,
      outstandingQty,
      suggestedQty: roundQty(Math.min(plannedOutstanding, outstandingQty)),
    };
  });

  return {
    vendorPoId,
    poNumber: po.poNumber,
    vendorName: po.vendor.name,
    projectId: po.project.id,
    projectName: po.project.name,
    currency: po.project.currency,
    deliveryPlanItemId: planItem?.id ?? null,
    planItemLabel: planItem ? planItem.label ?? `Delivery ${planItem.seq}` : null,
    plannedDate: planItem?.plannedDate ?? null,
    receivedDate: today(),
    lines,
  };
}

/**
 * Receipt rules. Cumulative accepted quantity may never exceed what was ordered —
 * the error names ordered / already received / attempted so the PM can see why.
 */
async function assertReceiptWithinOrdered(
  vendorPoId: string,
  lines: GrnInput["lines"],
  options: { excludeGrnId?: string } = {},
  db: Db = prisma,
): Promise<void> {
  const poLines = await db.vendorPOLine.findMany({
    where: { vendorPoId },
    include: {
      grnLines: {
        where: { grn: { status: "POSTED", ...(options.excludeGrnId ? { id: { not: options.excludeGrnId } } : {}) } },
        select: { quantityAccepted: true },
      },
    },
  });
  const byId = new Map(poLines.map((line) => [line.id, line]));

  for (const line of lines) {
    if (line.quantityAccepted <= 0 && line.quantityRejected <= 0) continue;

    const poLine = byId.get(line.vendorPoLineId);
    if (!poLine) throw new Error("This receipt refers to a line that is not on the purchase order.");

    const already = roundQty(poLine.grnLines.reduce((sum, grnLine) => sum + grnLine.quantityAccepted, 0));
    const attempted = roundQty(already + line.quantityAccepted);
    if (attempted > roundQty(poLine.quantity)) {
      throw new Error(
        `"${poLine.description}": ordered ${poLine.quantity}, already received ${already}, this receipt would take it to ${attempted}.`,
      );
    }
  }
}

export async function saveGrnDraft(input: GrnInput, grnId: string | null = null, db: Db = prisma): Promise<string> {
  const usableLines = input.lines.filter((line) => line.quantityAccepted > 0 || line.quantityRejected > 0);
  if (usableLines.length === 0) throw new Error("Enter a quantity on at least one line.");

  await assertReceiptWithinOrdered(input.vendorPoId, usableLines, { excludeGrnId: grnId ?? undefined }, db);

  const lineData = usableLines.map((line) => ({
    vendorPoLineId: line.vendorPoLineId,
    quantityAccepted: roundQty(line.quantityAccepted),
    quantityRejected: roundQty(line.quantityRejected),
    // Received is the sum of what was kept and what was sent back — enforced here, not trusted from the form.
    quantityReceived: roundQty(line.quantityAccepted + line.quantityRejected),
    remarks: line.remarks,
  }));

  if (grnId) {
    const existing = await db.gRN.findUnique({ where: { id: grnId }, select: { status: true } });
    if (!existing) throw new Error("Receipt not found.");
    if (existing.status === "POSTED") throw new Error("A posted receipt cannot be edited — record a correcting receipt instead.");

    await db.gRNLine.deleteMany({ where: { grnId } });
    await db.gRN.update({
      where: { id: grnId },
      data: {
        deliveryPlanItemId: input.deliveryPlanItemId,
        receivedDate: input.receivedDate,
        deliveryNoteRef: input.deliveryNoteRef,
        notes: input.notes,
        lines: { create: lineData },
      },
    });
    return grnId;
  }

  const grnNumber = await nextDocumentNumber(db, "GRN", input.receivedDate);
  const grn = await db.gRN.create({
    data: {
      vendorPoId: input.vendorPoId,
      deliveryPlanItemId: input.deliveryPlanItemId,
      grnNumber,
      status: "DRAFT",
      receivedDate: input.receivedDate,
      deliveryNoteRef: input.deliveryNoteRef,
      notes: input.notes,
      lines: { create: lineData },
    },
  });
  return grn.id;
}

/**
 * Posting is the moment goods become real: they count as delivered, they update the
 * PO and the delivery plan, and they become billable to the client.
 */
export async function postGrn(grnId: string, userId: string | null, db: Db = prisma): Promise<void> {
  const grn = await db.gRN.findUnique({ where: { id: grnId }, include: { lines: true } });
  if (!grn) throw new Error("Receipt not found.");
  if (grn.status === "POSTED") return;
  if (grn.lines.length === 0) throw new Error("This receipt has no lines.");

  await assertReceiptWithinOrdered(
    grn.vendorPoId,
    grn.lines.map((line) => ({
      vendorPoLineId: line.vendorPoLineId,
      quantityAccepted: line.quantityAccepted,
      quantityRejected: line.quantityRejected,
      remarks: line.remarks,
    })),
    { excludeGrnId: grnId },
    db,
  );

  await db.gRN.update({
    where: { id: grnId },
    data: { status: "POSTED", postedAt: new Date(), receivedById: userId },
  });

  await refreshVendorPoStatus(grn.vendorPoId, db);
  if (grn.deliveryPlanItemId) await recomputePlanItemStatus(grn.deliveryPlanItemId, db);
}

export async function deleteGrnDraft(grnId: string, db: Db = prisma): Promise<void> {
  const grn = await db.gRN.findUnique({ where: { id: grnId }, select: { status: true } });
  if (!grn) throw new Error("Receipt not found.");
  if (grn.status === "POSTED") throw new Error("A posted receipt cannot be deleted.");
  await db.gRN.delete({ where: { id: grnId } });
}

export async function getGrn(grnId: string, db: Db = prisma) {
  return db.gRN.findUnique({
    where: { id: grnId },
    include: {
      lines: { include: { vendorPoLine: true } },
      vendorPo: {
        include: {
          vendor: { select: { name: true } },
          project: { select: { id: true, name: true, code: true, currency: true } },
        },
      },
      deliveryPlanItem: { select: { id: true, seq: true, label: true, plannedDate: true } },
      receivedBy: { select: { name: true } },
    },
  });
}

export async function listProjectGrns(projectId: string, db: Db = prisma) {
  return db.gRN.findMany({
    where: { vendorPo: { projectId } },
    include: {
      vendorPo: { select: { id: true, poNumber: true, vendor: { select: { name: true } } } },
      lines: { include: { vendorPoLine: { select: { unitCostMinor: true, description: true } } } },
      deliveryPlanItem: { select: { plannedDate: true, label: true, seq: true } },
    },
    orderBy: { receivedDate: "desc" },
  });
}
