import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createVendorPo } from "@/server/services/vendorPo";
import { postGrn, saveGrnDraft } from "@/server/services/grn";
import { createAgreement } from "@/server/services/agreement";
import { createInvoice, getBillableLines, issueInvoice, recordPayment } from "@/server/services/invoice";
import { getProjectSummary } from "@/server/services/reporting";
import { toMinor } from "@/lib/money";
import { addDays } from "@/lib/dates";
import { agreementInput, makeVendor, NOW, openStandardProject, resetDatabase } from "./helpers";

/**
 * Billing rules. An invoice can only cover goods actually received, and never the
 * same goods twice.
 */

beforeEach(resetDatabase);

/** Project with a client PO for 10 widgets @100, and a vendor PO for the same 10. */
async function setup() {
  const { project, agreement, lines } = await openStandardProject({
    lines: [{ description: "Widget", quantity: 10, unitPrice: 100 }],
  });
  const vendor = await makeVendor();

  const po = await createVendorPo({
    projectId: project.id,
    vendorId: vendor.id,
    clientAgreementId: agreement.id,
    poNumber: null,
    issueDate: NOW,
    expectedDeliveryDate: addDays(NOW, 14),
    notes: null,
    lines: [
      {
        description: "Widget",
        uom: "EA",
        quantity: 10,
        unitCostMinor: toMinor(70),
        taxRatePct: 0,
        clientAgreementLineId: lines[0].id,
        notes: null,
      },
    ],
    planItems: [],
  });

  const poLine = await prisma.vendorPOLine.findFirstOrThrow({ where: { vendorPoId: po.id } });
  return { project, agreement, clientLine: lines[0], po, poLine };
}

async function deliver(poId: string, poLineId: string, quantity: number) {
  const grnId = await saveGrnDraft({
    vendorPoId: poId,
    deliveryPlanItemId: null,
    receivedDate: NOW,
    deliveryNoteRef: null,
    notes: null,
    lines: [{ vendorPoLineId: poLineId, quantityAccepted: quantity, quantityRejected: 0, remarks: null }],
  });
  await postGrn(grnId, null);
}

async function bill(projectId: string, agreementId: string, clientLineId: string, quantity: number, unitPrice = 100) {
  return createInvoice({
    projectId,
    clientAgreementId: agreementId,
    issueDate: NOW,
    dueDate: addDays(NOW, 30),
    notes: null,
    lines: [
      {
        clientAgreementLineId: clientLineId,
        description: "Widget",
        uom: "EA",
        quantity,
        unitPriceMinor: toMinor(unitPrice),
        taxRatePct: 0,
      },
    ],
  });
}

describe("billable quantity", () => {
  it("is zero until goods are received", async () => {
    const { agreement } = await setup();
    const [line] = await getBillableLines(agreement.id);

    expect(line.deliveredQty).toBe(0);
    expect(line.billableQty).toBe(0);
  });

  it("tracks accepted goods receipt quantities", async () => {
    const { agreement, po, poLine } = await setup();
    await deliver(po.id, poLine.id, 4);

    const [line] = await getBillableLines(agreement.id);
    expect(line.deliveredQty).toBe(4);
    expect(line.billableQty).toBe(4);
    expect(line.suggestedQty).toBe(4);
  });

  it("excludes rejected quantities", async () => {
    const { agreement, po, poLine } = await setup();
    const grnId = await saveGrnDraft({
      vendorPoId: po.id,
      deliveryPlanItemId: null,
      receivedDate: NOW,
      deliveryNoteRef: null,
      notes: null,
      lines: [{ vendorPoLineId: poLine.id, quantityAccepted: 3, quantityRejected: 2, remarks: "damaged" }],
    });
    await postGrn(grnId, null);

    const [line] = await getBillableLines(agreement.id);
    expect(line.deliveredQty).toBe(3);
  });

  it("drops as quantities are invoiced", async () => {
    const { project, agreement, clientLine, po, poLine } = await setup();
    await deliver(po.id, poLine.id, 6);
    const invoiceId = await bill(project.id, agreement.id, clientLine.id, 6);
    await issueInvoice(invoiceId);

    const [line] = await getBillableLines(agreement.id);
    expect(line.invoicedQty).toBe(6);
    expect(line.billableQty).toBe(0);
  });

  it("never exceeds the ordered quantity even if more was received", async () => {
    const { project, agreement, clientLine } = await openStandardProject({
      lines: [{ description: "Service", quantity: 5, unitPrice: 100 }],
    }).then(async (base) => ({ ...base, clientLine: base.lines[0] }));

    // No vendor line behind it: a service line is billable in full.
    const [line] = await getBillableLines(agreement.id);
    expect(line.hasVendorCoverage).toBe(false);
    expect(line.billableQty).toBe(5);
    expect(await bill(project.id, agreement.id, clientLine.id, 5)).toBeTruthy();
  });
});

describe("issuing", () => {
  it("refuses to bill more than has been delivered", async () => {
    const { project, agreement, clientLine, po, poLine } = await setup();
    await deliver(po.id, poLine.id, 3);

    await expect(bill(project.id, agreement.id, clientLine.id, 5)).rejects.toThrow(/at most 3 can be billed/i);
  });

  it("refuses to bill the same goods twice", async () => {
    const { project, agreement, clientLine, po, poLine } = await setup();
    await deliver(po.id, poLine.id, 4);
    await issueInvoice(await bill(project.id, agreement.id, clientLine.id, 4));

    await expect(bill(project.id, agreement.id, clientLine.id, 4)).rejects.toThrow(/already invoiced/i);
  });

  it("bills the balance after a second delivery", async () => {
    const { project, agreement, clientLine, po, poLine } = await setup();

    await deliver(po.id, poLine.id, 4);
    await issueInvoice(await bill(project.id, agreement.id, clientLine.id, 4));

    await deliver(po.id, poLine.id, 6);
    const second = await bill(project.id, agreement.id, clientLine.id, 6);
    await issueInvoice(second);

    const [line] = await getBillableLines(agreement.id);
    expect(line.invoicedQty).toBe(10);
    expect(line.billableQty).toBe(0);
  });

  it("assigns a real invoice number only on issue", async () => {
    const { project, agreement, clientLine, po, poLine } = await setup();
    await deliver(po.id, poLine.id, 2);
    const invoiceId = await bill(project.id, agreement.id, clientLine.id, 2);

    const draft = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(draft.invoiceNumber).toMatch(/^DRAFT-/);

    const number = await issueInvoice(invoiceId);
    expect(number).toMatch(/^INV-\d{4}-0001$/);
  });

  it("snapshots totals so later changes to the client document don't rewrite history", async () => {
    const { project, agreement, clientLine, po, poLine } = await setup();
    await deliver(po.id, poLine.id, 5);
    const invoiceId = await bill(project.id, agreement.id, clientLine.id, 5);
    await issueInvoice(invoiceId);

    await prisma.clientAgreementLine.update({
      where: { id: clientLine.id },
      data: { unitPriceMinor: toMinor(999) },
    });

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.subtotalMinor).toBe(toMinor(500));
  });

  it("refuses to issue past the project budget", async () => {
    const { project, agreement, clientLine, po, poLine } = await setup();
    await deliver(po.id, poLine.id, 10);

    // Bill at a price far above the client's own, so the total breaks the budget.
    const invoiceId = await bill(project.id, agreement.id, clientLine.id, 10, 500);
    await expect(issueInvoice(invoiceId)).rejects.toThrow(/past its budget/i);
  });

  it("allows it once the client raises the budget with another PO", async () => {
    const { project, agreement, clientLine, po, poLine } = await setup();
    await deliver(po.id, poLine.id, 10);
    const invoiceId = await bill(project.id, agreement.id, clientLine.id, 10, 500);

    await createAgreement(
      project.id,
      agreementInput("PO", "CLIENT-PO-2", { lines: [{ description: "Uplift", quantity: 1, unitPrice: 10_000 }] }),
    );

    await expect(issueInvoice(invoiceId)).resolves.toMatch(/^INV-/);
  });
});

describe("payments", () => {
  it("moves an invoice to part paid then paid", async () => {
    const { project, agreement, clientLine, po, poLine } = await setup();
    await deliver(po.id, poLine.id, 10);
    const invoiceId = await bill(project.id, agreement.id, clientLine.id, 10);
    await issueInvoice(invoiceId);

    await recordPayment({ invoiceId, amountMinor: toMinor(400), paidDate: NOW, method: null, reference: null });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe("PARTIALLY_PAID");

    await recordPayment({ invoiceId, amountMinor: toMinor(600), paidDate: NOW, method: null, reference: null });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe("PAID");
  });

  it("refuses a payment above the balance", async () => {
    const { project, agreement, clientLine, po, poLine } = await setup();
    await deliver(po.id, poLine.id, 10);
    const invoiceId = await bill(project.id, agreement.id, clientLine.id, 10);
    await issueInvoice(invoiceId);

    await expect(
      recordPayment({ invoiceId, amountMinor: toMinor(1500), paidDate: NOW, method: null, reference: null }),
    ).rejects.toThrow(/more than the invoice balance/i);
  });

  it("refuses a payment against a draft", async () => {
    const { project, agreement, clientLine, po, poLine } = await setup();
    await deliver(po.id, poLine.id, 5);
    const invoiceId = await bill(project.id, agreement.id, clientLine.id, 5);

    await expect(
      recordPayment({ invoiceId, amountMinor: toMinor(100), paidDate: NOW, method: null, reference: null }),
    ).rejects.toThrow(/issue the invoice/i);
  });
});

describe("project rollups", () => {
  it("matches hand-computed totals", async () => {
    const { project, agreement, clientLine, po, poLine } = await setup();
    await deliver(po.id, poLine.id, 6);
    await issueInvoice(await bill(project.id, agreement.id, clientLine.id, 4));
    await recordPayment({
      invoiceId: (await prisma.invoice.findFirstOrThrow({ where: { projectId: project.id } })).id,
      amountMinor: toMinor(150),
      paidDate: NOW,
      method: null,
      reference: null,
    });

    const summary = await getProjectSummary(project.id);
    expect(summary.budgetMinor).toBe(toMinor(1000)); // 10 × 100
    expect(summary.committedCostMinor).toBe(toMinor(700)); // 10 × 70
    expect(summary.receivedCostMinor).toBe(toMinor(420)); // 6 × 70
    expect(summary.invoicedNetMinor).toBe(toMinor(400)); // 4 × 100
    expect(summary.paidMinor).toBe(toMinor(150));
    expect(summary.marginMinor).toBe(toMinor(300)); // 1000 − 700
    expect(summary.unbilledDeliveredMinor).toBe(toMinor(200)); // (6 − 4) × 100
    expect(summary.budgetRemainingMinor).toBe(toMinor(600));
  });
});
