import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, CoverageCell, EmptyState, KpiCard, Money, PageHeader, StatusBadge } from "@/components/ui";
import { getVendorPoDetail } from "@/server/services/vendorPo";
import { getPlanForPo } from "@/server/services/deliveryPlan";
import { formatDate, relativeDays } from "@/lib/dates";
import { formatMoney, formatQty, lineTotalMinor, sumMinor } from "@/lib/money";
import { getT } from "@/server/locale";

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
  const t = await getT();

  return (
    <>
      <PageHeader
        title={po.poNumber}
        breadcrumb={[
          { label: t.projects.title, href: "/projects" },
          { label: po.project.code, href: `/projects/${po.project.id}` },
          { label: t.projects.vendorPos, href: `/projects/${po.project.id}/vendor-pos` },
          { label: po.poNumber },
        ]}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={po.status} />
            <span className="font-medium text-slate-700">{po.vendor.name}</span>
            <span className="text-slate-300">·</span>
            <span>{t.common.issued} {formatDate(po.issueDate)}</span>
            {po.expectedDeliveryDate && (
              <>
                <span className="text-slate-300">·</span>
                <span>{t.vendorPo.expectedDelivery} {formatDate(po.expectedDeliveryDate)}</span>
              </>
            )}
            {po.clientAgreement && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1.5">
                  {t.vendorPo.against}
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
            {t.vendorPo.receiveGoods}
          </Link>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t.vendorPo.orderValueNet} value={formatMoney(po.totals.subtotalMinor, currency)} />
        <KpiCard
          label={t.dashboard.received}
          value={formatMoney(receivedMinor, currency)}
          hint={`${formatMoney(po.totals.subtotalMinor - receivedMinor, currency)} ${t.vendorPo.outstanding}`}
        />
        <KpiCard label={t.vendorPo.plannedDeliveriesCount} value={plan.length} hint={`${openTranches.length} ${t.vendorPo.stillOpen}`} />
        <KpiCard label={t.projects.goodsReceipts} value={po.grns.length} />
      </section>

      {unplanned.length > 0 && (
        <div className="mb-6">
          <Alert tone="warning" title={t.vendorPo.unplannedWarning}>
            {unplanned.map((line) => `${line.description} (${formatQty(line.unplannedQty)} ${line.uom})`).join(", ")}.
            {t.vendorPo.unplannedWarningHint}
          </Alert>
        </div>
      )}

      {/* The delivery plan: promised dates, and one-click receipt for each. */}
      <section className="card mb-6 overflow-hidden">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t.vendorPo.deliveryPlan}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{t.vendorPo.deliveryPlanHint}</p>
          </div>
        </div>

        {plan.length === 0 ? (
          <EmptyState title={t.vendorPo.noPlannedDeliveries} />
        ) : (
          <ol className="divide-y divide-slate-100">
            {plan.map((item) => (
              <li key={item.id} className={`px-5 py-4 ${item.isOverdue ? "bg-red-50/40" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{item.label ?? `${t.dashboard.delivery} ${item.seq}`}</span>
                      <StatusBadge status={item.isOverdue ? "OVERDUE" : item.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {t.vendorPo.plannedOn} {formatDate(item.plannedDate)}{" "}
                      <span className={item.isOverdue ? "font-medium text-red-700" : ""}>
                        ({relativeDays(item.plannedDate, t)})
                      </span>
                      {" · "}
                      <Money minor={item.valueMinor} currency={currency} />
                    </p>
                    {item.notes && <p className="mt-1 text-xs italic text-slate-500">{item.notes}</p>}
                  </div>

                  {item.status !== "FULFILLED" && item.status !== "CANCELLED" && (
                    <Link href={`/vendor-pos/${id}/grns/new?planItemId=${item.id}`} className="btn-secondary btn-sm shrink-0">
                      {t.vendorPo.receiveThisDelivery}
                    </Link>
                  )}
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="pb-1 text-start font-medium">{t.common.line}</th>
                        <th className="pb-1 text-end font-medium">{t.vendorPo.planned}</th>
                        <th className="pb-1 text-end font-medium">{t.vendorPo.receivedCol}</th>
                        <th className="pb-1 text-end font-medium">{t.vendorPo.outstandingCol}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.lines.map((line) => (
                        <tr key={line.vendorPoLineId} className="text-slate-700">
                          <td className="py-0.5">{line.description}</td>
                          <td className="py-0.5 text-end tabular">
                            {formatQty(line.plannedQuantity)} {line.uom}
                          </td>
                          <td className="py-0.5 text-end tabular">{formatQty(line.receivedQuantity)}</td>
                          <td
                            className={`py-0.5 text-end tabular ${
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
          <h2 className="card-title">{t.vendorPo.orderLines}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>{t.common.description}</th>
                <th className="num text-end">{t.grn.ordered}</th>
                <th className="num text-end">{t.vendorPo.planned}</th>
                <th className="num text-end">{t.vendorPo.receivedCol}</th>
                <th style={{ width: "170px" }}>{t.vendorPo.progress}</th>
                <th className="num text-end">{t.vendorPo.unitCost}</th>
                <th className="num text-end">{t.common.lineTotal}</th>
                <th>{t.vendorPo.clientLine}</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((line) => {
                const cover = po.coverage.find((entry) => entry.vendorPoLineId === line.id);
                return (
                  <tr key={line.id}>
                    <td className="text-xs text-slate-400">{line.lineNo}</td>
                    <td className="text-slate-900">{line.description}</td>
                    <td className="num text-end tabular">
                      {formatQty(line.quantity)} {line.uom}
                    </td>
                    <td className="num text-end tabular">{cover ? formatQty(cover.plannedQty) : "—"}</td>
                    <td className="num text-end tabular">{cover ? formatQty(cover.receivedQty) : "—"}</td>
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
                    <td className="num text-end">
                      <Money minor={line.unitCostMinor} currency={currency} />
                    </td>
                    <td className="num text-end font-medium">
                      <Money minor={lineTotalMinor(line.quantity, line.unitCostMinor)} currency={currency} />
                    </td>
                    <td className="text-xs">
                      {line.clientAgreementLine ? (
                        <span className="text-emerald-700">{line.clientAgreementLine.agreement.reference}</span>
                      ) : (
                        <span className="text-slate-400">{t.common.notLinked}</span>
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
          <h2 className="card-title">{t.projects.goodsReceipts}</h2>
        </div>
        {po.grns.length === 0 ? (
          <EmptyState title={t.vendorPo.nothingReceived} />
        ) : (
          <table className="table table-hover">
            <thead>
              <tr>
                <th>{t.grn.grnNumber}</th>
                <th>{t.vendorPo.receivedCol}</th>
                <th>{t.vendorPo.againstPlan}</th>
                <th>{t.vendorPo.deliveryNote}</th>
                <th className="num text-end">{t.common.lines}</th>
                <th>{t.common.status}</th>
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
                      ? grn.deliveryPlanItem.label ?? `${t.dashboard.delivery} ${grn.deliveryPlanItem.seq}`
                      : t.vendorPo.unplanned}
                  </td>
                  <td className="text-sm text-slate-600">{grn.deliveryNoteRef ?? "—"}</td>
                  <td className="num text-end tabular">{grn.lines.length}</td>
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
