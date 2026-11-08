"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { createSession, destroySession, hasAnyUser, hashPassword, verifyPassword, getCurrentUser, setupTokenOk } from "@/lib/auth";

export type AuthState = { error?: string } | undefined;

const DUMMY_HASH = "$2b$12$vAsskPwNDDAHOzMTowdqt.1KpBSXaa7FR29NGEJNiLyo3o2DycvrO"; // hachage factice : temps de réponse identique si l'e-mail est inconnu
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

const setupSchema = z
  .object({
    name: z.string().trim().min(2, "Indique ton nom."),
    email: z.email("Adresse e-mail invalide.").trim().toLowerCase(),
    password: z.string().min(12, "12 caractères minimum.").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Les deux mots de passe ne correspondent pas.", path: ["confirm"] });

export async function setupAction(_: AuthState, form: FormData): Promise<AuthState> {
  if ((await hasAnyUser())) return { error: "Le compte administrateur existe déjà : connecte-toi." };
  if (!setupTokenOk(String(form.get("setupToken") ?? ""))) return { error: "Code d'installation absent ou incorrect." };
  const parsed = setupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const { name, email, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  const user = (await db.insert(schema.users).values({ name, email, passwordHash }).returning())[0];
  await db.update(schema.settings).set({ legalName: name }).where(eq(schema.settings.id, 1));
  await createSession(user);
  redirect("/");
}

const loginSchema = z.object({ email: z.string().trim().toLowerCase(), password: z.string().min(1).max(200) });

export async function loginAction(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Identifiants incorrects." };
  const { email, password } = parsed.data;
  const user = (await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1))[0];

  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const min = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    return { error: `Trop de tentatives. Réessaie dans ${min} min.` };
  }

  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    if (user) {
      const fails = user.failedLogins + 1;
      await db.update(schema.users)
                        .set({ failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
                        .where(eq(schema.users.id, user.id));
    }
    return { error: "Identifiants incorrects." };
  }

  await db.update(schema.users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await createSession(user);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

/** Déconnecte toutes les sessions ouvertes (ex. après un changement de mot de passe). */
export async function revokeAllSessions() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  await db.update(schema.users).set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` }).where(eq(schema.users.id, me.id));
  await destroySession();
  redirect("/login");
}
