import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createVendorPo } from "@/server/services/vendorPo";
import { postGrn, saveGrnDraft } from "@/server/services/grn";
import {
  defaultRange,
  getBillingForecast,
  getDeliveryForecast,
  getScheduleHealth,
  getUpcomingDeliveries,
} from "@/server/services/forecast";
import { toMinor } from "@/lib/money";
import { addDays, addMonths, monthKey } from "@/lib/dates";
import { makeVendor, NOW, openStandardProject, resetDatabase } from "./helpers";

/**
 * The forecast is the reason delivery plans exist, so it has to bucket planned value
 * into the right months and move it to "actual" when goods actually arrive.
 */

beforeEach(resetDatabase);

async function setup(planItems: Array<{ label: string; plannedDate: Date; quantities: number[] }>) {
  const { project, agreement, lines } = await openStandardProject({
    lines: [{ description: "Widget", quantity: 12, unitPrice: 100 }],
  });
  const vendor = await makeVendor();

  const po = await createVendorPo({
    projectId: project.id,
    vendorId: vendor.id,
    clientAgreementId: agreement.id,
    poNumber: null,
    issueDate: NOW,
    expectedDeliveryDate: addDays(NOW, 30),
    notes: null,
    lines: [
      {
        description: "Widget",
        uom: "EA",
        quantity: 12,
        unitCostMinor: toMinor(50),
        taxRatePct: 0,
        clientAgreementLineId: lines[0].id,
        notes: null,
      },
    ],
    planItems: planItems.map((item) => ({
      label: item.label,
      plannedDate: item.plannedDate,
      notes: null,
      quantities: item.quantities,
    })),
  });

  const poLine = await prisma.vendorPOLine.findFirstOrThrow({ where: { vendorPoId: po.id } });
  return { project, po, poLine };
}

describe("delivery forecast", () => {
  it("buckets planned value into the month it is promised for", async () => {
    const { project } = await setup([
      { label: "M0", plannedDate: NOW, quantities: [4] },
      { label: "M1", plannedDate: addMonths(NOW, 1), quantities: [4] },
      { label: "M2", plannedDate: addMonths(NOW, 2), quantities: [4] },
    ]);

    const buckets = await getDeliveryForecast({ projectId: project.id, range: defaultRange(1, 4) });
    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    // 4 × $50 cost in each of three consecutive months.
    expect(byKey.get(monthKey(NOW))?.plannedMinor).toBe(toMinor(200));
    expect(byKey.get(monthKey(addMonths(NOW, 1)))?.plannedMinor).toBe(toMinor(200));
    expect(byKey.get(monthKey(addMonths(NOW, 2)))?.plannedMinor).toBe(toMinor(200));
  });

  it("moves value from planned to actual when goods are received", async () => {
    const { project, po, poLine } = await setup([{ label: "M0", plannedDate: NOW, quantities: [12] }]);

    const before = await getDeliveryForecast({ projectId: project.id, range: defaultRange(1, 3) });
    expect(before.find((bucket) => bucket.key === monthKey(NOW))?.actualMinor).toBe(0);

    const grnId = await saveGrnDraft({
      vendorPoId: po.id,
      deliveryPlanItemId: null,
      receivedDate: NOW,
      deliveryNoteRef: null,
      notes: null,
      lines: [{ vendorPoLineId: poLine.id, quantityAccepted: 12, quantityRejected: 0, remarks: null }],
    });
    await postGrn(grnId, null);

    const after = await getDeliveryForecast({ projectId: project.id, range: defaultRange(1, 3) });
    const bucket = after.find((entry) => entry.key === monthKey(NOW));
    expect(bucket?.actualMinor).toBe(toMinor(600)); // 12 × $50
  });

  it("ignores draft receipts", async () => {
    const { project, po, poLine } = await setup([{ label: "M0", plannedDate: NOW, quantities: [12] }]);
    await saveGrnDraft({
      vendorPoId: po.id,
      deliveryPlanItemId: null,
      receivedDate: NOW,
      deliveryNoteRef: null,
      notes: null,
      lines: [{ vendorPoLineId: poLine.id, quantityAccepted: 12, quantityRejected: 0, remarks: null }],
    });

    const buckets = await getDeliveryForecast({ projectId: project.id, range: defaultRange(1, 3) });
    expect(buckets.find((bucket) => bucket.key === monthKey(NOW))?.actualMinor).toBe(0);
  });

  it("returns an unbroken run of months, so the chart has no gaps", async () => {
    const { project } = await setup([{ label: "M0", plannedDate: NOW, quantities: [12] }]);
    const buckets = await getDeliveryForecast({ projectId: project.id, range: defaultRange(2, 6) });

    expect(buckets).toHaveLength(9); // 2 back + current + 6 forward
    expect(new Set(buckets.map((bucket) => bucket.key)).size).toBe(9);
  });
});

describe("billing forecast", () => {
  it("values planned deliveries at the client's price, not ours", async () => {
    const { project } = await setup([{ label: "M0", plannedDate: NOW, quantities: [12] }]);
    const buckets = await getBillingForecast({ projectId: project.id, range: defaultRange(1, 3) });

    // Cost is $50/unit; the client pays $100/unit.
    expect(buckets.find((bucket) => bucket.key === monthKey(NOW))?.plannedMinor).toBe(toMinor(1200));
  });
});

describe("the delivery queue", () => {
  it("lists open tranches soonest first and flags the late ones", async () => {
    const { project } = await setup([
      { label: "Late", plannedDate: addDays(NOW, -10), quantities: [4] },
      { label: "Soon", plannedDate: addDays(NOW, 3), quantities: [4] },
      { label: "Later", plannedDate: addDays(NOW, 40), quantities: [4] },
    ]);

    const queue = await getUpcomingDeliveries({ projectId: project.id, withinDays: 90 });
    expect(queue.map((item) => item.label)).toEqual(["Late", "Soon", "Later"]);
    expect(queue[0].isOverdue).toBe(true);
    expect(queue[1].isOverdue).toBe(false);
    expect(queue[0].valueMinor).toBe(toMinor(200));
  });

  it("drops a tranche once it is fully received", async () => {
    const { project, po, poLine } = await setup([{ label: "One", plannedDate: addDays(NOW, 3), quantities: [12] }]);
    const item = await prisma.deliveryPlanItem.findFirstOrThrow({ where: { vendorPoId: po.id } });

    const grnId = await saveGrnDraft({
      vendorPoId: po.id,
      deliveryPlanItemId: item.id,
      receivedDate: NOW,
      deliveryNoteRef: null,
      notes: null,
      lines: [{ vendorPoLineId: poLine.id, quantityAccepted: 12, quantityRejected: 0, remarks: null }],
    });
    await postGrn(grnId, null);

    expect(await getUpcomingDeliveries({ projectId: project.id, withinDays: 90 })).toHaveLength(0);
  });
});

describe("schedule health", () => {
  it("measures slip against the planned date", async () => {
    const { project, po, poLine } = await setup([{ label: "One", plannedDate: addDays(NOW, -5), quantities: [12] }]);
    const item = await prisma.deliveryPlanItem.findFirstOrThrow({ where: { vendorPoId: po.id } });

    const grnId = await saveGrnDraft({
      vendorPoId: po.id,
      deliveryPlanItemId: item.id,
      receivedDate: NOW, // five days after it was promised
      deliveryNoteRef: null,
      notes: null,
      lines: [{ vendorPoLineId: poLine.id, quantityAccepted: 12, quantityRejected: 0, remarks: null }],
    });
    await postGrn(grnId, null);

    const health = await getScheduleHealth({ projectId: project.id });
    expect(health.averageSlipDays).toBe(5);
    expect(health.onTimePct).toBe(0);
    expect(health.overdueCount).toBe(0);
  });

  it("counts overdue tranches and their value", async () => {
    const { project } = await setup([
      { label: "Late 1", plannedDate: addDays(NOW, -20), quantities: [6] },
      { label: "Late 2", plannedDate: addDays(NOW, -2), quantities: [6] },
    ]);

    const health = await getScheduleHealth({ projectId: project.id });
    expect(health.overdueCount).toBe(2);
    expect(health.overdueValueMinor).toBe(toMinor(600)); // 12 × $50
  });
});
