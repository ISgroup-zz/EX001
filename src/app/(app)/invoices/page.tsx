import Link from "next/link";
import { EmptyState, KpiCard, Money, PageHeader, StatusBadge } from "@/components/ui";
import { prisma } from "@/server/db";
import { getPortfolioSummary } from "@/server/services/reporting";
import { formatDate, isPast } from "@/lib/dates";
import { formatMoneyCompact, sumMinor } from "@/lib/money";
import { getT } from "@/server/locale";

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
  const t = await getT();

  return (
    <>
      <PageHeader title={t.invoices.title} subtitle={t.invoices.subtitle} />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t.invoices.invoicedNet} value={formatMoneyCompact(portfolio.invoicedNetMinor)} />
        <KpiCard label={t.invoices.collected} value={formatMoneyCompact(portfolio.paidMinor)} tone="positive" />
        <KpiCard
          label={t.invoices.awaitingPayment}
          value={formatMoneyCompact(portfolio.outstandingReceivableMinor)}
          tone={portfolio.outstandingReceivableMinor > 0 ? "warning" : "default"}
        />
        <KpiCard
          label={t.dashboard.deliveredNotBilled}
          value={formatMoneyCompact(portfolio.unbilledDeliveredMinor)}
          hint={t.dashboard.readyToInvoice}
        />
      </section>

      <div className="mb-5 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {[
          { value: "", label: t.common.all },
          { value: "DRAFT", label: t.invoices.drafts },
          { value: "ISSUED", label: t.invoices.issuedFilter },
          { value: "PARTIALLY_PAID", label: t.invoices.partPaid },
          { value: "PAID", label: t.invoices.paidFilter },
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
          <EmptyState title={t.invoices.noInvoices} description={t.invoices.noInvoicesListHint} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>{t.invoices.invoice}</th>
                  <th>{t.common.client}</th>
                  <th>{t.common.project}</th>
                  <th>{t.common.issued}</th>
                  <th>{t.common.due}</th>
                  <th className="num text-end">{t.common.total}</th>
                  <th className="num text-end">{t.invoices.balance}</th>
                  <th>{t.common.status}</th>
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
                      <td className="num text-end font-medium">
                        <Money minor={invoice.totalMinor} currency={invoice.currency} />
                      </td>
                      <td className="num text-end">
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
