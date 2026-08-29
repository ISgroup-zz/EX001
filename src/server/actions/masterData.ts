"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "../auth";
import {
  createClient,
  createUser,
  createVendor,
  setUserActive,
  updateClient,
  updateUser,
  updateVendor,
} from "../services/masterData";
import { partySchema, userSchema } from "@/lib/validation/schemas";
import { optional, text, toFormState, type FormState } from "./helpers";

function partyPayload(formData: FormData) {
  return {
    code: optional(formData, "code"),
    name: text(formData, "name"),
    contactName: optional(formData, "contactName"),
    email: optional(formData, "email"),
    phone: optional(formData, "phone"),
    address: optional(formData, "address"),
    taxId: optional(formData, "taxId"),
    paymentTermsDays: optional(formData, "paymentTermsDays"),
  };
}

export async function saveClientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireRole("PROJECT_MANAGER");
    const input = partySchema.parse(partyPayload(formData));
    const id = optional(formData, "id");
    if (id) await updateClient(id, input);
    else await createClient(input);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/clients");
  revalidatePath("/projects/new");
  return { ok: true };
}

export async function saveVendorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireRole("PROJECT_MANAGER");
    const input = partySchema.parse(partyPayload(formData));
    const id = optional(formData, "id");
    if (id) await updateVendor(id, input);
    else await createVendor(input);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/vendors");
  return { ok: true };
}

export async function saveUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireRole("ADMIN");
    const input = userSchema.parse({
      name: text(formData, "name"),
      email: text(formData, "email"),
      role: text(formData, "role") || "VIEWER",
      password: optional(formData, "password") ?? "",
    });
    const id = optional(formData, "id");
    if (id) await updateUser(id, input);
    else await createUser(input);
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/settings/users");
  return { ok: true };
}

export async function toggleUserActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireRole("ADMIN");
    await setUserActive(text(formData, "id"), text(formData, "isActive") === "true");
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/settings/users");
  return { ok: true };
}
