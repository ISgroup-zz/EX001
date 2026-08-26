import Link from "next/link";
import { EmptyState, KpiCard, Money, PageHeader, StatusBadge } from "@/components/ui";
import { prisma } from "@/server/db";
import { getPortfolioSummary } from "@/server/services/reporting";
import { formatDate, isPast } from "@/lib/dates";
import { formatMoneyCompact, sumMinor } from "@/lib/money";

export const metadata = { title: "Invoices · Procurement Hub" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;

  const [invoices, portfolio] = await Promise.all([
    prisma.invoice.findMany({
      where: status ? { status: status as "ISSUED" } : {},
      include: {
        client: { select: { name: true } },
        project: { select: { id: true, code: true, name: true } },
        clientAgreement: { select: { reference: true } },
        payments: { select: { amountMinor: true } },
      },
      orderBy: { issueDate: "desc" },
      take: 200,
    }),
    getPortfolioSummary(),
  ]);

  const rows = invoices.map((invoice) => ({
    ...invoice,
    balanceMinor: invoice.totalMinor - sumMinor(invoice.payments.map((payment) => payment.amountMinor)),
  }));

  return (
    <>
      <PageHeader title="Invoices" subtitle="Every invoice raised to clients across all projects." />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Invoiced (net)" value={formatMoneyCompact(portfolio.invoicedNetMinor)} />
        <KpiCard label="Collected" value={formatMoneyCompact(portfolio.paidMinor)} tone="positive" />
        <KpiCard
          label="Awaiting payment"
          value={formatMoneyCompact(portfolio.outstandingReceivableMinor)}
          tone={portfolio.outstandingReceivableMinor > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Delivered, not billed"
          value={formatMoneyCompact(portfolio.unbilledDeliveredMinor)}
          hint="Ready to invoice"
        />
      </section>

      <div className="mb-5 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {[
          { value: "", label: "All" },
          { value: "DRAFT", label: "Drafts" },
          { value: "ISSUED", label: "Issued" },
          { value: "PARTIALLY_PAID", label: "Part paid" },
          { value: "PAID", label: "Paid" },
        ].map((option) => (
          <Link
            key={option.value}
            href={option.value ? `/invoices?status=${option.value}` : "/invoices"}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              (status ?? "") === option.value
                ? "bg-slate-100 font-medium text-slate-900"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="No invoices" description="Invoices appear here once goods have been received and billed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Project</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th className="num text-right">Total</th>
                  <th className="num text-right">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((invoice) => {
                  const overdue =
                    invoice.dueDate && invoice.balanceMinor > 0 && invoice.status !== "CANCELLED" && isPast(invoice.dueDate);
                  return (
                    <tr key={invoice.id}>
                      <td>
                        <Link href={`/invoices/${invoice.id}`} className="font-medium text-slate-900 hover:text-brand-700 tabular">
                          {invoice.invoiceNumber}
                        </Link>
                        <div className="text-xs text-slate-500 tabular">{invoice.clientAgreement.reference}</div>
                      </td>
                      <td>{invoice.client.name}</td>
                      <td>
                        <Link href={`/projects/${invoice.project.id}`} className="hover:text-brand-700">
                          {invoice.project.name}
                        </Link>
                      </td>
                      <td className="tabular">{formatDate(invoice.issueDate)}</td>
                      <td className={`tabular ${overdue ? "font-medium text-red-700" : ""}`}>
                        {formatDate(invoice.dueDate)}
                      </td>
                      <td className="num text-right font-medium">
                        <Money minor={invoice.totalMinor} currency={invoice.currency} />
                      </td>
                      <td className="num text-right">
                        <Money minor={invoice.balanceMinor} currency={invoice.currency} />
                      </td>
                      <td>
                        <StatusBadge status={invoice.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
