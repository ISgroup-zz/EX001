"use client";

import { useActionState, useState } from "react";
import { LineItemsEditor } from "./LineItemsEditor";
import { FormMessage, SubmitButton } from "./Form";
import { Alert, Field } from "./ui";
import { addAgreementAction } from "@/server/actions/projects";
import { formatMoney } from "@/lib/money";
import { useT } from "./LocaleProvider";
import { fill } from "@/lib/i18n";

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
  const t = useT();

  // Built per render so the labels translate with the rest of the UI.
  const TYPES = [
    { value: "PO", label: t.documentTypes.PO, blurb: t.agreements.poEffect },
    { value: "CONTRACT", label: t.documentTypes.CONTRACT, blurb: t.agreements.contractEffect },
    { value: "FRAMEWORK", label: t.documentTypes.FRAMEWORK, blurb: t.agreements.frameworkEffect },
    { value: "VARIATION", label: t.documentTypes.VARIATION, blurb: t.agreements.variationEffect },
  ] as const;

  const LINE_COLUMNS = [
    { key: "description", label: t.common.description, type: "text" as const },
    { key: "uom", label: t.common.uom, type: "text" as const, width: "80px", placeholder: "EA" },
    { key: "quantity", label: t.common.quantity, type: "qty" as const, width: "100px" },
    { key: "unitPrice", label: t.common.unitPrice, type: "money" as const, width: "130px" },
    { key: "taxRatePct", label: `${t.common.tax} %`, type: "percent" as const, width: "90px" },
  ];

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
        <p className="label">{t.agreements.documentType}</p>
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
              className={`rounded-xl border p-4 text-start transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
          <p className="field-hint">{t.agreements.variationNeedsParent}</p>
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
            <span className="font-medium text-slate-900">{t.agreements.isCallOff}</span>
            <span className="mt-0.5 block text-xs text-slate-600">
              {t.agreements.isCallOffHint}
            </span>
          </span>
        </label>
      )}

      {showParent && (
        <div className="card p-5">
          <Field label={isVariation ? t.agreements.documentBeingAmended : t.agreements.frameworkToDrawOn} htmlFor="parentSelect">
            <select
              id="parentSelect"
              className="select"
              required
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="" disabled>
                {t.agreements.choose}
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
                {fill(t.agreements.remainsOn, { amount: formatMoney(selectedFramework.remainingMinor, currency), reference: selectedFramework.reference })}
              </Alert>
            </div>
          )}
        </div>
      )}

      <div className="card space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.projects.clientDocNo} htmlFor="reference">
            <input id="reference" name="reference" required className="input" placeholder={t.projects.docNoPlaceholder} />
          </Field>
          <Field label={t.common.title} htmlFor="title" className="sm:col-span-2">
            <input id="title" name="title" className="input" placeholder={t.projects.titlePlaceholder} />
          </Field>
          <Field label={t.projects.issueDate} htmlFor="issueDate">
            <input id="issueDate" name="issueDate" type="date" required defaultValue={today} className="input" />
          </Field>
        </div>

        {isFramework ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.projects.ceilingValue} htmlFor="declaredValue" hint={t.projects.ceilingHint}>
              <input id="declaredValue" name="declaredValue" required className="input tabular" placeholder="1500000" />
            </Field>
            <Field label={t.projects.validFrom} htmlFor="validFrom">
              <input id="validFrom" name="validFrom" type="date" className="input" />
            </Field>
            <Field label={t.projects.validTo} htmlFor="validTo">
              <input id="validTo" name="validTo" type="date" className="input" />
            </Field>
          </div>
        ) : (
          <Field
            label={t.projects.lumpSum}
            htmlFor="declaredValue"
            hint={t.projects.lumpSumHint}
          >
            <input id="declaredValue" name="declaredValue" className="input tabular sm:max-w-xs" placeholder="0.00" />
          </Field>
        )}

        {!isFramework && (
          <div>
            <p className="label">{t.common.lines}</p>
            {isVariation && (
              <p className="field-hint mb-2">
                {t.agreements.negativeHint}
              </p>
            )}
            <LineItemsEditor name="lines" columns={LINE_COLUMNS} currency={currency} />
          </div>
        )}

        <Field label={t.common.notes} htmlFor="notes">
          <textarea id="notes" name="notes" className="textarea" />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <SubmitButton pendingLabel={t.agreements.recording}>{t.agreements.recordDocument}</SubmitButton>
      </div>
    </form>
  );
}
