"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "./Form";
import { EmptyState, Field, Money, ProgressBar } from "./ui";
import { recordVendorPaymentAction, updatePlanItemAction } from "@/server/actions/vendorPos";
import type { PaymentSchedule } from "@/server/services/vendorPayment";
import type { PlanItemView } from "@/server/services/deliveryPlan";
import { formatDate, toDateInput } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { fill } from "@/lib/i18n";
import { useT } from "./LocaleProvider";

/**
 * What each delivery milestone is worth to the vendor, what has been paid against it,
 * and the two things a PM does here: revise the terms, or record money that went out.
 *
 * Both are one click from the row they belong to — a payment schedule that lives on a
 * separate screen from the delivery plan is a schedule that stops being maintained.
 */

type Props = {
  vendorPoId: string;
  currency: string;
  schedule: PaymentSchedule;
  plan: PlanItemView[];
  today: string;
};

export function MilestonePayments({ vendorPoId, currency, schedule, plan, today }: Props) {
  const t = useT();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const planById = new Map(plan.map((item) => [item.id, item]));

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="card-header">
        <div>
          <h2 className="card-title">{t.vendorPo.paymentsTitle}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{t.vendorPo.paymentsHint}</p>
        </div>
      </div>

      <div className="grid gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-4">
        <Summary label={t.vendorPo.scheduled} minor={schedule.scheduledMinor} currency={currency} />
        <Summary label={t.vendorPo.paid} minor={schedule.paidMinor} currency={currency} tone="emerald" />
        <Summary
          label={t.vendorPo.payableNow}
          minor={schedule.payableNowMinor}
          currency={currency}
          tone={schedule.payableNowMinor > 0 ? "amber" : undefined}
        />
        <Summary
          label={t.vendorPo.paymentOverdue}
          minor={schedule.overdueMinor}
          currency={currency}
          tone={schedule.overdueMinor > 0 ? "red" : undefined}
        />
      </div>

      <div className="px-5 pt-3">
        <ProgressBar value={schedule.paidMinor} total={schedule.scheduledMinor} tone="emerald" />
      </div>

      {schedule.milestones.length === 0 ? (
        <EmptyState title={t.vendorPo.noPlannedDeliveries} />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t.vendorPo.milestone}</th>
                <th>{t.vendorPo.plannedDate}</th>
                <th>{t.vendorPo.paymentBasis}</th>
                <th className="num text-end">{t.vendorPo.due}</th>
                <th className="num text-end">{t.vendorPo.paid}</th>
                <th className="num text-end">{t.vendorPo.outstandingPayment}</th>
                <th>{t.vendorPo.payableFrom}</th>
                <th className="w-40" />
              </tr>
            </thead>
            <tbody>
              {schedule.milestones.map((milestone) => {
                const item = planById.get(milestone.planItemId);
                const isCancelled = milestone.status === "CANCELLED";

                return (
                  <tr key={milestone.planItemId} className={milestone.isOverdue ? "bg-red-50/40" : ""}>
                    <td className={`text-slate-900 ${isCancelled ? "line-through opacity-60" : ""}`}>
                      {milestone.label}
                    </td>
                    <td className="tabular">{formatDate(milestone.plannedDate)}</td>
                    <td className="text-sm text-slate-600 tabular">
                      {milestone.basis === "PERCENTAGE" ? `${milestone.percent ?? 0}%` : t.vendorPo.basisFixed}
                      {milestone.paymentDueDays > 0 && (
                        <span className="ms-1 text-xs text-slate-400">
                          +{milestone.paymentDueDays} {t.common.days}
                        </span>
                      )}
                    </td>
                    <td className="num text-end font-medium">
                      <Money minor={milestone.dueMinor} currency={currency} />
                    </td>
                    <td className="num text-end text-emerald-700">
                      <Money minor={milestone.paidMinor} currency={currency} />
                    </td>
                    <td className={`num text-end tabular ${milestone.isOverdue ? "font-semibold text-red-700" : ""}`}>
                      {formatMoney(milestone.outstandingMinor, currency)}
                    </td>
                    <td className="text-sm">
                      {milestone.payableFrom ? (
                        <span className={milestone.isOverdue ? "font-medium text-red-700" : "text-slate-600"}>
                          {formatDate(milestone.payableFrom)}
                        </span>
                      ) : (
                        <span className="text-slate-400">{t.vendorPo.notPayableYet}</span>
                      )}
                    </td>
                    <td>
                      {!isCancelled && (
                        <div className="flex justify-end gap-1">
                          {item && (
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => {
                                setEditingId(editingId === milestone.planItemId ? null : milestone.planItemId);
                                setPayingId(null);
                              }}
                            >
                              {t.vendorPo.editMilestone}
                            </button>
                          )}
                          {milestone.outstandingMinor > 0 && (
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => {
                                setPayingId(payingId === milestone.planItemId ? null : milestone.planItemId);
                                setEditingId(null);
                              }}
                            >
                              {t.vendorPo.recordPayment}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {payingId && (
        <PaymentForm
          vendorPoId={vendorPoId}
          currency={currency}
          today={today}
          milestone={schedule.milestones.find((m) => m.planItemId === payingId)!}
          onDone={() => setPayingId(null)}
        />
      )}

      {editingId && planById.has(editingId) && (
        <MilestoneEditor
          vendorPoId={vendorPoId}
          item={planById.get(editingId)!}
          onDone={() => setEditingId(null)}
        />
      )}
    </section>
  );
}

function Summary({
  label,
  minor,
  currency,
  tone,
}: {
  label: string;
  minor: number;
  currency: string;
  tone?: "emerald" | "amber" | "red";
}) {
  const colour =
    tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : "text-slate-900";
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold tabular ${colour}`}>{formatMoney(minor, currency)}</p>
    </div>
  );
}

function PaymentForm({
  vendorPoId,
  currency,
  today,
  milestone,
  onDone,
}: {
  vendorPoId: string;
  currency: string;
  today: string;
  milestone: PaymentSchedule["milestones"][number];
  onDone: () => void;
}) {
  const t = useT();
  const [state, formAction] = useActionState(recordVendorPaymentAction, null);

  if (state?.ok) {
    // The row above already shows the new figure; close rather than leave a stale form.
    queueMicrotask(onDone);
  }

  return (
    <form action={formAction} className="border-t border-slate-200 bg-brand-50/40 px-5 py-4">
      <input type="hidden" name="vendorPoId" value={vendorPoId} />
      <input type="hidden" name="planItemId" value={milestone.planItemId} />

      <h3 className="mb-3 text-sm font-semibold text-slate-800">
        {fill(t.vendorPo.recordPaymentFor, { milestone: milestone.label })}
      </h3>
      <FormMessage state={state} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t.vendorPo.amountPaid} htmlFor={`amount-${milestone.planItemId}`}>
          <input
            id={`amount-${milestone.planItemId}`}
            name="amount"
            className="input text-end tabular"
            inputMode="decimal"
            required
            defaultValue={(milestone.outstandingMinor / 100).toFixed(2)}
          />
        </Field>
        <Field label={t.vendorPo.paidDate} htmlFor={`paidDate-${milestone.planItemId}`}>
          <input
            id={`paidDate-${milestone.planItemId}`}
            name="paidDate"
            type="date"
            required
            defaultValue={today}
            className="input"
          />
        </Field>
        <Field label={t.vendorPo.method} htmlFor={`method-${milestone.planItemId}`}>
          <input id={`method-${milestone.planItemId}`} name="method" className="input" placeholder="Bank transfer" />
        </Field>
        <Field label={t.vendorPo.reference} htmlFor={`reference-${milestone.planItemId}`}>
          <input id={`reference-${milestone.planItemId}`} name="reference" className="input" />
        </Field>
        <div className="flex items-end gap-2">
          <SubmitButton pendingLabel={t.vendorPo.savingPayment}>{t.vendorPo.savePayment}</SubmitButton>
          <button type="button" className="btn-secondary" onClick={onDone}>
            {t.common.cancel}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {t.vendorPo.outstandingPayment}: {formatMoney(milestone.outstandingMinor, currency)}
      </p>
    </form>
  );
}

/**
 * Revising a milestone. Every field here is logged with its before and after value,
 * so a renegotiated date or payment share leaves a trail rather than overwriting history.
 */
function MilestoneEditor({
  vendorPoId,
  item,
  onDone,
}: {
  vendorPoId: string;
  item: PlanItemView;
  onDone: () => void;
}) {
  const t = useT();
  const [state, formAction] = useActionState(updatePlanItemAction, null);
  const [basis, setBasis] = useState<"PERCENTAGE" | "FIXED">(item.paymentBasis);
  const [quantities, setQuantities] = useState(
    item.lines.map((line) => ({ vendorPoLineId: line.vendorPoLineId, quantity: String(line.plannedQuantity) })),
  );

  if (state?.ok) queueMicrotask(onDone);

  return (
    <form action={formAction} className="border-t border-slate-200 bg-slate-50 px-5 py-4">
      <input type="hidden" name="vendorPoId" value={vendorPoId} />
      <input type="hidden" name="planItemId" value={item.id} />
      <input type="hidden" name="quantities" value={JSON.stringify(quantities)} />

      <h3 className="mb-3 text-sm font-semibold text-slate-800">
        {t.vendorPo.editMilestone} · {item.label ?? `${t.vendorPo.milestone} ${item.seq}`}
      </h3>
      <FormMessage state={state} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t.vendorPo.milestoneLabel} htmlFor={`label-${item.id}`}>
          <input id={`label-${item.id}`} name="label" className="input" defaultValue={item.label ?? ""} />
        </Field>
        <Field label={t.vendorPo.plannedDate} htmlFor={`plannedDate-${item.id}`}>
          <input
            id={`plannedDate-${item.id}`}
            name="plannedDate"
            type="date"
            required
            className="input"
            defaultValue={toDateInput(item.plannedDate)}
          />
        </Field>
        <Field label={t.vendorPo.paymentBasis} htmlFor={`basis-${item.id}`}>
          <select
            id={`basis-${item.id}`}
            name="paymentBasis"
            className="select"
            value={basis}
            onChange={(event) => setBasis(event.target.value as "PERCENTAGE" | "FIXED")}
          >
            <option value="PERCENTAGE">{t.vendorPo.basisPercent}</option>
            <option value="FIXED">{t.vendorPo.basisFixed}</option>
          </select>
        </Field>
        {basis === "PERCENTAGE" ? (
          <Field label={t.vendorPo.percentOfPo} htmlFor={`percent-${item.id}`}>
            <input
              id={`percent-${item.id}`}
              name="paymentPercent"
              className="input text-end tabular"
              inputMode="decimal"
              defaultValue={String(item.paymentPercent ?? 0)}
            />
          </Field>
        ) : (
          <Field label={t.vendorPo.fixedAmount} htmlFor={`amount-fixed-${item.id}`}>
            <input
              id={`amount-fixed-${item.id}`}
              name="paymentAmount"
              className="input text-end tabular"
              inputMode="decimal"
              defaultValue={((item.paymentAmountMinor ?? 0) / 100).toFixed(2)}
            />
          </Field>
        )}
        <Field label={t.vendorPo.paymentTerms} htmlFor={`dueDays-${item.id}`} hint={t.vendorPo.daysAfterDelivery}>
          <input
            id={`dueDays-${item.id}`}
            name="paymentDueDays"
            className="input text-end tabular"
            inputMode="numeric"
            defaultValue={String(item.paymentDueDays)}
          />
        </Field>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="pb-1 text-start font-medium">{t.common.line}</th>
              <th className="pb-1 text-end font-medium">{t.vendorPo.planned}</th>
              <th className="pb-1 text-end font-medium">{t.vendorPo.receivedCol}</th>
            </tr>
          </thead>
          <tbody>
            {item.lines.map((line, index) => (
              <tr key={line.vendorPoLineId}>
                <td className="py-1 text-slate-700">{line.description}</td>
                <td className="py-1 text-end">
                  <input
                    className="grid-input w-24 text-end tabular"
                    inputMode="decimal"
                    aria-label={`${t.vendorPo.planned} — ${line.description}`}
                    value={quantities[index]?.quantity ?? "0"}
                    onChange={(event) =>
                      setQuantities((current) =>
                        current.map((entry, i) => (i === index ? { ...entry, quantity: event.target.value } : entry)),
                      )
                    }
                  />
                </td>
                <td className="py-1 text-end text-slate-500 tabular">{line.receivedQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <SubmitButton pendingLabel={t.vendorPo.savingPayment}>{t.vendorPo.saveMilestone}</SubmitButton>
        <button type="button" className="btn-secondary" onClick={onDone}>
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
