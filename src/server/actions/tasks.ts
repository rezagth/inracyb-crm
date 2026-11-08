"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { today } from "@/lib/format";
import { logEvent, type ActionResult } from "../core";

const taskSchema = z.object({
  title: z.string().trim().min(1, "Donne un intitulé à la tâche.").max(300),
  dueDate: z.iso.date("Date invalide.").default(today()),
  priority: z.enum(["haute", "moyenne", "basse"]).default("moyenne"),
  companyId: z.string().max(64).optional(),
});

export async function createTaskAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireUser();
  const raw = Object.fromEntries(form);
  const parsed = taskSchema.safeParse({ ...raw, dueDate: raw.dueDate || today(), companyId: raw.companyId || undefined });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Tâche invalide." };
  const v = parsed.data;
  await db.transaction(async (tx) => {
            await tx.insert(schema.tasks).values({ title: v.title, dueDate: v.dueDate, priority: v.priority, companyId: v.companyId ?? null });
            if (v.companyId) await logEvent(tx, v.companyId, "task", `Tâche planifiée : ${v.title}`);
          });
  revalidatePath("/", "layout");
  return { ok: true, message: "Tâche ajoutée" };
}

export async function toggleTaskAction(id: string) {
  await requireUser();
  const t = (await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1))[0];
  if (!t) return;
  await db.update(schema.tasks).set({ done: !t.done, doneAt: t.done ? null : new Date() }).where(eq(schema.tasks.id, id));
  revalidatePath("/", "layout");
}

export async function deleteTaskAction(id: string) {
  await requireUser();
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  revalidatePath("/", "layout");
}
