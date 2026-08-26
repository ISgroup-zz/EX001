import { notFound } from "next/navigation";
import { ForecastChart } from "@/components/ForecastChart";
import { EmptyState, KpiCard } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { defaultRange, getBillingForecast, getDeliveryForecast, getScheduleHealth } from "@/server/services/forecast";
import { formatMoneyCompact, formatPercent, sumMinor } from "@/lib/money";

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

  if (!hasPlan) {
    return (
      <div className="card">
        <EmptyState
          title="Nothing to forecast yet"
          description="The forecast is built from delivery plans. Raise a vendor PO with its promised delivery dates and it will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Planned deliveries"
          value={formatMoneyCompact(sumMinor(delivery.map((b) => b.plannedMinor)), project.currency)}
          hint="At vendor cost"
        />
        <KpiCard
          label="Billable value ahead"
          value={formatMoneyCompact(sumMinor(billing.map((b) => b.plannedMinor)), project.currency)}
          hint="Client value of those deliveries"
        />
        <KpiCard
          label="Overdue"
          value={health.overdueCount}
          hint={formatMoneyCompact(health.overdueValueMinor, project.currency)}
          tone={health.overdueCount > 0 ? "negative" : "positive"}
        />
        <KpiCard
          label="On-time record"
          value={health.onTimePct === null ? "—" : formatPercent(health.onTimePct, 0)}
          hint={
            health.averageSlipDays === null
              ? "No receipts measured yet"
              : `Average slip ${health.averageSlipDays.toFixed(1)} days`
          }
        />
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Deliveries — planned vs. received</h2>
            <p className="mt-0.5 text-xs text-slate-500">From the delivery plans on this project&apos;s vendor POs.</p>
          </div>
        </div>
        <div className="p-5">
          <ForecastChart buckets={delivery} currency={project.currency} />
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Billing — expected vs. invoiced</h2>
            <p className="mt-0.5 text-xs text-slate-500">What those deliveries are worth to the client, and what has been billed.</p>
          </div>
        </div>
        <div className="p-5">
          <ForecastChart buckets={billing} currency={project.currency} />
        </div>
      </section>
    </div>
  );
}
