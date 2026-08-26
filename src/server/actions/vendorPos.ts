"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../auth";
import { cancelVendorPo, closeVendorPo, createVendorPo } from "../services/vendorPo";
import { cancelPlanItem, createPlanItems, updatePlanItem } from "../services/deliveryPlan";
import { vendorPoSchema } from "@/lib/validation/schemas";
import { parseQty } from "@/lib/money";
import { dropEmptyRows, optional, parseJsonField, text, toFormState, type FormState } from "./helpers";

type PlanRow = { label?: string; plannedDate?: string; quantities?: string[]; notes?: string };

/**
 * Creating a vendor PO together with its delivery plan — one submission, because the
 * plan is part of raising the order, not a separate errand.
 */
export async function createVendorPoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const projectId = text(formData, "projectId");
  let destination: string;

  try {
    await requireRole("PROJECT_MANAGER");

    const lineRows = dropEmptyRows(parseJsonField<Record<string, string>>(formData, "lines"), "description");
    const planRows = parseJsonField<PlanRow>(formData, "planItems").filter((row) => row.plannedDate);

    const input = vendorPoSchema.parse({
      projectId,
      vendorId: text(formData, "vendorId"),
      clientAgreementId: optional(formData, "clientAgreementId"),
      poNumber: optional(formData, "poNumber"),
      issueDate: text(formData, "issueDate"),
      expectedDeliveryDate: optional(formData, "expectedDeliveryDate"),
      notes: optional(formData, "notes"),
      lines: lineRows.map((row) => ({
        description: row.description ?? "",
        uom: row.uom || "EA",
        quantity: row.quantity ?? "",
        unitCostMinor: row.unitCost ?? "",
        taxRatePct: row.taxRatePct ?? "",
        clientAgreementLineId: row.clientAgreementLineId || undefined,
        notes: undefined,
      })),
      planItems: planRows.map((row) => ({
        label: row.label,
        plannedDate: row.plannedDate ?? "",
        notes: row.notes,
        quantities: row.quantities ?? [],
      })),
    });

    const po = await createVendorPo(input);
    destination = `/vendor-pos/${po.id}`;
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/deliveries");
  revalidatePath("/forecast");
  redirect(destination);
}

export async function cancelVendorPoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const vendorPoId = text(formData, "vendorPoId");
  try {
    await requireRole("PROJECT_MANAGER");
    await cancelVendorPo(vendorPoId);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/vendor-pos/${vendorPoId}`);
  revalidatePath("/deliveries");
  return { ok: true };
}

export async function closeVendorPoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const vendorPoId = text(formData, "vendorPoId");
  try {
    await requireRole("PROJECT_MANAGER");
    await closeVendorPo(vendorPoId);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/vendor-pos/${vendorPoId}`);
  return { ok: true };
}

/** Add one more planned delivery to an existing PO — e.g. to plan a leftover quantity. */
export async function addPlanItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const vendorPoId = text(formData, "vendorPoId");
  try {
    await requireRole("PROJECT_MANAGER");

    const quantities = parseJsonField<{ vendorPoLineId: string; quantity: string }>(formData, "quantities");
    const plannedDate = text(formData, "plannedDate");
    if (!plannedDate) throw new Error("Choose a planned delivery date.");

    await createPlanItems(vendorPoId, [
      {
        label: optional(formData, "label") ?? null,
        plannedDate: new Date(`${plannedDate}T00:00:00.000Z`),
        notes: optional(formData, "notes") ?? null,
        quantities: quantities.map((entry) => ({
          vendorPoLineId: entry.vendorPoLineId,
          quantity: parseQty(entry.quantity),
        })),
      },
    ]);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/vendor-pos/${vendorPoId}`);
  revalidatePath("/deliveries");
  revalidatePath("/forecast");
  return { ok: true };
}

/** Reschedule or resize a planned delivery. */
export async function updatePlanItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const vendorPoId = text(formData, "vendorPoId");
  try {
    await requireRole("PROJECT_MANAGER");

    const quantities = parseJsonField<{ vendorPoLineId: string; quantity: string }>(formData, "quantities");
    await updatePlanItem(text(formData, "planItemId"), {
      plannedDate: new Date(`${text(formData, "plannedDate")}T00:00:00.000Z`),
      label: optional(formData, "label") ?? null,
      notes: optional(formData, "notes") ?? null,
      quantities: quantities.map((entry) => ({
        vendorPoLineId: entry.vendorPoLineId,
        quantity: parseQty(entry.quantity),
      })),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/vendor-pos/${vendorPoId}`);
  revalidatePath("/deliveries");
  revalidatePath("/forecast");
  return { ok: true };
}

export async function cancelPlanItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const vendorPoId = text(formData, "vendorPoId");
  try {
    await requireRole("PROJECT_MANAGER");
    await cancelPlanItem(text(formData, "planItemId"));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/vendor-pos/${vendorPoId}`);
  revalidatePath("/deliveries");
  return { ok: true };
}
