"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../auth";
import {
  cancelInvoice,
  createInvoice,
  deleteInvoiceDraft,
  issueInvoice,
  recordPayment,
  updateInvoiceDraft,
} from "../services/invoice";
import { invoiceSchema, paymentSchema } from "@/lib/validation/schemas";
import { dropEmptyRows, optional, parseJsonField, text, toFormState, type FormState } from "./helpers";

function invoicePayload(formData: FormData) {
  const rows = dropEmptyRows(parseJsonField<Record<string, string>>(formData, "lines"), "description");
  return {
    projectId: text(formData, "projectId"),
    clientAgreementId: text(formData, "clientAgreementId"),
    issueDate: text(formData, "issueDate"),
    dueDate: optional(formData, "dueDate"),
    notes: optional(formData, "notes"),
    lines: rows
      // A pre-filled line the PM zeroed out is a line they chose not to bill this time.
      .filter((row) => Number(row.quantity) > 0)
      .map((row) => ({
        clientAgreementLineId: row.clientAgreementLineId || undefined,
        description: row.description ?? "",
        uom: row.uom || "EA",
        quantity: row.quantity ?? "",
        unitPriceMinor: row.unitPrice ?? "",
        taxRatePct: row.taxRatePct ?? "",
      })),
  };
}

export async function createInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const shouldIssue = text(formData, "intent") === "issue";
  const projectId = text(formData, "projectId");
  let destination: string;

  try {
    await requireRole("PROJECT_MANAGER");
    const input = invoiceSchema.parse(invoicePayload(formData));

    const existingId = optional(formData, "invoiceId");
    let invoiceId: string;
    if (existingId) {
      await updateInvoiceDraft(existingId, input);
      invoiceId = existingId;
    } else {
      invoiceId = await createInvoice(input);
    }

    if (shouldIssue) await issueInvoice(invoiceId);
    destination = `/invoices/${invoiceId}`;
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/invoices");
  revalidatePath("/");
  redirect(destination);
}

export async function issueInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const invoiceId = text(formData, "invoiceId");
  try {
    await requireRole("PROJECT_MANAGER");
    await issueInvoice(invoiceId);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/");
  return { ok: true };
}

export async function cancelInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const invoiceId = text(formData, "invoiceId");
  try {
    await requireRole("PROJECT_MANAGER");
    await cancelInvoice(invoiceId);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true };
}

export async function deleteInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const projectId = text(formData, "projectId");
  try {
    await requireRole("PROJECT_MANAGER");
    await deleteInvoiceDraft(text(formData, "invoiceId"));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/invoices");
  redirect(projectId ? `/projects/${projectId}` : "/invoices");
}

export async function recordPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const invoiceId = text(formData, "invoiceId");
  try {
    await requireRole("PROJECT_MANAGER");
    const input = paymentSchema.parse({
      invoiceId,
      amountMinor: text(formData, "amount"),
      paidDate: text(formData, "paidDate"),
      method: optional(formData, "method"),
      reference: optional(formData, "reference"),
    });
    await recordPayment({
      invoiceId: input.invoiceId,
      amountMinor: input.amountMinor,
      paidDate: input.paidDate,
      method: input.method,
      reference: input.reference,
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/");
  return { ok: true };
}
