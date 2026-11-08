/**
 * npm run db:seed          → ajoute ton catalogue de prestations (si vide).
 * npm run db:seed -- --demo → ajoute aussi des données de démonstration FICTIVES
 *                             (entreprises marquées « (démo) »), uniquement si la base ne contient aucune entreprise.
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { loadEnv } from "./load-env";

loadEnv();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquante");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = drizzle(pool, { schema });
const demo = process.argv.includes("--demo");

const CATALOG = [
  { name: "Audit cyber forfaitaire — TPE", offer: "Audit", unit: "forfait", pu: 3200, description: "Jusqu'à 10 postes, rapport et plan d'action" },
  { name: "Audit cyber forfaitaire — PME", offer: "Audit", unit: "forfait", pu: 9600, description: "Jusqu'à 50 postes, rapport et plan d'action" },
  { name: "RSSI externalisé — abonnement", offer: "CISOaaS", unit: "mois", pu: 1033, description: "Pilotage sécurité, comité mensuel, support" },
  { name: "Journée de conseil cybersécurité", offer: "CISOaaS", unit: "jour", pu: 650, description: "Intervention ponctuelle" },
  { name: "Mise en place de la double authentification", offer: "CISOaaS", unit: "forfait", pu: 450, description: "Messageries et comptes critiques" },
  { name: "Sensibilisation des équipes au phishing", offer: "CISOaaS", unit: "forfait", pu: 650, description: "Demi-journée, support remis" },
  { name: "Automatisation IA — cadrage et première tâche", offer: "IA", unit: "forfait", pu: 1500, description: "Une tâche automatisée et testée" },
  { name: "Maintenance d'automatisation IA", offer: "IA", unit: "mois", pu: 150, description: "Suivi, corrections, évolutions mineures" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function nextNumber(tx: Tx, kind: string, prefix: string, date: string) {
  const year = date.slice(0, 4);
  const key = `${kind}-${year}`;
  await tx.insert(schema.counters).values({ key, value: 1 }).onConflictDoUpdate({ target: schema.counters.key, set: { value: sql`${schema.counters.value} + 1` } });
  const v = (await tx.select().from(schema.counters).where(eq(schema.counters.key, key)).limit(1))[0]!.value;
  return `${prefix}-${year}-${String(v).padStart(3, "0")}`;
}

async function main() {
const catCount = (await db.select({ c: sql<number>`count(*)::int` }).from(schema.catalogItems).limit(1))[0]!.c;
if (catCount === 0) {
  for (const c of CATALOG) await db.insert(schema.catalogItems).values({ name: c.name, offer: c.offer, unit: c.unit, unitPriceCents: c.pu * 100, description: c.description });
  console.log(`✓ Catalogue : ${CATALOG.length} prestations ajoutées (tarifs à ajuster dans /catalogue).`);
} else console.log("• Catalogue déjà rempli, rien à faire.");

if (demo) {
  const n = (await db.select({ c: sql<number>`count(*)::int` }).from(schema.companies).limit(1))[0]!.c;
  if (n > 0) {
    console.log("• La base contient déjà des entreprises : données de démo NON ajoutées (pour ne rien mélanger).");
  } else {
    await db.transaction(async (tx) => {
                  const co = async (name: string, v: Partial<typeof schema.companies.$inferInsert>, contact: [string, string, string, string]) => {
                    const id = (await tx.insert(schema.companies).values({ name: `${name} (démo)`, lastContact: day(-3), ...v }).returning())[0].id;
                    await tx.insert(schema.contacts).values({ companyId: id, firstName: contact[0], lastName: contact[1], role: contact[2], email: contact[3], isPrimary: true });
                    await tx.insert(schema.events).values({ companyId: id, type: "create", text: "Entreprise créée (données de démonstration)" });
                    return id;
                  };
                  const a = (await co("Cabinet Exemple Avocats", { sector: "Juridique", stage: "gagne", offer: "Audit", amountCents: 320000, city: "Lyon", address: "1 rue de l'Exemple\n69000", priority: "haute", source: "Recommandation" }, ["Camille", "Exemple", "Associée", "camille@exemple.test"]));
                  const b = (await co("Office Notarial Modèle", { sector: "Notariat", stage: "devis", offer: "CISOaaS", amountCents: 1240000, city: "Annecy", address: "2 place du Modèle\n74000", source: "LinkedIn" }, ["Louis", "Modèle", "Notaire", "louis@modele.test"]));
                  const c = (await co("Cabinet Fictif Santé", { sector: "Santé", stage: "rdv", offer: "Audit", amountCents: 320000, city: "Grenoble", source: "Site web" }, ["Inès", "Fictif", "Gérante", "ines@fictif.test"]));
                  await co("Expertise Comptable Démo", { sector: "Expertise comptable", stage: "contacte", offer: "IA", amountCents: 150000, city: "Chambéry", source: "Salon" }, ["Hugo", "Démo", "Expert-comptable", "hugo@demo.test"]);
                  await co("Agence Immobilière Test", { sector: "Immobilier", stage: "qualif", offer: "Audit", amountCents: 0, city: "Valence", source: "Site web", lastContact: null }, ["Léa", "Test", "Directrice", ""]);

                  // Devis accepté → facture émise et partiellement payée (client a)
                  const qa = (await tx.insert(schema.quotes).values({ number: (await nextNumber(tx, "quote", "D", day(-40))), companyId: a, subject: "Audit cyber forfaitaire — TPE", status: "accepte", issueDate: day(-40), validUntil: day(-10), totalHtCents: 320000, signedBy: "Camille Exemple, associée", signedAt: new Date() }).returning())[0];
                  await tx.insert(schema.quoteLines).values({ quoteId: qa.id, position: 0, label: CATALOG[0].name + " — " + CATALOG[0].description, quantity: 1, unit: "forfait", unitPriceCents: 320000 });
                  const ia = (await tx.insert(schema.invoices).values({ number: (await nextNumber(tx, "invoice", "F", day(-35))), companyId: a, subject: `Audit cyber forfaitaire — TPE (${qa.number})`, status: "envoyee", issueDate: day(-35), dueDate: day(-5), totalHtCents: 320000, quoteId: qa.id }).returning())[0];
                  await tx.insert(schema.invoiceLines).values({ invoiceId: ia.id, position: 0, label: CATALOG[0].name, quantity: 1, unit: "forfait", unitPriceCents: 320000 });
                  await tx.insert(schema.payments).values({ invoiceId: ia.id, date: day(-20), amountCents: 96000, method: "Virement bancaire" });

                  // Devis envoyé en attente (client b)
                  const qb = (await tx.insert(schema.quotes).values({ number: (await nextNumber(tx, "quote", "D", day(-6))), companyId: b, subject: "RSSI externalisé — 12 mois", status: "envoye", issueDate: day(-6), validUntil: day(24), totalHtCents: 1239600 }).returning())[0];
                  await tx.insert(schema.quoteLines).values({ quoteId: qb.id, position: 0, label: CATALOG[2].name, quantity: 12, unit: "mois", unitPriceCents: 103300 });

                  await tx.insert(schema.tasks).values([
                                    { title: "Relancer le solde de la facture (démo)", companyId: a, dueDate: day(0), priority: "haute" },
                                    { title: "Préparer le RDV de découverte (démo)", companyId: c, dueDate: day(2), priority: "moyenne" },
                                    { title: "Relancer le devis RSSI (démo)", companyId: b, dueDate: day(-1), priority: "haute" },
                                  ]);
                });
    console.log("✓ Données de démonstration fictives ajoutées (5 entreprises « (démo) »).");
  }
}
await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
