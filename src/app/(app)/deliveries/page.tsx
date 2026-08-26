import Link from "next/link";
import { EmptyState, KpiCard, Money, PageHeader, StatusBadge } from "@/components/ui";
import { getScheduleHealth, getUpcomingDeliveries, type UpcomingDelivery } from "@/server/services/forecast";
import { formatDate, relativeDays } from "@/lib/dates";
import { formatMoneyCompact, formatPercent, formatQty } from "@/lib/money";

export const metadata = { title: "Deliveries · Procurement Hub" };

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

  const overdue = deliveries.filter((delivery) => delivery.isOverdue);
  const thisWeek = deliveries.filter((delivery) => !delivery.isOverdue && delivery.daysAway <= 7);
  const later = deliveries.filter((delivery) => !delivery.isOverdue && delivery.daysAway > 7);

  return (
    <>
      <PageHeader
        title="Deliveries"
        subtitle="Planned deliveries from every vendor purchase order. Receiving one takes a single click."
        actions={
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {[
              { days: 30, label: "30 days" },
              { days: 90, label: "90 days" },
              { days: 365, label: "1 year" },
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
          label="Overdue"
          value={health.overdueCount}
          hint={formatMoneyCompact(health.overdueValueMinor)}
          tone={health.overdueCount > 0 ? "negative" : "positive"}
        />
        <KpiCard label="Due in 7 days" value={health.dueNext7} />
        <KpiCard label="Due in 30 days" value={health.dueNext30} />
        <KpiCard
          label="On-time record"
          value={health.onTimePct === null ? "—" : formatPercent(health.onTimePct, 0)}
          hint={
            health.averageSlipDays === null
              ? "No receipts measured yet"
              : `Average slip ${health.averageSlipDays.toFixed(1)} days over ${health.receiptsMeasured} receipts`
          }
          tone={health.onTimePct !== null && health.onTimePct < 70 ? "warning" : "default"}
        />
      </section>

      {deliveries.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Nothing planned in this window"
            description="Delivery plans are recorded when a vendor PO is raised — every tranche shows up here."
          />
        </div>
      ) : (
        <div className="space-y-6">
          <DeliveryGroup title="Overdue" tone="danger" deliveries={overdue} />
          <DeliveryGroup title="Due this week" tone="warning" deliveries={thisWeek} />
          <DeliveryGroup title="Later" tone="default" deliveries={later} />
        </div>
      )}
    </>
  );
}

function DeliveryGroup({
  title,
  tone,
  deliveries,
}: {
  title: string;
  tone: "danger" | "warning" | "default";
  deliveries: UpcomingDelivery[];
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
              <th>Planned</th>
              <th>Delivery</th>
              <th>Vendor / PO</th>
              <th>Project</th>
              <th className="num text-right">Outstanding qty</th>
              <th className="num text-right">Value</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {deliveries.map((delivery) => (
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
                  <div className="text-xs text-slate-500 tabular">{delivery.projectCode}</div>
                </td>
                <td className="num text-right tabular">{formatQty(delivery.outstandingQty)}</td>
                <td className="num text-right">
                  <Money minor={delivery.valueMinor} currency={delivery.currency} />
                </td>
                <td className="text-right">
                  <Link
                    href={`/vendor-pos/${delivery.vendorPoId}/grns/new?planItemId=${delivery.planItemId}`}
                    className="btn-primary btn-sm"
                  >
                    Receive
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
