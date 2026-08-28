"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FormMessage, SubmitButton } from "./Form";
import { Alert, Field } from "./ui";
import { createInvoiceAction } from "@/server/actions/invoices";
import { formatMoney, formatQty, parseMoneyToMinor, parseQty } from "@/lib/money";
import type { BillableLine } from "@/server/services/invoice";
import { useT } from "./LocaleProvider";

/**
 * Building a client invoice.
 *
 * Lines arrive pre-filled with what is actually billable — delivered, not yet invoiced —
 * so the usual job is to check the numbers and issue. Anything typed above the billable
 * quantity is refused by the server, and flagged here before it gets that far.
 */

type AgreementOption = { id: string; reference: string; type: string };

type Row = {
  clientAgreementLineId: string;
  description: string;
  uom: string;
  quantity: string;
  unitPrice: string;
  taxRatePct: string;
  billableQty: number;
  deliveredQty: number;
  invoicedQty: number;
  orderedQty: number;
  hasVendorCoverage: boolean;
};

export function InvoiceForm({
  projectId,
  currency,
  agreements,
  selectedAgreementId,
  billable,
  today,
  dueDate,
}: {
  projectId: string;
  currency: string;
  agreements: AgreementOption[];
  selectedAgreementId: string;
  billable: BillableLine[];
  today: string;
  dueDate: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(createInvoiceAction, null);
  const t = useT();

  const [rows, setRows] = useState<Row[]>(() =>
    billable.map((line) => ({
      clientAgreementLineId: line.clientAgreementLineId,
      description: line.description,
      uom: line.uom,
      quantity: line.suggestedQty > 0 ? String(line.suggestedQty) : "0",
      unitPrice: String(line.unitPriceMinor / 100),
      taxRatePct: String(line.taxRatePct),
      billableQty: line.billableQty,
      deliveredQty: line.deliveredQty,
      invoicedQty: line.invoicedQty,
      orderedQty: line.orderedQty,
      hasVendorCoverage: line.hasVendorCoverage,
    })),
  );

  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.clientAgreementLineId === id ? { ...row, ...patch } : row)));

  const billEverything = () =>
    setRows((current) => current.map((row) => ({ ...row, quantity: String(row.billableQty) })));

  const clearAll = () => setRows((current) => current.map((row) => ({ ...row, quantity: "0" })));

  const totals = useMemo(() => {
    let net = 0;
    let tax = 0;
    for (const row of rows) {
      const lineNet = Math.round(parseQty(row.quantity) * parseMoneyToMinor(row.unitPrice));
      net += lineNet;
      tax += Math.round((lineNet * (Number(row.taxRatePct) || 0)) / 100);
    }
    return { net, tax, gross: net + tax };
  }, [rows]);

  const overBilled = rows.some((row) => parseQty(row.quantity) > row.billableQty);
  const nothingToBill = rows.every((row) => parseQty(row.quantity) <= 0);
  const anythingBillable = rows.some((row) => row.billableQty > 0);

  const serialised = rows
    .filter((row) => parseQty(row.quantity) > 0)
    .map((row) => ({
      clientAgreementLineId: row.clientAgreementLineId,
      description: row.description,
      uom: row.uom,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      taxRatePct: row.taxRatePct,
    }));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="clientAgreementId" value={selectedAgreementId} />
      <input type="hidden" name="lines" value={JSON.stringify(serialised)} />

      <FormMessage state={state} />

      <div className="card grid gap-4 p-5 sm:grid-cols-3">
        <Field label={t.invoices.billAgainst} htmlFor="agreementPicker" hint={t.invoices.billAgainstHint}>
          <select
            id="agreementPicker"
            className="select"
            value={selectedAgreementId}
            onChange={(event) =>
              router.replace(`/projects/${projectId}/invoices/new?agreementId=${event.target.value}`)
            }
          >
            {agreements.map((agreement) => (
              <option key={agreement.id} value={agreement.id}>
                {agreement.reference} · {agreement.type.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.invoices.invoiceDate} htmlFor="issueDate">
          <input id="issueDate" name="issueDate" type="date" required defaultValue={today} className="input" />
        </Field>
        <Field label={t.invoices.dueDate} htmlFor="dueDate" hint={t.invoices.dueDateHint}>
          <input id="dueDate" name="dueDate" type="date" defaultValue={dueDate} className="input" />
        </Field>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t.common.lines}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {t.invoices.linesHint}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={billEverything}>
              {t.invoices.billEverything}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={clearAll}>
              {t.grn.clear}
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm font-medium text-slate-700">{t.invoices.noLinesToBill}</p>
            <p className="text-sm text-slate-500">{t.invoices.noLinesToBillHint}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.common.description}</th>
                  <th className="num text-end">{t.invoices.orderedCol}</th>
                  <th className="num text-end">{t.invoices.deliveredCol}</th>
                  <th className="num text-end">{t.invoices.invoicedCol}</th>
                  <th className="num text-end">{t.invoices.billableCol}</th>
                  <th className="num text-end" style={{ width: "120px" }}>
                    {t.invoices.billNow}
                  </th>
                  <th className="num text-end" style={{ width: "130px" }}>
                    {t.common.unitPrice}
                  </th>
                  <th className="num text-end" style={{ width: "90px" }}>
                    {t.common.tax} %
                  </th>
                  <th className="num text-end" style={{ width: "130px" }}>
                    {t.common.lineTotal}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const quantity = parseQty(row.quantity);
                  const over = quantity > row.billableQty;
                  return (
                    <tr key={row.clientAgreementLineId}>
                      <td>
                        <div className="text-slate-900">{row.description}</div>
                        {!row.hasVendorCoverage && (
                          <div className="text-[11px] text-slate-400">{t.invoices.noVendorLine}</div>
                        )}
                      </td>
                      <td className="num text-end tabular text-slate-500">
                        {formatQty(row.orderedQty)} {row.uom}
                      </td>
                      <td className="num text-end tabular">{formatQty(row.deliveredQty)}</td>
                      <td className="num text-end tabular text-slate-500">{formatQty(row.invoicedQty)}</td>
                      <td className="num text-end tabular font-medium text-emerald-700">
                        {formatQty(row.billableQty)}
                      </td>
                      <td>
                        <input
                          className={`grid-input text-end tabular ${over ? "border-red-400 bg-red-50" : ""}`}
                          inputMode="decimal"
                          value={row.quantity}
                          onChange={(event) => setRow(row.clientAgreementLineId, { quantity: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="grid-input text-end tabular"
                          inputMode="decimal"
                          value={row.unitPrice}
                          onChange={(event) => setRow(row.clientAgreementLineId, { unitPrice: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="grid-input text-end tabular"
                          inputMode="decimal"
                          value={row.taxRatePct}
                          onChange={(event) => setRow(row.clientAgreementLineId, { taxRatePct: event.target.value })}
                        />
                      </td>
                      <td className="num text-end font-medium tabular">
                        {formatMoney(Math.round(quantity * parseMoneyToMinor(row.unitPrice)), currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 text-sm">
                  <td colSpan={8} className="px-4 py-2 text-end font-medium text-slate-600">
                    {t.common.net}
                  </td>
                  <td className="px-4 py-2 text-end font-semibold tabular">{formatMoney(totals.net, currency)}</td>
                </tr>
                <tr className="bg-slate-50 text-sm">
                  <td colSpan={8} className="px-4 py-2 text-end font-medium text-slate-600">
                    {t.common.tax}
                  </td>
                  <td className="px-4 py-2 text-end tabular">{formatMoney(totals.tax, currency)}</td>
                </tr>
                <tr className="bg-slate-50 text-sm">
                  <td colSpan={8} className="px-4 py-2 text-end font-semibold text-slate-700">
                    {t.common.total}
                  </td>
                  <td className="px-4 py-2 text-end font-semibold tabular">{formatMoney(totals.gross, currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {!anythingBillable && rows.length > 0 && (
        <Alert tone="warning" title={t.invoices.nothingBillable}>
          {t.invoices.nothingBillableHint}
        </Alert>
      )}

      {overBilled && (
        <Alert tone="danger" title={t.invoices.overBilled}>
          {t.invoices.overBilledHint}
        </Alert>
      )}

      <Field label={t.common.notes} htmlFor="notes">
        <textarea id="notes" name="notes" className="textarea" placeholder={t.invoices.notesPlaceholder} />
      </Field>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <SubmitButton name="intent" value="draft" className="btn-secondary" disabled={nothingToBill}>
          {t.grn.saveDraft}
        </SubmitButton>
        <SubmitButton name="intent" value="issue" pendingLabel={t.invoices.issuing} disabled={nothingToBill}>
          {t.invoices.issueInvoice}
        </SubmitButton>
      </div>
    </form>
  );
}
