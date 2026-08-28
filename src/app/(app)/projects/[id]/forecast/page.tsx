import { notFound } from "next/navigation";
import { ForecastChart } from "@/components/ForecastChart";
import { EmptyState, KpiCard } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { defaultRange, getBillingForecast, getDeliveryForecast, getScheduleHealth } from "@/server/services/forecast";
import { formatMoneyCompact, formatPercent, sumMinor } from "@/lib/money";
import { getT } from "@/server/locale";

export default async function ProjectForecastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const range = defaultRange(2, 9);
  const [delivery, billing, health] = await Promise.all([
    getDeliveryForecast({ projectId: id, range }),
    getBillingForecast({ projectId: id, range }),
    getScheduleHealth({ projectId: id }),
  ]);

  const hasPlan = delivery.some((bucket) => bucket.plannedMinor > 0 || bucket.actualMinor > 0);
  const t = await getT();

  if (!hasPlan) {
    return (
      <div className="card">
        <EmptyState
          title={t.forecast.nothingToForecast}
          description={t.forecast.nothingToForecastHint}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t.forecast.plannedDeliveries}
          value={formatMoneyCompact(sumMinor(delivery.map((b) => b.plannedMinor)), project.currency)}
          hint={t.forecast.atVendorCost}
        />
        <KpiCard
          label={t.forecast.billableAhead}
          value={formatMoneyCompact(sumMinor(billing.map((b) => b.plannedMinor)), project.currency)}
          hint={t.forecast.clientValueOf}
        />
        <KpiCard
          label={t.deliveries.overdue}
          value={health.overdueCount}
          hint={formatMoneyCompact(health.overdueValueMinor, project.currency)}
          tone={health.overdueCount > 0 ? "negative" : "positive"}
        />
        <KpiCard
          label={t.deliveries.onTimeRecord}
          value={health.onTimePct === null ? t.common.none : formatPercent(health.onTimePct, 0)}
          hint={
            health.averageSlipDays === null
              ? t.deliveries.noReceiptsMeasured
              : `${t.forecast.averageSlip} ${health.averageSlipDays.toFixed(1)} ${t.dashboard.days}`
          }
        />
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t.forecast.projectDeliveries}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{t.forecast.projectDeliveriesHint}</p>
          </div>
        </div>
        <div className="p-5">
          <ForecastChart buckets={delivery} currency={project.currency} />
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t.forecast.projectBilling}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{t.forecast.projectBillingHint}</p>
          </div>
        </div>
        <div className="p-5">
          <ForecastChart buckets={billing} currency={project.currency} />
        </div>
      </section>
    </div>
  );
}
