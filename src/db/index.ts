import "server-only";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

/**
 * Connexion Postgres (Neon). `DATABASE_URL` doit être l'URL « poolée » de Neon sur Vercel.
 * Le schéma est créé par `npm run db:migrate` (au déploiement), jamais au démarrage de l'application.
 */
function open(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante : voir .env.example");
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL doit être une URL Postgres (postgres://…). L'ancienne base SQLite se copie avec `npm run db:copy-sqlite`.");
  const pool = new Pool({ connectionString: url, max: process.env.VERCEL ? 3 : 10, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
  // Neon ferme les connexions inactives : sans ce gestionnaire, l'erreur n'est pas interceptée et fait planter le processus.
  pool.on("error", (e) => console.error("[db] connexion inactive fermée :", e.message));
  return drizzle(pool, { schema });
}

const globalForDb = globalThis as unknown as { __icrmDb?: Db };
export const db: Db = globalForDb.__icrmDb ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.__icrmDb = db;

export { schema };
