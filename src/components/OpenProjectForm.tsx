"use client";

import { useActionState, useState } from "react";
import { LineItemsEditor } from "./LineItemsEditor";
import { FormMessage, SubmitButton } from "./Form";
import { Field } from "./ui";
import { openProjectAction } from "@/server/actions/projects";

/**
 * Opening a project.
 *
 * A project cannot exist without a client document behind it, so the document IS the
 * first step: pick what the client sent (a PO, a contract or a framework), enter it,
 * then name the project it opens. Both are saved in one transaction.
 */

type Option = { id: string; name: string };

const DOCUMENT_TYPES = [
  {
    value: "PO",
    label: "Purchase order",
    blurb: "The client sent a PO. Its line total becomes the opening budget.",
  },
  {
    value: "CONTRACT",
    label: "Contract",
    blurb: "A signed contract with a contract value, priced by line or as a lump sum.",
  },
  {
    value: "FRAMEWORK",
    label: "Framework agreement",
    blurb: "An umbrella agreement with a ceiling. Call-off POs draw the ceiling down later.",
  },
] as const;

const LINE_COLUMNS = [
  { key: "description", label: "Description", type: "text" as const, placeholder: "What the client ordered" },
  { key: "uom", label: "UoM", type: "text" as const, width: "80px", placeholder: "EA" },
  { key: "quantity", label: "Qty", type: "qty" as const, width: "100px" },
  { key: "unitPrice", label: "Unit price", type: "money" as const, width: "130px" },
  { key: "taxRatePct", label: "Tax %", type: "percent" as const, width: "90px" },
];

export function OpenProjectForm({
  clients,
  managers,
  today,
}: {
  clients: Option[];
  managers: Option[];
  today: string;
}) {
  const [state, formAction] = useActionState(openProjectAction, null);
  const [step, setStep] = useState(1);
  const [documentType, setDocumentType] = useState<string>("PO");
  const [currency, setCurrency] = useState("USD");

  const isFramework = documentType === "FRAMEWORK";
  const steps = ["Client & document", "Document details", "Project"];

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="type" value={documentType} />

      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {steps.map((label, index) => {
          const number = index + 1;
          const active = step === number;
          const done = step > number;
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(number)}
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
        <div className="card p-5">
          <Field label="Client" htmlFor="clientId">
            <select id="clientId" name="clientId" required className="select" defaultValue="">
              <option value="" disabled>
                Choose the client…
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div>
          <p className="label">What did the client send?</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {DOCUMENT_TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDocumentType(option.value)}
                className={`rounded-xl border p-4 text-left transition ${
                  documentType === option.value
                    ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-600">{option.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setStep(2)}>
            Continue
          </button>
        </div>
      </section>

      {/* ---------------------------------------------------------------- step 2 */}
      <section className={step === 2 ? "space-y-5" : "hidden"}>
        <div className="card space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Client's document no." htmlFor="reference">
              <input id="reference" name="reference" required className="input" placeholder="e.g. NW-PO-88431" />
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
              <Field
                label="Ceiling value"
                htmlFor="declaredValue"
                hint="The maximum the framework covers. This is the opening budget; call-offs draw it down."
              >
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
              hint="Use this only when the document has a headline value and no line detail."
            >
              <input id="declaredValue" name="declaredValue" className="input tabular sm:max-w-xs" placeholder="0.00" />
            </Field>
          )}

          {!isFramework && (
            <div>
              <p className="label">Lines</p>
              <LineItemsEditor name="lines" columns={LINE_COLUMNS} currency={currency} addLabel="Add line" />
            </div>
          )}

          <Field label="Notes" htmlFor="notes">
            <textarea id="notes" name="notes" className="textarea" placeholder="Anything worth recording about this document" />
          </Field>
        </div>

        <div className="flex justify-between">
          <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
            Back
          </button>
          <button type="button" className="btn-primary" onClick={() => setStep(3)}>
            Continue
          </button>
        </div>
      </section>

      {/* ---------------------------------------------------------------- step 3 */}
      <section className={step === 3 ? "space-y-5" : "hidden"}>
        <div className="card space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project name" htmlFor="name">
              <input id="name" name="name" required className="input" placeholder="e.g. Substation 220kV Upgrade" />
            </Field>
            <Field label="Project code" htmlFor="code" hint="Leave blank to generate one automatically.">
              <input id="code" name="code" className="input" placeholder="PRJ-2026-0001" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Project manager" htmlFor="managerId">
              <select id="managerId" name="managerId" className="select" defaultValue="">
                <option value="">Unassigned</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency" htmlFor="currency">
              <select
                id="currency"
                name="currency"
                className="select"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {["USD", "EUR", "GBP", "AED", "SAR"].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start date" htmlFor="startDate">
              <input id="startDate" name="startDate" type="date" required defaultValue={today} className="input" />
            </Field>
            <Field label="Target completion" htmlFor="targetDate">
              <input id="targetDate" name="targetDate" type="date" className="input" />
            </Field>
          </div>

          <Field label="Description" htmlFor="description">
            <textarea id="description" name="description" className="textarea" placeholder="Scope summary" />
          </Field>
        </div>

        <div className="flex justify-between">
          <button type="button" className="btn-secondary" onClick={() => setStep(2)}>
            Back
          </button>
          <SubmitButton pendingLabel="Opening project…">Open project</SubmitButton>
        </div>
      </section>
    </form>
  );
}
