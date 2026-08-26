import { prisma, type Db } from "../db";
import { hashPassword } from "../password";
import type { z } from "zod";
import type { partySchema, userSchema } from "@/lib/validation/schemas";

/** Clients, vendors and users. */

type PartyInput = z.output<typeof partySchema>;
type UserInput = z.output<typeof userSchema>;

/** Derive a readable code (ACME-01) when the user doesn't supply one. */
async function generatePartyCode(name: string, exists: (code: string) => Promise<boolean>): Promise<string> {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 6) || "PARTY";

  for (let suffix = 1; suffix < 100; suffix += 1) {
    const candidate = `${base}-${String(suffix).padStart(2, "0")}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error("Could not generate a unique code — please enter one.");
}

export async function createClient(input: PartyInput, db: Db = prisma) {
  const code =
    input.code ??
    (await generatePartyCode(input.name, async (candidate) =>
      Boolean(await db.client.findUnique({ where: { code: candidate }, select: { id: true } })),
    ));
  return db.client.create({ data: { ...input, code } });
}

export async function updateClient(id: string, input: PartyInput, db: Db = prisma) {
  const { code, ...rest } = input;
  return db.client.update({ where: { id }, data: { ...rest, ...(code ? { code } : {}) } });
}

export async function createVendor(input: PartyInput, db: Db = prisma) {
  const code =
    input.code ??
    (await generatePartyCode(input.name, async (candidate) =>
      Boolean(await db.vendor.findUnique({ where: { code: candidate }, select: { id: true } })),
    ));
  return db.vendor.create({ data: { ...input, code } });
}

export async function updateVendor(id: string, input: PartyInput, db: Db = prisma) {
  const { code, ...rest } = input;
  return db.vendor.update({ where: { id }, data: { ...rest, ...(code ? { code } : {}) } });
}

export async function listClients(db: Db = prisma) {
  return db.client.findMany({
    include: { _count: { select: { projects: true } } },
    orderBy: { name: "asc" },
  });
}

export async function listVendors(db: Db = prisma) {
  return db.vendor.findMany({
    include: { _count: { select: { vendorPos: true } } },
    orderBy: { name: "asc" },
  });
}

export async function listUsers(db: Db = prisma) {
  return db.user.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { name: "asc" },
  });
}

export async function createUser(input: UserInput, db: Db = prisma) {
  if (!input.password) throw new Error("Set a password for the new user.");
  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new Error("A user with that email already exists.");

  return db.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    },
  });
}

export async function updateUser(id: string, input: UserInput, db: Db = prisma) {
  return db.user.update({
    where: { id },
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    },
  });
}

export async function setUserActive(id: string, isActive: boolean, db: Db = prisma) {
  return db.user.update({ where: { id }, data: { isActive } });
}
