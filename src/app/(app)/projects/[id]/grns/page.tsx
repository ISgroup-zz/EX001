import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Money, StatusBadge } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { listProjectGrns } from "@/server/services/grn";
import { getUpcomingDeliveries } from "@/server/services/forecast";
import { formatDate, daysBetween } from "@/lib/dates";
import { formatQty, lineTotalMinor, sumMinor } from "@/lib/money";

export default async function ProjectGrnsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [grns, upcoming] = await Promise.all([
    listProjectGrns(id),
    getUpcomingDeliveries({ projectId: id, withinDays: 365 }),
  ]);

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <section className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">Still to arrive</h2>
            <Link href="/deliveries" className="link text-xs">
              All deliveries →
            </Link>
          </div>
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Planned</th>
                <th>Delivery</th>
                <th>Vendor / PO</th>
                <th className="num text-right">Value</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {upcoming.map((delivery) => (
                <tr key={delivery.planItemId} className={delivery.isOverdue ? "bg-red-50/40" : undefined}>
                  <td className="tabular">
                    {formatDate(delivery.plannedDate)}
                    {delivery.isOverdue && <span className="ml-2 text-xs font-medium text-red-700">overdue</span>}
                  </td>
                  <td>{delivery.label}</td>
                  <td>
                    {delivery.vendorName}{" "}
                    <Link href={`/vendor-pos/${delivery.vendorPoId}`} className="text-xs text-slate-500 tabular">
                      {delivery.poNumber}
                    </Link>
                  </td>
                  <td className="num text-right">
                    <Money minor={delivery.valueMinor} currency={project.currency} />
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
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Goods receipts</h2>
        </div>
        {grns.length === 0 ? (
          <EmptyState title="Nothing received yet" description="Receipts appear here as deliveries are posted." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>GRN</th>
                  <th>Received</th>
                  <th>Vendor / PO</th>
                  <th>Against plan</th>
                  <th className="num text-right">Accepted</th>
                  <th className="num text-right">Value</th>
                  <th>Status</th>
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
                            {grn.deliveryPlanItem.label ?? `Delivery ${grn.deliveryPlanItem.seq}`}
                            {slip !== null && (
                              <span className={`ml-2 text-xs ${slip > 0 ? "text-red-700" : "text-emerald-700"}`}>
                                {slip > 0 ? `${slip}d late` : slip < 0 ? `${Math.abs(slip)}d early` : "on time"}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400">unplanned</span>
                        )}
                      </td>
                      <td className="num text-right tabular">{formatQty(accepted)}</td>
                      <td className="num text-right font-medium">
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
