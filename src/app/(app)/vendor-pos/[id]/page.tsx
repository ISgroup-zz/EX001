import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, CoverageCell, EmptyState, KpiCard, Money, PageHeader, StatusBadge } from "@/components/ui";
import { getVendorPoDetail } from "@/server/services/vendorPo";
import { getPlanForPo } from "@/server/services/deliveryPlan";
import { getPaymentSchedule } from "@/server/services/vendorPayment";
import { getPlanHistory } from "@/server/services/planChangeLog";
import { MilestonePayments } from "@/components/MilestonePayments";
import { formatDate, relativeDays, toDateInput } from "@/lib/dates";
import { formatMoney, formatQty, lineTotalMinor, sumMinor } from "@/lib/money";
import { getT } from "@/server/locale";
import { fill, type Dictionary } from "@/lib/i18n";
import type { PlanHistoryRow } from "@/server/services/planChangeLog";

export default async function VendorPoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await getVendorPoDetail(id);
  if (!po) notFound();

  const [plan, schedule, history] = await Promise.all([
    getPlanForPo(id),
    getPaymentSchedule(id),
    getPlanHistory(id),
  ]);
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
                      {" · "}
                      <span className="text-slate-600">
                        {t.vendorPo.payment}{" "}
                        {item.paymentBasis === "PERCENTAGE"
                          ? `${item.paymentPercent ?? 0}%`
                          : formatMoney(item.paymentAmountMinor ?? 0, currency)}
                        {item.paymentDueDays > 0 && ` +${item.paymentDueDays} ${t.common.days}`}
                      </span>
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

      <MilestonePayments
        vendorPoId={id}
        currency={currency}
        schedule={schedule}
        plan={plan}
        today={toDateInput(new Date())}
      />

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

      {/* Append-only: what changed on the plan and its payments, and who changed it. */}
      <section className="card mt-6 overflow-hidden">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t.vendorPo.changeLog}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{t.vendorPo.changeLogHint}</p>
          </div>
        </div>
        {history.length === 0 ? (
          <EmptyState title={t.vendorPo.noChangesYet} />
        ) : (
          <ol className="divide-y divide-slate-100">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-sm">
                <span className="w-40 shrink-0 text-xs text-slate-500 tabular">
                  {formatDate(entry.createdAt)}
                </span>
                <StatusBadge status={actionStatus(entry.action)} label={actionLabel(entry.action, t)} />
                <span className="min-w-0 flex-1 text-slate-700">{describeChange(entry, t, currency)}</span>
                {entry.changedBy && (
                  <span className="text-xs text-slate-400">{fill(t.vendorPo.changedBy, { name: entry.changedBy })}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function actionLabel(action: string, t: Dictionary): string {
  switch (action) {
    case "PLAN_CREATED":
      return t.vendorPo.actionPlanCreated;
    case "MILESTONE_ADDED":
      return t.vendorPo.actionMilestoneAdded;
    case "MILESTONE_CANCELLED":
      return t.vendorPo.actionMilestoneCancelled;
    case "PAYMENT_RECORDED":
      return t.vendorPo.actionPaymentRecorded;
    default:
      return t.vendorPo.actionMilestoneUpdated;
  }
}

const CHANGE_FIELD_LABELS: Record<string, (t: Dictionary) => string> = {
  plannedDate: (t) => t.vendorPo.changeFieldPlannedDate,
  label: (t) => t.vendorPo.changeFieldLabel,
  paymentBasis: (t) => t.vendorPo.changeFieldPaymentBasis,
  paymentPercent: (t) => t.vendorPo.changeFieldPaymentPercent,
  paymentAmountMinor: (t) => t.vendorPo.changeFieldPaymentAmount,
  paymentDueDays: (t) => t.vendorPo.changeFieldPaymentDueDays,
};

/**
 * Field-level rows are rebuilt from the stored old/new values so they read in the
 * viewer's language. The prose summary written at the time is the fallback — it is the
 * record as it was made, and translating it after the fact would rewrite history.
 */
function describeChange(entry: PlanHistoryRow, t: Dictionary, currency: string): string {
  if (!entry.field || entry.oldValue === null || entry.newValue === null) return entry.summary;

  const fieldKey = entry.field.startsWith("quantity:") ? "quantity" : entry.field;
  const label =
    fieldKey === "quantity"
      ? t.vendorPo.changeFieldQuantity
      : CHANGE_FIELD_LABELS[fieldKey]?.(t) ?? entry.field;

  const render = (value: string) => {
    if (fieldKey === "plannedDate") return formatDate(new Date(value));
    if (fieldKey === "paymentAmountMinor") return formatMoney(Number(value) || 0, currency);
    if (fieldKey === "paymentPercent") return `${value || 0}%`;
    return value === "" ? "—" : value;
  };

  return `${label}: ${render(entry.oldValue)} → ${render(entry.newValue)}`;
}

/** Reuse the status badge palette so log actions read at a glance. */
function actionStatus(action: string): string {
  switch (action) {
    case "PAYMENT_RECORDED":
      return "PAID";
    case "MILESTONE_CANCELLED":
      return "CANCELLED";
    case "MILESTONE_ADDED":
    case "PLAN_CREATED":
      return "PLANNED";
    default:
      return "PARTIAL";
  }
}
