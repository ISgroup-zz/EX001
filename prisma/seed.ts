/**
 * Demo data.
 *
 * Everything here goes through the real services, so seeding is also an end-to-end
 * exercise of the rules: a project can only be opened on a client document, call-offs
 * draw down a framework, receipts move delivery plans along, invoices bill only what
 * has been received.
 *
 * Dates are relative to today so the dashboard always has something overdue and
 * something upcoming.
 */

import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/password";
import { addDays, addMonths, startOfDay, today } from "../src/lib/dates";
import { toMinor } from "../src/lib/money";
import { openProject } from "../src/server/services/project";
import { createAgreement } from "../src/server/services/agreement";
import { createVendorPo } from "../src/server/services/vendorPo";
import { postGrn, saveGrnDraft, startGrnDraft } from "../src/server/services/grn";
import { createInvoice, issueInvoice, recordPayment } from "../src/server/services/invoice";
import { getPlanForPo } from "../src/server/services/deliveryPlan";
import type { AgreementInput } from "../src/lib/validation/schemas";

const now = today();

type SeedLine = { description: string; uom: string; quantity: number; unitPrice: number; taxRatePct?: number };

function agreement(
  type: AgreementInput["type"],
  reference: string,
  options: {
    title?: string;
    issueDate?: Date;
    lines?: SeedLine[];
    declaredValue?: number;
    parentAgreementId?: string | null;
    validFrom?: Date | null;
    validTo?: Date | null;
    notes?: string;
  } = {},
): AgreementInput {
  return {
    type,
    reference,
    title: options.title ?? null,
    issueDate: options.issueDate ?? now,
    validFrom: options.validFrom ?? null,
    validTo: options.validTo ?? null,
    declaredValueMinor: options.declaredValue !== undefined ? toMinor(options.declaredValue) : undefined,
    parentAgreementId: options.parentAgreementId ?? null,
    documentUrl: null,
    notes: options.notes ?? null,
    lines: (options.lines ?? []).map((line) => ({
      description: line.description,
      uom: line.uom,
      quantity: line.quantity,
      unitPriceMinor: toMinor(line.unitPrice),
      taxRatePct: line.taxRatePct ?? 5,
      notes: null,
    })),
  };
}

async function clearDatabase() {
  // Child-first so foreign keys never block the wipe.
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

/**
 * Two modes:
 *
 *   npm run db:seed            local development — WIPES the database, then seeds.
 *   npm run db:seed:if-empty   deployment — seeds only an empty database, never clears.
 *
 * The deployment path additionally requires SEED_DEMO_DATA=true, so a stray run can
 * never drop real data: it is opt-in, and it refuses the moment any user exists.
 */
async function main() {
  const seedOnlyIfEmpty = process.argv.includes("--if-empty");

  if (seedOnlyIfEmpty) {
    if (process.env.SEED_DEMO_DATA !== "true") {
      console.log("SEED_DEMO_DATA is not 'true' — skipping demo data.");
      return;
    }
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      console.log(`Database already has ${existingUsers} user(s) — leaving it untouched.`);
      return;
    }
    console.log("Empty database and SEED_DEMO_DATA=true — loading demo data…");
  } else {
    console.log("Clearing existing data…");
    await clearDatabase();
  }

  // ------------------------------------------------------------------ users
  const password = await hashPassword("password123");
  const [admin, pm] = await Promise.all([
    prisma.user.create({
      data: { name: "Amira Haddad", email: "admin@procurementhub.test", role: "ADMIN", passwordHash: password },
    }),
    prisma.user.create({
      data: { name: "Omar Nasser", email: "pm@procurementhub.test", role: "PROJECT_MANAGER", passwordHash: password },
    }),
    prisma.user.create({
      data: { name: "Lena Farah", email: "viewer@procurementhub.test", role: "VIEWER", passwordHash: password },
    }),
  ]);

  // ------------------------------------------------------------------ parties
  const [northwind, gulfPetro] = await Promise.all([
    prisma.client.create({
      data: {
        code: "NWE-01",
        name: "Northwind Energy",
        contactName: "Sara Idris",
        email: "procurement@northwind.example",
        phone: "+971 4 555 0110",
        address: "Dubai Investment Park, Dubai, UAE",
        taxId: "TRN-100200300",
        paymentTermsDays: 45,
      },
    }),
    prisma.client.create({
      data: {
        code: "GPC-01",
        name: "Gulf Petrochem Industries",
        contactName: "Khalid Rahman",
        email: "buying@gulfpetrochem.example",
        phone: "+966 13 555 0180",
        address: "Jubail Industrial City, Saudi Arabia",
        taxId: "TRN-400500600",
        paymentTermsDays: 60,
      },
    }),
  ]);

  const [vertex, delta, orion] = await Promise.all([
    prisma.vendor.create({
      data: { code: "VTX-01", name: "Vertex Electricals", contactName: "Marco Ricci", email: "sales@vertex.example", paymentTermsDays: 30 },
    }),
    prisma.vendor.create({
      data: { code: "DLT-01", name: "Delta Instruments", contactName: "Ji-woo Park", email: "orders@delta.example", paymentTermsDays: 45 },
    }),
    prisma.vendor.create({
      data: { code: "ORN-01", name: "Orion Cables", contactName: "Hana Suzuki", email: "export@orioncables.example", paymentTermsDays: 30 },
    }),
  ]);

  // ================================================================== Project 1
  // Opened on a client PO, then a second PO arrives and lifts the budget.
  console.log("Opening PRJ-1 on a client purchase order…");
  const substation = await openProject({
    name: "Substation 220kV Upgrade",
    code: null,
    clientId: northwind.id,
    managerId: pm.id,
    currency: "USD",
    description: "Supply of switchgear, protection relays and power cable for the 220kV substation upgrade.",
    startDate: addMonths(now, -3),
    targetDate: addMonths(now, 5),
    agreement: agreement("PO", "NW-PO-88431", {
      title: "Switchgear and protection package",
      issueDate: addMonths(now, -3),
      lines: [
        { description: "11kV switchgear panel, withdrawable ACB", uom: "EA", quantity: 12, unitPrice: 18500 },
        { description: "Numerical protection relay, feeder", uom: "EA", quantity: 24, unitPrice: 3250 },
      ],
    }),
  });

  // A second client PO lands two months later — the project budget goes up.
  await createAgreement(
    substation.id,
    agreement("PO", "NW-PO-89117", {
      title: "Additional cable scope",
      issueDate: addMonths(now, -1),
      lines: [
        { description: "XLPE power cable 240mm², 3-core", uom: "M", quantity: 4200, unitPrice: 62 },
        { description: "Cable termination kit, 11kV indoor", uom: "SET", quantity: 36, unitPrice: 410 },
      ],
    }),
  );

  const substationLines = await prisma.clientAgreementLine.findMany({
    where: { agreement: { projectId: substation.id } },
    include: { agreement: { select: { reference: true } } },
    orderBy: [{ agreement: { issueDate: "asc" } }, { lineNo: "asc" }],
  });
  const findLine = (fragment: string) =>
    substationLines.find((line) => line.description.toLowerCase().includes(fragment.toLowerCase()));

  const switchgearLine = findLine("switchgear")!;
  const relayLine = findLine("relay")!;
  const cableLine = findLine("XLPE")!;
  const terminationLine = findLine("termination")!;

  // Vendor PO 1: switchgear + relays, split into three monthly shipments.
  // The first was due three weeks ago and has been received; the second is due shortly.
  console.log("Raising vendor POs with delivery plans…");
  const switchgearPo = await createVendorPo({
    projectId: substation.id,
    vendorId: vertex.id,
    clientAgreementId: switchgearLine.agreementId,
    poNumber: null,
    issueDate: addMonths(now, -2),
    expectedDeliveryDate: addDays(now, -21),
    notes: "Ex-works Milan, consolidated shipping.",
    lines: [
      {
        description: "11kV switchgear panel, withdrawable ACB",
        uom: "EA",
        quantity: 12,
        unitCostMinor: toMinor(14200),
        taxRatePct: 5,
        clientAgreementLineId: switchgearLine.id,
        notes: null,
      },
      {
        description: "Numerical protection relay, feeder",
        uom: "EA",
        quantity: 24,
        unitCostMinor: toMinor(2480),
        taxRatePct: 5,
        clientAgreementLineId: relayLine.id,
        notes: null,
      },
    ],
    planItems: [
      { label: "Shipment 1 of 3", plannedDate: addDays(now, -21), notes: null, quantities: [4, 8] },
      { label: "Shipment 2 of 3", plannedDate: addDays(now, 9), notes: null, quantities: [4, 8] },
      { label: "Shipment 3 of 3", plannedDate: addDays(now, 40), notes: null, quantities: [4, 8] },
    ],
  });

  // Vendor PO 2: cable scope. The first tranche is overdue and NOT received —
  // it shows up in red on the dashboard and the delivery queue.
  const cablePo = await createVendorPo({
    projectId: substation.id,
    vendorId: orion.id,
    clientAgreementId: cableLine.agreementId,
    poNumber: null,
    issueDate: addDays(now, -25),
    expectedDeliveryDate: addDays(now, -5),
    notes: null,
    lines: [
      {
        description: "XLPE power cable 240mm², 3-core",
        uom: "M",
        quantity: 4200,
        unitCostMinor: toMinor(48),
        taxRatePct: 5,
        clientAgreementLineId: cableLine.id,
        notes: null,
      },
      {
        description: "Cable termination kit, 11kV indoor",
        uom: "SET",
        quantity: 36,
        unitCostMinor: toMinor(295),
        taxRatePct: 5,
        clientAgreementLineId: terminationLine.id,
        notes: null,
      },
    ],
    planItems: [
      { label: "Drum batch 1", plannedDate: addDays(now, -5), notes: "Late — vendor chasing mill slot.", quantities: [2100, 18] },
      { label: "Drum batch 2", plannedDate: addDays(now, 25), notes: null, quantities: [2100, 18] },
    ],
  });

  // Receive the first switchgear shipment, a few days late.
  const switchgearPlan = await getPlanForPo(switchgearPo.id);
  const firstShipment = switchgearPlan[0];
  const draft = await startGrnDraft(switchgearPo.id, firstShipment.id);
  const grnId = await saveGrnDraft({
    vendorPoId: switchgearPo.id,
    deliveryPlanItemId: firstShipment.id,
    receivedDate: addDays(now, -18),
    deliveryNoteRef: "VTX-DN-4471",
    notes: "Arrived 3 days late; packing list checked against PO.",
    lines: draft.lines.map((line) => ({
      vendorPoLineId: line.vendorPoLineId,
      quantityAccepted: line.suggestedQty,
      quantityRejected: 0,
      remarks: null,
    })),
  });
  await postGrn(grnId, pm.id);

  // Bill the client for what has actually landed.
  console.log("Raising the first client invoice…");
  const invoiceId = await createInvoice({
    projectId: substation.id,
    clientAgreementId: switchgearLine.agreementId,
    issueDate: addDays(now, -14),
    dueDate: addDays(now, 31),
    notes: "First progress invoice — shipment 1 of 3.",
    lines: [
      {
        clientAgreementLineId: switchgearLine.id,
        description: switchgearLine.description,
        uom: switchgearLine.uom,
        quantity: 4,
        unitPriceMinor: switchgearLine.unitPriceMinor,
        taxRatePct: switchgearLine.taxRatePct,
      },
      {
        clientAgreementLineId: relayLine.id,
        description: relayLine.description,
        uom: relayLine.uom,
        quantity: 8,
        unitPriceMinor: relayLine.unitPriceMinor,
        taxRatePct: relayLine.taxRatePct,
      },
    ],
  });
  await issueInvoice(invoiceId);
  await recordPayment({
    invoiceId,
    amountMinor: toMinor(50000),
    paidDate: addDays(now, -2),
    method: "Bank transfer",
    reference: "SWIFT/NWE/22841",
  });

  // ================================================================== Project 2
  // Opened on a FRAMEWORK: the ceiling is the budget, call-offs draw it down.
  console.log("Opening PRJ-2 on a framework agreement…");
  const maintenance = await openProject({
    name: "Refinery Instrumentation Framework",
    code: null,
    clientId: gulfPetro.id,
    managerId: pm.id,
    currency: "USD",
    description: "Two-year call-off framework for field instrumentation and calibration spares.",
    startDate: addMonths(now, -2),
    targetDate: addMonths(now, 22),
    agreement: agreement("FRAMEWORK", "GPC-FA-2026-07", {
      title: "Instrumentation supply framework",
      issueDate: addMonths(now, -2),
      declaredValue: 1_500_000,
      validFrom: addMonths(now, -2),
      validTo: addMonths(now, 22),
      notes: "Ceiling value; individual scopes released as call-off POs.",
    }),
  });

  const framework = await prisma.clientAgreement.findFirstOrThrow({
    where: { projectId: maintenance.id, type: "FRAMEWORK" },
  });

  // Two call-offs against the framework. Neither raises the budget — the ceiling
  // already counted this money — but both consume it.
  await createAgreement(
    maintenance.id,
    agreement("PO", "GPC-CO-0001", {
      title: "Call-off 1 — pressure transmitters",
      issueDate: addMonths(now, -2),
      parentAgreementId: framework.id,
      lines: [
        { description: "Pressure transmitter, 4-20mA HART", uom: "EA", quantity: 60, unitPrice: 1850 },
        { description: "Manifold, 5-valve stainless", uom: "EA", quantity: 60, unitPrice: 240 },
      ],
    }),
  );
  const callOff2Id = await createAgreement(
    maintenance.id,
    agreement("PO", "GPC-CO-0002", {
      title: "Call-off 2 — temperature loops",
      issueDate: addDays(now, -20),
      parentAgreementId: framework.id,
      lines: [
        { description: "RTD temperature assembly with thermowell", uom: "EA", quantity: 85, unitPrice: 940 },
        { description: "Loop calibration and certification", uom: "LOT", quantity: 1, unitPrice: 18500 },
      ],
    }),
  );

  const callOff2Lines = await prisma.clientAgreementLine.findMany({
    where: { agreementId: callOff2Id },
    orderBy: { lineNo: "asc" },
  });

  const instrumentPo = await createVendorPo({
    projectId: maintenance.id,
    vendorId: delta.id,
    clientAgreementId: callOff2Id,
    poNumber: null,
    issueDate: addDays(now, -18),
    expectedDeliveryDate: addDays(now, 14),
    notes: null,
    lines: [
      {
        description: "RTD temperature assembly with thermowell",
        uom: "EA",
        quantity: 85,
        unitCostMinor: toMinor(690),
        taxRatePct: 5,
        clientAgreementLineId: callOff2Lines[0].id,
        notes: null,
      },
    ],
    // No plan supplied on purpose: the default single tranche is generated for us.
    planItems: [],
  });

  // ================================================================== Project 3
  // Opened on a CONTRACT, later increased by a variation order.
  console.log("Opening PRJ-3 on a contract, then adding a variation…");
  const controlRoom = await openProject({
    name: "Control Room Fit-out",
    code: null,
    clientId: gulfPetro.id,
    managerId: admin.id,
    currency: "USD",
    description: "Turnkey fit-out of the central control room including consoles and video wall.",
    startDate: addMonths(now, -1),
    targetDate: addMonths(now, 7),
    agreement: agreement("CONTRACT", "GPC-CTR-4490", {
      title: "Control room fit-out contract",
      issueDate: addMonths(now, -1),
      lines: [
        { description: "Operator console, dual-tier, 3-screen", uom: "EA", quantity: 8, unitPrice: 12400 },
        { description: "Video wall 55\" bezel-less cube", uom: "EA", quantity: 12, unitPrice: 8600 },
        { description: "Installation and commissioning", uom: "LOT", quantity: 1, unitPrice: 46000 },
      ],
    }),
  });

  const contract = await prisma.clientAgreement.findFirstOrThrow({
    where: { projectId: controlRoom.id, type: "CONTRACT" },
  });

  await createAgreement(
    controlRoom.id,
    agreement("VARIATION", "GPC-VO-01", {
      title: "Variation 1 — two additional consoles",
      issueDate: addDays(now, -6),
      parentAgreementId: contract.id,
      lines: [{ description: "Operator console, dual-tier, 3-screen (additional)", uom: "EA", quantity: 2, unitPrice: 12400 }],
    }),
  );

  // ------------------------------------------------------------------ summary
  const [projects, agreements, pos, planItems, grns, invoices] = await Promise.all([
    prisma.project.count(),
    prisma.clientAgreement.count(),
    prisma.vendorPO.count(),
    prisma.deliveryPlanItem.count(),
    prisma.gRN.count(),
    prisma.invoice.count(),
  ]);

  console.log("\nSeed complete:");
  console.log(`  ${projects} projects, ${agreements} client documents, ${pos} vendor POs`);
  console.log(`  ${planItems} planned deliveries, ${grns} goods receipts, ${invoices} invoices`);
  console.log(`  vendor POs seeded: ${switchgearPo.poNumber}, ${cablePo.poNumber}, ${instrumentPo.poNumber}`);
  console.log("\nSign in with:");
  console.log("  admin@procurementhub.test / password123   (Admin)");
  console.log("  pm@procurementhub.test    / password123   (Project manager)");
  console.log("  viewer@procurementhub.test/ password123   (Viewer)");
  console.log(`\nStartOfDay reference used for relative dates: ${startOfDay(now).toISOString().slice(0, 10)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
