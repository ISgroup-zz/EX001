"use client";

import { useFormStatus } from "react-dom";
import type { FormState } from "@/server/actions/helpers";
import { useT } from "./LocaleProvider";

/** Submit button that disables and relabels itself while the action is in flight. */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn-primary",
  name,
  value,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  /** Set both to tell the action which button was pressed (e.g. save vs. post). */
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" name={name} value={value} className={className} disabled={pending || disabled}>
      {pending ? pendingLabel ?? t.common.saving : children}
    </button>
  );
}

/** Renders the error a server action came back with. */
export function FormMessage({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      {state.error}
    </div>
  );
}
