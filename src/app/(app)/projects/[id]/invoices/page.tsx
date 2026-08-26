import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Money, StatusBadge } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { listProjectInvoices } from "@/server/services/invoice";
import { getProjectSummary } from "@/server/services/reporting";
import { formatDate, isPast } from "@/lib/dates";

export default async function ProjectInvoicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [invoices, summary] = await Promise.all([listProjectInvoices(id), getProjectSummary(id)]);

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <div>
          <h2 className="card-title">Invoices</h2>
          {summary.unbilledDeliveredMinor > 0 && (
            <p className="mt-0.5 text-xs text-amber-700">
              <Money minor={summary.unbilledDeliveredMinor} currency={project.currency} /> delivered and not yet billed.
            </p>
          )}
        </div>
        <Link href={`/projects/${id}/invoices/new`} className="btn-primary btn-sm">
          New invoice
        </Link>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Invoices draw from goods actually received, so post a receipt first and the quantities fill themselves in."
          action={
            <Link href={`/projects/${id}/invoices/new`} className="btn-primary btn-sm">
              New invoice
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Against</th>
                <th>Issued</th>
                <th>Due</th>
                <th className="num text-right">Net</th>
                <th className="num text-right">Total</th>
                <th className="num text-right">Paid</th>
                <th className="num text-right">Balance</th>
                <th>Status</th>
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
                      {overdue && " · overdue"}
                    </td>
                    <td className="num text-right">
                      <Money minor={invoice.subtotalMinor} currency={invoice.currency} />
                    </td>
                    <td className="num text-right font-medium">
                      <Money minor={invoice.totalMinor} currency={invoice.currency} />
                    </td>
                    <td className="num text-right text-emerald-700">
                      <Money minor={invoice.paidMinor} currency={invoice.currency} />
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
  );
}
