"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../auth";
import { openProject, updateProject } from "../services/project";
import { createAgreement, cancelAgreement, deleteAgreement } from "../services/agreement";
import { agreementSchema, openProjectSchema } from "@/lib/validation/schemas";
import { dropEmptyRows, optional, parseJsonField, text, toFormState, type FormState } from "./helpers";

/** Build the client-document half of a submission, shared by "open project" and "add document". */
function agreementPayload(formData: FormData) {
  const rows = dropEmptyRows(parseJsonField<Record<string, string>>(formData, "lines"), "description");

  return {
    type: text(formData, "type") || "PO",
    reference: text(formData, "reference"),
    title: optional(formData, "title"),
    issueDate: text(formData, "issueDate"),
    validFrom: optional(formData, "validFrom"),
    validTo: optional(formData, "validTo"),
    declaredValueMinor: optional(formData, "declaredValue"),
    parentAgreementId: optional(formData, "parentAgreementId"),
    documentUrl: optional(formData, "documentUrl"),
    notes: optional(formData, "notes"),
    lines: rows.map((row) => ({
      description: row.description ?? "",
      uom: row.uom || "EA",
      quantity: row.quantity ?? "",
      unitPriceMinor: row.unitPrice ?? "",
      taxRatePct: row.taxRatePct ?? "",
      notes: undefined,
    })),
  };
}

/**
 * Opening a project. The project and the client document that justifies it are one
 * submission — there is no way to create an empty project.
 */
export async function openProjectAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let destination: string;
  try {
    await requireRole("PROJECT_MANAGER");

    const input = openProjectSchema.parse({
      name: text(formData, "name"),
      code: optional(formData, "code"),
      clientId: text(formData, "clientId"),
      managerId: optional(formData, "managerId"),
      currency: text(formData, "currency") || "USD",
      description: optional(formData, "description"),
      startDate: text(formData, "startDate"),
      targetDate: optional(formData, "targetDate"),
      agreement: agreementPayload(formData),
    });

    const project = await openProject(input);
    destination = `/projects/${project.id}`;
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/projects");
  revalidatePath("/");
  redirect(destination);
}

/** Adding another client document — this is what raises the budget mid-project. */
export async function addAgreementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const projectId = text(formData, "projectId");
  try {
    await requireRole("PROJECT_MANAGER");
    const input = agreementSchema.parse(agreementPayload(formData));
    await createAgreement(projectId, input);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/agreements`);
  revalidatePath("/");
  redirect(`/projects/${projectId}/agreements`);
}

export async function cancelAgreementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const projectId = text(formData, "projectId");
  try {
    await requireRole("PROJECT_MANAGER");
    await cancelAgreement(text(formData, "agreementId"));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/projects/${projectId}/agreements`);
  return { ok: true };
}

export async function deleteAgreementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const projectId = text(formData, "projectId");
  try {
    await requireRole("PROJECT_MANAGER");
    await deleteAgreement(text(formData, "agreementId"));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/projects/${projectId}/agreements`);
  redirect(`/projects/${projectId}/agreements`);
}

export async function updateProjectAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const projectId = text(formData, "projectId");
  try {
    await requireRole("PROJECT_MANAGER");
    const targetDate = optional(formData, "targetDate");
    await updateProject(projectId, {
      name: text(formData, "name"),
      description: optional(formData, "description") ?? null,
      managerId: optional(formData, "managerId") ?? null,
      status: (text(formData, "status") || "ACTIVE") as "ACTIVE",
      targetDate: targetDate ? new Date(`${targetDate}T00:00:00.000Z`) : null,
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
