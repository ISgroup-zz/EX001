import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createAgreement } from "@/server/services/agreement";
import { getBudgetTimeline, getFrameworkUsage, getProjectBudgetMinor } from "@/server/services/budget";
import { openProject } from "@/server/services/project";
import { toMinor } from "@/lib/money";
import { addDays } from "@/lib/dates";
import { agreementInput, makeClient, NOW, openStandardProject, resetDatabase } from "./helpers";

/**
 * The budget rules. A project's budget is whatever the client has committed, and it
 * grows as documents arrive — but a framework's call-offs must never count twice.
 */

beforeEach(resetDatabase);

describe("budget growth", () => {
  it("rises by exactly the value of each new client PO", async () => {
    const { project } = await openStandardProject();
    expect(await getProjectBudgetMinor(project.id)).toBe(toMinor(2000));

    await createAgreement(
      project.id,
      agreementInput("PO", "CLIENT-PO-2", {
        issueDate: addDays(NOW, 30),
        lines: [{ description: "Cable", quantity: 100, unitPrice: 62 }],
      }),
    );

    expect(await getProjectBudgetMinor(project.id)).toBe(toMinor(2000 + 6200));
  });

  it("shows each step in the timeline with a running total", async () => {
    const { project } = await openStandardProject();
    await createAgreement(
      project.id,
      agreementInput("PO", "CLIENT-PO-2", {
        issueDate: addDays(NOW, 30),
        lines: [{ description: "Cable", quantity: 100, unitPrice: 62 }],
      }),
    );

    const timeline = await getBudgetTimeline(project.id);
    expect(timeline).toHaveLength(2);
    expect(timeline[0].isOriginating).toBe(true);
    expect(timeline[0].deltaMinor).toBe(toMinor(2000));
    expect(timeline[0].runningBudgetMinor).toBe(toMinor(2000));
    expect(timeline[1].deltaMinor).toBe(toMinor(6200));
    expect(timeline[1].runningBudgetMinor).toBe(toMinor(8200));
  });

  it("ignores drafts and cancellations", async () => {
    const { project } = await openStandardProject();
    const extraId = await createAgreement(
      project.id,
      agreementInput("PO", "CLIENT-PO-2", { lines: [{ description: "Extra", quantity: 1, unitPrice: 5000 }] }),
    );
    await prisma.clientAgreement.update({ where: { id: extraId }, data: { status: "CANCELLED" } });

    expect(await getProjectBudgetMinor(project.id)).toBe(toMinor(2000));
  });

  it("uses the declared value when a document has no lines", async () => {
    const client = await makeClient();
    const project = await openProject({
      name: "Lump sum",
      code: null,
      clientId: client.id,
      managerId: null,
      currency: "USD",
      description: null,
      startDate: NOW,
      targetDate: null,
      agreement: agreementInput("CONTRACT", "CTR-LUMP", { declaredValue: 90_000 }),
    });

    expect(await getProjectBudgetMinor(project.id)).toBe(toMinor(90_000));
  });
});

describe("frameworks and call-offs", () => {
  async function openFramework(ceiling = 100_000) {
    const client = await makeClient();
    const project = await openProject({
      name: "Framework project",
      code: null,
      clientId: client.id,
      managerId: null,
      currency: "USD",
      description: null,
      startDate: NOW,
      targetDate: null,
      agreement: agreementInput("FRAMEWORK", "FA-1", { declaredValue: ceiling }),
    });
    const framework = await prisma.clientAgreement.findFirstOrThrow({ where: { projectId: project.id } });
    return { project, framework };
  }

  it("counts the ceiling as budget", async () => {
    const { project } = await openFramework();
    expect(await getProjectBudgetMinor(project.id)).toBe(toMinor(100_000));
  });

  it("does not raise the budget when a call-off is issued, but draws the ceiling down", async () => {
    const { project, framework } = await openFramework();

    await createAgreement(
      project.id,
      agreementInput("PO", "CO-1", {
        parentAgreementId: framework.id,
        lines: [{ description: "Transmitters", quantity: 10, unitPrice: 3000 }],
      }),
    );

    // Budget is unchanged — that money was already counted in the ceiling.
    expect(await getProjectBudgetMinor(project.id)).toBe(toMinor(100_000));

    const usage = await getFrameworkUsage(framework.id);
    expect(usage.calledOffMinor).toBe(toMinor(30_000));
    expect(usage.remainingMinor).toBe(toMinor(70_000));
  });

  it("rejects a call-off larger than the remaining ceiling", async () => {
    const { project, framework } = await openFramework(50_000);

    await createAgreement(
      project.id,
      agreementInput("PO", "CO-1", {
        parentAgreementId: framework.id,
        lines: [{ description: "Batch 1", quantity: 1, unitPrice: 40_000 }],
      }),
    );

    await expect(
      createAgreement(
        project.id,
        agreementInput("PO", "CO-2", {
          parentAgreementId: framework.id,
          lines: [{ description: "Batch 2", quantity: 1, unitPrice: 15_000 }],
        }),
      ),
    ).rejects.toThrow(/more than the framework has left/i);
  });

  it("marks a framework exhausted once fully drawn down", async () => {
    const { project, framework } = await openFramework(20_000);
    await createAgreement(
      project.id,
      agreementInput("PO", "CO-1", {
        parentAgreementId: framework.id,
        lines: [{ description: "All of it", quantity: 1, unitPrice: 20_000 }],
      }),
    );

    const refreshed = await prisma.clientAgreement.findUniqueOrThrow({ where: { id: framework.id } });
    expect(refreshed.status).toBe("EXHAUSTED");
  });

  it("refuses a call-off under something that is not a framework", async () => {
    const { project, agreement } = await openStandardProject();

    await expect(
      createAgreement(
        project.id,
        agreementInput("PO", "CO-1", {
          parentAgreementId: agreement.id,
          lines: [{ description: "X", quantity: 1, unitPrice: 100 }],
        }),
      ),
    ).rejects.toThrow(/only be issued under a framework/i);
  });
});

describe("variations", () => {
  it("raises the budget by its value", async () => {
    const { project, agreement } = await openStandardProject();
    await prisma.clientAgreement.update({ where: { id: agreement.id }, data: { type: "CONTRACT" } });

    await createAgreement(
      project.id,
      agreementInput("VARIATION", "VO-1", {
        parentAgreementId: agreement.id,
        lines: [{ description: "Two more", quantity: 2, unitPrice: 500 }],
      }),
    );

    expect(await getProjectBudgetMinor(project.id)).toBe(toMinor(3000));
  });

  it("reduces the budget when negative", async () => {
    const { project, agreement } = await openStandardProject();
    await prisma.clientAgreement.update({ where: { id: agreement.id }, data: { type: "CONTRACT" } });

    await createAgreement(
      project.id,
      agreementInput("VARIATION", "VO-1", {
        parentAgreementId: agreement.id,
        lines: [{ description: "Descope", quantity: -1, unitPrice: 500 }],
      }),
    );

    expect(await getProjectBudgetMinor(project.id)).toBe(toMinor(1500));
  });

  it("must amend something", async () => {
    const { project } = await openStandardProject();
    await expect(
      createAgreement(
        project.id,
        agreementInput("VARIATION", "VO-1", { lines: [{ description: "X", quantity: 1, unitPrice: 100 }] }),
      ),
    ).rejects.toThrow();
  });
});
