import Link from "next/link";
import { notFound } from "next/navigation";
import { BudgetTimeline } from "@/components/BudgetTimeline";
import { EmptyState, Money, ProgressBar, StatusBadge } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { getBudgetTimeline } from "@/server/services/budget";
import { getProjectSummary } from "@/server/services/reporting";
import { getUpcomingDeliveries } from "@/server/services/forecast";
import { listVendorPos } from "@/server/services/vendorPo";
import { formatDate, relativeDays } from "@/lib/dates";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [timeline, summary, deliveries, vendorPos] = await Promise.all([
    getBudgetTimeline(id),
    getProjectSummary(id),
    getUpcomingDeliveries({ projectId: id, withinDays: 60 }),
    listVendorPos(id),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="card lg:col-span-2">
        <div className="card-header">
          <div>
            <h2 className="card-title">Budget history</h2>
            <p className="mt-0.5 text-xs text-slate-500">Every client document and what it did to the budget.</p>
          </div>
          <Link href={`/projects/${id}/agreements/new`} className="btn-secondary btn-sm">
            Add document
          </Link>
        </div>
        <div className="p-5">
          <BudgetTimeline entries={timeline} currency={project.currency} />
        </div>
      </section>

      <div className="space-y-6">
        <section className="card p-5">
          <h2 className="card-title mb-3">Where the money stands</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Invoiced against budget</dt>
                <dd className="font-medium tabular">
                  <Money minor={summary.invoicedNetMinor} currency={project.currency} />
                </dd>
              </div>
              <div className="mt-1.5">
                <ProgressBar value={summary.invoicedNetMinor} total={summary.budgetMinor} />
              </div>
            </div>
            <div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Committed against budget</dt>
                <dd className="font-medium tabular">
                  <Money minor={summary.committedCostMinor} currency={project.currency} />
                </dd>
              </div>
              <div className="mt-1.5">
                <ProgressBar
                  value={summary.committedCostMinor}
                  total={summary.budgetMinor}
                  tone={summary.committedCostMinor > summary.budgetMinor ? "red" : "amber"}
                />
              </div>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-3">
              <dt className="text-slate-600">Received from vendors</dt>
              <dd className="font-medium tabular">
                <Money minor={summary.receivedCostMinor} currency={project.currency} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Paid by client</dt>
              <dd className="font-medium tabular">
                <Money minor={summary.paidMinor} currency={project.currency} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Awaiting payment</dt>
              <dd className="font-medium tabular">
                <Money minor={summary.outstandingReceivableMinor} currency={project.currency} />
              </dd>
            </div>
          </dl>

          {summary.unbilledDeliveredMinor > 0 && (
            <Link href={`/projects/${id}/invoices/new`} className="btn-primary btn-sm mt-4 w-full">
              Invoice <Money minor={summary.unbilledDeliveredMinor} currency={project.currency} /> delivered
            </Link>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Next deliveries</h2>
            <Link href={`/projects/${id}/vendor-pos`} className="link text-xs">
              All POs →
            </Link>
          </div>
          {deliveries.length === 0 ? (
            <EmptyState title="Nothing scheduled" description="Planned deliveries appear here once a vendor PO is raised." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {deliveries.slice(0, 6).map((delivery) => (
                <li key={delivery.planItemId} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{delivery.label}</span>
                      {delivery.isOverdue && <StatusBadge status="OVERDUE" />}
                    </div>
                    <p className="text-xs text-slate-500">
                      {delivery.vendorName} · {formatDate(delivery.plannedDate)} ({relativeDays(delivery.plannedDate)})
                    </p>
                  </div>
                  <Link
                    href={`/vendor-pos/${delivery.vendorPoId}/grns/new?planItemId=${delivery.planItemId}`}
                    className="btn-secondary btn-sm shrink-0"
                  >
                    Receive
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {project.description && (
          <section className="card p-5">
            <h2 className="card-title mb-2">Scope</h2>
            <p className="whitespace-pre-line text-sm text-slate-600">{project.description}</p>
          </section>
        )}

        {vendorPos.length > 0 && (
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Vendor POs</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {vendorPos.slice(0, 5).map((po) => (
                <li key={po.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/vendor-pos/${po.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-700 tabular">
                      {po.poNumber}
                    </Link>
                    <p className="truncate text-xs text-slate-500">{po.vendor.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money minor={po.totals.subtotalMinor} currency={project.currency} className="text-sm" />
                    <div className="mt-0.5">
                      <StatusBadge status={po.status} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
