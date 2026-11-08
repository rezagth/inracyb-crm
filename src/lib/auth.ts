import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { signSession, verifySession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "./session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: { id: string; sessionVersion: number }) {
  const token = await signSession({ sub: user.id, sv: user.sessionVersion });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = { id: string; email: string; name: string };

/** Lit et valide la session (signature, expiration, version de session en base). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;
  const user = (await db.select().from(schema.users).where(eq(schema.users.id, payload.sub)).limit(1))[0];
  if (!user || user.sessionVersion !== payload.sv) return null;
  return { id: user.id, email: user.email, name: user.name };
}

/** À appeler au début de chaque page et action protégée. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function hasAnyUser(): Promise<boolean> {
  return !!(await db.select({ id: schema.users.id }).from(schema.users).limit(1))[0];
}

/**
 * En ligne (Vercel) ou si SETUP_TOKEN est défini, la création du premier compte exige ce code :
 * sans lui, le premier visiteur d'une base vide pourrait prendre le contrôle du CRM.
 */
export function setupTokenRequired(): boolean {
  return Boolean(process.env.VERCEL || process.env.SETUP_TOKEN);
}

export function setupTokenOk(given: string): boolean {
  if (!setupTokenRequired()) return true;
  const expected = process.env.SETUP_TOKEN ?? "";
  if (expected.length < 20) return false; // non configuré ou trop court : création refusée
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
