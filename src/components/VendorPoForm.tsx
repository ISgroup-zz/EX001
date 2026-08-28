"use client";

import { useActionState, useMemo, useState } from "react";
import { FormMessage, SubmitButton } from "./Form";
import { Alert, Field, ProgressBar } from "./ui";
import { createVendorPoAction } from "@/server/actions/vendorPos";
import { formatMoney, formatQty, parseMoneyToMinor, parseQty, roundQty, splitQuantityEvenly } from "@/lib/money";
import { addMonths, addWeeks, toDateInput } from "@/lib/dates";
import type { OrderableAgreementLine } from "@/server/services/vendorPo";
import { useT } from "./LocaleProvider";

/**
 * Raising a vendor PO, in three steps that mirror how a PM actually works:
 *   1. who and when
 *   2. what — ticked straight off the client's document rather than retyped, which
 *      also links each vendor line to the client line it serves
 *   3. when it arrives — the delivery plan, pre-filled and splittable in one click
 *
 * Step 3 is where the forecast comes from, so it is part of raising the order and
 * never a separate errand.
 */

type Vendor = { id: string; name: string };

type PoLine = {
  key: string;
  clientAgreementLineId: string | null;
  description: string;
  uom: string;
  quantity: string;
  unitCost: string;
  taxRatePct: string;
};

type PlanRow = {
  key: string;
  label: string;
  plannedDate: string;
  quantities: string[];
};

let keyCounter = 0;
const nextKey = () => `row-${keyCounter++}`;

const blankLine = (): PoLine => ({
  key: nextKey(),
  clientAgreementLineId: null,
  description: "",
  uom: "EA",
  quantity: "",
  unitCost: "",
  taxRatePct: "5",
});

export function VendorPoForm({
  projectId,
  currency,
  vendors,
  orderable,
  agreements,
  today,
}: {
  projectId: string;
  currency: string;
  vendors: Vendor[];
  orderable: OrderableAgreementLine[];
  agreements: Array<{ id: string; reference: string; type: string }>;
  today: string;
}) {
  const [state, formAction] = useActionState(createVendorPoAction, null);
  const [step, setStep] = useState(1);
  const [lines, setLines] = useState<PoLine[]>([]);
  const [planRows, setPlanRows] = useState<PlanRow[]>([]);
  const [expectedDate, setExpectedDate] = useState(toDateInput(addWeeks(new Date(), 4)));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const t = useT();

  const outstanding = orderable.filter((line) => line.outstandingQty > 0);

  /** Ticking client lines builds the PO — description, quantity and the link, all at once. */
  const pullSelectedLines = () => {
    const picked = outstanding.filter((line) => selected[line.clientAgreementLineId]);
    if (picked.length === 0) return;

    const pulled: PoLine[] = picked.map((line) => ({
      key: nextKey(),
      clientAgreementLineId: line.clientAgreementLineId,
      description: line.description,
      uom: line.uom,
      quantity: String(line.outstandingQty),
      // Cost is ours to negotiate, so it starts blank rather than copying the client price.
      unitCost: "",
      taxRatePct: "5",
    }));

    setLines((current) => [...current.filter((line) => line.description.trim() !== ""), ...pulled]);
    setSelected({});
  };

  const setLine = (key: string, patch: Partial<PoLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const removeLine = (key: string) => setLines((current) => current.filter((line) => line.key !== key));

  const activeLines = lines.filter((line) => line.description.trim() !== "");

  const totals = useMemo(() => {
    let net = 0;
    let tax = 0;
    for (const line of activeLines) {
      const lineNet = Math.round(parseQty(line.quantity) * parseMoneyToMinor(line.unitCost));
      net += lineNet;
      tax += Math.round((lineNet * (Number(line.taxRatePct) || 0)) / 100);
    }
    return { net, tax, gross: net + tax };
  }, [activeLines]);

  // ---------------------------------------------------------------- delivery plan

  const ensurePlanShape = (rows: PlanRow[]): PlanRow[] =>
    rows.map((row) => ({
      ...row,
      quantities: activeLines.map((_, index) => row.quantities[index] ?? "0"),
    }));

  const singleTranche = (): PlanRow[] => [
    {
      key: nextKey(),
      label: "Full delivery",
      plannedDate: expectedDate,
      quantities: activeLines.map((line) => String(parseQty(line.quantity))),
    },
  ];

  const splitInto = (parts: number, cadence: "weeks" | "months") => {
    const perLine = activeLines.map((line) => splitQuantityEvenly(parseQty(line.quantity), parts));
    const start = new Date(`${expectedDate}T00:00:00.000Z`);

    setPlanRows(
      Array.from({ length: parts }, (_, index) => ({
        key: nextKey(),
        label: `Shipment ${index + 1} of ${parts}`,
        plannedDate: toDateInput(cadence === "months" ? addMonths(start, index) : addWeeks(start, index * 4)),
        quantities: activeLines.map((_, lineIndex) => String(perLine[lineIndex][index])),
      })),
    );
  };

  const goToPlan = () => {
    setPlanRows((current) => (current.length === 0 ? singleTranche() : ensurePlanShape(current)));
    setStep(3);
  };

  const addPlanRow = () =>
    setPlanRows((current) => [
      ...current,
      {
        key: nextKey(),
        label: `Shipment ${current.length + 1}`,
        plannedDate: expectedDate,
        quantities: activeLines.map(() => "0"),
      },
    ]);

  const setPlanCell = (key: string, index: number, value: string) =>
    setPlanRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, quantities: row.quantities.map((qty, i) => (i === index ? value : qty)) } : row,
      ),
    );

  /** Put whatever is unplanned on a line into the last tranche. */
  const planRemainder = () => {
    setPlanRows((current) => {
      if (current.length === 0) return singleTranche();
      const rows = ensurePlanShape(current);
      const last = rows.length - 1;
      return rows.map((row, rowIndex) =>
        rowIndex !== last
          ? row
          : {
              ...row,
              quantities: row.quantities.map((qty, lineIndex) => {
                const ordered = parseQty(activeLines[lineIndex]?.quantity ?? "0");
                const plannedElsewhere = rows.reduce(
                  (sum, other, otherIndex) => (otherIndex === last ? sum : sum + parseQty(other.quantities[lineIndex] ?? "0")),
                  0,
                );
                const remainder = roundQty(Math.max(0, ordered - plannedElsewhere));
                return String(remainder > 0 ? remainder : parseQty(qty));
              }),
            },
      );
    });
  };

  const coverage = activeLines.map((line, index) => {
    const ordered = parseQty(line.quantity);
    const planned = roundQty(planRows.reduce((sum, row) => sum + parseQty(row.quantities[index] ?? "0"), 0));
    return { ordered, planned, over: planned > ordered, under: planned < ordered };
  });
  const hasOverPlan = coverage.some((entry) => entry.over);
  const hasUnderPlan = coverage.some((entry) => entry.under);

  const serialisedLines = activeLines.map((line) => ({
    description: line.description,
    uom: line.uom,
    quantity: line.quantity,
    unitCost: line.unitCost,
    taxRatePct: line.taxRatePct,
    clientAgreementLineId: line.clientAgreementLineId ?? "",
  }));

  const serialisedPlan = planRows.map((row) => ({
    label: row.label,
    plannedDate: row.plannedDate,
    quantities: row.quantities,
  }));

  const steps = [t.vendorPo.stepVendor, t.vendorPo.stepLines, t.vendorPo.stepPlan];

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="lines" value={JSON.stringify(serialisedLines)} />
      <input type="hidden" name="planItems" value={JSON.stringify(serialisedPlan)} />

      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {steps.map((label, index) => {
          const number = index + 1;
          const active = step === number;
          const done = step > number;
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => (number === 3 ? goToPlan() : setStep(number))}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 transition ${
                  active ? "bg-brand-50 text-brand-800" : done ? "text-slate-600 hover:bg-slate-50" : "text-slate-400"
                }`}
              >
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full text-xs font-semibold ${
                    active ? "bg-brand-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {done ? "✓" : number}
                </span>
                {label}
              </button>
              {number < steps.length && <span className="text-slate-300">→</span>}
            </li>
          );
        })}
      </ol>

      <FormMessage state={state} />

      {/* ---------------------------------------------------------------- step 1 */}
      <section className={step === 1 ? "space-y-5" : "hidden"}>
        <div className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.common.vendor} htmlFor="vendorId">
            <select id="vendorId" name="vendorId" required className="select" defaultValue="">
              <option value="" disabled>
                {t.vendorPo.chooseVendor}
              </option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t.vendorPo.againstClientDocument} htmlFor="clientAgreementId">
            <select id="clientAgreementId" name="clientAgreementId" className="select" defaultValue="">
              <option value="">{t.vendorPo.notSpecified}</option>
              {agreements.map((agreement) => (
                <option key={agreement.id} value={agreement.id}>
                  {agreement.reference} · {agreement.type.toLowerCase()}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t.vendorPo.ourPoNumber} htmlFor="poNumber" hint={t.vendorPo.poNumberHint}>
            <input id="poNumber" name="poNumber" className="input tabular" placeholder="PO-2026-0001" />
          </Field>

          <Field label={t.projects.issueDate} htmlFor="issueDate">
            <input id="issueDate" name="issueDate" type="date" required defaultValue={today} className="input" />
          </Field>

          <Field label={t.vendorPo.expectedDelivery} htmlFor="expectedDeliveryDate" hint={t.vendorPo.expectedHint}>
            <input
              id="expectedDeliveryDate"
              name="expectedDeliveryDate"
              type="date"
              className="input"
              value={expectedDate}
              onChange={(event) => setExpectedDate(event.target.value)}
            />
          </Field>

          <Field label={t.common.notes} htmlFor="notes" className="sm:col-span-2 lg:col-span-3">
            <input id="notes" name="notes" className="input" placeholder={t.vendorPo.notesPlaceholder} />
          </Field>
        </div>

        <div className="flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setStep(2)}>
            {t.common.continue}
          </button>
        </div>
      </section>

      {/* ---------------------------------------------------------------- step 2 */}
      <section className={step === 2 ? "space-y-5" : "hidden"}>
        {outstanding.length > 0 && (
          <div className="card overflow-hidden">
            <div className="card-header">
              <div>
                <h2 className="card-title">{t.vendorPo.pullTitle}</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t.vendorPo.pullHint}
                </p>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={pullSelectedLines}>
                {t.vendorPo.addSelected}
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-10" />
                    <th>{t.vendorPo.clientLine}</th>
                    <th>{t.vendorPo.document}</th>
                    <th className="num text-end">{t.vendorPo.clientQty}</th>
                    <th className="num text-end">{t.vendorPo.alreadyOrdered}</th>
                    <th className="num text-end">{t.vendorPo.stillToOrder}</th>
                  </tr>
                </thead>
                <tbody>
                  {outstanding.map((line) => (
                    <tr key={line.clientAgreementLineId}>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          checked={Boolean(selected[line.clientAgreementLineId])}
                          onChange={(event) =>
                            setSelected((current) => ({
                              ...current,
                              [line.clientAgreementLineId]: event.target.checked,
                            }))
                          }
                        />
                      </td>
                      <td className="text-slate-900">{line.description}</td>
                      <td className="text-xs text-slate-500 tabular">{line.agreementReference}</td>
                      <td className="num text-end tabular">{formatQty(line.clientQty)}</td>
                      <td className="num text-end tabular">{formatQty(line.orderedQty)}</td>
                      <td className="num text-end font-medium tabular">
                        {formatQty(line.outstandingQty)} {line.uom}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">{t.vendorPo.orderLines}</h2>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setLines((c) => [...c, blankLine()])}>
              + {t.vendorPo.addLine}
            </button>
          </div>

          {lines.length === 0 ? (
            <div className="empty-state">
              <p className="text-sm font-medium text-slate-700">{t.vendorPo.noLinesYet}</p>
              <p className="text-sm text-slate-500">
                {outstanding.length > 0
                  ? t.vendorPo.noLinesHintPull
                  : t.vendorPo.noLinesHint}
              </p>
              <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => setLines([blankLine()])}>
                + {t.vendorPo.addLine}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>{t.common.description}</th>
                    <th style={{ width: "80px" }}>{t.common.uom}</th>
                    <th className="num text-end" style={{ width: "110px" }}>
                      {t.common.quantity}
                    </th>
                    <th className="num text-end" style={{ width: "140px" }}>
                      {t.vendorPo.unitCost}
                    </th>
                    <th className="num text-end" style={{ width: "90px" }}>
                      {t.common.tax} %
                    </th>
                    <th className="num text-end" style={{ width: "130px" }}>
                      {t.common.lineTotal}
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line.key}>
                      <td className="text-center text-xs text-slate-400">{index + 1}</td>
                      <td>
                        <input
                          className="grid-input"
                          value={line.description}
                          placeholder={t.vendorPo.whatWeBuying}
                          onChange={(event) => setLine(line.key, { description: event.target.value })}
                        />
                        {line.clientAgreementLineId && (
                          <span className="ms-2 text-[11px] text-emerald-700">{t.vendorPo.linkedToClientLine}</span>
                        )}
                      </td>
                      <td>
                        <input
                          className="grid-input"
                          value={line.uom}
                          onChange={(event) => setLine(line.key, { uom: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="grid-input text-end tabular"
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(event) => setLine(line.key, { quantity: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="grid-input text-end tabular"
                          inputMode="decimal"
                          value={line.unitCost}
                          placeholder="0.00"
                          onChange={(event) => setLine(line.key, { unitCost: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="grid-input text-end tabular"
                          inputMode="decimal"
                          value={line.taxRatePct}
                          onChange={(event) => setLine(line.key, { taxRatePct: event.target.value })}
                        />
                      </td>
                      <td className="num text-end text-slate-600 tabular">
                        {formatMoney(Math.round(parseQty(line.quantity) * parseMoneyToMinor(line.unitCost)), currency)}
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label={t.common.remove}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 text-sm">
                    <td colSpan={6} className="px-4 py-2 text-end font-medium text-slate-600">
                      {t.common.net}
                    </td>
                    <td className="px-4 py-2 text-end font-semibold text-slate-900 tabular">
                      {formatMoney(totals.net, currency)}
                    </td>
                    <td />
                  </tr>
                  {totals.tax > 0 && (
                    <tr className="bg-slate-50 text-sm">
                      <td colSpan={6} className="px-4 py-2 text-end font-medium text-slate-600">
                        {t.common.gross}
                      </td>
                      <td className="px-4 py-2 text-end font-semibold text-slate-900 tabular">
                        {formatMoney(totals.gross, currency)}
                      </td>
                      <td />
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
            {t.common.back}
          </button>
          <button type="button" className="btn-primary" onClick={goToPlan} disabled={activeLines.length === 0}>
            {t.vendorPo.continueToPlan}
          </button>
        </div>
      </section>

      {/* ---------------------------------------------------------------- step 3 */}
      <section className={step === 3 ? "space-y-5" : "hidden"}>
        <Alert tone="info" title={t.vendorPo.planIsForecast}>
          {t.vendorPo.planIsForecastHint}
        </Alert>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">{t.vendorPo.plannedDeliveries}</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => setPlanRows(singleTranche())}>
                {t.vendorPo.singleDelivery}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => splitInto(2, "months")}>
                {t.vendorPo.splitIn2}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => splitInto(3, "months")}>
                {t.vendorPo.splitIn3}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => splitInto(4, "months")}>
                {t.vendorPo.monthlyBy4}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={addPlanRow}>
                {t.vendorPo.addTranche}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "180px" }}>{t.vendorPo.label}</th>
                  <th style={{ width: "160px" }}>{t.vendorPo.plannedDate}</th>
                  {activeLines.map((line) => (
                    <th key={line.key} className="num text-end">
                      <span className="block max-w-[140px] truncate">{line.description}</span>
                      <span className="text-[10px] font-normal normal-case text-slate-400">
                        {formatQty(parseQty(line.quantity))} {line.uom} {t.vendorPo.ordered}
                      </span>
                    </th>
                  ))}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {planRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <input
                        className="grid-input"
                        value={row.label}
                        onChange={(event) =>
                          setPlanRows((current) =>
                            current.map((item) => (item.key === row.key ? { ...item, label: event.target.value } : item)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className="grid-input tabular"
                        value={row.plannedDate}
                        onChange={(event) =>
                          setPlanRows((current) =>
                            current.map((item) =>
                              item.key === row.key ? { ...item, plannedDate: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </td>
                    {activeLines.map((line, index) => (
                      <td key={line.key}>
                        <input
                          className="grid-input text-end tabular"
                          inputMode="decimal"
                          value={row.quantities[index] ?? "0"}
                          onChange={(event) => setPlanCell(row.key, index, event.target.value)}
                        />
                      </td>
                    ))}
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => setPlanRows((current) => current.filter((item) => item.key !== row.key))}
                        className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label={t.common.remove}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.vendorPo.coverage}</h3>
              {hasUnderPlan && (
                <button type="button" className="btn-secondary btn-sm" onClick={planRemainder}>
                  {t.vendorPo.planRemainder}
                </button>
              )}
            </div>
            <ul className="space-y-2">
              {activeLines.map((line, index) => {
                const entry = coverage[index];
                return (
                  <li key={line.key} className="flex items-center gap-3">
                    <span className="w-48 shrink-0 truncate text-xs text-slate-600">{line.description}</span>
                    <div className="flex-1">
                      <ProgressBar
                        value={entry.planned}
                        total={entry.ordered}
                        tone={entry.over ? "red" : entry.planned >= entry.ordered ? "emerald" : "amber"}
                        showPct={false}
                      />
                    </div>
                    <span className={`w-32 shrink-0 text-end text-xs tabular ${entry.over ? "text-red-700" : "text-slate-500"}`}>
                      {formatQty(entry.planned)} / {formatQty(entry.ordered)} {line.uom}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {hasOverPlan && (
          <Alert tone="danger" title={t.vendorPo.overPlanned}>
            {t.vendorPo.overPlannedHint}
          </Alert>
        )}
        {hasUnderPlan && !hasOverPlan && (
          <Alert tone="warning" title={t.vendorPo.underPlanned}>
            {t.vendorPo.underPlannedHint}
          </Alert>
        )}

        <div className="flex justify-between">
          <button type="button" className="btn-secondary" onClick={() => setStep(2)}>
            {t.common.back}
          </button>
          <SubmitButton pendingLabel={t.vendorPo.creating}>{t.vendorPo.createPo}</SubmitButton>
        </div>
      </section>
    </form>
  );
}
