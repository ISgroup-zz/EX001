import type { Db } from "./db";

/**
 * Human-facing document numbers: PRJ-2026-0001, PO-2026-0042, GRN-2026-0007, INV-2026-0003.
 *
 * The counter row is updated inside the caller's transaction, so two people creating
 * an invoice at the same moment can't be handed the same number.
 */
export async function nextDocumentNumber(db: Db, prefix: string, when: Date = new Date()): Promise<string> {
  const year = when.getUTCFullYear();
  const counter = await db.documentCounter.upsert({
    where: { prefix_year: { prefix, year } },
    create: { prefix, year, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${year}-${String(counter.value).padStart(4, "0")}`;
}
