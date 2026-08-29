import Link from "next/link";
import { ForecastChart } from "@/components/ForecastChart";
import { EmptyState, KpiCard, Money, PageHeader, StatusBadge } from "@/components/ui";
import {
  defaultRange,
  getBillingForecast,
  getCashForecast,
  getDeliveryForecast,
  getScheduleHealth,
  getUpcomingDeliveries,
  getVendorPerformance,
} from "@/server/services/forecast";
import { formatDate } from "@/lib/dates";
import { formatMoneyCompact, formatPercent, sumMinor } from "@/lib/money";
import { getT } from "@/server/locale";

/**
 * The forecast exists because every vendor PO carries a delivery plan: promised dates
 * with quantities behind them. That is what makes "what lands next month, and what can
 * we bill for it" answerable rather than guesswork.
 */
export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const { months } = await searchParams;
  const forward = Number(months) || 6;
  const range = defaultRange(2, forward);

  const [delivery, billing, cash, health, vendors, upcoming] = await Promise.all([
    getDeliveryForecast({ range }),
    getBillingForecast({ range }),
    getCashForecast({ range }),
    getScheduleHealth(),
    getVendorPerformance(),
    getUpcomingDeliveries({ withinDays: forward * 31 }),
  ]);

  const plannedAhead = sumMinor(delivery.map((bucket) => bucket.plannedMinor));
  const revenueAhead = sumMinor(billing.map((bucket) => bucket.plannedMinor));
  const cashAhead = sumMinor(cash.map((bucket) => bucket.plannedMinor));
  const t = await getT();

  return (
    <>
      <PageHeader
        title={t.forecast.title}
        subtitle={t.forecast.subtitle}
        actions={
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {[3, 6, 12].map((option) => (
              <Link
                key={option}
                href={`/forecast?months=${option}`}
                className={`rounded-md px-2.5 py-1 text-xs transition ${
                  forward === option ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option === 3 ? t.forecast.months3 : option === 6 ? t.forecast.months6 : t.forecast.months12}
              </Link>
            ))}
          </div>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t.forecast.deliveriesPlanned} value={formatMoneyCompact(plannedAhead)} hint={t.forecast.atVendorCost} />
        <KpiCard label={t.forecast.billableValue} value={formatMoneyCompact(revenueAhead)} hint={t.forecast.clientValueOf} />
        <KpiCard label={t.forecast.cashExpected} value={formatMoneyCompact(cashAhead)} hint={t.forecast.fromIssuedInvoices} />
        <KpiCard
          label={t.forecast.overdueDeliveries}
          value={health.overdueCount}
          hint={formatMoneyCompact(health.overdueValueMinor)}
          tone={health.overdueCount > 0 ? "negative" : "positive"}
        />
      </section>

      <div className="space-y-6">
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t.forecast.deliveriesChart}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{t.forecast.deliveriesChartHint}</p>
            </div>
          </div>
          <div className="p-5">
            <ForecastChart buckets={delivery} />
          </div>
          <ForecastTable buckets={delivery} plannedLabel={t.forecast.plannedRow} actualLabel={t.forecast.receivedRow} monthLabel={t.forecast.month} />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">{t.forecast.billingChart}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{t.forecast.billingChartHint}</p>
              </div>
            </div>
            <div className="p-5">
              <ForecastChart buckets={billing} />
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">{t.forecast.cashChart}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{t.forecast.cashChartHint}</p>
              </div>
            </div>
            <div className="p-5">
              <ForecastChart buckets={cash} emptyMessage={t.forecast.noInvoicesOutstanding} />
            </div>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">{t.forecast.vendorPerformance}</h2>
            </div>
            {vendors.length === 0 ? (
              <EmptyState title={t.forecast.noReceipts} description={t.forecast.noReceiptsHint} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.common.vendor}</th>
                    <th className="num text-end">{t.forecast.receipts}</th>
                    <th className="num text-end">{t.forecast.onTime}</th>
                    <th className="num text-end">{t.forecast.averageSlip}</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((vendor) => (
                    <tr key={vendor.vendorId}>
                      <td className="text-slate-900">{vendor.vendorName}</td>
                      <td className="num text-end tabular">{vendor.receipts}</td>
                      <td className="num text-end tabular">{formatPercent(vendor.onTimePct, 0)}</td>
                      <td
                        className={`num text-end tabular ${vendor.averageSlipDays > 0 ? "text-red-700" : "text-emerald-700"}`}
                      >
                        {vendor.averageSlipDays > 0 ? "+" : ""}
                        {vendor.averageSlipDays.toFixed(1)} {t.dashboard.days}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">{t.forecast.pipeline}</h2>
              <Link href="/deliveries" className="link text-xs">
                {t.deliveries.workTheQueue}
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState title={t.projects.nothingScheduled} />
            ) : (
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>{t.dashboard.planned}</th>
                    <th>{t.dashboard.delivery}</th>
                    <th>{t.common.project}</th>
                    <th className="num text-end">{t.common.value}</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.slice(0, 10).map((delivery) => (
                    <tr key={delivery.planItemId} className={delivery.isOverdue ? "bg-red-50/40" : undefined}>
                      <td className="tabular">{formatDate(delivery.plannedDate)}</td>
                      <td>
                        <Link href={`/vendor-pos/${delivery.vendorPoId}`} className="hover:text-brand-700">
                          {delivery.label}
                        </Link>
                        {delivery.isOverdue && (
                          <span className="ms-2">
                            <StatusBadge status="OVERDUE" />
                          </span>
                        )}
                      </td>
                      <td className="text-sm text-slate-600">{delivery.projectName}</td>
                      <td className="num text-end">
                        <Money minor={delivery.valueMinor} currency={delivery.currency} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/** The table view: every plotted value reachable without hovering. */
function ForecastTable({
  buckets,
  plannedLabel,
  actualLabel,
  monthLabel,
}: {
  buckets: Array<{ key: string; label: string; plannedMinor: number; actualMinor: number }>;
  plannedLabel: string;
  actualLabel: string;
  monthLabel: string;
}) {
  const withData = buckets.filter((bucket) => bucket.plannedMinor > 0 || bucket.actualMinor > 0);
  if (withData.length === 0) return null;

  return (
    <div className="overflow-x-auto border-t border-slate-200">
      <table className="table">
        <thead>
          <tr>
            <th>{monthLabel}</th>
            {withData.map((bucket) => (
              <th key={bucket.key} className="num text-end">
                {bucket.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="font-medium text-slate-700">{plannedLabel}</td>
            {withData.map((bucket) => (
              <td key={bucket.key} className="num text-end tabular">
                <Money minor={bucket.plannedMinor} />
              </td>
            ))}
          </tr>
          <tr>
            <td className="font-medium text-slate-700">{actualLabel}</td>
            {withData.map((bucket) => (
              <td key={bucket.key} className="num text-end tabular">
                <Money minor={bucket.actualMinor} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
