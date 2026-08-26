import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { openProject } from "@/server/services/project";
import { cancelAgreement, deleteAgreement } from "@/server/services/agreement";
import { getProjectBudgetMinor } from "@/server/services/budget";
import { toMinor } from "@/lib/money";
import { agreementInput, makeClient, NOW, openStandardProject, resetDatabase } from "./helpers";

/**
 * A project is opened ON a client document. These tests pin that down: the document
 * comes first, it sets the opening budget, and it cannot later be removed.
 */

beforeEach(resetDatabase);

async function open(agreement: Parameters<typeof agreementInput>[0], reference: string, options = {}) {
  const client = await makeClient();
  return openProject({
    name: "Project",
    code: null,
    clientId: client.id,
    managerId: null,
    currency: "USD",
    description: null,
    startDate: NOW,
    targetDate: null,
    agreement: agreementInput(agreement, reference, options),
  });
}

describe("opening a project", () => {
  it("opens from a client PO and sets the opening budget to its line total", async () => {
    const project = await open("PO", "PO-1", {
      lines: [{ description: "Widget", quantity: 10, unitPrice: 100 }],
    });

    expect(await getProjectBudgetMinor(project.id)).toBe(toMinor(1000));
  });

  it("opens from a contract", async () => {
    const project = await open("CONTRACT", "CTR-1", {
      lines: [{ description: "Fit-out", quantity: 1, unitPrice: 250_000 }],
    });

    expect(await getProjectBudgetMinor(project.id)).toBe(toMinor(250_000));
  });

  it("opens from a framework, whose ceiling is the opening budget", async () => {
    const project = await open("FRAMEWORK", "FA-1", { declaredValue: 1_500_000 });

    expect(await getProjectBudgetMinor(project.id)).toBe(toMinor(1_500_000));
  });

  it("records which document the project was opened on", async () => {
    const { project, agreement } = await openStandardProject();
    const saved = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });

    expect(saved.originatingAgreementId).toBe(agreement.id);
  });

  it("generates a project code when none is given", async () => {
    const project = await open("PO", "PO-1", { lines: [{ description: "X", quantity: 1, unitPrice: 1 }] });
    expect(project.code).toMatch(/^PRJ-\d{4}-\d{4}$/);
  });

  it("refuses to open a project on a variation, which has nothing to amend", async () => {
    await expect(open("VARIATION", "VO-1", { lines: [{ description: "X", quantity: 1, unitPrice: 100 }] })).rejects.toThrow(
      /must be opened on a purchase order, a contract or a framework/i,
    );
  });

  it("leaves no project behind when the client document is invalid", async () => {
    const client = await makeClient();

    await expect(
      openProject({
        name: "Doomed",
        code: null,
        clientId: client.id,
        managerId: null,
        currency: "USD",
        description: null,
        startDate: NOW,
        targetDate: null,
        // A framework with no ceiling is rejected downstream; the transaction must roll back.
        agreement: agreementInput("PO", "PO-X", { lines: [{ description: "Bad", quantity: -5, unitPrice: 100 }] }),
      }),
    ).rejects.toThrow();

    expect(await prisma.project.count()).toBe(0);
  });

  it("refuses a project whose code is already taken", async () => {
    const client = await makeClient();
    const base = {
      name: "Project",
      code: "PRJ-FIXED",
      clientId: client.id,
      managerId: null,
      currency: "USD",
      description: null,
      startDate: NOW,
      targetDate: null,
    };

    await openProject({ ...base, agreement: agreementInput("PO", "A", { lines: [{ description: "X", quantity: 1, unitPrice: 1 }] }) });
    await expect(
      openProject({ ...base, agreement: agreementInput("PO", "B", { lines: [{ description: "X", quantity: 1, unitPrice: 1 }] }) }),
    ).rejects.toThrow(/already in use/i);
  });
});

describe("the originating document", () => {
  it("cannot be deleted", async () => {
    const { agreement } = await openStandardProject();
    await expect(deleteAgreement(agreement.id)).rejects.toThrow(/opened on/i);
  });

  it("cancels the project when it is cancelled and nothing else carries it", async () => {
    const { project, agreement } = await openStandardProject();
    await cancelAgreement(agreement.id);

    const saved = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(saved.status).toBe("CANCELLED");
    expect(await getProjectBudgetMinor(project.id)).toBe(0);
  });

  it("leaves the project open when later documents carry it", async () => {
    const { project, agreement } = await openStandardProject();
    const { createAgreement } = await import("@/server/services/agreement");
    await createAgreement(
      project.id,
      agreementInput("PO", "CLIENT-PO-2", { lines: [{ description: "More", quantity: 4, unitPrice: 500 }] }),
    );

    await cancelAgreement(agreement.id);

    const saved = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(saved.status).toBe("ACTIVE");
    expect(await getProjectBudgetMinor(project.id)).toBe(toMinor(2000));
  });
});
