import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/db/schema";
import { DEFAULTS } from "../src/lib/defaults";
import { loadEnv } from "./load-env";

/**
 * Applique les migrations Postgres puis ajoute, une seule fois, les contenus de départ
 * (ligne des paramètres, base de connaissances, obligations, registre RGPD, documents, partenaires, automatisations).
 * Sans danger si relancé : rien n'est modifié ni dupliqué.
 */
async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante (voir .env.example)");
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing();

  const marker = "_defaults_v1";
  const done = await db.select().from(schema.automations);
  if (!done.some((a) => a.key === marker)) {
    const today = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
    await db.transaction(async (tx) => {
      for (const k of DEFAULTS.kb) await tx.insert(schema.kbArticles).values({ ...k, updatedOn: today });
      for (const o of DEFAULTS.obligations) await tx.insert(schema.obligations).values({ ...o });
      for (const r of DEFAULTS.rgpd) await tx.insert(schema.rgpdRecords).values({ ...r });
      for (const d of DEFAULTS.documents) await tx.insert(schema.documents).values({ ...d, updatedOn: today });
      for (const p of DEFAULTS.partners) await tx.insert(schema.partners).values({ ...p });
      for (const key of ["acompte", "solde", "contrats", "retard", "ticket", "prospectJ0", "rdvPrep"]) await tx.insert(schema.automations).values({ key, enabled: true }).onConflictDoNothing();
      await tx.insert(schema.automations).values({ key: marker, enabled: false });
    });
  }
  await pool.end();
  console.log("✓ Base de données à jour");
}
main().catch((e) => {
  console.error("✗ Échec de la migration :", e instanceof Error ? e.message : e);
  process.exit(1);
});
