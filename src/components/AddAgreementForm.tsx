"use client";

import { useActionState, useState } from "react";
import { LineItemsEditor } from "./LineItemsEditor";
import { FormMessage, SubmitButton } from "./Form";
import { Alert, Field } from "./ui";
import { addAgreementAction } from "@/server/actions/projects";
import { formatMoney } from "@/lib/money";

/**
 * Adding a further client document to a live project — the thing that moves the budget.
 *
 * Four kinds, and the form changes shape for each:
 *   PO         a new order (optionally a call-off drawing on a framework)
 *   CONTRACT   a signed contract
 *   FRAMEWORK  an umbrella with a ceiling
 *   VARIATION  an amendment to a contract or framework, up or down
 */

export type ParentOption = {
  id: string;
  reference: string;
  type: string;
  remainingMinor?: number;
};

const LINE_COLUMNS = [
  { key: "description", label: "Description", type: "text" as const },
  { key: "uom", label: "UoM", type: "text" as const, width: "80px", placeholder: "EA" },
  { key: "quantity", label: "Qty", type: "qty" as const, width: "100px" },
  { key: "unitPrice", label: "Unit price", type: "money" as const, width: "130px" },
  { key: "taxRatePct", label: "Tax %", type: "percent" as const, width: "90px" },
];

const TYPES = [
  { value: "PO", label: "Purchase order", blurb: "Adds its line total to the budget." },
  { value: "CONTRACT", label: "Contract", blurb: "Adds its contract value to the budget." },
  { value: "FRAMEWORK", label: "Framework", blurb: "Adds its ceiling; call-offs draw it down." },
  { value: "VARIATION", label: "Variation order", blurb: "Amends a contract or framework, up or down." },
] as const;

export function AddAgreementForm({
  projectId,
  currency,
  frameworks,
  amendable,
  today,
}: {
  projectId: string;
  currency: string;
  frameworks: ParentOption[];
  amendable: ParentOption[];
  today: string;
}) {
  const [state, formAction] = useActionState(addAgreementAction, null);
  const [type, setType] = useState<string>("PO");
  const [isCallOff, setIsCallOff] = useState(false);
  const [parentId, setParentId] = useState("");

  const isFramework = type === "FRAMEWORK";
  const isVariation = type === "VARIATION";
  const showParent = isVariation || (type === "PO" && isCallOff);
  const parentOptions = isVariation ? amendable : frameworks;
  const selectedFramework = frameworks.find((framework) => framework.id === parentId);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="type" value={type} />
      {showParent ? <input type="hidden" name="parentAgreementId" value={parentId} /> : null}

      <FormMessage state={state} />

      <div>
        <p className="label">Document type</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setType(option.value);
                setParentId("");
                setIsCallOff(false);
              }}
              disabled={option.value === "VARIATION" && amendable.length === 0}
              className={`rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                type === option.value
                  ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-600">{option.blurb}</span>
            </button>
          ))}
        </div>
        {amendable.length === 0 && (
          <p className="field-hint">A variation needs a contract or framework on the project to amend.</p>
        )}
      </div>

      {type === "PO" && frameworks.length > 0 && (
        <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-4">
          <input
            type="checkbox"
            checked={isCallOff}
            onChange={(event) => setIsCallOff(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm">
            <span className="font-medium text-slate-900">This is a call-off against a framework</span>
            <span className="mt-0.5 block text-xs text-slate-600">
              A call-off draws down the framework&apos;s ceiling instead of adding to the budget — that money was already
              counted when the framework was recorded.
            </span>
          </span>
        </label>
      )}

      {showParent && (
        <div className="card p-5">
          <Field label={isVariation ? "Document being amended" : "Framework to draw on"} htmlFor="parentSelect">
            <select
              id="parentSelect"
              className="select"
              required
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="" disabled>
                Choose…
              </option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.reference} · {option.type.toLowerCase()}
                  {option.remainingMinor !== undefined ? ` · ${formatMoney(option.remainingMinor, currency)} left` : ""}
                </option>
              ))}
            </select>
          </Field>
          {selectedFramework?.remainingMinor !== undefined && (
            <div className="mt-3">
              <Alert tone="info">
                {formatMoney(selectedFramework.remainingMinor, currency)} remains on {selectedFramework.reference}. A
                call-off larger than that will be rejected.
              </Alert>
            </div>
          )}
        </div>
      )}

      <div className="card space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Client's document no." htmlFor="reference">
            <input id="reference" name="reference" required className="input" placeholder="e.g. NW-PO-89117" />
          </Field>
          <Field label="Title" htmlFor="title" className="sm:col-span-2">
            <input id="title" name="title" className="input" placeholder="Short description of the scope" />
          </Field>
          <Field label="Issue date" htmlFor="issueDate">
            <input id="issueDate" name="issueDate" type="date" required defaultValue={today} className="input" />
          </Field>
        </div>

        {isFramework ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Ceiling value" htmlFor="declaredValue" hint="The maximum this framework covers.">
              <input id="declaredValue" name="declaredValue" required className="input tabular" placeholder="1500000" />
            </Field>
            <Field label="Valid from" htmlFor="validFrom">
              <input id="validFrom" name="validFrom" type="date" className="input" />
            </Field>
            <Field label="Valid to" htmlFor="validTo">
              <input id="validTo" name="validTo" type="date" className="input" />
            </Field>
          </div>
        ) : (
          <Field
            label="Lump-sum value (optional)"
            htmlFor="declaredValue"
            hint="Only when the document has a headline value and no line detail."
          >
            <input id="declaredValue" name="declaredValue" className="input tabular sm:max-w-xs" placeholder="0.00" />
          </Field>
        )}

        {!isFramework && (
          <div>
            <p className="label">Lines</p>
            {isVariation && (
              <p className="field-hint mb-2">
                For a reduction, enter a negative quantity — the variation&apos;s value comes off the budget.
              </p>
            )}
            <LineItemsEditor name="lines" columns={LINE_COLUMNS} currency={currency} />
          </div>
        )}

        <Field label="Notes" htmlFor="notes">
          <textarea id="notes" name="notes" className="textarea" />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <SubmitButton pendingLabel="Recording…">Record document</SubmitButton>
      </div>
    </form>
  );
}
