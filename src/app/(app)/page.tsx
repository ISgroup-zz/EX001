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
import { getT } from "@/server/locale";
import { fill } from "@/lib/i18n";

export default async function DashboardPage() {
  const [portfolio, deliveries, health, overdueInvoices, frameworks, projects] = await Promise.all([
    getPortfolioSummary(),
    getUpcomingDeliveries({ withinDays: 14 }),
    getScheduleHealth(),
    getOverdueInvoices(),
    getFrameworksNearCeiling(70),
    listProjects({ status: "ACTIVE" }),
  ]);
  const t = await getT();

  const overdue = deliveries.filter((delivery) => delivery.isOverdue);
  const dueSoon = deliveries.filter((delivery) => !delivery.isOverdue);

  const projectRows = await Promise.all(
    projects.slice(0, 8).map(async (project) => ({ project, summary: await getProjectSummary(project.id) })),
  );

  return (
    <>
      <PageHeader
        title={t.dashboard.title}
        subtitle={`${portfolio.projectCount} ${portfolio.projectCount === 1 ? t.dashboard.liveProject : t.dashboard.liveProjects}`}
        actions={
          <Link href="/projects/new" className="btn-primary">
            {t.nav.openProject}
          </Link>
        }
      />

      {/* Deliveries first: this is the work a PM does today. */}
      <section className="mb-6">
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="flex items-center gap-3">
              <h2 className="card-title">{t.dashboard.deliveriesNeedingAttention}</h2>
              {overdue.length > 0 && (
                <span className="badge bg-red-50 text-red-700 ring-red-200">{overdue.length} {t.dashboard.overdueCount}</span>
              )}
              {dueSoon.length > 0 && (
                <span className="badge bg-amber-50 text-amber-800 ring-amber-200">{dueSoon.length} {t.dashboard.dueSoon}</span>
              )}
            </div>
            <Link href="/deliveries" className="link text-sm">{t.dashboard.allDeliveries}</Link>
          </div>

          {deliveries.length === 0 ? (
            <EmptyState title={t.dashboard.nothingDue} description={t.dashboard.nothingDueHint} />
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>{t.dashboard.planned}</th>
                    <th>{t.dashboard.delivery}</th>
                    <th>{t.dashboard.vendorPo}</th>
                    <th>{t.common.project}</th>
                    <th className="num text-end">{t.dashboard.outstandingValue}</th>
                    <th className="w-28" />
                  </tr>
                </thead>
                <tbody>
                  {[...overdue, ...dueSoon].map((delivery) => (
                    <tr key={delivery.planItemId} className={delivery.isOverdue ? "bg-red-50/40" : undefined}>
                      <td>
                        <div className="font-medium tabular">{formatDate(delivery.plannedDate)}</div>
                        <div className={`text-xs ${delivery.isOverdue ? "font-medium text-red-700" : "text-slate-500"}`}>
                          {relativeDays(delivery.plannedDate, t)}
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
                      <td className="num text-end">
                        <Money minor={delivery.valueMinor} currency={delivery.currency} />
                      </td>
                      <td className="text-end">
                        <Link
                          href={`/vendor-pos/${delivery.vendorPoId}/grns/new?planItemId=${delivery.planItemId}`}
                          className="btn-secondary btn-sm"
                        >{t.dashboard.receive}</Link>
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
        <KpiCard label={t.dashboard.clientBudget} value={formatMoneyCompact(portfolio.budgetMinor)} hint={t.dashboard.acrossLiveProjects} />
        <KpiCard
          label={t.dashboard.committedToVendors}
          value={formatMoneyCompact(portfolio.committedCostMinor)}
          hint={`${t.dashboard.received} ${formatMoneyCompact(portfolio.receivedCostMinor)}`}
        />
        <KpiCard
          label={t.dashboard.margin}
          value={formatMoneyCompact(portfolio.marginMinor)}
          hint={formatPercent(portfolio.marginPct)}
          tone={portfolio.marginMinor >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          label={t.dashboard.deliveredNotBilled}
          value={formatMoneyCompact(portfolio.unbilledDeliveredMinor)}
          hint={t.dashboard.readyToInvoice}
          tone={portfolio.unbilledDeliveredMinor > 0 ? "warning" : "default"}
        />
        <KpiCard
          label={t.dashboard.awaitingPayment}
          value={formatMoneyCompact(portfolio.outstandingReceivableMinor)}
          hint={`${overdueInvoices.length} ${overdueInvoices.length === 1 ? t.dashboard.invoiceOverdue : t.dashboard.invoicesOverdue}`}
          tone={overdueInvoices.length > 0 ? "negative" : "default"}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2">
          <div className="card-header">
            <h2 className="card-title">{t.dashboard.activeProjects}</h2>
            <Link href="/projects" className="link text-sm">{t.dashboard.allProjects}</Link>
          </div>
          {projects.length === 0 ? (
            <EmptyState title={t.dashboard.noActiveProjects} />
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>{t.common.project}</th>
                    <th>{t.common.client}</th>
                    <th className="w-44">{t.dashboard.billedVsBudget}</th>
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
                          {fill(t.dashboard.amountOfTotal, {
                            amount: formatMoneyCompact(summary.invoicedNetMinor, project.currency),
                            total: formatMoneyCompact(summary.budgetMinor, project.currency),
                          })}
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
            <h2 className="card-title mb-3">{t.dashboard.deliveryPerformance}</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">{t.dashboard.overdueTranches}</dt>
                <dd className={`font-medium tabular ${health.overdueCount > 0 ? "text-red-700" : "text-slate-900"}`}>
                  {health.overdueCount}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">{t.dashboard.dueIn7}</dt>
                <dd className="font-medium tabular">{health.dueNext7}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">{t.dashboard.dueIn30}</dt>
                <dd className="font-medium tabular">{health.dueNext30}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2.5">
                <dt className="text-slate-600">{t.dashboard.onTimeReceipts}</dt>
                <dd className="font-medium tabular">
                  {health.onTimePct === null ? "—" : formatPercent(health.onTimePct, 0)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">{t.dashboard.averageSlip}</dt>
                <dd className="font-medium tabular">
                  {health.averageSlipDays === null ? t.common.none : `${health.averageSlipDays.toFixed(1)} ${t.dashboard.days}`}
                </dd>
              </div>
            </dl>
            <Link href="/forecast" className="link mt-4 inline-block text-sm">{t.dashboard.openForecast}</Link>
          </section>

          {frameworks.length > 0 && (
            <section className="card p-5">
              <h2 className="card-title mb-3">{t.dashboard.frameworksNearCeiling}</h2>
              <ul className="space-y-3">
                {frameworks.map((framework) => (
                  <li key={framework.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <Link href={`/agreements/${framework.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {framework.reference}
                      </Link>
                      <span className="text-xs text-slate-500">{formatPercent(framework.usedPct, 0)} {t.dashboard.used}</span>
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
                      {formatMoneyCompact(framework.remainingMinor, framework.project.currency)} {t.dashboard.left} ·{" "}
                      {framework.project.name}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {overdueInvoices.length > 0 && (
            <section className="card p-5">
              <h2 className="card-title mb-3">{t.dashboard.overdueInvoices}</h2>
              <ul className="space-y-3">
                {overdueInvoices.slice(0, 5).map((invoice) => (
                  <li key={invoice.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <div>
                      <Link href={`/invoices/${invoice.id}`} className="font-medium text-slate-900 hover:text-brand-700 tabular">
                        {invoice.invoiceNumber}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {invoice.client.name} · {t.common.due} {formatDate(invoice.dueDate)}
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
