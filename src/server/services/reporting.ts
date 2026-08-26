import { prisma, type Db } from "../db";
import { percentOf, sumMinor } from "@/lib/money";
import { getProjectBudgetMinor } from "./budget";
import { getCommittedCostMinor, getReceivedCostMinor } from "./vendorPo";
import { getInvoicedTotals } from "./invoice";

/**
 * Project rollups — one place that answers "where does this project stand?".
 *
 * Margin is client budget minus what we have committed to vendors, both net of tax.
 */

export type ProjectSummary = {
  budgetMinor: number;
  committedCostMinor: number;
  receivedCostMinor: number;
  invoicedNetMinor: number;
  invoicedGrossMinor: number;
  paidMinor: number;
  outstandingReceivableMinor: number;
  marginMinor: number;
  marginPct: number;
  budgetRemainingMinor: number;
  unbilledDeliveredMinor: number;
};

export async function getProjectSummary(projectId: string, db: Db = prisma): Promise<ProjectSummary> {
  const [budgetMinor, committedCostMinor, receivedCostMinor, invoiced] = await Promise.all([
    getProjectBudgetMinor(projectId, db),
    getCommittedCostMinor(projectId, db),
    getReceivedCostMinor(projectId, db),
    getInvoicedTotals(projectId, db),
  ]);

  const marginMinor = budgetMinor - committedCostMinor;

  return {
    budgetMinor,
    committedCostMinor,
    receivedCostMinor,
    invoicedNetMinor: invoiced.invoicedNetMinor,
    invoicedGrossMinor: invoiced.invoicedGrossMinor,
    paidMinor: invoiced.paidMinor,
    outstandingReceivableMinor: invoiced.invoicedGrossMinor - invoiced.paidMinor,
    marginMinor,
    marginPct: percentOf(marginMinor, budgetMinor),
    budgetRemainingMinor: budgetMinor - invoiced.invoicedNetMinor,
    unbilledDeliveredMinor: await getUnbilledDeliveredMinor(projectId, db),
  };
}

/**
 * Delivered but not yet invoiced, valued at CLIENT prices — the money sitting on the
 * shelf waiting for someone to raise an invoice.
 */
export async function getUnbilledDeliveredMinor(projectId: string, db: Db = prisma): Promise<number> {
  const agreementLines = await db.clientAgreementLine.findMany({
    where: { agreement: { projectId, status: { notIn: ["CANCELLED", "DRAFT"] } } },
    include: {
      vendorPoLines: {
        where: { vendorPo: { status: { not: "CANCELLED" } } },
        include: { grnLines: { where: { grn: { status: "POSTED" } }, select: { quantityAccepted: true } } },
      },
      invoiceLines: {
        where: { invoice: { status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] } } },
        select: { quantity: true },
      },
    },
  });

  return sumMinor(
    agreementLines.map((line) => {
      if (line.vendorPoLines.length === 0) return 0; // nothing to receive, so nothing "unbilled but delivered"
      const delivered = line.vendorPoLines.reduce(
        (sum, poLine) => sum + poLine.grnLines.reduce((lineSum, grnLine) => lineSum + grnLine.quantityAccepted, 0),
        0,
      );
      const invoiced = line.invoiceLines.reduce((sum, invoiceLine) => sum + invoiceLine.quantity, 0);
      const billable = Math.max(0, Math.min(line.quantity, delivered) - invoiced);
      return Math.round(billable * line.unitPriceMinor);
    }),
  );
}

export type PortfolioSummary = ProjectSummary & { projectCount: number };

/** The same rollup across every live project, for the dashboard. */
export async function getPortfolioSummary(db: Db = prisma): Promise<PortfolioSummary> {
  const projects = await db.project.findMany({
    where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
    select: { id: true },
  });

  const summaries = await Promise.all(projects.map((project) => getProjectSummary(project.id, db)));

  const totals = summaries.reduce<ProjectSummary>(
    (acc, summary) => ({
      budgetMinor: acc.budgetMinor + summary.budgetMinor,
      committedCostMinor: acc.committedCostMinor + summary.committedCostMinor,
      receivedCostMinor: acc.receivedCostMinor + summary.receivedCostMinor,
      invoicedNetMinor: acc.invoicedNetMinor + summary.invoicedNetMinor,
      invoicedGrossMinor: acc.invoicedGrossMinor + summary.invoicedGrossMinor,
      paidMinor: acc.paidMinor + summary.paidMinor,
      outstandingReceivableMinor: acc.outstandingReceivableMinor + summary.outstandingReceivableMinor,
      marginMinor: acc.marginMinor + summary.marginMinor,
      marginPct: 0,
      budgetRemainingMinor: acc.budgetRemainingMinor + summary.budgetRemainingMinor,
      unbilledDeliveredMinor: acc.unbilledDeliveredMinor + summary.unbilledDeliveredMinor,
    }),
    {
      budgetMinor: 0,
      committedCostMinor: 0,
      receivedCostMinor: 0,
      invoicedNetMinor: 0,
      invoicedGrossMinor: 0,
      paidMinor: 0,
      outstandingReceivableMinor: 0,
      marginMinor: 0,
      marginPct: 0,
      budgetRemainingMinor: 0,
      unbilledDeliveredMinor: 0,
    },
  );

  return {
    ...totals,
    marginPct: percentOf(totals.marginMinor, totals.budgetMinor),
    projectCount: projects.length,
  };
}

/** Invoices past their due date and not settled. */
export async function getOverdueInvoices(db: Db = prisma) {
  const invoices = await db.invoice.findMany({
    where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: new Date() } },
    include: {
      client: { select: { name: true } },
      project: { select: { id: true, name: true, code: true } },
      payments: { select: { amountMinor: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  return invoices.map((invoice) => ({
    ...invoice,
    balanceMinor: invoice.totalMinor - sumMinor(invoice.payments.map((payment) => payment.amountMinor)),
  }));
}

/** Frameworks that are nearly drawn down — a prompt to go back to the client. */
export async function getFrameworksNearCeiling(thresholdPct = 80, db: Db = prisma) {
  const frameworks = await db.clientAgreement.findMany({
    where: { type: "FRAMEWORK", status: { in: ["ACTIVE", "EXHAUSTED"] } },
    include: {
      children: { where: { status: { notIn: ["CANCELLED", "DRAFT"] } }, include: { lines: true } },
      project: { select: { id: true, name: true, code: true, currency: true } },
    },
  });

  return frameworks
    .map((framework) => {
      const ceilingMinor = framework.declaredValueMinor ?? 0;
      const calledOffMinor = sumMinor(
        framework.children.map((child) =>
          Math.round(child.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0)),
        ),
      );
      return {
        id: framework.id,
        reference: framework.reference,
        project: framework.project,
        ceilingMinor,
        calledOffMinor,
        remainingMinor: ceilingMinor - calledOffMinor,
        usedPct: percentOf(calledOffMinor, ceilingMinor),
      };
    })
    .filter((framework) => framework.usedPct >= thresholdPct)
    .sort((a, b) => b.usedPct - a.usedPct);
}
