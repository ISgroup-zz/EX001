"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../auth";
import { deleteGrnDraft, postGrn, saveGrnDraft } from "../services/grn";
import { grnSchema } from "@/lib/validation/schemas";
import { optional, parseJsonField, text, toFormState, type FormState } from "./helpers";

type ReceiptRow = { vendorPoLineId: string; quantityAccepted?: string; quantityRejected?: string; remarks?: string };

function receiptPayload(formData: FormData) {
  const rows = parseJsonField<ReceiptRow>(formData, "lines");
  return {
    vendorPoId: text(formData, "vendorPoId"),
    deliveryPlanItemId: optional(formData, "deliveryPlanItemId"),
    receivedDate: text(formData, "receivedDate"),
    deliveryNoteRef: optional(formData, "deliveryNoteRef"),
    notes: optional(formData, "notes"),
    lines: rows.map((row) => ({
      vendorPoLineId: row.vendorPoLineId,
      quantityAccepted: row.quantityAccepted ?? "0",
      quantityRejected: row.quantityRejected ?? "0",
      remarks: row.remarks,
    })),
  };
}

/**
 * Save and (optionally) post a receipt in one go — the common case is "the numbers are
 * right, post it", so the form's primary button does both.
 */
export async function saveGrnAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const shouldPost = text(formData, "intent") === "post";
  let destination: string;
  let vendorPoId: string;

  try {
    const user = await requireRole("PROJECT_MANAGER");
    const input = grnSchema.parse(receiptPayload(formData));
    vendorPoId = input.vendorPoId;

    const existingId = optional(formData, "grnId") ?? null;
    const grnId = await saveGrnDraft(input, existingId);
    if (shouldPost) await postGrn(grnId, user.id);

    destination = `/grns/${grnId}`;
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/vendor-pos/${vendorPoId}`);
  revalidatePath("/deliveries");
  revalidatePath("/forecast");
  revalidatePath("/");
  redirect(destination);
}

export async function postGrnAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const grnId = text(formData, "grnId");
  const vendorPoId = text(formData, "vendorPoId");
  try {
    const user = await requireRole("PROJECT_MANAGER");
    await postGrn(grnId, user.id);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/grns/${grnId}`);
  revalidatePath(`/vendor-pos/${vendorPoId}`);
  revalidatePath("/deliveries");
  revalidatePath("/forecast");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteGrnAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const vendorPoId = text(formData, "vendorPoId");
  try {
    await requireRole("PROJECT_MANAGER");
    await deleteGrnDraft(text(formData, "grnId"));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/vendor-pos/${vendorPoId}`);
  redirect(`/vendor-pos/${vendorPoId}`);
}
