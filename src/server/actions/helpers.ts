import { ZodError, type ZodSchema } from "zod";

/** Shared plumbing for server actions: parsing form payloads and reporting failures. */

export type FormState = { error?: string; ok?: boolean } | null;

/**
 * `redirect()` works by throwing, so a catch-all around an action must let that
 * through untouched — otherwise a successful save looks like an error.
 */
export function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (error as { digest: string }).digest === "DYNAMIC_SERVER_USAGE")
  );
}

export function toFormState(error: unknown): FormState {
  if (isRedirectError(error)) throw error;

  if (error instanceof ZodError) {
    const first = error.errors[0];
    return { error: first ? `${first.path.filter((p) => typeof p === "string").join(" ")} ${first.message}`.trim() : "Please check the form." };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Something went wrong. Please try again." };
}

/** The line grids post their rows as a single JSON field. */
export function parseJsonField<T = unknown>(formData: FormData, name: string): T[] {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    throw new Error("The line items could not be read. Please re-enter them.");
  }
}

/** Drop rows the user left completely blank rather than failing validation on them. */
export function dropEmptyRows(rows: Record<string, string>[], requiredKey: string): Record<string, string>[] {
  return rows.filter((row) => String(row[requiredKey] ?? "").trim() !== "");
}

export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function optional(formData: FormData, name: string): string | undefined {
  const value = text(formData, name);
  return value === "" ? undefined : value;
}

export function parseWith<T>(schema: ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}
