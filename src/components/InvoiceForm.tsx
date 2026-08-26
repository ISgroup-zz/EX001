"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FormMessage, SubmitButton } from "./Form";
import { Alert, Field } from "./ui";
import { createInvoiceAction } from "@/server/actions/invoices";
import { formatMoney, formatQty, parseMoneyToMinor, parseQty } from "@/lib/money";
import type { BillableLine } from "@/server/services/invoice";

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
        <Field label="Bill against" htmlFor="agreementPicker" hint="Each invoice is raised against one client document.">
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
        <Field label="Invoice date" htmlFor="issueDate">
          <input id="issueDate" name="issueDate" type="date" required defaultValue={today} className="input" />
        </Field>
        <Field label="Due date" htmlFor="dueDate" hint="Defaults to the client's payment terms.">
          <input id="dueDate" name="dueDate" type="date" defaultValue={dueDate} className="input" />
        </Field>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <div>
            <h2 className="card-title">Lines</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Billable = delivered, less what has already been invoiced. Zero a line to leave it for next time.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={billEverything}>
              Bill everything billable
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={clearAll}>
              Clear
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm font-medium text-slate-700">This document has no lines to bill</p>
            <p className="text-sm text-slate-500">Lump-sum documents are invoiced from the project instead.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num text-right">Ordered</th>
                  <th className="num text-right">Delivered</th>
                  <th className="num text-right">Invoiced</th>
                  <th className="num text-right">Billable</th>
                  <th className="num text-right" style={{ width: "120px" }}>
                    Bill now
                  </th>
                  <th className="num text-right" style={{ width: "130px" }}>
                    Unit price
                  </th>
                  <th className="num text-right" style={{ width: "90px" }}>
                    Tax %
                  </th>
                  <th className="num text-right" style={{ width: "130px" }}>
                    Line total
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
                          <div className="text-[11px] text-slate-400">no vendor line — billable in full</div>
                        )}
                      </td>
                      <td className="num text-right tabular text-slate-500">
                        {formatQty(row.orderedQty)} {row.uom}
                      </td>
                      <td className="num text-right tabular">{formatQty(row.deliveredQty)}</td>
                      <td className="num text-right tabular text-slate-500">{formatQty(row.invoicedQty)}</td>
                      <td className="num text-right tabular font-medium text-emerald-700">
                        {formatQty(row.billableQty)}
                      </td>
                      <td>
                        <input
                          className={`grid-input text-right tabular ${over ? "border-red-400 bg-red-50" : ""}`}
                          inputMode="decimal"
                          value={row.quantity}
                          onChange={(event) => setRow(row.clientAgreementLineId, { quantity: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="grid-input text-right tabular"
                          inputMode="decimal"
                          value={row.unitPrice}
                          onChange={(event) => setRow(row.clientAgreementLineId, { unitPrice: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="grid-input text-right tabular"
                          inputMode="decimal"
                          value={row.taxRatePct}
                          onChange={(event) => setRow(row.clientAgreementLineId, { taxRatePct: event.target.value })}
                        />
                      </td>
                      <td className="num text-right font-medium tabular">
                        {formatMoney(Math.round(quantity * parseMoneyToMinor(row.unitPrice)), currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 text-sm">
                  <td colSpan={8} className="px-4 py-2 text-right font-medium text-slate-600">
                    Net
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular">{formatMoney(totals.net, currency)}</td>
                </tr>
                <tr className="bg-slate-50 text-sm">
                  <td colSpan={8} className="px-4 py-2 text-right font-medium text-slate-600">
                    Tax
                  </td>
                  <td className="px-4 py-2 text-right tabular">{formatMoney(totals.tax, currency)}</td>
                </tr>
                <tr className="bg-slate-50 text-sm">
                  <td colSpan={8} className="px-4 py-2 text-right font-semibold text-slate-700">
                    Total
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular">{formatMoney(totals.gross, currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {!anythingBillable && rows.length > 0 && (
        <Alert tone="warning" title="Nothing is billable on this document yet">
          Everything delivered has already been invoiced. Post the next goods receipt and the billable quantity will
          appear here.
        </Alert>
      )}

      {overBilled && (
        <Alert tone="danger" title="More than has been delivered">
          One or more lines bill above the billable quantity. Reduce them — an invoice can only cover goods actually
          received.
        </Alert>
      )}

      <Field label="Notes" htmlFor="notes">
        <textarea id="notes" name="notes" className="textarea" placeholder="Anything to appear on the invoice" />
      </Field>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <SubmitButton name="intent" value="draft" className="btn-secondary" disabled={nothingToBill}>
          Save as draft
        </SubmitButton>
        <SubmitButton name="intent" value="issue" pendingLabel="Issuing…" disabled={nothingToBill}>
          Issue invoice
        </SubmitButton>
      </div>
    </form>
  );
}
