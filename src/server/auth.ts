import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, User } from "@prisma/client";
import { prisma } from "./db";
import { verifyPassword } from "./password";

export { hashPassword, verifyPassword } from "./password";

const SESSION_COOKIE = "procurement_session";
const SESSION_DAYS = 30;

export type SessionUser = Pick<User, "id" | "name" | "email" | "role">;

/** The signed-in user, or null. Safe to call from any server component. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;

  const { id, name, email, role } = session.user;
  return { id, name, email, role };
}

/** Require a signed-in user; redirects to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  PROJECT_MANAGER: 1,
  ADMIN: 2,
};

export function hasRole(user: SessionUser, minimum: Role): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[minimum];
}

/**
 * Guard for every mutating server action. Viewers can read the whole app but
 * cannot create documents; only admins touch users and master data deletions.
 */
export async function requireRole(minimum: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user, minimum)) {
    throw new Error("You do not have permission to perform this action.");
  }
  return user;
}

export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const session = await prisma.session.create({ data: { userId, expiresAt } });
  const store = await cookies();
  store.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await prisma.session.deleteMany({ where: { id: sessionId } });
    store.delete(SESSION_COOKIE);
  }
}

export async function signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.isActive) return { ok: false, error: "Invalid email or password." };
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "Invalid email or password." };
  }
  await createSession(user.id);
  return { ok: true };
}
