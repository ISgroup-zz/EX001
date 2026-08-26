"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "./Form";
import { Field } from "./ui";
import { saveClientAction, saveVendorAction } from "@/server/actions/masterData";

/** Create or edit a client or vendor — the same form either way. */

export type Party = {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  paymentTermsDays: number;
};

export function PartyManager({ kind, parties }: { kind: "client" | "vendor"; parties: Party[] }) {
  const action = kind === "client" ? saveClientAction : saveVendorAction;
  const [state, formAction] = useActionState(action, null);
  const [editing, setEditing] = useState<Party | null>(null);
  const [open, setOpen] = useState(false);

  const start = (party: Party | null) => {
    setEditing(party);
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={() => start(null)}>
          Add {kind}
        </button>
      </div>

      {open && (
        <form key={editing?.id ?? "new"} action={formAction} className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="card-title">{editing ? `Edit ${editing.name}` : `New ${kind}`}</h2>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>

          <FormMessage state={state} />
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Name" htmlFor="name">
              <input id="name" name="name" required defaultValue={editing?.name ?? ""} className="input" />
            </Field>
            <Field label="Code" htmlFor="code" hint="Blank generates one.">
              <input id="code" name="code" defaultValue={editing?.code ?? ""} className="input tabular" />
            </Field>
            <Field label="Contact" htmlFor="contactName">
              <input id="contactName" name="contactName" defaultValue={editing?.contactName ?? ""} className="input" />
            </Field>
            <Field label="Payment terms (days)" htmlFor="paymentTermsDays">
              <input
                id="paymentTermsDays"
                name="paymentTermsDays"
                defaultValue={editing?.paymentTermsDays ?? 30}
                className="input tabular"
              />
            </Field>
            <Field label="Email" htmlFor="email">
              <input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} className="input" />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <input id="phone" name="phone" defaultValue={editing?.phone ?? ""} className="input" />
            </Field>
            <Field label="Tax ID" htmlFor="taxId">
              <input id="taxId" name="taxId" defaultValue={editing?.taxId ?? ""} className="input tabular" />
            </Field>
            <Field label="Address" htmlFor="address" className="sm:col-span-2 lg:col-span-4">
              <textarea id="address" name="address" defaultValue={editing?.address ?? ""} className="textarea" />
            </Field>
          </div>

          <div className="flex justify-end">
            <SubmitButton>{editing ? "Save changes" : `Create ${kind}`}</SubmitButton>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        {parties.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm font-medium text-slate-700">No {kind}s yet</p>
            <button type="button" className="btn-primary btn-sm mt-2" onClick={() => start(null)}>
              Add {kind}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Contact</th>
                  <th>Email</th>
                  <th className="num text-right">Terms</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {parties.map((party) => (
                  <tr key={party.id}>
                    <td className="font-medium text-slate-900">{party.name}</td>
                    <td className="tabular text-slate-500">{party.code}</td>
                    <td>{party.contactName ?? "—"}</td>
                    <td className="text-slate-600">{party.email ?? "—"}</td>
                    <td className="num text-right tabular">{party.paymentTermsDays} days</td>
                    <td className="text-right">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => start(party)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
