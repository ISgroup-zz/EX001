"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "./Form";
import { Field, StatusBadge } from "./ui";
import { saveUserAction, toggleUserActiveAction } from "@/server/actions/masterData";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

const ROLES = [
  { value: "ADMIN", label: "Admin", blurb: "Everything, including user management." },
  { value: "PROJECT_MANAGER", label: "Project manager", blurb: "Opens projects, raises POs, posts receipts, invoices." },
  { value: "VIEWER", label: "Viewer", blurb: "Reads everything, changes nothing." },
];

export function UserManager({ users }: { users: ManagedUser[] }) {
  const [state, formAction] = useActionState(saveUserAction, null);
  const [toggleState, toggle] = useActionState(toggleUserActiveAction, null);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [open, setOpen] = useState(false);

  const start = (user: ManagedUser | null) => {
    setEditing(user);
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={() => start(null)}>
          Add user
        </button>
      </div>

      {open && (
        <form key={editing?.id ?? "new"} action={formAction} className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="card-title">{editing ? `Edit ${editing.name}` : "New user"}</h2>
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
            <Field label="Email" htmlFor="email">
              <input id="email" name="email" type="email" required defaultValue={editing?.email ?? ""} className="input" />
            </Field>
            <Field label="Role" htmlFor="role">
              <select id="role" name="role" defaultValue={editing?.role ?? "PROJECT_MANAGER"} className="select">
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              hint={editing ? "Leave blank to keep the current one." : "At least 8 characters."}
            >
              <input id="password" name="password" type="password" className="input" autoComplete="new-password" />
            </Field>
          </div>

          <ul className="space-y-1 text-xs text-slate-500">
            {ROLES.map((role) => (
              <li key={role.value}>
                <span className="font-medium text-slate-700">{role.label}:</span> {role.blurb}
              </li>
            ))}
          </ul>

          <div className="flex justify-end">
            <SubmitButton>{editing ? "Save changes" : "Create user"}</SubmitButton>
          </div>
        </form>
      )}

      <FormMessage state={toggleState} />

      <div className="card overflow-hidden">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th className="w-44" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="font-medium text-slate-900">{user.name}</td>
                <td className="text-slate-600">{user.email}</td>
                <td>{ROLES.find((role) => role.value === user.role)?.label ?? user.role}</td>
                <td>
                  <StatusBadge status={user.isActive ? "ACTIVE" : "CANCELLED"} label={user.isActive ? "active" : "disabled"} />
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => start(user)}>
                      Edit
                    </button>
                    <form action={toggle}>
                      <input type="hidden" name="id" value={user.id} />
                      <input type="hidden" name="isActive" value={user.isActive ? "false" : "true"} />
                      <SubmitButton className="btn-ghost btn-sm">{user.isActive ? "Disable" : "Enable"}</SubmitButton>
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
