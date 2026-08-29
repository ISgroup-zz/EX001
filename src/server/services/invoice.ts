import { prisma, type Db } from "../db";
import { nextDocumentNumber } from "../numbering";
import { lineTotalMinor, roundQty, sumMinor, taxMinor, totalsForLines } from "@/lib/money";
import { addDays } from "@/lib/dates";
import type { InvoiceInput } from "@/lib/validation/schemas";
import { getProjectBudgetMinor } from "./budget";

/**
 * Client invoicing.
 *
 * We bill what has actually been DELIVERED, so an invoice can never run ahead of the
 * goods. Per client line:
 *
 *   billable = min(ordered, delivered) − already invoiced
 *
 * where `delivered` is the accepted quantity on posted GRNs against the vendor PO lines
 * linked to that client line. Client lines with no vendor line behind them (services,
 * mark-ups) fall back to their ordered quantity — there is nothing to receive.
 */

const ISSUED_STATUSES = ["ISSUED", "PARTIALLY_PAID", "PAID"] as const;

export type BillableLine = {
  clientAgreementLineId: string;
  lineNo: number;
  description: string;
  uom: string;
  unitPriceMinor: number;
  taxRatePct: number;
  orderedQty: number;
  deliveredQty: number;
  invoicedQty: number;
  draftedQty: number;
  /** Hard ceiling used when issuing. */
  billableQty: number;
  /** Pre-fill suggestion, which also steps around quantities held on other open drafts. */
  suggestedQty: number;
  hasVendorCoverage: boolean;
};

export async function getBillableLines(
  clientAgreementId: string,
  options: { excludeInvoiceId?: string } = {},
  db: Db = prisma,
): Promise<BillableLine[]> {
  const agreement = await db.clientAgreement.findUnique({
    where: { id: clientAgreementId },
    include: {
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          vendorPoLines: {
            where: { vendorPo: { status: { not: "CANCELLED" } } },
            include: { grnLines: { where: { grn: { status: "POSTED" } }, select: { quantityAccepted: true } } },
          },
          invoiceLines: {
            where: {
              invoice: {
                status: { notIn: ["CANCELLED"] },
                ...(options.excludeInvoiceId ? { id: { not: options.excludeInvoiceId } } : {}),
              },
            },
            include: { invoice: { select: { status: true } } },
          },
        },
      },
    },
  });
  if (!agreement) return [];

  return agreement.lines.map((line) => {
    const hasVendorCoverage = line.vendorPoLines.length > 0;
    const deliveredQty = hasVendorCoverage
      ? roundQty(
          line.vendorPoLines.reduce(
            (sum, poLine) => sum + poLine.grnLines.reduce((lineSum, grnLine) => lineSum + grnLine.quantityAccepted, 0),
            0,
          ),
        )
      : roundQty(line.quantity);

    const invoicedQty = roundQty(
      line.invoiceLines
        .filter((invoiceLine) => (ISSUED_STATUSES as readonly string[]).includes(invoiceLine.invoice.status))
        .reduce((sum, invoiceLine) => sum + invoiceLine.quantity, 0),
    );
    const draftedQty = roundQty(
      line.invoiceLines
        .filter((invoiceLine) => invoiceLine.invoice.status === "DRAFT")
        .reduce((sum, invoiceLine) => sum + invoiceLine.quantity, 0),
    );

    const deliveredWithinOrder = Math.min(roundQty(line.quantity), deliveredQty);
    const billableQty = roundQty(Math.max(0, deliveredWithinOrder - invoicedQty));

    return {
      clientAgreementLineId: line.id,
      lineNo: line.lineNo,
      description: line.description,
      uom: line.uom,
      unitPriceMinor: line.unitPriceMinor,
      taxRatePct: line.taxRatePct,
      orderedQty: roundQty(line.quantity),
      deliveredQty,
      invoicedQty,
      draftedQty,
      billableQty,
      suggestedQty: roundQty(Math.max(0, billableQty - draftedQty)),
      hasVendorCoverage,
    };
  });
}

/** Reject anything that bills more than has been delivered, line by line. */
async function assertLinesAreBillable(
  clientAgreementId: string,
  lines: InvoiceInput["lines"],
  excludeInvoiceId: string | undefined,
  db: Db,
): Promise<void> {
  const billable = await getBillableLines(clientAgreementId, { excludeInvoiceId }, db);
  const byId = new Map(billable.map((line) => [line.clientAgreementLineId, line]));

  for (const line of lines) {
    if (!line.clientAgreementLineId) continue; // free-text line, checked against budget instead
    const reference = byId.get(line.clientAgreementLineId);
    if (!reference) throw new Error("This invoice refers to a line that is not on the selected client document.");
    if (roundQty(line.quantity) > reference.billableQty) {
      throw new Error(
        `"${reference.description}": ${reference.deliveredQty} delivered, ${reference.invoicedQty} already invoiced, so at most ${reference.billableQty} can be billed now.`,
      );
    }
  }
}

function computeTotals(lines: InvoiceInput["lines"]) {
  return totalsForLines(
    lines.map((line) => ({ quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, taxRatePct: line.taxRatePct })),
  );
}

export async function createInvoice(input: InvoiceInput, db: Db = prisma): Promise<string> {
  const [project, agreement] = await Promise.all([
    db.project.findUnique({ where: { id: input.projectId }, select: { id: true, clientId: true, currency: true } }),
    db.clientAgreement.findUnique({ where: { id: input.clientAgreementId }, select: { id: true, projectId: true, status: true, reference: true, validTo: true } }),
  ]);
  if (!project) throw new Error("Project not found.");
  if (!agreement || agreement.projectId !== project.id) throw new Error("That client document is not on this project.");
  if (agreement.status === "CANCELLED" || agreement.status === "DRAFT") {
    throw new Error(`${agreement.reference} is not active and cannot be invoiced against.`);
  }

  await assertLinesAreBillable(input.clientAgreementId, input.lines, undefined, db);

  const client = await db.client.findUnique({ where: { id: project.clientId }, select: { paymentTermsDays: true } });
  const totals = computeTotals(input.lines);

  const invoice = await db.invoice.create({
    data: {
      projectId: project.id,
      clientId: project.clientId,
      clientAgreementId: input.clientAgreementId,
      // Drafts hold a placeholder so cancelled drafts don't burn a number in the sequence.
      invoiceNumber: `DRAFT-${Date.now().toString(36).toUpperCase()}`,
      status: "DRAFT",
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? addDays(input.issueDate, client?.paymentTermsDays ?? 30),
      currency: project.currency,
      notes: input.notes,
      subtotalMinor: totals.subtotalMinor,
      taxTotalMinor: totals.taxTotalMinor,
      totalMinor: totals.totalMinor,
      lines: {
        create: input.lines.map((line, index) => ({
          lineNo: index + 1,
          clientAgreementLineId: line.clientAgreementLineId,
          description: line.description,
          uom: line.uom || "EA",
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          taxRatePct: line.taxRatePct,
          lineTotalMinor: lineTotalMinor(line.quantity, line.unitPriceMinor),
        })),
      },
    },
  });

  return invoice.id;
}

export async function updateInvoiceDraft(invoiceId: string, input: InvoiceInput, db: Db = prisma): Promise<void> {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== "DRAFT") throw new Error("Only a draft invoice can be edited.");

  await assertLinesAreBillable(input.clientAgreementId, input.lines, invoiceId, db);
  const totals = computeTotals(input.lines);

  await db.invoiceLine.deleteMany({ where: { invoiceId } });
  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      clientAgreementId: input.clientAgreementId,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      notes: input.notes,
      subtotalMinor: totals.subtotalMinor,
      taxTotalMinor: totals.taxTotalMinor,
      totalMinor: totals.totalMinor,
      lines: {
        create: input.lines.map((line, index) => ({
          lineNo: index + 1,
          clientAgreementLineId: line.clientAgreementLineId,
          description: line.description,
          uom: line.uom || "EA",
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          taxRatePct: line.taxRatePct,
          lineTotalMinor: lineTotalMinor(line.quantity, line.unitPriceMinor),
        })),
      },
    },
  });
}

/**
 * Issuing assigns the real number and snapshots the totals, so later edits to the
 * client document never rewrite an invoice that has already gone out.
 */
export async function issueInvoice(invoiceId: string, db: Db = prisma): Promise<string> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true, clientAgreement: { select: { id: true, reference: true, validTo: true, status: true } } },
  });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== "DRAFT") throw new Error("This invoice has already been issued.");
  if (invoice.lines.length === 0) throw new Error("An invoice needs at least one line.");

  await assertLinesAreBillable(
    invoice.clientAgreementId,
    invoice.lines.map((line) => ({
      clientAgreementLineId: line.clientAgreementLineId,
      description: line.description,
      uom: line.uom,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxRatePct: line.taxRatePct,
    })),
    invoiceId,
    db,
  );

  // Total billed across the project must stay inside the budget the client committed.
  const [budgetMinor, issuedTotal] = await Promise.all([
    getProjectBudgetMinor(invoice.projectId, db),
    db.invoice.aggregate({
      where: { projectId: invoice.projectId, status: { in: [...ISSUED_STATUSES] }, id: { not: invoiceId } },
      _sum: { subtotalMinor: true },
    }),
  ]);
  const alreadyInvoiced = issuedTotal._sum.subtotalMinor ?? 0;
  if (alreadyInvoiced + invoice.subtotalMinor > budgetMinor) {
    throw new Error(
      `This invoice would take the project past its budget (budget ${(budgetMinor / 100).toFixed(2)}, already invoiced ${(alreadyInvoiced / 100).toFixed(2)}). Record the client's additional PO or variation first.`,
    );
  }

  const subtotalMinor = sumMinor(invoice.lines.map((line) => lineTotalMinor(line.quantity, line.unitPriceMinor)));
  const taxTotalMinor = sumMinor(
    invoice.lines.map((line) => taxMinor(lineTotalMinor(line.quantity, line.unitPriceMinor), line.taxRatePct)),
  );
  const invoiceNumber = await nextDocumentNumber(db, "INV", invoice.issueDate);

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      invoiceNumber,
      status: "ISSUED",
      issuedAt: new Date(),
      subtotalMinor,
      taxTotalMinor,
      totalMinor: subtotalMinor + taxTotalMinor,
    },
  });

  return invoiceNumber;
}

export async function cancelInvoice(invoiceId: string, db: Db = prisma): Promise<void> {
  const paid = await db.payment.aggregate({ where: { invoiceId }, _sum: { amountMinor: true } });
  if ((paid._sum.amountMinor ?? 0) > 0) throw new Error("Payments have been recorded against this invoice.");
  await db.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED" } });
}

export async function deleteInvoiceDraft(invoiceId: string, db: Db = prisma): Promise<void> {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== "DRAFT") throw new Error("Only a draft invoice can be deleted.");
  await db.invoice.delete({ where: { id: invoiceId } });
}

export async function recordPayment(
  input: { invoiceId: string; amountMinor: number; paidDate: Date; method: string | null; reference: string | null },
  db: Db = prisma,
): Promise<void> {
  const invoice = await db.invoice.findUnique({
    where: { id: input.invoiceId },
    include: { payments: true },
  });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "DRAFT") throw new Error("Issue the invoice before recording a payment.");
  if (invoice.status === "CANCELLED") throw new Error("This invoice has been cancelled.");
  if (input.amountMinor <= 0) throw new Error("Enter a payment amount.");

  const alreadyPaid = sumMinor(invoice.payments.map((payment) => payment.amountMinor));
  if (alreadyPaid + input.amountMinor > invoice.totalMinor) {
    throw new Error(`That is more than the invoice balance of ${((invoice.totalMinor - alreadyPaid) / 100).toFixed(2)}.`);
  }

  await db.payment.create({
    data: {
      invoiceId: input.invoiceId,
      amountMinor: input.amountMinor,
      paidDate: input.paidDate,
      method: input.method,
      reference: input.reference,
    },
  });

  const paidTotal = alreadyPaid + input.amountMinor;
  await db.invoice.update({
    where: { id: input.invoiceId },
    data: { status: paidTotal >= invoice.totalMinor ? "PAID" : "PARTIALLY_PAID" },
  });
}

export async function getInvoice(invoiceId: string, db: Db = prisma) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: { orderBy: { lineNo: "asc" } },
      payments: { orderBy: { paidDate: "asc" } },
      client: true,
      project: { select: { id: true, name: true, code: true, currency: true } },
      clientAgreement: { select: { id: true, reference: true, type: true } },
    },
  });
  if (!invoice) return null;

  const paidMinor = sumMinor(invoice.payments.map((payment) => payment.amountMinor));
  return { ...invoice, paidMinor, balanceMinor: invoice.totalMinor - paidMinor };
}

export async function listProjectInvoices(projectId: string, db: Db = prisma) {
  const invoices = await db.invoice.findMany({
    where: { projectId },
    include: {
      payments: { select: { amountMinor: true } },
      clientAgreement: { select: { reference: true, type: true } },
    },
    orderBy: { issueDate: "desc" },
  });

  return invoices.map((invoice) => {
    const paidMinor = sumMinor(invoice.payments.map((payment) => payment.amountMinor));
    return { ...invoice, paidMinor, balanceMinor: invoice.totalMinor - paidMinor };
  });
}

/** Net invoiced and paid on a project — the revenue half of the rollups. */
export async function getInvoicedTotals(projectId: string, db: Db = prisma) {
  const [invoiced, payments] = await Promise.all([
    db.invoice.aggregate({
      where: { projectId, status: { in: [...ISSUED_STATUSES] } },
      _sum: { subtotalMinor: true, totalMinor: true },
    }),
    db.payment.aggregate({ where: { invoice: { projectId } }, _sum: { amountMinor: true } }),
  ]);

  return {
    invoicedNetMinor: invoiced._sum.subtotalMinor ?? 0,
    invoicedGrossMinor: invoiced._sum.totalMinor ?? 0,
    paidMinor: payments._sum.amountMinor ?? 0,
  };
}
