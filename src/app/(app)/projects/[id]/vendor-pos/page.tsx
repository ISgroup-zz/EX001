import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Money, StatusBadge } from "@/components/ui";
import { getProject } from "@/server/services/project";
import { listVendorPos } from "@/server/services/vendorPo";
import { formatDate, isPast } from "@/lib/dates";

export default async function ProjectVendorPosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const pos = await listVendorPos(id);

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <h2 className="card-title">Vendor purchase orders</h2>
        <Link href={`/projects/${id}/vendor-pos/new`} className="btn-primary btn-sm">
          New vendor PO
        </Link>
      </div>

      {pos.length === 0 ? (
        <EmptyState
          title="No purchase orders yet"
          description="Raise one against the client's scope — you can tick the client lines rather than retyping them."
          action={
            <Link href={`/projects/${id}/vendor-pos/new`} className="btn-primary btn-sm">
              New vendor PO
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>PO</th>
                <th>Vendor</th>
                <th>Issued</th>
                <th>Next delivery</th>
                <th className="num text-right">Net value</th>
                <th>Status</th>
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
                      <div className="text-xs text-slate-500">{po.lines.length} lines</div>
                    </td>
                    <td>{po.vendor.name}</td>
                    <td className="tabular">{formatDate(po.issueDate)}</td>
                    <td>
                      {po.nextDelivery ? (
                        <span className={`tabular ${late ? "font-medium text-red-700" : ""}`}>
                          {formatDate(po.nextDelivery)}
                          {late && " · overdue"}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">all received</span>
                      )}
                    </td>
                    <td className="num text-right font-medium">
                      <Money minor={po.totals.subtotalMinor} currency={project.currency} />
                    </td>
                    <td>
                      <StatusBadge status={po.status} />
                    </td>
                    <td className="text-right">
                      <Link href={`/vendor-pos/${po.id}/grns/new`} className="btn-secondary btn-sm">
                        Receive
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
