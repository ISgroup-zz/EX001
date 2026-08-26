import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createVendorPo } from "@/server/services/vendorPo";
import { postGrn, saveGrnDraft, startGrnDraft } from "@/server/services/grn";
import { getPlanForPo } from "@/server/services/deliveryPlan";
import { toMinor } from "@/lib/money";
import { addDays } from "@/lib/dates";
import { makeVendor, NOW, openStandardProject, resetDatabase } from "./helpers";

/** Receipt rules: never more than ordered, drafts don't count, posting is one-way. */

beforeEach(resetDatabase);

async function setup() {
  const { project, lines } = await openStandardProject();
  const vendor = await makeVendor();

  const po = await createVendorPo({
    projectId: project.id,
    vendorId: vendor.id,
    clientAgreementId: lines[0].agreementId,
    poNumber: null,
    issueDate: NOW,
    expectedDeliveryDate: addDays(NOW, 14),
    notes: null,
    lines: [
      {
        description: "Widget",
        uom: "EA",
        quantity: 10,
        unitCostMinor: toMinor(80),
        taxRatePct: 0,
        clientAgreementLineId: lines[0].id,
        notes: null,
      },
    ],
    planItems: [
      { label: "First half", plannedDate: addDays(NOW, 14), notes: null, quantities: [6] },
      { label: "Second half", plannedDate: addDays(NOW, 45), notes: null, quantities: [4] },
    ],
  });

  const poLines = await prisma.vendorPOLine.findMany({ where: { vendorPoId: po.id } });
  return { project, po, poLine: poLines[0], clientLines: lines };
}

async function receive(poId: string, poLineId: string, quantity: number, planItemId: string | null = null) {
  const grnId = await saveGrnDraft({
    vendorPoId: poId,
    deliveryPlanItemId: planItemId,
    receivedDate: NOW,
    deliveryNoteRef: null,
    notes: null,
    lines: [{ vendorPoLineId: poLineId, quantityAccepted: quantity, quantityRejected: 0, remarks: null }],
  });
  await postGrn(grnId, null);
  return grnId;
}

describe("pre-filling a receipt", () => {
  it("suggests the planned quantity for the chosen tranche", async () => {
    const { po, poLine } = await setup();
    const plan = await getPlanForPo(po.id);

    const draft = await startGrnDraft(po.id, plan[0].id);
    expect(draft.lines[0].suggestedQty).toBe(6);
    expect(draft.lines[0].vendorPoLineId).toBe(poLine.id);
    expect(draft.planItemLabel).toBe("First half");
  });

  it("suggests everything outstanding when no tranche is chosen", async () => {
    const { po } = await setup();
    const draft = await startGrnDraft(po.id, null);
    expect(draft.lines[0].suggestedQty).toBe(10);
  });

  it("shrinks the suggestion once part of the tranche has arrived", async () => {
    const { po, poLine } = await setup();
    const plan = await getPlanForPo(po.id);
    await receive(po.id, poLine.id, 2, plan[0].id);

    const draft = await startGrnDraft(po.id, plan[0].id);
    expect(draft.lines[0].suggestedQty).toBe(4);
    expect(draft.lines[0].receivedQty).toBe(2);
  });
});

describe("receipt limits", () => {
  it("refuses more than was ordered", async () => {
    const { po, poLine } = await setup();

    await expect(
      saveGrnDraft({
        vendorPoId: po.id,
        deliveryPlanItemId: null,
        receivedDate: NOW,
        deliveryNoteRef: null,
        notes: null,
        lines: [{ vendorPoLineId: poLine.id, quantityAccepted: 11, quantityRejected: 0, remarks: null }],
      }),
    ).rejects.toThrow(/ordered 10/i);
  });

  it("counts what has already been received when checking the limit", async () => {
    const { po, poLine } = await setup();
    await receive(po.id, poLine.id, 8);

    await expect(
      saveGrnDraft({
        vendorPoId: po.id,
        deliveryPlanItemId: null,
        receivedDate: NOW,
        deliveryNoteRef: null,
        notes: null,
        lines: [{ vendorPoLineId: poLine.id, quantityAccepted: 3, quantityRejected: 0, remarks: null }],
      }),
    ).rejects.toThrow(/already received 8/i);
  });

  it("allows a tranche to over-deliver as long as the order total holds", async () => {
    const { po, poLine } = await setup();
    const plan = await getPlanForPo(po.id);

    // 8 against a tranche planned for 6 — the vendor shipped more in one go.
    await expect(receive(po.id, poLine.id, 8, plan[0].id)).resolves.toBeTruthy();
  });

  it("derives received quantity from accepted plus rejected", async () => {
    const { po, poLine } = await setup();
    const grnId = await saveGrnDraft({
      vendorPoId: po.id,
      deliveryPlanItemId: null,
      receivedDate: NOW,
      deliveryNoteRef: null,
      notes: null,
      // The form claims nothing about "received"; the service computes it.
      lines: [{ vendorPoLineId: poLine.id, quantityAccepted: 7, quantityRejected: 2, remarks: "2 damaged" }],
    });

    const line = await prisma.gRNLine.findFirstOrThrow({ where: { grnId } });
    expect(line.quantityReceived).toBe(9);
  });
});

describe("posting", () => {
  it("moves the PO from ISSUED to PARTIALLY_RECEIVED to RECEIVED", async () => {
    const { po, poLine } = await setup();
    expect((await prisma.vendorPO.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("ISSUED");

    await receive(po.id, poLine.id, 6);
    expect((await prisma.vendorPO.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("PARTIALLY_RECEIVED");

    await receive(po.id, poLine.id, 4);
    expect((await prisma.vendorPO.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("RECEIVED");
  });

  it("leaves a draft out of the delivered totals until it is posted", async () => {
    const { po, poLine } = await setup();
    await saveGrnDraft({
      vendorPoId: po.id,
      deliveryPlanItemId: null,
      receivedDate: NOW,
      deliveryNoteRef: null,
      notes: null,
      lines: [{ vendorPoLineId: poLine.id, quantityAccepted: 5, quantityRejected: 0, remarks: null }],
    });

    const { getPoCoverage } = await import("@/server/services/deliveryPlan");
    expect((await getPoCoverage(po.id))[0].receivedQty).toBe(0);
    expect((await prisma.vendorPO.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("ISSUED");
  });

  it("refuses to edit a posted receipt", async () => {
    const { po, poLine } = await setup();
    const grnId = await receive(po.id, poLine.id, 3);

    await expect(
      saveGrnDraft(
        {
          vendorPoId: po.id,
          deliveryPlanItemId: null,
          receivedDate: NOW,
          deliveryNoteRef: null,
          notes: null,
          lines: [{ vendorPoLineId: poLine.id, quantityAccepted: 4, quantityRejected: 0, remarks: null }],
        },
        grnId,
      ),
    ).rejects.toThrow(/posted receipt cannot be edited/i);
  });

  it("is idempotent — posting twice does not double-count", async () => {
    const { po, poLine } = await setup();
    const grnId = await receive(po.id, poLine.id, 4);
    await postGrn(grnId, null);

    const { getPoCoverage } = await import("@/server/services/deliveryPlan");
    expect((await getPoCoverage(po.id))[0].receivedQty).toBe(4);
  });

  it("gives each receipt a sequential number", async () => {
    const { po, poLine } = await setup();
    const first = await receive(po.id, poLine.id, 2);
    const second = await receive(po.id, poLine.id, 2);

    const numbers = await prisma.gRN.findMany({
      where: { id: { in: [first, second] } },
      select: { grnNumber: true },
      orderBy: { grnNumber: "asc" },
    });
    expect(numbers[0].grnNumber).toMatch(/^GRN-\d{4}-0001$/);
    expect(numbers[1].grnNumber).toMatch(/^GRN-\d{4}-0002$/);
  });
});
