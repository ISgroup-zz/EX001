import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Money, StatusBadge } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { listProjectInvoices } from "@/server/services/invoice";
import { getProjectSummary } from "@/server/services/reporting";
import { formatDate, isPast } from "@/lib/dates";
import { getT } from "@/server/locale";
import { fill } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export default async function ProjectInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [invoices, summary] = await Promise.all([listProjectInvoices(id), getProjectSummary(id)]);
  const t = await getT();

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <div>
          <h2 className="card-title">{t.projects.invoices}</h2>
          {summary.unbilledDeliveredMinor > 0 && (
            <p className="mt-0.5 text-xs text-amber-700">
              {fill(t.invoices.deliveredNotBilled, { amount: formatMoney(summary.unbilledDeliveredMinor, project.currency) })}
            </p>
          )}
        </div>
        <Link href={`/projects/${id}/invoices/new`} className="btn-primary btn-sm">
          {t.invoices.newInvoice}
        </Link>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title={t.invoices.noInvoicesYet}
          description={t.invoices.noInvoicesHint}
          action={
            <Link href={`/projects/${id}/invoices/new`} className="btn-primary btn-sm">
              {t.invoices.newInvoice}
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>{t.invoices.invoice}</th>
                <th>{t.invoices.againstCol}</th>
                <th>{t.common.issued}</th>
                <th>{t.common.due}</th>
                <th className="num text-end">{t.common.net}</th>
                <th className="num text-end">{t.common.total}</th>
                <th className="num text-end">{t.invoices.paid}</th>
                <th className="num text-end">{t.invoices.balance}</th>
                <th>{t.common.status}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const overdue =
                  invoice.dueDate && invoice.balanceMinor > 0 && invoice.status !== "CANCELLED" && isPast(invoice.dueDate);
                return (
                  <tr key={invoice.id}>
                    <td>
                      <Link href={`/invoices/${invoice.id}`} className="font-medium text-slate-900 hover:text-brand-700 tabular">
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td className="text-sm text-slate-600 tabular">{invoice.clientAgreement.reference}</td>
                    <td className="tabular">{formatDate(invoice.issueDate)}</td>
                    <td className={`tabular ${overdue ? "font-medium text-red-700" : ""}`}>
                      {formatDate(invoice.dueDate)}
                      {overdue && ` · ${t.common.overdue}`}
                    </td>
                    <td className="num text-end">
                      <Money minor={invoice.subtotalMinor} currency={invoice.currency} />
                    </td>
                    <td className="num text-end font-medium">
                      <Money minor={invoice.totalMinor} currency={invoice.currency} />
                    </td>
                    <td className="num text-end text-emerald-700">
                      <Money minor={invoice.paidMinor} currency={invoice.currency} />
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
  );
}
