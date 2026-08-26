import { z } from "zod";
import { parseMoneyToMinor, parseQty } from "@/lib/money";

/**
 * Form input schemas.
 *
 * Forms submit strings; services take integers. The transforms here are the single
 * boundary where "1,234.50" becomes 123450 minor units, so no service ever sees a float.
 */

export const moneyToMinor = z
  .union([z.string(), z.number()])
  .transform((value) => parseMoneyToMinor(value));

export const quantity = z
  .union([z.string(), z.number()])
  .transform((value) => parseQty(value))
  .refine((value) => value > 0, { message: "Quantity must be greater than zero." });

/** Variations may reduce a commitment, so their line quantities can be negative. */
export const signedQuantity = z
  .union([z.string(), z.number()])
  .transform((value) => parseQty(value))
  .refine((value) => value !== 0, { message: "Quantity cannot be zero." });

export const dateInput = z
  .string()
  .min(1, "Required")
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((date) => !Number.isNaN(date.getTime()), { message: "Invalid date." });

export const optionalDateInput = z
  .string()
  .optional()
  .transform((value) => (value ? new Date(`${value}T00:00:00.000Z`) : null))
  .refine((date) => date === null || !Number.isNaN(date.getTime()), { message: "Invalid date." });

export const optionalText = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

const taxRate = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === "") return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  });

// ---------------------------------------------------------------- client agreements

export const agreementLineSchema = z.object({
  description: z.string().trim().min(1, "Description is required."),
  uom: z.string().trim().default("EA"),
  quantity: signedQuantity,
  unitPriceMinor: moneyToMinor,
  taxRatePct: taxRate,
  notes: optionalText,
});

export const agreementTypeSchema = z.enum(["PO", "CONTRACT", "FRAMEWORK", "VARIATION"]);

export const agreementSchema = z
  .object({
    type: agreementTypeSchema,
    reference: z.string().trim().min(1, "The client's document number is required."),
    title: optionalText,
    issueDate: dateInput,
    validFrom: optionalDateInput,
    validTo: optionalDateInput,
    declaredValueMinor: moneyToMinor.optional(),
    parentAgreementId: z
      .string()
      .optional()
      .transform((value) => (value ? value : null)),
    documentUrl: optionalText,
    notes: optionalText,
    lines: z.array(agreementLineSchema).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.type === "FRAMEWORK" && !value.declaredValueMinor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["declaredValueMinor"],
        message: "A framework needs a ceiling value.",
      });
    }
    if (value.type === "VARIATION" && !value.parentAgreementId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parentAgreementId"],
        message: "A variation must amend an existing contract or framework.",
      });
    }
    if (value.type === "PO" && value.lines.length === 0 && !value.declaredValueMinor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines"],
        message: "Add at least one line, or enter a total value.",
      });
    }
    if (value.validFrom && value.validTo && value.validTo < value.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validTo"],
        message: "Valid-to cannot be before valid-from.",
      });
    }
  });

/** Opening a project: the project and its first client document are one submission. */
export const openProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required."),
  code: optionalText,
  clientId: z.string().min(1, "Choose a client."),
  managerId: z
    .string()
    .optional()
    .transform((value) => (value ? value : null)),
  currency: z.string().trim().default("USD"),
  description: optionalText,
  startDate: dateInput,
  targetDate: optionalDateInput,
  agreement: agreementSchema,
});

// ---------------------------------------------------------------- vendor POs & delivery plans

export const vendorPoLineSchema = z.object({
  description: z.string().trim().min(1, "Description is required."),
  uom: z.string().trim().default("EA"),
  quantity,
  unitCostMinor: moneyToMinor,
  taxRatePct: taxRate,
  clientAgreementLineId: z
    .string()
    .optional()
    .transform((value) => (value ? value : null)),
  notes: optionalText,
});

export const deliveryPlanItemSchema = z.object({
  label: optionalText,
  plannedDate: dateInput,
  notes: optionalText,
  /** Planned quantity per PO line, keyed by the line's index in the submitted PO. */
  quantities: z.array(z.union([z.string(), z.number()])).transform((values) => values.map((v) => parseQty(v))),
});

export const vendorPoSchema = z
  .object({
    projectId: z.string().min(1),
    vendorId: z.string().min(1, "Choose a vendor."),
    clientAgreementId: z
      .string()
      .optional()
      .transform((value) => (value ? value : null)),
    poNumber: optionalText,
    issueDate: dateInput,
    expectedDeliveryDate: optionalDateInput,
    notes: optionalText,
    lines: z.array(vendorPoLineSchema).min(1, "A purchase order needs at least one line."),
    planItems: z.array(deliveryPlanItemSchema).default([]),
  })
  .superRefine((value, ctx) => {
    value.planItems.forEach((item, index) => {
      if (item.quantities.every((qty) => qty <= 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["planItems", index, "quantities"],
          message: "A planned delivery needs a quantity on at least one line.",
        });
      }
    });
  });

// ---------------------------------------------------------------- goods receipt

export const grnLineSchema = z.object({
  vendorPoLineId: z.string().min(1),
  quantityAccepted: z.union([z.string(), z.number()]).transform((value) => parseQty(value)),
  quantityRejected: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === undefined || value === "" ? 0 : parseQty(value))),
  remarks: optionalText,
});

export const grnSchema = z.object({
  vendorPoId: z.string().min(1),
  deliveryPlanItemId: z
    .string()
    .optional()
    .transform((value) => (value ? value : null)),
  receivedDate: dateInput,
  deliveryNoteRef: optionalText,
  notes: optionalText,
  lines: z.array(grnLineSchema).min(1, "Record at least one line."),
});

// ---------------------------------------------------------------- invoicing

export const invoiceLineSchema = z.object({
  clientAgreementLineId: z
    .string()
    .optional()
    .transform((value) => (value ? value : null)),
  description: z.string().trim().min(1, "Description is required."),
  uom: z.string().trim().default("EA"),
  quantity,
  unitPriceMinor: moneyToMinor,
  taxRatePct: taxRate,
});

export const invoiceSchema = z.object({
  projectId: z.string().min(1),
  clientAgreementId: z.string().min(1, "Choose the client document to bill against."),
  issueDate: dateInput,
  dueDate: optionalDateInput,
  notes: optionalText,
  lines: z.array(invoiceLineSchema).min(1, "An invoice needs at least one line."),
});

export const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amountMinor: moneyToMinor,
  paidDate: dateInput,
  method: optionalText,
  reference: optionalText,
});

// ---------------------------------------------------------------- master data & users

export const partySchema = z.object({
  code: optionalText,
  name: z.string().trim().min(1, "Name is required."),
  contactName: optionalText,
  email: optionalText,
  phone: optionalText,
  address: optionalText,
  taxId: optionalText,
  paymentTermsDays: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      const parsed = Number(value ?? 30);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 30;
    }),
});

export const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(["ADMIN", "PROJECT_MANAGER", "VIEWER"]),
  password: z.string().min(8, "Use at least 8 characters.").optional().or(z.literal("")),
});

export type AgreementInput = z.output<typeof agreementSchema>;
export type OpenProjectInput = z.output<typeof openProjectSchema>;
export type VendorPoInput = z.output<typeof vendorPoSchema>;
export type GrnInput = z.output<typeof grnSchema>;
export type InvoiceInput = z.output<typeof invoiceSchema>;
