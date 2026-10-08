import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "iw_session";
const SESSION_DAYS = 7;

export const ROLES = ["ADMIN", "ASESOR", "LECTURA"] as const;
export type Role = (typeof ROLES)[number];

/** Permisos por rol. ADMIN lo tiene todo. */
export const PERMISSIONS: Record<Role, string[]> = {
  ADMIN: [
    "clients:read", "clients:write",
    "loans:read", "loans:write",
    "payments:read", "payments:write",
    "rates:read", "rates:write",
    "users:read", "users:write",
    "reports:read",
  ],
  ASESOR: [
    "clients:read", "clients:write",
    "loans:read", "loans:write",
    "payments:read", "payments:write",
    "rates:read",
    "reports:read",
  ],
  LECTURA: ["clients:read", "loans:read", "payments:read", "rates:read", "reports:read"],
};

export function can(role: Role | undefined, permission: string): boolean {
  if (!role) return false;
  return PERMISSIONS[role]?.includes(permission) ?? false;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  store.delete(COOKIE_NAME);
}

/**
 * Usuario de la sesión actual. Cacheado por request para no repetir la
 * consulta en cada Server Component de la misma renderización.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (!session.user.isActive) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as Role,
  };
});

/** Para páginas: redirige a login si no hay sesión. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Para páginas: además valida un permiso concreto. */
export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/");
  return user;
}