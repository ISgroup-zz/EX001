import Link from "next/link";
import { EmptyState, KpiCard, Money, PageHeader, ProgressBar, StatusBadge } from "@/components/ui";
import {
  getFrameworksNearCeiling,
  getOverdueInvoices,
  getPortfolioSummary,
  getProjectSummary,
} from "@/server/services/reporting";
import { getScheduleHealth, getUpcomingDeliveries } from "@/server/services/forecast";
import { listProjects } from "@/server/services/project";
import { formatDate, relativeDays } from "@/lib/dates";
import { formatMoneyCompact, formatPercent } from "@/lib/money";

export const metadata = { title: "Dashboard · Procurement Hub" };

export default async function DashboardPage() {
  const [portfolio, deliveries, health, overdueInvoices, frameworks, projects] = await Promise.all([
    getPortfolioSummary(),
    getUpcomingDeliveries({ withinDays: 14 }),
    getScheduleHealth(),
    getOverdueInvoices(),
    getFrameworksNearCeiling(70),
    listProjects({ status: "ACTIVE" }),
  ]);

  const overdue = deliveries.filter((delivery) => delivery.isOverdue);
  const dueSoon = deliveries.filter((delivery) => !delivery.isOverdue);

  const projectRows = await Promise.all(
    projects.slice(0, 8).map(async (project) => ({ project, summary: await getProjectSummary(project.id) })),
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${portfolio.projectCount} live project${portfolio.projectCount === 1 ? "" : "s"}`}
        actions={
          <Link href="/projects/new" className="btn-primary">
            Open project
          </Link>
        }
      />

      {/* Deliveries first: this is the work a PM does today. */}
      <section className="mb-6">
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="flex items-center gap-3">
              <h2 className="card-title">Deliveries needing attention</h2>
              {overdue.length > 0 && (
                <span className="badge bg-red-50 text-red-700 ring-red-200">{overdue.length} overdue</span>
              )}
              {dueSoon.length > 0 && (
                <span className="badge bg-amber-50 text-amber-800 ring-amber-200">{dueSoon.length} due soon</span>
              )}
            </div>
            <Link href="/deliveries" className="link text-sm">
              All deliveries →
            </Link>
          </div>

          {deliveries.length === 0 ? (
            <EmptyState title="Nothing due in the next two weeks" description="Planned deliveries appear here as their dates approach." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Planned</th>
                    <th>Delivery</th>
                    <th>Vendor / PO</th>
                    <th>Project</th>
                    <th className="num text-right">Outstanding value</th>
                    <th className="w-28" />
                  </tr>
                </thead>
                <tbody>
                  {[...overdue, ...dueSoon].map((delivery) => (
                    <tr key={delivery.planItemId} className={delivery.isOverdue ? "bg-red-50/40" : undefined}>
                      <td>
                        <div className="font-medium tabular">{formatDate(delivery.plannedDate)}</div>
                        <div className={`text-xs ${delivery.isOverdue ? "font-medium text-red-700" : "text-slate-500"}`}>
                          {relativeDays(delivery.plannedDate)}
                        </div>
                      </td>
                      <td>
                        <div className="font-medium text-slate-900">{delivery.label}</div>
                        <StatusBadge status={delivery.isOverdue ? "OVERDUE" : delivery.status} />
                      </td>
                      <td>
                        <div>{delivery.vendorName}</div>
                        <Link href={`/vendor-pos/${delivery.vendorPoId}`} className="text-xs text-slate-500 hover:text-brand-700 tabular">
                          {delivery.poNumber}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/projects/${delivery.projectId}`} className="hover:text-brand-700">
                          {delivery.projectName}
                        </Link>
                      </td>
                      <td className="num text-right">
                        <Money minor={delivery.valueMinor} currency={delivery.currency} />
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/vendor-pos/${delivery.vendorPoId}/grns/new?planItemId=${delivery.planItemId}`}
                          className="btn-secondary btn-sm"
                        >
                          Receive
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Client budget" value={formatMoneyCompact(portfolio.budgetMinor)} hint="Across live projects" />
        <KpiCard
          label="Committed to vendors"
          value={formatMoneyCompact(portfolio.committedCostMinor)}
          hint={`Received ${formatMoneyCompact(portfolio.receivedCostMinor)}`}
        />
        <KpiCard
          label="Margin"
          value={formatMoneyCompact(portfolio.marginMinor)}
          hint={formatPercent(portfolio.marginPct)}
          tone={portfolio.marginMinor >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          label="Delivered, not billed"
          value={formatMoneyCompact(portfolio.unbilledDeliveredMinor)}
          hint="Ready to invoice"
          tone={portfolio.unbilledDeliveredMinor > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Awaiting payment"
          value={formatMoneyCompact(portfolio.outstandingReceivableMinor)}
          hint={`${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"} overdue`}
          tone={overdueInvoices.length > 0 ? "negative" : "default"}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2">
          <div className="card-header">
            <h2 className="card-title">Active projects</h2>
            <Link href="/projects" className="link text-sm">
              All projects →
            </Link>
          </div>
          {projects.length === 0 ? (
            <EmptyState title="No active projects" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th className="w-44">Billed vs budget</th>
                  </tr>
                </thead>
                <tbody>
                  {projectRows.map(({ project, summary }) => (
                    <tr key={project.id}>
                      <td>
                        <Link href={`/projects/${project.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {project.name}
                        </Link>
                        <div className="text-xs text-slate-500 tabular">{project.code}</div>
                      </td>
                      <td>{project.client.name}</td>
                      <td>
                        <ProgressBar value={summary.invoicedNetMinor} total={summary.budgetMinor} />
                        <div className="mt-1 text-xs text-slate-500 tabular">
                          {formatMoneyCompact(summary.invoicedNetMinor, project.currency)} of{" "}
                          {formatMoneyCompact(summary.budgetMinor, project.currency)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="card-title mb-3">Delivery performance</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Overdue tranches</dt>
                <dd className={`font-medium tabular ${health.overdueCount > 0 ? "text-red-700" : "text-slate-900"}`}>
                  {health.overdueCount}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Due in 7 days</dt>
                <dd className="font-medium tabular">{health.dueNext7}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Due in 30 days</dt>
                <dd className="font-medium tabular">{health.dueNext30}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2.5">
                <dt className="text-slate-600">On-time receipts</dt>
                <dd className="font-medium tabular">
                  {health.onTimePct === null ? "—" : formatPercent(health.onTimePct, 0)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Average slip</dt>
                <dd className="font-medium tabular">
                  {health.averageSlipDays === null ? "—" : `${health.averageSlipDays.toFixed(1)} days`}
                </dd>
              </div>
            </dl>
            <Link href="/forecast" className="link mt-4 inline-block text-sm">
              Open forecast →
            </Link>
          </section>

          {frameworks.length > 0 && (
            <section className="card p-5">
              <h2 className="card-title mb-3">Frameworks nearing ceiling</h2>
              <ul className="space-y-3">
                {frameworks.map((framework) => (
                  <li key={framework.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <Link href={`/agreements/${framework.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {framework.reference}
                      </Link>
                      <span className="text-xs text-slate-500">{formatPercent(framework.usedPct, 0)} used</span>
                    </div>
                    <div className="mt-1">
                      <ProgressBar
                        value={framework.calledOffMinor}
                        total={framework.ceilingMinor}
                        tone={framework.usedPct >= 90 ? "red" : "amber"}
                        showPct={false}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500 tabular">
                      {formatMoneyCompact(framework.remainingMinor, framework.project.currency)} left ·{" "}
                      {framework.project.name}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {overdueInvoices.length > 0 && (
            <section className="card p-5">
              <h2 className="card-title mb-3">Overdue invoices</h2>
              <ul className="space-y-3">
                {overdueInvoices.slice(0, 5).map((invoice) => (
                  <li key={invoice.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <div>
                      <Link href={`/invoices/${invoice.id}`} className="font-medium text-slate-900 hover:text-brand-700 tabular">
                        {invoice.invoiceNumber}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {invoice.client.name} · due {formatDate(invoice.dueDate)}
                      </div>
                    </div>
                    <Money minor={invoice.balanceMinor} currency={invoice.currency} className="font-medium text-red-700" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
