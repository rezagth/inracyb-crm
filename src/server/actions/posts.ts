"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { visualJson } from "@/lib/post-visual";
import { disconnectLinkedin } from "../linkedin";

type R = { ok: true; message: string } | { ok: false; error: string };

const input = z.object({ id: z.string().min(1).max(64), body: z.string().max(5000), kicker: z.string().max(60), big: z.string().max(40), sub: z.string().max(140) });

/** Texte et image d'un post (phase Q). */
export async function savePostContentAction(raw: z.input<typeof input>): Promise<R> {
  await requireUser();
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, error: "Texte ou image trop long." };
  const v = p.data;
  await db.update(schema.posts).set({ body: v.body.trim(), visual: visualJson(v.kicker, v.big, v.sub) }).where(eq(schema.posts.id, v.id));
  revalidatePath("/marketing");
  return { ok: true, message: "Post enregistré" };
}

/** Marque un post comme publié : plus de mail de rappel pour lui. */
export async function markPostPublishedAction(id: string): Promise<R> {
  await requireUser();
  const p = z.string().min(1).max(64).safeParse(id);
  if (!p.success) return { ok: false, error: "Post introuvable." };
  await db.update(schema.posts).set({ status: "publie" }).where(eq(schema.posts.id, p.data));
  revalidatePath("/marketing");
  return { ok: true, message: "Publié : bravo !" };
}

/** Retire l'autorisation LinkedIn du CRM (les posts ne partent plus tout seuls ; le mail manuel prend le relais). */
export async function disconnectLinkedinAction(): Promise<R> {
  await requireUser();
  await disconnectLinkedin();
  revalidatePath("/marketing");
  return { ok: true, message: "LinkedIn déconnecté" };
}
