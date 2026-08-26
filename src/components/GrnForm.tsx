"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "./Form";
import { Alert, Field } from "./ui";
import { saveGrnAction } from "@/server/actions/grns";
import { formatQty, parseQty } from "@/lib/money";
import { formatDate, toDateInput } from "@/lib/dates";
import type { GrnDraft } from "@/server/services/grn";

/**
 * Receiving goods.
 *
 * The draft arrives pre-filled from the planned delivery, so the usual job is to glance
 * at the numbers and press Post. Rejections are the exception, so that column stays out
 * of the way until it's needed.
 */
export function GrnForm({ draft, grnId }: { draft: GrnDraft; grnId?: string }) {
  const [state, formAction] = useActionState(saveGrnAction, null);
  const [showRejections, setShowRejections] = useState(false);
  const [rows, setRows] = useState(() =>
    draft.lines.map((line) => ({
      vendorPoLineId: line.vendorPoLineId,
      quantityAccepted: line.suggestedQty > 0 ? String(line.suggestedQty) : "",
      quantityRejected: "",
      remarks: "",
    })),
  );

  const setRow = (id: string, patch: Partial<(typeof rows)[number]>) =>
    setRows((current) => current.map((row) => (row.vendorPoLineId === id ? { ...row, ...patch } : row)));

  const receiveAll = () =>
    setRows((current) =>
      current.map((row) => {
        const line = draft.lines.find((entry) => entry.vendorPoLineId === row.vendorPoLineId);
        return { ...row, quantityAccepted: String(line?.outstandingQty ?? 0) };
      }),
    );

  const clearAll = () => setRows((current) => current.map((row) => ({ ...row, quantityAccepted: "", quantityRejected: "" })));

  const overReceipt = rows.some((row) => {
    const line = draft.lines.find((entry) => entry.vendorPoLineId === row.vendorPoLineId);
    return line ? parseQty(row.quantityAccepted) > line.outstandingQty : false;
  });
  const nothingEntered = rows.every((row) => parseQty(row.quantityAccepted) <= 0 && parseQty(row.quantityRejected) <= 0);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="vendorPoId" value={draft.vendorPoId} />
      {grnId && <input type="hidden" name="grnId" value={grnId} />}
      {draft.deliveryPlanItemId && <input type="hidden" name="deliveryPlanItemId" value={draft.deliveryPlanItemId} />}
      <input type="hidden" name="lines" value={JSON.stringify(rows)} />

      <FormMessage state={state} />

      {draft.planItemLabel && (
        <Alert tone="info" title={`Receiving against "${draft.planItemLabel}"`}>
          Planned for {draft.plannedDate ? formatDate(draft.plannedDate) : "—"}. Quantities below are pre-filled from that
          plan — change only what differs from what actually turned up.
        </Alert>
      )}

      <div className="card grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Received date" htmlFor="receivedDate">
          <input
            id="receivedDate"
            name="receivedDate"
            type="date"
            required
            defaultValue={toDateInput(draft.receivedDate)}
            className="input"
          />
        </Field>
        <Field label="Delivery note ref" htmlFor="deliveryNoteRef">
          <input id="deliveryNoteRef" name="deliveryNoteRef" className="input" placeholder="Vendor's DN number" />
        </Field>
        <Field label="Notes" htmlFor="notes">
          <input id="notes" name="notes" className="input" placeholder="Condition, discrepancies, who checked it" />
        </Field>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Quantities received</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={receiveAll}>
              Receive all outstanding
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={clearAll}>
              Clear
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowRejections((value) => !value)}>
              {showRejections ? "Hide rejections" : "Record a rejection"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Description</th>
                <th className="num text-right">Ordered</th>
                <th className="num text-right">Already received</th>
                <th className="num text-right">Outstanding</th>
                <th className="num text-right" style={{ width: "130px" }}>
                  Accepted
                </th>
                {showRejections && (
                  <>
                    <th className="num text-right" style={{ width: "130px" }}>
                      Rejected
                    </th>
                    <th style={{ width: "200px" }}>Remarks</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((line, index) => {
                const row = rows[index];
                const accepted = parseQty(row.quantityAccepted);
                const over = accepted > line.outstandingQty;
                return (
                  <tr key={line.vendorPoLineId}>
                    <td className="text-xs text-slate-400">{line.lineNo}</td>
                    <td className="text-slate-900">{line.description}</td>
                    <td className="num text-right tabular">
                      {formatQty(line.orderedQty)} {line.uom}
                    </td>
                    <td className="num text-right tabular text-slate-500">{formatQty(line.receivedQty)}</td>
                    <td className="num text-right tabular font-medium">{formatQty(line.outstandingQty)}</td>
                    <td>
                      <input
                        className={`grid-input text-right tabular ${over ? "border-red-400 bg-red-50" : ""}`}
                        inputMode="decimal"
                        value={row.quantityAccepted}
                        placeholder="0"
                        onChange={(event) => setRow(line.vendorPoLineId, { quantityAccepted: event.target.value })}
                      />
                      {over && <p className="mt-0.5 text-right text-[11px] text-red-600">more than outstanding</p>}
                    </td>
                    {showRejections && (
                      <>
                        <td>
                          <input
                            className="grid-input text-right tabular"
                            inputMode="decimal"
                            value={row.quantityRejected}
                            placeholder="0"
                            onChange={(event) => setRow(line.vendorPoLineId, { quantityRejected: event.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="grid-input"
                            value={row.remarks}
                            placeholder="Reason"
                            onChange={(event) => setRow(line.vendorPoLineId, { remarks: event.target.value })}
                          />
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {overReceipt && (
        <Alert tone="danger" title="More than was ordered">
          One or more lines accept more than the outstanding quantity. A goods receipt can never take a line past its
          ordered quantity.
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <SubmitButton
          name="intent"
          value="draft"
          className="btn-secondary"
          pendingLabel="Saving…"
          disabled={nothingEntered}
        >
          Save as draft
        </SubmitButton>
        <SubmitButton name="intent" value="post" pendingLabel="Posting…" disabled={nothingEntered}>
          Post receipt
        </SubmitButton>
      </div>
      <p className="text-right text-xs text-slate-500">
        Posting makes these goods count as delivered — and billable to the client.
      </p>
    </form>
  );
}
