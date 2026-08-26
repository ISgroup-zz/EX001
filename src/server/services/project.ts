import { prisma, type Db } from "../db";
import { nextDocumentNumber } from "../numbering";
import type { OpenProjectInput } from "@/lib/validation/schemas";
import { createAgreement } from "./agreement";

/**
 * Opening a project.
 *
 * A project is never created empty: it is opened ON THE BASIS OF a client document —
 * a PO, a contract or a framework — and that document sets the opening budget.
 * Project and document are created in one transaction, so no code path can produce a
 * project with nothing behind it.
 */

export async function openProject(input: OpenProjectInput): Promise<{ id: string; code: string }> {
  if (input.agreement.type === "VARIATION") {
    // A variation amends something that already exists; it cannot be what opens a project.
    throw new Error("A project must be opened on a purchase order, a contract or a framework agreement.");
  }
  if (input.agreement.parentAgreementId) {
    throw new Error("The opening document cannot be a call-off — no framework exists on this project yet.");
  }

  const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true } });
  if (!client) throw new Error("Client not found.");

  return prisma.$transaction(async (tx) => {
    const code = input.code ?? (await nextDocumentNumber(tx, "PRJ", input.startDate));

    const existingCode = await tx.project.findUnique({ where: { code }, select: { id: true } });
    if (existingCode) throw new Error(`Project code ${code} is already in use.`);

    const project = await tx.project.create({
      data: {
        code,
        name: input.name,
        description: input.description,
        clientId: input.clientId,
        managerId: input.managerId,
        currency: input.currency || "USD",
        startDate: input.startDate,
        targetDate: input.targetDate,
        status: "ACTIVE",
      },
    });

    const agreementId = await createAgreement(project.id, input.agreement, tx);

    // Point the project at the document it was opened on. Nullable in the schema only
    // because the two rows cannot be written in a single statement.
    await tx.project.update({
      where: { id: project.id },
      data: { originatingAgreementId: agreementId },
    });

    return { id: project.id, code: project.code };
  });
}

export type ProjectUpdateInput = {
  name: string;
  description: string | null;
  managerId: string | null;
  status: "DRAFT" | "ACTIVE" | "ON_HOLD" | "CLOSED" | "CANCELLED";
  targetDate: Date | null;
};

export async function updateProject(projectId: string, input: ProjectUpdateInput, db: Db = prisma): Promise<void> {
  await db.project.update({
    where: { id: projectId },
    data: {
      name: input.name,
      description: input.description,
      managerId: input.managerId,
      status: input.status,
      targetDate: input.targetDate,
    },
  });
}

export async function getProject(projectId: string, db: Db = prisma) {
  return db.project.findUnique({
    where: { id: projectId },
    include: {
      client: true,
      manager: { select: { id: true, name: true, email: true } },
      originatingAgreement: { select: { id: true, reference: true, type: true } },
    },
  });
}

export async function listProjects(
  filters: { status?: string; clientId?: string; managerId?: string; search?: string } = {},
  db: Db = prisma,
) {
  return db.project.findMany({
    where: {
      ...(filters.status ? { status: filters.status as ProjectUpdateInput["status"] } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.managerId ? { managerId: filters.managerId } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search } },
              { code: { contains: filters.search } },
            ],
          }
        : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
      originatingAgreement: { select: { type: true, reference: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
