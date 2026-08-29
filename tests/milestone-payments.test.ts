import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createVendorPo } from "@/server/services/vendorPo";
import { postGrn, saveGrnDraft } from "@/server/services/grn";
import { getPlanForPo, updatePlanItem, cancelPlanItem } from "@/server/services/deliveryPlan";
import { getPaymentSchedule, recordVendorPayment } from "@/server/services/vendorPayment";
import { getPlanHistory } from "@/server/services/planChangeLog";
import { toMinor } from "@/lib/money";
import { addDays } from "@/lib/dates";
import { makeVendor, NOW, openStandardProject, resetDatabase } from "./helpers";

/**
 * Milestone payments: what we owe the vendor for each delivery, when it falls due,
 * and the rule that a schedule can never promise more than the order is worth.
 *
 * The PO below is 10 × $100 = $1,000 net, so percentages read directly as dollars.
 */

beforeEach(resetDatabase);

type MilestoneSpec = {
  label: string;
  plannedDate: Date;
  quantity: number;
  basis?: "PERCENTAGE" | "FIXED";
  percent?: number;
  amountMinor?: number;
  dueDays?: number;
};

async function makePo(milestones: MilestoneSpec[]) {
  const { project, lines } = await openStandardProject({
    lines: [{ description: "Widget", quantity: 10, unitPrice: 200 }],
  });
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
        unitCostMinor: toMinor(100),
        taxRatePct: 0,
        clientAgreementLineId: lines[0].id,
        notes: null,
      },
    ],
    planItems: milestones.map((milestone) => ({
      label: milestone.label,
      plannedDate: milestone.plannedDate,
      notes: null,
      quantities: [milestone.quantity],
      paymentBasis: milestone.basis ?? "PERCENTAGE",
      paymentPercent: milestone.percent ?? 0,
      paymentAmountMinor: milestone.amountMinor,
      paymentDueDays: milestone.dueDays ?? 0,
    })),
  });

  const poLine = await prisma.vendorPOLine.findFirstOrThrow({ where: { vendorPoId: po.id } });
  return { project, po, poLine };
}

/** Post a GRN that fully meets the given milestone. */
async function fulfil(poId: string, poLineId: string, planItemId: string, quantity: number, receivedDate = NOW) {
  const grnId = await saveGrnDraft({
    vendorPoId: poId,
    deliveryPlanItemId: planItemId,
    receivedDate,
    deliveryNoteRef: null,
    notes: null,
    lines: [{ vendorPoLineId: poLineId, quantityAccepted: quantity, quantityRejected: 0, remarks: null }],
  });
  await postGrn(grnId, null);
}

describe("what each milestone is worth", () => {
  it("derives a percentage from the order value", async () => {
    const { po } = await makePo([
      { label: "On shipment", plannedDate: NOW, quantity: 6, percent: 60 },
      { label: "On completion", plannedDate: addDays(NOW, 30), quantity: 4, percent: 40 },
    ]);

    const schedule = await getPaymentSchedule(po.id);
    expect(schedule.poNetMinor).toBe(toMinor(1000));
    expect(schedule.milestones.map((m) => m.dueMinor)).toEqual([toMinor(600), toMinor(400)]);
    expect(schedule.scheduledMinor).toBe(toMinor(1000));
    expect(schedule.unscheduledMinor).toBe(0);
  });

  it("keeps a fixed amount fixed, and takes percentages off the rest", async () => {
    const { po } = await makePo([
      { label: "Mobilisation", plannedDate: NOW, quantity: 1, basis: "FIXED", amountMinor: toMinor(150) },
      { label: "Delivery", plannedDate: addDays(NOW, 30), quantity: 9, percent: 80 },
    ]);

    const schedule = await getPaymentSchedule(po.id);
    expect(schedule.milestones[0].dueMinor).toBe(toMinor(150));
    expect(schedule.milestones[1].dueMinor).toBe(toMinor(800));
    // $50 of the order has no payment against it yet, and is reported rather than hidden.
    expect(schedule.unscheduledMinor).toBe(toMinor(50));
  });

  it("re-derives a percentage when the order value changes", async () => {
    const { po, poLine } = await makePo([{ label: "All", plannedDate: NOW, quantity: 10, percent: 100 }]);

    await prisma.vendorPOLine.update({ where: { id: poLine.id }, data: { unitCostMinor: toMinor(120) } });

    // A stored figure would now disagree with the order; a derived one cannot.
    const schedule = await getPaymentSchedule(po.id);
    expect(schedule.milestones[0].dueMinor).toBe(toMinor(1200));
  });

  it("refuses a schedule that promises more than the order is worth", async () => {
    await expect(
      makePo([
        { label: "Too much", plannedDate: NOW, quantity: 5, percent: 60 },
        { label: "Also too much", plannedDate: addDays(NOW, 10), quantity: 5, percent: 60 },
      ]),
    ).rejects.toThrow(/more than the order value/i);
  });

  it("allows a thirds split, where rounding puts it a cent over", async () => {
    const { po } = await makePo([
      { label: "A", plannedDate: NOW, quantity: 4, percent: 33.333 },
      { label: "B", plannedDate: addDays(NOW, 10), quantity: 3, percent: 33.333 },
      { label: "C", plannedDate: addDays(NOW, 20), quantity: 3, percent: 33.333 },
    ]);

    const schedule = await getPaymentSchedule(po.id);
    expect(schedule.scheduledMinor).toBe(toMinor(1000) - 1); // 33333 × 3
  });
});

describe("when money falls due", () => {
  it("owes nothing until the goods actually arrive", async () => {
    const { po } = await makePo([{ label: "On delivery", plannedDate: NOW, quantity: 10, percent: 100 }]);

    const schedule = await getPaymentSchedule(po.id);
    expect(schedule.milestones[0].isPayable).toBe(false);
    expect(schedule.milestones[0].payableFrom).toBeNull();
    expect(schedule.payableNowMinor).toBe(0);
  });

  it("becomes payable once the milestone is fulfilled", async () => {
    const { po, poLine } = await makePo([{ label: "On delivery", plannedDate: NOW, quantity: 10, percent: 100 }]);
    const [item] = await getPlanForPo(po.id);
    await fulfil(po.id, poLine.id, item.id, 10);

    const schedule = await getPaymentSchedule(po.id);
    expect(schedule.milestones[0].isPayable).toBe(true);
    expect(schedule.payableNowMinor).toBe(toMinor(1000));
  });

  it("runs payment terms from the actual delivery, not the planned date", async () => {
    // Promised for next month, delivered today: the vendor is owed 30 days from today.
    const { po, poLine } = await makePo([
      { label: "Early", plannedDate: addDays(NOW, 30), quantity: 10, percent: 100, dueDays: 30 },
    ]);
    const [item] = await getPlanForPo(po.id);
    await fulfil(po.id, poLine.id, item.id, 10);

    const schedule = await getPaymentSchedule(po.id);
    expect(schedule.milestones[0].fulfilledOn?.toISOString().slice(0, 10)).toBe(NOW.toISOString().slice(0, 10));
    expect(schedule.milestones[0].payableFrom?.toISOString().slice(0, 10)).toBe(
      addDays(NOW, 30).toISOString().slice(0, 10),
    );
  });

  it("does not move money already owed when a delivered milestone is rescheduled", async () => {
    const { po, poLine } = await makePo([
      { label: "Delivered", plannedDate: NOW, quantity: 10, percent: 100, dueDays: 0 },
    ]);
    const [item] = await getPlanForPo(po.id);
    await fulfil(po.id, poLine.id, item.id, 10);

    const before = (await getPaymentSchedule(po.id)).milestones[0].payableFrom;

    await updatePlanItem(item.id, {
      plannedDate: addDays(NOW, 120),
      label: "Delivered",
      notes: null,
      quantities: [{ vendorPoLineId: poLine.id, quantity: 10 }],
      payment: { basis: "PERCENTAGE", percent: 100, dueDays: 0 },
    });

    const after = (await getPaymentSchedule(po.id)).milestones[0].payableFrom;
    expect(after?.toISOString()).toBe(before?.toISOString());
  });

  it("pushes the due date out by the agreed terms", async () => {
    const { po, poLine } = await makePo([
      { label: "Net 45", plannedDate: NOW, quantity: 10, percent: 100, dueDays: 45 },
    ]);
    const [item] = await getPlanForPo(po.id);
    await fulfil(po.id, poLine.id, item.id, 10);

    const schedule = await getPaymentSchedule(po.id);
    expect(schedule.milestones[0].payableFrom?.toISOString().slice(0, 10)).toBe(
      addDays(NOW, 45).toISOString().slice(0, 10),
    );
    expect(schedule.milestones[0].isOverdue).toBe(false);
  });

  it("reads a past-due unpaid milestone as overdue", async () => {
    const { po, poLine } = await makePo([
      { label: "Was due", plannedDate: addDays(NOW, -60), quantity: 10, percent: 100, dueDays: 30 },
    ]);
    const [item] = await getPlanForPo(po.id);
    // Delivered 60 days ago on 30-day terms: the money fell due 30 days back.
    await fulfil(po.id, poLine.id, item.id, 10, addDays(NOW, -60));

    const schedule = await getPaymentSchedule(po.id);
    expect(schedule.milestones[0].isOverdue).toBe(true);
    expect(schedule.overdueMinor).toBe(toMinor(1000));
  });

  it("only counts a partly-delivered milestone once it is complete", async () => {
    const { po, poLine } = await makePo([{ label: "One", plannedDate: NOW, quantity: 10, percent: 100 }]);
    const [item] = await getPlanForPo(po.id);
    await fulfil(po.id, poLine.id, item.id, 6);

    expect((await getPaymentSchedule(po.id)).payableNowMinor).toBe(0);
  });
});

describe("recording payments", () => {
  it("reduces what is outstanding", async () => {
    const { po, poLine } = await makePo([{ label: "One", plannedDate: NOW, quantity: 10, percent: 100 }]);
    const [item] = await getPlanForPo(po.id);
    await fulfil(po.id, poLine.id, item.id, 10);

    await recordVendorPayment(
      { planItemId: item.id, amountMinor: toMinor(400), paidDate: NOW, method: null, reference: null, notes: null },
      null,
    );

    const schedule = await getPaymentSchedule(po.id);
    expect(schedule.paidMinor).toBe(toMinor(400));
    expect(schedule.outstandingMinor).toBe(toMinor(600));
    expect(schedule.milestones[0].isPayable).toBe(true);
  });

  it("refuses to pay more than the milestone is worth", async () => {
    const { po } = await makePo([{ label: "One", plannedDate: NOW, quantity: 10, percent: 50 }]);
    const [item] = await getPlanForPo(po.id);

    await expect(
      recordVendorPayment(
        { planItemId: item.id, amountMinor: toMinor(600), paidDate: NOW, method: null, reference: null, notes: null },
        null,
      ),
    ).rejects.toThrow(/still owed/i);
  });

  it("settles a milestone when it is paid in full", async () => {
    const { po, poLine } = await makePo([{ label: "One", plannedDate: NOW, quantity: 10, percent: 100 }]);
    const [item] = await getPlanForPo(po.id);
    await fulfil(po.id, poLine.id, item.id, 10);

    await recordVendorPayment(
      { planItemId: item.id, amountMinor: toMinor(1000), paidDate: NOW, method: null, reference: null, notes: null },
      null,
    );

    const schedule = await getPaymentSchedule(po.id);
    expect(schedule.outstandingMinor).toBe(0);
    expect(schedule.payableNowMinor).toBe(0);
    expect(schedule.milestones[0].isPayable).toBe(false);
  });

  it("will not let a paid milestone be revalued below what was paid", async () => {
    const { po, poLine } = await makePo([{ label: "One", plannedDate: NOW, quantity: 10, percent: 100 }]);
    const [item] = await getPlanForPo(po.id);
    await fulfil(po.id, poLine.id, item.id, 10);
    await recordVendorPayment(
      { planItemId: item.id, amountMinor: toMinor(700), paidDate: NOW, method: null, reference: null, notes: null },
      null,
    );

    await expect(
      updatePlanItem(item.id, {
        plannedDate: NOW,
        label: "One",
        notes: null,
        quantities: [{ vendorPoLineId: poLine.id, quantity: 10 }],
        payment: { basis: "PERCENTAGE", percent: 50 },
      }),
    ).rejects.toThrow(/cannot be reduced below/i);
  });

  it("will not cancel a milestone that has been paid against", async () => {
    // Nothing received against it — an advance payment alone is enough to pin it.
    const { po } = await makePo([{ label: "One", plannedDate: NOW, quantity: 10, percent: 100 }]);
    const [item] = await getPlanForPo(po.id);
    await recordVendorPayment(
      { planItemId: item.id, amountMinor: toMinor(100), paidDate: NOW, method: null, reference: null, notes: null },
      null,
    );

    await expect(cancelPlanItem(item.id)).rejects.toThrow(/paid against/i);
  });
});

describe("the change log", () => {
  it("records the plan the order was raised with", async () => {
    const { po } = await makePo([
      { label: "First", plannedDate: NOW, quantity: 6, percent: 60 },
      { label: "Second", plannedDate: addDays(NOW, 30), quantity: 4, percent: 40 },
    ]);

    const history = await getPlanHistory(po.id);
    expect(history).toHaveLength(2);
    expect(history.every((row) => row.action === "PLAN_CREATED")).toBe(true);
    expect(history.map((row) => row.summary).join(" ")).toMatch(/First/);
  });

  it("names the field that moved, with its old and new value", async () => {
    const { po, poLine } = await makePo([{ label: "First", plannedDate: NOW, quantity: 10, percent: 100 }]);
    const [item] = await getPlanForPo(po.id);

    await updatePlanItem(item.id, {
      plannedDate: addDays(NOW, 14),
      label: "First",
      notes: null,
      quantities: [{ vendorPoLineId: poLine.id, quantity: 10 }],
      payment: { basis: "PERCENTAGE", percent: 90, dueDays: 30 },
    });

    const history = await getPlanHistory(po.id);
    const fields = history.filter((row) => row.action === "MILESTONE_UPDATED").map((row) => row.field);
    expect(fields).toContain("plannedDate");
    expect(fields).toContain("paymentPercent");
    expect(fields).toContain("paymentDueDays");

    const percentChange = history.find((row) => row.field === "paymentPercent");
    expect(percentChange?.oldValue).toBe("100");
    expect(percentChange?.newValue).toBe("90");
  });

  it("logs nothing when an edit changes nothing", async () => {
    const { po, poLine } = await makePo([{ label: "First", plannedDate: NOW, quantity: 10, percent: 100 }]);
    const [item] = await getPlanForPo(po.id);
    const before = (await getPlanHistory(po.id)).length;

    await updatePlanItem(item.id, {
      plannedDate: NOW,
      label: "First",
      notes: null,
      quantities: [{ vendorPoLineId: poLine.id, quantity: 10 }],
      payment: { basis: "PERCENTAGE", percent: 100, dueDays: 0 },
    });

    expect(await getPlanHistory(po.id)).toHaveLength(before);
  });

  it("records payments and cancellations too", async () => {
    const { po, poLine } = await makePo([
      { label: "First", plannedDate: NOW, quantity: 6, percent: 60 },
      { label: "Second", plannedDate: addDays(NOW, 30), quantity: 4, percent: 40 },
    ]);
    const plan = await getPlanForPo(po.id);
    await fulfil(po.id, poLine.id, plan[0].id, 6);

    await recordVendorPayment(
      { planItemId: plan[0].id, amountMinor: toMinor(600), paidDate: NOW, method: "Transfer", reference: "TT-1", notes: null },
      null,
    );
    await cancelPlanItem(plan[1].id);

    const actions = (await getPlanHistory(po.id)).map((row) => row.action);
    expect(actions).toContain("PAYMENT_RECORDED");
    expect(actions).toContain("MILESTONE_CANCELLED");
  });

  it("keeps history for a milestone that is later cancelled", async () => {
    const { po, poLine } = await makePo([
      { label: "First", plannedDate: NOW, quantity: 6, percent: 60 },
      { label: "Second", plannedDate: addDays(NOW, 30), quantity: 4, percent: 40 },
    ]);
    const plan = await getPlanForPo(po.id);

    await updatePlanItem(plan[1].id, {
      plannedDate: addDays(NOW, 45),
      label: "Second",
      notes: null,
      quantities: [{ vendorPoLineId: poLine.id, quantity: 4 }],
      payment: { basis: "PERCENTAGE", percent: 40, dueDays: 0 },
    });
    await cancelPlanItem(plan[1].id);

    // The date change survives the cancellation — the log is append-only.
    const history = await getPlanHistory(po.id);
    expect(history.some((row) => row.field === "plannedDate")).toBe(true);
    expect(history.some((row) => row.action === "MILESTONE_CANCELLED")).toBe(true);
  });

  it("stops counting a cancelled milestone in the schedule", async () => {
    const { po } = await makePo([
      { label: "First", plannedDate: NOW, quantity: 6, percent: 60 },
      { label: "Second", plannedDate: addDays(NOW, 30), quantity: 4, percent: 40 },
    ]);
    const plan = await getPlanForPo(po.id);
    await cancelPlanItem(plan[1].id);

    const schedule = await getPaymentSchedule(po.id);
    expect(schedule.scheduledMinor).toBe(toMinor(600));
    expect(schedule.unscheduledMinor).toBe(toMinor(400));
  });
});
