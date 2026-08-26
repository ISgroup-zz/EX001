import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "../db";
import { sumMinor, totalsForLines } from "@/lib/money";
import type { AgreementInput } from "@/lib/validation/schemas";
import {
  agreementValueMinor,
  assertCallOffFitsCeiling,
  getFrameworkUsage,
  isCommitted,
  refreshFrameworkStatus,
} from "./budget";

/**
 * Client agreements — the documents that give a project its budget.
 * Creating one is the only way the budget moves.
 */

/** Value of a submitted (not yet saved) document, using the same rule as a saved one. */
export function inputValueMinor(input: Pick<AgreementInput, "type" | "lines" | "declaredValueMinor">): number {
  if (input.type === "FRAMEWORK") return input.declaredValueMinor ?? 0;
  if (input.lines.length > 0) {
    return totalsForLines(
      input.lines.map((line) => ({
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        taxRatePct: line.taxRatePct,
      })),
    ).subtotalMinor;
  }
  return input.declaredValueMinor ?? 0;
}

function linesCreateData(input: AgreementInput): Prisma.ClientAgreementLineCreateWithoutAgreementInput[] {
  return input.lines.map((line, index) => ({
    lineNo: index + 1,
    description: line.description,
    uom: line.uom || "EA",
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    taxRatePct: line.taxRatePct,
    notes: line.notes,
  }));
}

/**
 * Validate a document against the ones already on the project:
 * a variation must amend something, a call-off must fit its framework's ceiling,
 * and a reduction cannot take a document below what has already been billed on it.
 */
async function assertAgreementIsValid(
  projectId: string,
  input: AgreementInput,
  options: { excludeAgreementId?: string } = {},
  db: Db = prisma,
): Promise<void> {
  const value = inputValueMinor(input);

  // A variation only means something relative to the document it amends.
  if (input.type === "VARIATION" && !input.parentAgreementId) {
    throw new Error("A variation must amend an existing contract or framework agreement.");
  }
  if (input.type === "FRAMEWORK" && !input.declaredValueMinor) {
    throw new Error("A framework agreement needs a ceiling value.");
  }

  if (input.parentAgreementId) {
    const parent = await db.clientAgreement.findUnique({
      where: { id: input.parentAgreementId },
      include: { lines: true },
    });
    if (!parent || parent.projectId !== projectId) {
      throw new Error("The parent document was not found on this project.");
    }

    if (input.type === "PO") {
      if (parent.type !== "FRAMEWORK") {
        throw new Error("A call-off can only be issued under a framework agreement.");
      }
      await assertCallOffFitsCeiling(parent.id, value, options, db);
    }

    if (input.type === "VARIATION") {
      if (parent.type !== "CONTRACT" && parent.type !== "FRAMEWORK") {
        throw new Error("A variation must amend a contract or a framework agreement.");
      }
      if (value < 0) {
        const siblings = await db.clientAgreement.findMany({
          where: {
            parentAgreementId: parent.id,
            type: "VARIATION",
            ...(options.excludeAgreementId ? { id: { not: options.excludeAgreementId } } : {}),
          },
          include: { lines: true },
        });
        const existingVariations = sumMinor(
          siblings.filter(isCommitted).map((sibling) => agreementValueMinor(sibling)),
        );
        const invoicedAgainstParent = await invoicedTotalMinor(parent.id, db);
        const newParentValue = agreementValueMinor(parent) + existingVariations + value;
        if (newParentValue < invoicedAgainstParent) {
          throw new Error(
            `This reduction would take ${parent.reference} below what has already been invoiced against it.`,
          );
        }
      }
    }
  }

  if (input.type === "PO" && !input.parentAgreementId && value < 0) {
    throw new Error("A purchase order cannot have a negative value.");
  }
}

/** Net value invoiced against one client document (issued invoices only). */
export async function invoicedTotalMinor(agreementId: string, db: Db = prisma): Promise<number> {
  const result = await db.invoice.aggregate({
    where: { clientAgreementId: agreementId, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] } },
    _sum: { subtotalMinor: true },
  });
  return result._sum.subtotalMinor ?? 0;
}

export async function createAgreement(
  projectId: string,
  input: AgreementInput,
  db: Db = prisma,
): Promise<string> {
  await assertAgreementIsValid(projectId, input, {}, db);

  const duplicate = await db.clientAgreement.findFirst({
    where: { projectId, reference: input.reference },
    select: { id: true },
  });
  if (duplicate) {
    throw new Error(`Document ${input.reference} is already recorded on this project.`);
  }

  const agreement = await db.clientAgreement.create({
    data: {
      projectId,
      type: input.type,
      reference: input.reference,
      title: input.title,
      issueDate: input.issueDate,
      validFrom: input.validFrom,
      validTo: input.validTo,
      declaredValueMinor: input.declaredValueMinor ?? null,
      parentAgreementId: input.parentAgreementId,
      documentUrl: input.documentUrl,
      notes: input.notes,
      status: "ACTIVE",
      lines: { create: linesCreateData(input) },
    },
  });

  if (input.parentAgreementId && input.type === "PO") {
    await refreshFrameworkStatus(input.parentAgreementId, db);
  }

  return agreement.id;
}

export async function updateAgreement(
  agreementId: string,
  input: AgreementInput,
  db: Db = prisma,
): Promise<void> {
  const existing = await db.clientAgreement.findUnique({ where: { id: agreementId } });
  if (!existing) throw new Error("Document not found.");

  await assertAgreementIsValid(existing.projectId, input, { excludeAgreementId: agreementId }, db);

  // Callers that need atomicity pass a transaction client in as `db`; Prisma forbids
  // opening a nested transaction here.
  await db.clientAgreementLine.deleteMany({ where: { agreementId } });
  await db.clientAgreement.update({
    where: { id: agreementId },
    data: {
      type: input.type,
      reference: input.reference,
      title: input.title,
      issueDate: input.issueDate,
      validFrom: input.validFrom,
      validTo: input.validTo,
      declaredValueMinor: input.declaredValueMinor ?? null,
      parentAgreementId: input.parentAgreementId,
      documentUrl: input.documentUrl,
      notes: input.notes,
      lines: { create: linesCreateData(input) },
    },
  });

  const frameworkId = input.parentAgreementId ?? existing.parentAgreementId;
  if (frameworkId) await refreshFrameworkStatus(frameworkId, db);
}

/**
 * Cancelling the document a project was opened on cancels the project too —
 * unless later documents are carrying it, in which case the project stays open.
 */
export async function cancelAgreement(agreementId: string, db: Db = prisma): Promise<void> {
  const agreement = await db.clientAgreement.findUnique({
    where: { id: agreementId },
    include: { project: { select: { id: true, originatingAgreementId: true } } },
  });
  if (!agreement) throw new Error("Document not found.");

  const invoiced = await invoicedTotalMinor(agreementId, db);
  if (invoiced > 0) {
    throw new Error("This document has been invoiced against and cannot be cancelled.");
  }

  await db.clientAgreement.update({ where: { id: agreementId }, data: { status: "CANCELLED" } });

  if (agreement.parentAgreementId) await refreshFrameworkStatus(agreement.parentAgreementId, db);

  if (agreement.project.originatingAgreementId === agreementId) {
    const remaining = await db.clientAgreement.count({
      where: { projectId: agreement.projectId, status: { not: "CANCELLED" } },
    });
    if (remaining === 0) {
      await db.project.update({ where: { id: agreement.projectId }, data: { status: "CANCELLED" } });
    }
  }
}

/** The originating document can never be deleted — the project would lose its basis. */
export async function deleteAgreement(agreementId: string, db: Db = prisma): Promise<void> {
  const agreement = await db.clientAgreement.findUnique({
    where: { id: agreementId },
    include: {
      project: { select: { originatingAgreementId: true } },
      children: { select: { id: true } },
      invoices: { select: { id: true } },
      vendorPos: { select: { id: true } },
    },
  });
  if (!agreement) throw new Error("Document not found.");
  if (agreement.project.originatingAgreementId === agreementId) {
    throw new Error("This is the document the project was opened on — it cannot be deleted.");
  }
  if (agreement.children.length > 0) {
    throw new Error("Remove the call-offs and variations under this document first.");
  }
  if (agreement.invoices.length > 0 || agreement.vendorPos.length > 0) {
    throw new Error("This document is referenced by invoices or purchase orders.");
  }

  await db.clientAgreement.delete({ where: { id: agreementId } });
  if (agreement.parentAgreementId) await refreshFrameworkStatus(agreement.parentAgreementId, db);
}

export async function getAgreementDetail(agreementId: string, db: Db = prisma) {
  const agreement = await db.clientAgreement.findUnique({
    where: { id: agreementId },
    include: {
      lines: { orderBy: { lineNo: "asc" } },
      parentAgreement: { select: { id: true, reference: true, type: true } },
      children: { include: { lines: true }, orderBy: { issueDate: "asc" } },
      project: { select: { id: true, name: true, code: true, currency: true, originatingAgreementId: true } },
      invoices: {
        select: { id: true, invoiceNumber: true, status: true, issueDate: true, totalMinor: true, subtotalMinor: true },
        orderBy: { issueDate: "desc" },
      },
    },
  });
  if (!agreement) return null;

  const usage = agreement.type === "FRAMEWORK" ? await getFrameworkUsage(agreementId, db) : null;

  return {
    ...agreement,
    valueMinor: agreementValueMinor(agreement),
    invoicedMinor: await invoicedTotalMinor(agreementId, db),
    isOriginating: agreement.project.originatingAgreementId === agreementId,
    frameworkUsage: usage,
  };
}
