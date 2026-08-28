import { prisma } from "@/server/db";
import { toMinor } from "@/lib/money";
import { addDays, today } from "@/lib/dates";
import type { AgreementInput } from "@/lib/validation/schemas";

/** Fixtures shared by the suites. Every test starts from an empty database. */

export const NOW = today();

export async function resetDatabase() {
  await prisma.deliveryPlanChange.deleteMany();
  await prisma.vendorPayment.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.gRNLine.deleteMany();
  await prisma.gRN.deleteMany();
  await prisma.deliveryPlanLine.deleteMany();
  await prisma.deliveryPlanItem.deleteMany();
  await prisma.vendorPOLine.deleteMany();
  await prisma.vendorPO.deleteMany();
  await prisma.project.updateMany({ data: { originatingAgreementId: null } });
  await prisma.clientAgreementLine.deleteMany();
  await prisma.clientAgreement.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.documentCounter.deleteMany();
}

export async function makeClient(name = "Test Client") {
  return prisma.client.create({
    data: { code: `C-${Math.random().toString(36).slice(2, 8)}`, name, paymentTermsDays: 30 },
  });
}

export async function makeVendor(name = "Test Vendor") {
  return prisma.vendor.create({
    data: { code: `V-${Math.random().toString(36).slice(2, 8)}`, name },
  });
}

type LineSpec = { description: string; quantity: number; unitPrice: number; uom?: string; taxRatePct?: number };

export function agreementInput(
  type: AgreementInput["type"],
  reference: string,
  options: {
    lines?: LineSpec[];
    declaredValue?: number;
    parentAgreementId?: string | null;
    issueDate?: Date;
    validTo?: Date | null;
  } = {},
): AgreementInput {
  return {
    type,
    reference,
    title: null,
    issueDate: options.issueDate ?? NOW,
    validFrom: null,
    validTo: options.validTo ?? null,
    declaredValueMinor: options.declaredValue !== undefined ? toMinor(options.declaredValue) : undefined,
    parentAgreementId: options.parentAgreementId ?? null,
    documentUrl: null,
    notes: null,
    lines: (options.lines ?? []).map((line) => ({
      description: line.description,
      uom: line.uom ?? "EA",
      quantity: line.quantity,
      unitPriceMinor: toMinor(line.unitPrice),
      taxRatePct: line.taxRatePct ?? 0,
      notes: null,
    })),
  };
}

/** A project opened on a two-line client PO — the starting point for most tests. */
export async function openStandardProject(options: { lines?: LineSpec[]; name?: string } = {}) {
  const { openProject } = await import("@/server/services/project");
  const client = await makeClient();

  const project = await openProject({
    name: options.name ?? "Test Project",
    code: null,
    clientId: client.id,
    managerId: null,
    currency: "USD",
    description: null,
    startDate: NOW,
    targetDate: addDays(NOW, 90),
    agreement: agreementInput("PO", "CLIENT-PO-1", {
      lines: options.lines ?? [
        { description: "Widget", quantity: 10, unitPrice: 100 },
        { description: "Gadget", quantity: 5, unitPrice: 200 },
      ],
    }),
  });

  const agreement = await prisma.clientAgreement.findFirstOrThrow({
    where: { projectId: project.id },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });

  return { client, project, agreement, lines: agreement.lines };
}
