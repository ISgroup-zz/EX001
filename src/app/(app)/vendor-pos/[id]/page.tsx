import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, CoverageCell, EmptyState, KpiCard, Money, PageHeader, StatusBadge } from "@/components/ui";
import { getVendorPoDetail } from "@/server/services/vendorPo";
import { getPlanForPo } from "@/server/services/deliveryPlan";
import { formatDate, relativeDays } from "@/lib/dates";
import { formatMoney, formatQty, lineTotalMinor, sumMinor } from "@/lib/money";

export default async function VendorPoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await getVendorPoDetail(id);
  if (!po) notFound();

  const plan = await getPlanForPo(id);
  const currency = po.project.currency;
  const receivedMinor = sumMinor(
    po.coverage.map((line) => lineTotalMinor(line.receivedQty, line.unitCostMinor)),
  );
  const unplanned = po.coverage.filter((line) => line.unplannedQty > 0);
  const openTranches = plan.filter((item) => item.status !== "FULFILLED" && item.status !== "CANCELLED");

  return (
    <>
      <PageHeader
        title={po.poNumber}
        breadcrumb={[
          { label: "Projects", href: "/projects" },
          { label: po.project.code, href: `/projects/${po.project.id}` },
          { label: "Vendor POs", href: `/projects/${po.project.id}/vendor-pos` },
          { label: po.poNumber },
        ]}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={po.status} />
            <span className="font-medium text-slate-700">{po.vendor.name}</span>
            <span className="text-slate-300">·</span>
            <span>issued {formatDate(po.issueDate)}</span>
            {po.expectedDeliveryDate && (
              <>
                <span className="text-slate-300">·</span>
                <span>expected {formatDate(po.expectedDeliveryDate)}</span>
              </>
            )}
            {po.clientAgreement && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1.5">
                  against
                  <Link href={`/agreements/${po.clientAgreement.id}`} className="link tabular">
                    {po.clientAgreement.reference}
                  </Link>
                </span>
              </>
            )}
          </span>
        }
        actions={
          <Link href={`/vendor-pos/${id}/grns/new`} className="btn-primary">
            Receive goods
          </Link>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Order value (net)" value={formatMoney(po.totals.subtotalMinor, currency)} />
        <KpiCard
          label="Received"
          value={formatMoney(receivedMinor, currency)}
          hint={`${formatMoney(po.totals.subtotalMinor - receivedMinor, currency)} outstanding`}
        />
        <KpiCard label="Planned deliveries" value={plan.length} hint={`${openTranches.length} still open`} />
        <KpiCard label="Goods receipts" value={po.grns.length} />
      </section>

      {unplanned.length > 0 && (
        <div className="mb-6">
          <Alert tone="warning" title="Part of this order has no planned delivery date">
            {unplanned.map((line) => `${line.description} (${formatQty(line.unplannedQty)} ${line.uom})`).join(", ")}.
            Unplanned quantity does not appear in the forecast.
          </Alert>
        </div>
      )}

      {/* The delivery plan: promised dates, and one-click receipt for each. */}
      <section className="card mb-6 overflow-hidden">
        <div className="card-header">
          <div>
            <h2 className="card-title">Delivery plan</h2>
            <p className="mt-0.5 text-xs text-slate-500">What the vendor promised, and what has actually arrived.</p>
          </div>
        </div>

        {plan.length === 0 ? (
          <EmptyState title="No planned deliveries" />
        ) : (
          <ol className="divide-y divide-slate-100">
            {plan.map((item) => (
              <li key={item.id} className={`px-5 py-4 ${item.isOverdue ? "bg-red-50/40" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{item.label ?? `Delivery ${item.seq}`}</span>
                      <StatusBadge status={item.isOverdue ? "OVERDUE" : item.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Planned {formatDate(item.plannedDate)}{" "}
                      <span className={item.isOverdue ? "font-medium text-red-700" : ""}>
                        ({relativeDays(item.plannedDate)})
                      </span>
                      {" · "}
                      <Money minor={item.valueMinor} currency={currency} />
                    </p>
                    {item.notes && <p className="mt-1 text-xs italic text-slate-500">{item.notes}</p>}
                  </div>

                  {item.status !== "FULFILLED" && item.status !== "CANCELLED" && (
                    <Link href={`/vendor-pos/${id}/grns/new?planItemId=${item.id}`} className="btn-secondary btn-sm shrink-0">
                      Receive this delivery
                    </Link>
                  )}
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="pb-1 text-left font-medium">Line</th>
                        <th className="pb-1 text-right font-medium">Planned</th>
                        <th className="pb-1 text-right font-medium">Received</th>
                        <th className="pb-1 text-right font-medium">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.lines.map((line) => (
                        <tr key={line.vendorPoLineId} className="text-slate-700">
                          <td className="py-0.5">{line.description}</td>
                          <td className="py-0.5 text-right tabular">
                            {formatQty(line.plannedQuantity)} {line.uom}
                          </td>
                          <td className="py-0.5 text-right tabular">{formatQty(line.receivedQuantity)}</td>
                          <td
                            className={`py-0.5 text-right tabular ${
                              line.outstandingQuantity > 0 ? "font-medium text-amber-700" : "text-emerald-700"
                            }`}
                          >
                            {formatQty(line.outstandingQuantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card mb-6 overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Order lines</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Description</th>
                <th className="num text-right">Ordered</th>
                <th className="num text-right">Planned</th>
                <th className="num text-right">Received</th>
                <th style={{ width: "170px" }}>Progress</th>
                <th className="num text-right">Unit cost</th>
                <th className="num text-right">Line total</th>
                <th>Client line</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((line) => {
                const cover = po.coverage.find((entry) => entry.vendorPoLineId === line.id);
                return (
                  <tr key={line.id}>
                    <td className="text-xs text-slate-400">{line.lineNo}</td>
                    <td className="text-slate-900">{line.description}</td>
                    <td className="num text-right tabular">
                      {formatQty(line.quantity)} {line.uom}
                    </td>
                    <td className="num text-right tabular">{cover ? formatQty(cover.plannedQty) : "—"}</td>
                    <td className="num text-right tabular">{cover ? formatQty(cover.receivedQty) : "—"}</td>
                    <td>
                      {cover && (
                        <CoverageCell
                          ordered={cover.orderedQty}
                          planned={cover.plannedQty}
                          received={cover.receivedQty}
                          uom={cover.uom}
                        />
                      )}
                    </td>
                    <td className="num text-right">
                      <Money minor={line.unitCostMinor} currency={currency} />
                    </td>
                    <td className="num text-right font-medium">
                      <Money minor={lineTotalMinor(line.quantity, line.unitCostMinor)} currency={currency} />
                    </td>
                    <td className="text-xs">
                      {line.clientAgreementLine ? (
                        <span className="text-emerald-700">{line.clientAgreementLine.agreement.reference}</span>
                      ) : (
                        <span className="text-slate-400">not linked</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Goods receipts</h2>
        </div>
        {po.grns.length === 0 ? (
          <EmptyState title="Nothing received yet" />
        ) : (
          <table className="table table-hover">
            <thead>
              <tr>
                <th>GRN</th>
                <th>Received</th>
                <th>Against</th>
                <th>Delivery note</th>
                <th className="num text-right">Lines</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {po.grns.map((grn) => (
                <tr key={grn.id}>
                  <td>
                    <Link href={`/grns/${grn.id}`} className="font-medium text-slate-900 hover:text-brand-700 tabular">
                      {grn.grnNumber}
                    </Link>
                  </td>
                  <td className="tabular">{formatDate(grn.receivedDate)}</td>
                  <td className="text-sm text-slate-600">
                    {grn.deliveryPlanItem
                      ? grn.deliveryPlanItem.label ?? `Delivery ${grn.deliveryPlanItem.seq}`
                      : "unplanned"}
                  </td>
                  <td className="text-sm text-slate-600">{grn.deliveryNoteRef ?? "—"}</td>
                  <td className="num text-right tabular">{grn.lines.length}</td>
                  <td>
                    <StatusBadge status={grn.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
