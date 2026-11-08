import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { today } from "@/lib/format";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = typeof db | Tx;

export async function getSettings(): Promise<schema.Settings> {
  const row = (await db.select().from(schema.settings).where(eq(schema.settings.id, 1)).limit(1))[0];
  if (row) return row;
  await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing();
  return (await db.select().from(schema.settings).where(eq(schema.settings.id, 1)).limit(1))[0]!;
}

export async function logEvent(tx: DbOrTx, companyId: string | null, type: string, text: string) {
  await tx.insert(schema.events).values({ companyId, type, text });
}

/** Numérotation continue par année : F-2026-001, D-2026-001, AV-2026-001. À appeler dans une transaction. */
export async function nextNumber(tx: DbOrTx, kind: "invoice" | "quote" | "credit", prefix: string, isoDate = today()): Promise<string> {
  const year = isoDate.slice(0, 4);
  const key = `${kind}-${year}`;
  await tx.insert(schema.counters).values({ key, value: 1 }).onConflictDoUpdate({ target: schema.counters.key, set: { value: sql`${schema.counters.value} + 1` } });
  const row = (await tx.select().from(schema.counters).where(eq(schema.counters.key, key)).limit(1))[0]!;
  return `${prefix}-${year}-${String(row.value).padStart(3, "0")}`;
}

export function draftNumber(): string {
  return "BROUILLON-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
