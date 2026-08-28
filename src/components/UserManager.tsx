"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "./Form";
import { Field, StatusBadge } from "./ui";
import { saveUserAction, toggleUserActiveAction } from "@/server/actions/masterData";
import { useT } from "./LocaleProvider";
import { fill } from "@/lib/i18n";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

export function UserManager({ users }: { users: ManagedUser[] }) {
  const [state, formAction] = useActionState(saveUserAction, null);
  const [toggleState, toggle] = useActionState(toggleUserActiveAction, null);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [open, setOpen] = useState(false);
  const t = useT();
  const roles = [
    { value: "ADMIN", label: t.roles.ADMIN, blurb: t.roles.adminBlurb },
    { value: "PROJECT_MANAGER", label: t.roles.PROJECT_MANAGER, blurb: t.roles.pmBlurb },
    { value: "VIEWER", label: t.roles.VIEWER, blurb: t.roles.viewerBlurb },
  ];

  const start = (user: ManagedUser | null) => {
    setEditing(user);
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={() => start(null)}>
          {t.users.addUser}
        </button>
      </div>

      {open && (
        <form key={editing?.id ?? "new"} action={formAction} className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="card-title">{editing ? fill(t.users.editUser, { name: editing.name }) : t.users.newUser}</h2>
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
            <Field label={t.parties.email} htmlFor="email">
              <input id="email" name="email" type="email" required defaultValue={editing?.email ?? ""} className="input" />
            </Field>
            <Field label={t.users.role} htmlFor="role">
              <select id="role" name="role" defaultValue={editing?.role ?? "PROJECT_MANAGER"} className="select">
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t.auth.password}
              htmlFor="password"
              hint={editing ? t.users.passwordKeepHint : t.users.passwordNewHint}
            >
              <input id="password" name="password" type="password" className="input" autoComplete="new-password" />
            </Field>
          </div>

          <ul className="space-y-1 text-xs text-slate-500">
            {roles.map((role) => (
              <li key={role.value}>
                <span className="font-medium text-slate-700">{role.label}:</span> {role.blurb}
              </li>
            ))}
          </ul>

          <div className="flex justify-end">
            <SubmitButton>{editing ? t.common.saveChanges : t.users.createUser}</SubmitButton>
          </div>
        </form>
      )}

      <FormMessage state={toggleState} />

      <div className="card overflow-hidden">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>{t.parties.name}</th>
              <th>{t.parties.email}</th>
              <th>{t.users.role}</th>
              <th>{t.common.status}</th>
              <th className="w-44" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="font-medium text-slate-900">{user.name}</td>
                <td className="text-slate-600">{user.email}</td>
                <td>{roles.find((role) => role.value === user.role)?.label ?? user.role}</td>
                <td>
                  <StatusBadge status={user.isActive ? "ACTIVE" : "CANCELLED"} label={user.isActive ? t.users.active : t.statuses.disabled} />
                </td>
                <td className="text-end">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => start(user)}>
                      {t.common.edit}
                    </button>
                    <form action={toggle}>
                      <input type="hidden" name="id" value={user.id} />
                      <input type="hidden" name="isActive" value={user.isActive ? "false" : "true"} />
                      <SubmitButton className="btn-ghost btn-sm">{user.isActive ? t.users.disable : t.users.enable}</SubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
