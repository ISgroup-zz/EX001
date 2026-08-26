"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "./Form";
import { Field } from "./ui";
import { cancelInvoiceAction, issueInvoiceAction, recordPaymentAction } from "@/server/actions/invoices";
import { toDateInput } from "@/lib/dates";
import { fromMinor } from "@/lib/money";

/** Issue, cancel, print and record payments — everything that acts on a saved invoice. */
export function InvoiceActions({
  invoiceId,
  status,
  balanceMinor,
}: {
  invoiceId: string;
  status: string;
  balanceMinor: number;
}) {
  const [issueState, issue] = useActionState(issueInvoiceAction, null);
  const [cancelState, cancel] = useActionState(cancelInvoiceAction, null);
  const [paymentState, pay] = useActionState(recordPaymentAction, null);
  const [showPayment, setShowPayment] = useState(false);

  const isDraft = status === "DRAFT";
  const canTakePayment = balanceMinor > 0 && ["ISSUED", "PARTIALLY_PAID"].includes(status);

  return (
    <div className="no-print flex flex-col items-end gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => window.print()}>
          Print
        </button>

        {isDraft && (
          <form action={issue}>
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <SubmitButton pendingLabel="Issuing…">Issue invoice</SubmitButton>
          </form>
        )}

        {canTakePayment && (
          <button type="button" className="btn-primary" onClick={() => setShowPayment((value) => !value)}>
            {showPayment ? "Close" : "Record payment"}
          </button>
        )}

        {status !== "CANCELLED" && status !== "PAID" && (
          <form action={cancel}>
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <SubmitButton className="btn-danger" pendingLabel="Cancelling…">
              Cancel
            </SubmitButton>
          </form>
        )}
      </div>

      <FormMessage state={issueState ?? cancelState} />

      {showPayment && canTakePayment && (
        <form action={pay} className="card w-full min-w-[320px] space-y-3 p-4 text-left sm:w-[420px]">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <FormMessage state={paymentState} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" htmlFor="amount">
              <input
                id="amount"
                name="amount"
                required
                className="input tabular"
                defaultValue={fromMinor(balanceMinor).toFixed(2)}
              />
            </Field>
            <Field label="Date" htmlFor="paidDate">
              <input id="paidDate" name="paidDate" type="date" required defaultValue={toDateInput(new Date())} className="input" />
            </Field>
            <Field label="Method" htmlFor="method">
              <input id="method" name="method" className="input" placeholder="Bank transfer" />
            </Field>
            <Field label="Reference" htmlFor="reference">
              <input id="reference" name="reference" className="input" />
            </Field>
          </div>
          <SubmitButton className="btn-primary w-full" pendingLabel="Recording…">
            Record payment
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
