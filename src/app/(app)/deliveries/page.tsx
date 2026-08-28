import Link from "next/link";
import { EmptyState, KpiCard, Money, PageHeader, StatusBadge } from "@/components/ui";
import { getScheduleHealth, getUpcomingDeliveries, type UpcomingDelivery } from "@/server/services/forecast";
import { formatDate, relativeDays } from "@/lib/dates";
import { formatMoneyCompact, formatPercent, formatQty } from "@/lib/money";
import { getT } from "@/server/locale";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * The PM work queue: every open tranche across every project, soonest first, each one
 * click away from a pre-filled goods receipt.
 */
export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const { window } = await searchParams;
  const horizon = Number(window) || 90;

  const [deliveries, health] = await Promise.all([
    getUpcomingDeliveries({ withinDays: horizon }),
    getScheduleHealth(),
  ]);
  const t = await getT();

  const overdue = deliveries.filter((delivery) => delivery.isOverdue);
  const thisWeek = deliveries.filter((delivery) => !delivery.isOverdue && delivery.daysAway <= 7);
  const later = deliveries.filter((delivery) => !delivery.isOverdue && delivery.daysAway > 7);

  return (
    <>
      <PageHeader
        title={t.deliveries.title}
        subtitle={t.deliveries.subtitle}
        actions={
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {[
              { days: 30, label: t.deliveries.window30 },
              { days: 90, label: t.deliveries.window90 },
              { days: 365, label: t.deliveries.window365 },
            ].map((option) => (
              <Link
                key={option.days}
                href={`/deliveries?window=${option.days}`}
                className={`rounded-md px-2.5 py-1 text-xs transition ${
                  horizon === option.days ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t.deliveries.overdue}
          value={health.overdueCount}
          hint={formatMoneyCompact(health.overdueValueMinor)}
          tone={health.overdueCount > 0 ? "negative" : "positive"}
        />
        <KpiCard label={t.deliveries.dueIn7} value={health.dueNext7} />
        <KpiCard label={t.deliveries.dueIn30} value={health.dueNext30} />
        <KpiCard
          label={t.deliveries.onTimeRecord}
          value={health.onTimePct === null ? "—" : formatPercent(health.onTimePct, 0)}
          hint={
            health.averageSlipDays === null
              ? t.deliveries.noReceiptsMeasured
              : fill(t.deliveries.averageSlipOver, { days: health.averageSlipDays.toFixed(1), count: health.receiptsMeasured })
          }
          tone={health.onTimePct !== null && health.onTimePct < 70 ? "warning" : "default"}
        />
      </section>

      {deliveries.length === 0 ? (
        <div className="card">
          <EmptyState
            title={t.deliveries.nothingPlanned}
            description={t.deliveries.nothingPlannedHint}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <DeliveryGroup title={t.deliveries.overdueGroup} tone="danger" deliveries={overdue} t={t} />
          <DeliveryGroup title={t.deliveries.dueThisWeek} tone="warning" deliveries={thisWeek} t={t} />
          <DeliveryGroup title={t.deliveries.later} tone="default" deliveries={later} t={t} />
        </div>
      )}
    </>
  );
}

function DeliveryGroup({
  title,
  tone,
  deliveries,
  t,
}: {
  title: string;
  tone: "danger" | "warning" | "default";
  deliveries: UpcomingDelivery[];
  t: Dictionary;
}) {
  if (deliveries.length === 0) return null;

  const badgeTone = {
    danger: "bg-red-50 text-red-700 ring-red-200",
    warning: "bg-amber-50 text-amber-800 ring-amber-200",
    default: "bg-slate-100 text-slate-600 ring-slate-200",
  }[tone];

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <h2 className="card-title">{title}</h2>
          <span className={`badge ${badgeTone}`}>{deliveries.length}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>{t.dashboard.planned}</th>
              <th>{t.dashboard.delivery}</th>
              <th>{t.dashboard.vendorPo}</th>
              <th>{t.common.project}</th>
              <th className="num text-end">{t.deliveries.outstandingQty}</th>
              <th className="num text-end">{t.common.value}</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {deliveries.map((delivery) => (
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
                  <div className="text-xs text-slate-500 tabular">{delivery.projectCode}</div>
                </td>
                <td className="num text-end tabular">{formatQty(delivery.outstandingQty)}</td>
                <td className="num text-end">
                  <Money minor={delivery.valueMinor} currency={delivery.currency} />
                </td>
                <td className="text-end">
                  <Link
                    href={`/vendor-pos/${delivery.vendorPoId}/grns/new?planItemId=${delivery.planItemId}`}
                    className="btn-primary btn-sm"
                  >
                    {t.dashboard.receive}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
