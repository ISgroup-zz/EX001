import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Money, StatusBadge } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { listVendorPos } from "@/server/services/vendorPo";
import { formatDate, isPast } from "@/lib/dates";
import { getT } from "@/server/locale";

export default async function ProjectVendorPosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const pos = await listVendorPos(id);
  const t = await getT();

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <h2 className="card-title">{t.vendorPo.poList}</h2>
        <Link href={`/projects/${id}/vendor-pos/new`} className="btn-primary btn-sm">
          {t.vendorPo.newVendorPo}
        </Link>
      </div>

      {pos.length === 0 ? (
        <EmptyState
          title={t.vendorPo.noPos}
          description={t.vendorPo.noPosHint}
          action={
            <Link href={`/projects/${id}/vendor-pos/new`} className="btn-primary btn-sm">
              {t.vendorPo.newVendorPo}
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>{t.documentTypes.poShort}</th>
                <th>{t.common.vendor}</th>
                <th>{t.common.issued}</th>
                <th>{t.vendorPo.nextDelivery}</th>
                <th className="num text-end">{t.vendorPo.netValue}</th>
                <th>{t.common.status}</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => {
                const late = po.nextDelivery ? isPast(po.nextDelivery) : false;
                return (
                  <tr key={po.id}>
                    <td>
                      <Link href={`/vendor-pos/${po.id}`} className="font-medium text-slate-900 hover:text-brand-700 tabular">
                        {po.poNumber}
                      </Link>
                      <div className="text-xs text-slate-500">{po.lines.length} {t.common.lines}</div>
                    </td>
                    <td>{po.vendor.name}</td>
                    <td className="tabular">{formatDate(po.issueDate)}</td>
                    <td>
                      {po.nextDelivery ? (
                        <span className={`tabular ${late ? "font-medium text-red-700" : ""}`}>
                          {formatDate(po.nextDelivery)}
                          {late && ` · ${t.common.overdue}`}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">{t.vendorPo.allReceived}</span>
                      )}
                    </td>
                    <td className="num text-end font-medium">
                      <Money minor={po.totals.subtotalMinor} currency={project.currency} />
                    </td>
                    <td>
                      <StatusBadge status={po.status} />
                    </td>
                    <td className="text-end">
                      <Link href={`/vendor-pos/${po.id}/grns/new`} className="btn-secondary btn-sm">
                        {t.dashboard.receive}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
