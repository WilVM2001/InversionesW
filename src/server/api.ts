import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser, can, type SessionUser } from "@/server/auth";

/**
 * Utilidades para los Route Handlers.
 *
 * A diferencia de las páginas, un endpoint no debe redirigir: si falta la
 * sesión responde 401 y si falta el permiso responde 403, de modo que el
 * cliente pueda distinguir ambos casos sin seguir un redirect.
 */
export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export const unauthorized = (): NextResponse => jsonError("Sesión requerida.", 401);
export const forbidden = (): NextResponse => jsonError("No tiene permiso para esta operación.", 403);
export const notFound = (what = "Recurso"): NextResponse => jsonError(`${what} no encontrado.`, 404);

/** Usuario autenticado o null si no hay sesión válida. */
export async function apiUser(): Promise<SessionUser | null> {
  return currentUser();
}

/**
 * Usuario autenticado con un permiso concreto.
 * Si falla devuelve la respuesta de error ya construida, de modo que el
 * handler pueda hacer `if (user instanceof NextResponse) return user;`.
 * Los Route Handlers no pueden devolver null.
 */
export async function apiRequire(permission: string): Promise<SessionUser | NextResponse> {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!can(user.role, permission)) return forbidden();
  return user;
}

/** Traduce errores conocidos a respuestas JSON coherentes. */
export function apiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const detail = error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    return jsonError(`Datos inválidos: ${detail}`, 400);
  }
  if (error instanceof Error) {
    return jsonError(error.message, 400);
  }
  return jsonError("Error inesperado.", 500);
}

/** Serializa Decimals de Prisma como números para no filtrar objetos raros. */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, v) => (v === undefined ? null : v))) as T;
}