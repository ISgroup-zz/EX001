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

export const metadata = { title: "Forecast · Procurement Hub" };

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

  return (
    <>
      <PageHeader
        title="Forecast"
        subtitle="Built from the delivery plans on every vendor purchase order — promised dates, and the client value behind them."
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
                {option} months
              </Link>
            ))}
          </div>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Deliveries planned" value={formatMoneyCompact(plannedAhead)} hint="At vendor cost, in this window" />
        <KpiCard label="Billable value" value={formatMoneyCompact(revenueAhead)} hint="Client value of those deliveries" />
        <KpiCard label="Cash expected" value={formatMoneyCompact(cashAhead)} hint="From invoices already issued" />
        <KpiCard
          label="Overdue deliveries"
          value={health.overdueCount}
          hint={formatMoneyCompact(health.overdueValueMinor)}
          tone={health.overdueCount > 0 ? "negative" : "positive"}
        />
      </section>

      <div className="space-y-6">
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Deliveries — planned vs. actual</h2>
              <p className="mt-0.5 text-xs text-slate-500">Vendor cost of planned tranches against goods actually received.</p>
            </div>
          </div>
          <div className="p-5">
            <ForecastChart buckets={delivery} />
          </div>
          <ForecastTable buckets={delivery} plannedLabel="Planned" actualLabel="Received" />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Billing — expected vs. invoiced</h2>
                <p className="mt-0.5 text-xs text-slate-500">Client value of planned deliveries against invoices raised.</p>
              </div>
            </div>
            <div className="p-5">
              <ForecastChart buckets={billing} />
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Cash — due vs. received</h2>
                <p className="mt-0.5 text-xs text-slate-500">Outstanding invoice balances by due date against payments in.</p>
              </div>
            </div>
            <div className="p-5">
              <ForecastChart buckets={cash} emptyMessage="No invoices outstanding in this period." />
            </div>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">Vendor delivery performance</h2>
            </div>
            {vendors.length === 0 ? (
              <EmptyState title="No measured receipts yet" description="Performance is measured once goods are received against a planned date." />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th className="num text-right">Receipts</th>
                    <th className="num text-right">On time</th>
                    <th className="num text-right">Average slip</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((vendor) => (
                    <tr key={vendor.vendorId}>
                      <td className="text-slate-900">{vendor.vendorName}</td>
                      <td className="num text-right tabular">{vendor.receipts}</td>
                      <td className="num text-right tabular">{formatPercent(vendor.onTimePct, 0)}</td>
                      <td
                        className={`num text-right tabular ${vendor.averageSlipDays > 0 ? "text-red-700" : "text-emerald-700"}`}
                      >
                        {vendor.averageSlipDays > 0 ? "+" : ""}
                        {vendor.averageSlipDays.toFixed(1)} days
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">Delivery pipeline</h2>
              <Link href="/deliveries" className="link text-xs">
                Work the queue →
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState title="Nothing scheduled" />
            ) : (
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Planned</th>
                    <th>Delivery</th>
                    <th>Project</th>
                    <th className="num text-right">Value</th>
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
                          <span className="ml-2">
                            <StatusBadge status="OVERDUE" />
                          </span>
                        )}
                      </td>
                      <td className="text-sm text-slate-600">{delivery.projectName}</td>
                      <td className="num text-right">
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
}: {
  buckets: Array<{ key: string; label: string; plannedMinor: number; actualMinor: number }>;
  plannedLabel: string;
  actualLabel: string;
}) {
  const withData = buckets.filter((bucket) => bucket.plannedMinor > 0 || bucket.actualMinor > 0);
  if (withData.length === 0) return null;

  return (
    <div className="overflow-x-auto border-t border-slate-200">
      <table className="table">
        <thead>
          <tr>
            <th>Month</th>
            {withData.map((bucket) => (
              <th key={bucket.key} className="num text-right">
                {bucket.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="font-medium text-slate-700">{plannedLabel}</td>
            {withData.map((bucket) => (
              <td key={bucket.key} className="num text-right tabular">
                <Money minor={bucket.plannedMinor} />
              </td>
            ))}
          </tr>
          <tr>
            <td className="font-medium text-slate-700">{actualLabel}</td>
            {withData.map((bucket) => (
              <td key={bucket.key} className="num text-right tabular">
                <Money minor={bucket.actualMinor} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
