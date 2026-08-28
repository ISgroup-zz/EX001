"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "./Form";
import { Field } from "./ui";
import { saveClientAction, saveVendorAction } from "@/server/actions/masterData";
import { useT } from "./LocaleProvider";
import { fill } from "@/lib/i18n";

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
  const t = useT();

  const start = (party: Party | null) => {
    setEditing(party);
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={() => start(null)}>
          {kind === "client" ? t.parties.addClient : t.parties.addVendor}
        </button>
      </div>

      {open && (
        <form key={editing?.id ?? "new"} action={formAction} className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="card-title">{editing ? fill(t.parties.editParty, { name: editing.name }) : kind === "client" ? t.parties.newClient : t.parties.newVendor}</h2>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
              {t.common.close}
            </button>
          </div>

          <FormMessage state={state} />
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t.parties.name} htmlFor="name">
              <input id="name" name="name" required defaultValue={editing?.name ?? ""} className="input" />
            </Field>
            <Field label={t.parties.code} htmlFor="code" hint={t.parties.codeHint}>
              <input id="code" name="code" defaultValue={editing?.code ?? ""} className="input tabular" />
            </Field>
            <Field label={t.parties.contact} htmlFor="contactName">
              <input id="contactName" name="contactName" defaultValue={editing?.contactName ?? ""} className="input" />
            </Field>
            <Field label={t.parties.paymentTerms} htmlFor="paymentTermsDays">
              <input
                id="paymentTermsDays"
                name="paymentTermsDays"
                defaultValue={editing?.paymentTermsDays ?? 30}
                className="input tabular"
              />
            </Field>
            <Field label={t.parties.email} htmlFor="email">
              <input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} className="input" />
            </Field>
            <Field label={t.parties.phone} htmlFor="phone">
              <input id="phone" name="phone" defaultValue={editing?.phone ?? ""} className="input" />
            </Field>
            <Field label={t.parties.taxId} htmlFor="taxId">
              <input id="taxId" name="taxId" defaultValue={editing?.taxId ?? ""} className="input tabular" />
            </Field>
            <Field label={t.parties.address} htmlFor="address" className="sm:col-span-2 lg:col-span-4">
              <textarea id="address" name="address" defaultValue={editing?.address ?? ""} className="textarea" />
            </Field>
          </div>

          <div className="flex justify-end">
            <SubmitButton>{editing ? t.common.saveChanges : kind === "client" ? t.parties.createClient : t.parties.createVendor}</SubmitButton>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        {parties.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm font-medium text-slate-700">{kind === "client" ? t.parties.noClients : t.parties.noVendors}</p>
            <button type="button" className="btn-primary btn-sm mt-2" onClick={() => start(null)}>
              {kind === "client" ? t.parties.addClient : t.parties.addVendor}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>{t.parties.name}</th>
                  <th>{t.parties.code}</th>
                  <th>{t.parties.contact}</th>
                  <th>{t.parties.email}</th>
                  <th className="num text-end">{t.parties.terms}</th>
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
                    <td className="num text-end tabular">{party.paymentTermsDays} {t.parties.days}</td>
                    <td className="text-end">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => start(party)}>
                        {t.common.edit}
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
