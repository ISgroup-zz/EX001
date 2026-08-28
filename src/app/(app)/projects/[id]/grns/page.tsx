import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Money, StatusBadge } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { listProjectGrns } from "@/server/services/grn";
import { getUpcomingDeliveries } from "@/server/services/forecast";
import { formatDate, daysBetween } from "@/lib/dates";
import { formatQty, lineTotalMinor, sumMinor } from "@/lib/money";
import { getT } from "@/server/locale";
import { fill } from "@/lib/i18n";

export default async function ProjectGrnsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [grns, upcoming] = await Promise.all([
    listProjectGrns(id),
    getUpcomingDeliveries({ projectId: id, withinDays: 365 }),
  ]);
  const t = await getT();

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <section className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">{t.grn.stillToArrive}</h2>
            <Link href="/deliveries" className="link text-xs">
              {t.dashboard.allDeliveries}
            </Link>
          </div>
          <table className="table table-hover">
            <thead>
              <tr>
                <th>{t.dashboard.planned}</th>
                <th>{t.dashboard.delivery}</th>
                <th>{t.dashboard.vendorPo}</th>
                <th className="num text-end">{t.common.value}</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {upcoming.map((delivery) => (
                <tr key={delivery.planItemId} className={delivery.isOverdue ? "bg-red-50/40" : undefined}>
                  <td className="tabular">
                    {formatDate(delivery.plannedDate)}
                    {delivery.isOverdue && <span className="ms-2 text-xs font-medium text-red-700">{t.common.overdue}</span>}
                  </td>
                  <td>{delivery.label}</td>
                  <td>
                    {delivery.vendorName}{" "}
                    <Link href={`/vendor-pos/${delivery.vendorPoId}`} className="text-xs text-slate-500 tabular">
                      {delivery.poNumber}
                    </Link>
                  </td>
                  <td className="num text-end">
                    <Money minor={delivery.valueMinor} currency={project.currency} />
                  </td>
                  <td className="text-end">
                    <Link
                      href={`/vendor-pos/${delivery.vendorPoId}/grns/new?planItemId=${delivery.planItemId}`}
                      className="btn-secondary btn-sm"
                    >
                      {t.dashboard.receive}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">{t.projects.goodsReceipts}</h2>
        </div>
        {grns.length === 0 ? (
          <EmptyState title={t.grn.nothingReceivedYet} description={t.grn.nothingReceivedHint} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>{t.grn.grnNumber}</th>
                  <th>{t.grn.receivedQty}</th>
                  <th>{t.dashboard.vendorPo}</th>
                  <th>{t.grn.againstPlan}</th>
                  <th className="num text-end">{t.grn.accepted}</th>
                  <th className="num text-end">{t.common.value}</th>
                  <th>{t.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {grns.map((grn) => {
                  const accepted = grn.lines.reduce((sum, line) => sum + line.quantityAccepted, 0);
                  const value = sumMinor(
                    grn.lines.map((line) => lineTotalMinor(line.quantityAccepted, line.vendorPoLine.unitCostMinor)),
                  );
                  const slip = grn.deliveryPlanItem
                    ? daysBetween(grn.deliveryPlanItem.plannedDate, grn.receivedDate)
                    : null;

                  return (
                    <tr key={grn.id}>
                      <td>
                        <Link href={`/grns/${grn.id}`} className="font-medium text-slate-900 hover:text-brand-700 tabular">
                          {grn.grnNumber}
                        </Link>
                      </td>
                      <td className="tabular">{formatDate(grn.receivedDate)}</td>
                      <td>
                        <div className="text-sm">{grn.vendorPo.vendor.name}</div>
                        <Link href={`/vendor-pos/${grn.vendorPo.id}`} className="text-xs text-slate-500 tabular">
                          {grn.vendorPo.poNumber}
                        </Link>
                      </td>
                      <td className="text-sm text-slate-600">
                        {grn.deliveryPlanItem ? (
                          <>
                            {grn.deliveryPlanItem.label ?? `${t.dashboard.delivery} ${grn.deliveryPlanItem.seq}`}
                            {slip !== null && (
                              <span className={`ms-2 text-xs ${slip > 0 ? "text-red-700" : "text-emerald-700"}`}>
                                {slip > 0 ? fill(t.grn.late, { days: slip }) : slip < 0 ? fill(t.grn.early, { days: Math.abs(slip) }) : t.grn.onTime}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400">{t.vendorPo.unplanned}</span>
                        )}
                      </td>
                      <td className="num text-end tabular">{formatQty(accepted)}</td>
                      <td className="num text-end font-medium">
                        <Money minor={value} currency={project.currency} />
                      </td>
                      <td>
                        <StatusBadge status={grn.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
