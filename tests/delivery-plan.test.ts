import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createVendorPo } from "@/server/services/vendorPo";
import { getPlanForPo, getPoCoverage, splitEvenly, updatePlanItem } from "@/server/services/deliveryPlan";
import { toMinor } from "@/lib/money";
import { addDays, addMonths } from "@/lib/dates";
import { makeVendor, NOW, openStandardProject, resetDatabase } from "./helpers";

/**
 * The delivery plan is what the forecast is built from, so it has to be trustworthy:
 * always present, never more than was ordered, and always reconciling to the order.
 */

beforeEach(resetDatabase);

async function makePo(options: { planItems?: Array<{ label: string; plannedDate: Date; quantities: number[] }> } = {}) {
  const { project, lines } = await openStandardProject();
  const vendor = await makeVendor();

  const po = await createVendorPo({
    projectId: project.id,
    vendorId: vendor.id,
    clientAgreementId: null,
    poNumber: null,
    issueDate: NOW,
    expectedDeliveryDate: addDays(NOW, 30),
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
      {
        description: "Gadget",
        uom: "EA",
        quantity: 5,
        unitCostMinor: toMinor(150),
        taxRatePct: 0,
        clientAgreementLineId: lines[1].id,
        notes: null,
      },
    ],
    planItems: (options.planItems ?? []).map((item) => ({
      label: item.label,
      plannedDate: item.plannedDate,
      notes: null,
      quantities: item.quantities,
    })),
  });

  return { project, po, lines };
}

describe("default plan generation", () => {
  it("gives a PO issued with no plan one tranche for the full quantity", async () => {
    const { po } = await makePo();
    const plan = await getPlanForPo(po.id);

    expect(plan).toHaveLength(1);
    expect(plan[0].plannedDate.toISOString().slice(0, 10)).toBe(addDays(NOW, 30).toISOString().slice(0, 10));
    expect(plan[0].lines.map((line) => line.plannedQuantity)).toEqual([10, 5]);
  });

  it("leaves nothing unplanned by default", async () => {
    const { po } = await makePo();
    const coverage = await getPoCoverage(po.id);

    expect(coverage.every((line) => line.unplannedQty === 0)).toBe(true);
    expect(coverage.map((line) => line.plannedQty)).toEqual([10, 5]);
  });
});

describe("splitting", () => {
  it("distributes remainders so planned always equals ordered", () => {
    const tranches = splitEvenly(
      [
        { vendorPoLineId: "a", quantity: 10 },
        { vendorPoLineId: "b", quantity: 7 },
      ],
      3,
      NOW,
      4,
    );

    expect(tranches).toHaveLength(3);
    const totalA = tranches.reduce((sum, item) => sum + item.quantities[0].quantity, 0);
    const totalB = tranches.reduce((sum, item) => sum + item.quantities[1].quantity, 0);
    expect(Math.round(totalA * 1000) / 1000).toBe(10);
    expect(Math.round(totalB * 1000) / 1000).toBe(7);
  });

  it("saves a three-way monthly split as three tranches on the right dates", async () => {
    const { po } = await makePo({
      planItems: [
        { label: "M1", plannedDate: NOW, quantities: [4, 2] },
        { label: "M2", plannedDate: addMonths(NOW, 1), quantities: [3, 2] },
        { label: "M3", plannedDate: addMonths(NOW, 2), quantities: [3, 1] },
      ],
    });

    const plan = await getPlanForPo(po.id);
    expect(plan).toHaveLength(3);
    expect(plan.map((item) => item.label)).toEqual(["M1", "M2", "M3"]);

    const coverage = await getPoCoverage(po.id);
    expect(coverage.map((line) => line.plannedQty)).toEqual([10, 5]);
  });
});

describe("plan limits", () => {
  it("rejects a plan that promises more than was ordered", async () => {
    await expect(
      makePo({
        planItems: [
          { label: "Too much", plannedDate: NOW, quantities: [11, 5] },
        ],
      }),
    ).rejects.toThrow(/more than the 10 ordered/i);
  });

  it("allows under-coverage but reports the unplanned quantity", async () => {
    const { po } = await makePo({
      planItems: [{ label: "Partial plan", plannedDate: NOW, quantities: [6, 5] }],
    });

    const coverage = await getPoCoverage(po.id);
    expect(coverage[0].plannedQty).toBe(6);
    expect(coverage[0].unplannedQty).toBe(4);
  });

  it("refuses to reschedule a tranche below what has already been received", async () => {
    const { po } = await makePo({ planItems: [{ label: "One", plannedDate: NOW, quantities: [10, 5] }] });
    const [item] = await getPlanForPo(po.id);
    const poLines = await prisma.vendorPOLine.findMany({ where: { vendorPoId: po.id }, orderBy: { lineNo: "asc" } });

    const { postGrn, saveGrnDraft } = await import("@/server/services/grn");
    const grnId = await saveGrnDraft({
      vendorPoId: po.id,
      deliveryPlanItemId: item.id,
      receivedDate: NOW,
      deliveryNoteRef: null,
      notes: null,
      lines: [{ vendorPoLineId: poLines[0].id, quantityAccepted: 6, quantityRejected: 0, remarks: null }],
    });
    await postGrn(grnId, null);

    await expect(
      updatePlanItem(item.id, {
        plannedDate: NOW,
        label: "One",
        notes: null,
        quantities: [
          { vendorPoLineId: poLines[0].id, quantity: 3 },
          { vendorPoLineId: poLines[1].id, quantity: 5 },
        ],
      }),
    ).rejects.toThrow(/cannot be lower than the 6 already received/i);
  });
});

describe("tranche status", () => {
  it("moves PLANNED → PARTIAL → FULFILLED as goods arrive", async () => {
    const { po } = await makePo({ planItems: [{ label: "One", plannedDate: NOW, quantities: [10, 5] }] });
    const poLines = await prisma.vendorPOLine.findMany({ where: { vendorPoId: po.id }, orderBy: { lineNo: "asc" } });
    const { postGrn, saveGrnDraft } = await import("@/server/services/grn");

    expect((await getPlanForPo(po.id))[0].status).toBe("PLANNED");

    const first = await saveGrnDraft({
      vendorPoId: po.id,
      deliveryPlanItemId: (await getPlanForPo(po.id))[0].id,
      receivedDate: NOW,
      deliveryNoteRef: null,
      notes: null,
      lines: [{ vendorPoLineId: poLines[0].id, quantityAccepted: 4, quantityRejected: 0, remarks: null }],
    });
    await postGrn(first, null);
    expect((await getPlanForPo(po.id))[0].status).toBe("PARTIAL");

    const second = await saveGrnDraft({
      vendorPoId: po.id,
      deliveryPlanItemId: (await getPlanForPo(po.id))[0].id,
      receivedDate: NOW,
      deliveryNoteRef: null,
      notes: null,
      lines: [
        { vendorPoLineId: poLines[0].id, quantityAccepted: 6, quantityRejected: 0, remarks: null },
        { vendorPoLineId: poLines[1].id, quantityAccepted: 5, quantityRejected: 0, remarks: null },
      ],
    });
    await postGrn(second, null);
    expect((await getPlanForPo(po.id))[0].status).toBe("FULFILLED");
  });

  it("reads a past-dated unfulfilled tranche as overdue", async () => {
    const { po } = await makePo({ planItems: [{ label: "Late", plannedDate: addDays(NOW, -5), quantities: [10, 5] }] });
    const [item] = await getPlanForPo(po.id);

    expect(item.isOverdue).toBe(true);
  });

  it("does not call a fulfilled tranche overdue, however late it was", async () => {
    const { po } = await makePo({ planItems: [{ label: "Late but done", plannedDate: addDays(NOW, -5), quantities: [10, 5] }] });
    const poLines = await prisma.vendorPOLine.findMany({ where: { vendorPoId: po.id }, orderBy: { lineNo: "asc" } });
    const { postGrn, saveGrnDraft } = await import("@/server/services/grn");

    const grnId = await saveGrnDraft({
      vendorPoId: po.id,
      deliveryPlanItemId: (await getPlanForPo(po.id))[0].id,
      receivedDate: NOW,
      deliveryNoteRef: null,
      notes: null,
      lines: poLines.map((line, index) => ({
        vendorPoLineId: line.id,
        quantityAccepted: index === 0 ? 10 : 5,
        quantityRejected: 0,
        remarks: null,
      })),
    });
    await postGrn(grnId, null);

    const [item] = await getPlanForPo(po.id);
    expect(item.status).toBe("FULFILLED");
    expect(item.isOverdue).toBe(false);
  });
});
