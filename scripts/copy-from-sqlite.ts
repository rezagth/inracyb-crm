/**
 * Copie unique de l'ancienne base SQLite (data/infracyb.db) vers Postgres.
 *   SQLITE_FILE=data/infracyb.db DATABASE_URL=postgres://… npm run db:copy-sqlite
 * - À lancer après `npm run db:migrate`, sur une base Postgres sans données métier.
 * - Lecture seule côté SQLite ; tout est copié dans une seule transaction (tout ou rien).
 * - Vérifie ensuite que chaque table a le même nombre de lignes.
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { resolve } from "node:path";
import * as schema from "../src/db/schema";
import { loadEnv } from "./load-env";

type Lite = { all: (sql: string) => Record<string, unknown>[]; has: (table: string) => boolean; close: () => void };

/** Ouvre la base SQLite en lecture seule : better-sqlite3 si disponible, sinon le module intégré à Node (22.5+). */
async function openSqlite(file: string): Promise<Lite> {
  try {
    const mod = (await import("better-sqlite3")) as unknown as { default: new (f: string, o: object) => { prepare: (q: string) => { all: (...a: unknown[]) => unknown[]; get: (...a: unknown[]) => unknown }; close: () => void } };
    const d = new mod.default(file, { readonly: true, fileMustExist: true });
    return { all: (q) => d.prepare(q).all() as Record<string, unknown>[], has: (t) => !!d.prepare("select 1 from sqlite_master where type='table' and name=?").get(t), close: () => d.close() };
  } catch {
    const { DatabaseSync } = (await import("node:sqlite")) as unknown as { DatabaseSync: new (f: string, o: object) => { prepare: (q: string) => { all: (...a: unknown[]) => unknown[]; get: (...a: unknown[]) => unknown }; close: () => void } };
    const d = new DatabaseSync(file, { readOnly: true });
    return { all: (q) => d.prepare(q).all() as Record<string, unknown>[], has: (t) => !!d.prepare("select 1 from sqlite_master where type='table' and name=?").get(t), close: () => d.close() };
  }
}

function tables(): PgTable[] {
  return (Object.values(schema) as unknown[]).filter((v) => is(v, PgTable)) as PgTable[];
}

/** Tables triées pour que chaque table passe après celles qu'elle référence. */
function sorted(all: PgTable[]): PgTable[] {
  const byName = new Map(all.map((t) => [getTableName(t), t]));
  const out: PgTable[] = [];
  const seen = new Set<string>();
  const visit = (t: PgTable) => {
    const n = getTableName(t);
    if (seen.has(n)) return;
    seen.add(n);
    for (const fk of getTableConfig(t).foreignKeys) {
      const ref = byName.get(getTableName(fk.reference().foreignTable as PgTable));
      if (ref && ref !== t) visit(ref);
    }
    out.push(t);
  };
  all.forEach(visit);
  return out;
}

function convert(dataType: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (dataType === "boolean") return v === 1 || v === true || v === "1";
  if (dataType === "date") return new Date(Number(v));
  return v;
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante");
  const file = resolve(process.cwd(), process.env.SQLITE_FILE ?? "data/infracyb.db");
  const sqlite = await openSqlite(file);
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });

  const order = sorted(tables());
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(schema.companies);
  const users = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  if (existing[0].n > 0 || users[0].n > 0) throw new Error("La base Postgres contient déjà des données métier ou un compte : copie annulée pour ne rien écraser.");

  const report: string[] = [];
  await db.transaction(async (tx) => {
    // Les contenus de départ ajoutés par db:migrate sont remplacés par ceux de l'ancienne base.
    for (const t of [...order].reverse()) await tx.delete(t);
    for (const t of order) {
      const name = getTableName(t);
      if (!sqlite.has(name)) {
        report.push(`${name}: absente de SQLite (ignorée)`);
        continue;
      }
      const cols = getTableColumns(t);
      const rows = sqlite.all(`select * from "${name}"`);
      const values = rows.map((r) => Object.fromEntries(Object.entries(cols).map(([key, col]) => [key, convert(col.dataType, r[col.name])])));
      for (let i = 0; i < values.length; i += 200) await tx.insert(t).values(values.slice(i, i + 200) as never);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(t);
      if (n !== rows.length) throw new Error(`${name} : ${rows.length} lignes en SQLite, ${n} en Postgres`);
      if (rows.length) report.push(`${name}: ${rows.length} ligne(s)`);
    }
  });
  sqlite.close();
  await pool.end();
  console.log("✓ Copie terminée et vérifiée :\n  " + report.join("\n  "));
}
main().catch((e) => {
  console.error("✗ Copie annulée (rien n'a été modifié) :", e instanceof Error ? e.message : e);
  process.exit(1);
});
