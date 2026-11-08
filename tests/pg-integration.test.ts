/**
 * Parcours critiques sur un vrai Postgres (PGlite, en mémoire) : migrations, numérotation continue,
 * paiements, avoirs, facturation des contrats, envoi du statut à StratCyber.
 * Les modules propres à Next.js (session, revalidation) sont remplacés par des doublures.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleLite } from "drizzle-orm/pglite";
import { migrate as migrateLite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

// Par défaut PGlite (Postgres en mémoire). Avec TEST_DATABASE_URL (base de test vide), un vrai serveur Postgres.
const realUrl = process.env.TEST_DATABASE_URL;
const lite = new PGlite();
const pool = realUrl ? new Pool({ connectionString: realUrl, max: 5 }) : null;
const db = (pool ? drizzlePg(pool, { schema }) : drizzleLite(lite, { schema })) as unknown as ReturnType<typeof drizzleLite<typeof schema>>;

const M = Module as unknown as { _load: (...a: unknown[]) => unknown };
const orig = M._load;
M._load = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return {};
  if (request === "next/cache") return { revalidatePath: () => undefined };
  if (request === "@/db") return { db, schema };
  if (request === "@/lib/auth") return { requireUser: async () => ({ id: "u1", email: "moi@test.fr", name: "Moi" }) };
  return orig.call(this, request, ...rest);
};

const T = new Date().toISOString().slice(0, 10);
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let companyId = "";
const line = (price: string) => ({ label: "Audit", quantity: 1, unit: "forfait" as const, unitPrice: price });
const input = (price: string, due = day(30)) => ({ companyId, subject: "Test", issueDate: T, dueDate: due, discountPct: "0", note: "", lines: [line(price)] });

before(async () => {
  if (pool) await migratePg(db as never, { migrationsFolder: "./drizzle" });
  else await migrateLite(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing();
  companyId = (await db.insert(schema.companies).values({ name: "Cabinet Test", sector: "Juridique" }).returning({ id: schema.companies.id }))[0].id;
});
after(async () => {
  if (pool) await pool.end();
  else await lite.close();
});

test("les tables métier existent après migration", async () => {
  const r = await db.execute(sql`select count(*)::int as n from information_schema.tables where table_schema='public'`);
  assert.ok((r.rows[0] as { n: number }).n >= 25);
});

test("numérotation continue : F-AAAA-001, 002, … sans trou, lignes enregistrées", async () => {
  const { saveInvoiceAction } = await import("../src/server/actions/documents");
  const a = await saveInvoiceAction(null, true, input("1000"));
  const b = await saveInvoiceAction(null, true, input("2000"));
  assert.ok(a.ok && b.ok);
  const rows = await db.select().from(schema.invoices).orderBy(schema.invoices.number);
  assert.deepEqual(rows.map((r) => r.number), [`F-${T.slice(0, 4)}-001`, `F-${T.slice(0, 4)}-002`]);
  const lines = await db.select().from(schema.invoiceLines);
  assert.equal(lines.length, 2);
  assert.equal(rows[0].totalHtCents, 100000);
});

test("un brouillon garde un numéro provisoire et ne consomme aucun numéro définitif", async () => {
  const { saveInvoiceAction, emitInvoiceAction } = await import("../src/server/actions/documents");
  const d = await saveInvoiceAction(null, false, input("500"));
  assert.ok(d.ok);
  const before = await db.select().from(schema.counters);
  const inv = (await db.select().from(schema.invoices).where(eq(schema.invoices.id, (d as { id: string }).id)))[0];
  assert.match(inv.number, /^BROUILLON-/);
  const e = await emitInvoiceAction(inv.id);
  assert.ok(e.ok);
  const after = (await db.select().from(schema.invoices).where(eq(schema.invoices.id, inv.id)))[0];
  assert.equal(after.number, `F-${T.slice(0, 4)}-003`);
  assert.equal(before.length, 1);
});

test("émissions simultanées : numéros tous distincts et consécutifs", async () => {
  const { saveInvoiceAction } = await import("../src/server/actions/documents");
  const res = await Promise.all([1, 2, 3, 4, 5].map(() => saveInvoiceAction(null, true, input("100"))));
  assert.ok(res.every((r) => r.ok));
  const nums = (await db.select().from(schema.invoices)).map((r) => r.number).sort();
  assert.equal(new Set(nums).size, nums.length);
  assert.equal(nums[nums.length - 1], `F-${T.slice(0, 4)}-008`);
});

test("paiement partiel puis solde ; refus d'un trop-perçu", async () => {
  const { addPaymentAction } = await import("../src/server/actions/documents");
  const inv = (await db.select().from(schema.invoices).where(eq(schema.invoices.number, `F-${T.slice(0, 4)}-001`)))[0];
  const over = await addPaymentAction(inv.id, { amount: "5000", date: T, method: "Virement bancaire" });
  assert.equal(over.ok, false);
  const p1 = await addPaymentAction(inv.id, { amount: "400", date: T, method: "Virement bancaire" });
  assert.ok(p1.ok);
  assert.equal((await db.select().from(schema.invoices).where(eq(schema.invoices.id, inv.id)))[0].status, "envoyee");
  const p2 = await addPaymentAction(inv.id, { amount: "600", date: T, method: "Virement bancaire" });
  assert.ok(p2.ok && /soldée/.test(p2.message ?? ""));
  assert.equal((await db.select().from(schema.invoices).where(eq(schema.invoices.id, inv.id)))[0].status, "payee");
});

test("avoir : numéro AV-…, lignes en négatif", async () => {
  const { createCreditNoteAction } = await import("../src/server/actions/documents");
  const inv = (await db.select().from(schema.invoices).where(eq(schema.invoices.number, `F-${T.slice(0, 4)}-002`)))[0];
  const r = await createCreditNoteAction(inv.id);
  assert.ok(r.ok, JSON.stringify(r));
  const av = (await db.select().from(schema.invoices).where(eq(schema.invoices.kind, "avoir")))[0];
  assert.match(av.number, /^AV-\d{4}-001$/);
  const l = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, av.id));
  assert.equal(l.length, 1);
  assert.equal(l[0].unitPriceCents, -200000);
});

test("facturation mensuelle des contrats : une seule facture par contrat et par mois", async () => {
  const { billContracts } = await import("../src/server/automations");
  await db.insert(schema.contracts).values({ companyId, offer: "RSSI externalisé", monthlyCents: 103300, start: day(-60), status: "actif" });
  const r1 = await billContracts();
  assert.ok(r1.ok, JSON.stringify(r1));
  await billContracts();
  const drafts = (await db.select().from(schema.invoices)).filter((i) => i.subject.startsWith("RSSI externalisé"));
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].status, "brouillon");
  assert.equal(drafts[0].totalHtCents, 103300);
});

test("tâches de relance pour factures échues : créées une seule fois", async () => {
  const { lateInvoiceTasks } = await import("../src/server/automations");
  const { saveInvoiceAction } = await import("../src/server/actions/documents");
  await saveInvoiceAction(null, true, input("700", day(-10)));
  const n1 = await lateInvoiceTasks();
  const n2 = await lateInvoiceTasks();
  assert.ok(n1 >= 1);
  assert.equal(n2, 0);
});

test("lien StratCyber : retard détecté, signature envoyée, aucune donnée de facture transmise", async () => {
  process.env.STRATCYBER_URL = "http://stratcyber.test";
  process.env.STRATCYBER_WEBHOOK_SECRET = "secret-de-test";
  const sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const { syncStratcyber } = await import("../src/server/stratcyber-sync");
    const { signPayload } = await import("../src/lib/stratcyber-link");
    const r = await syncStratcyber();
    assert.ok(r.ok, r.message);
    const status = sent.find((s) => s.body.event === "payment.status")!;
    assert.equal(status.body.status, "en_retard");
    assert.ok((status.body.overdueDays as number) >= 10);
    assert.equal(status.headers["x-infracyb-signature"], signPayload("secret-de-test", status.headers["x-infracyb-timestamp"], JSON.stringify(status.body)));
    for (const s of sent) assert.deepEqual(Object.keys(s.body).sort().filter((k) => !["event", "crmId", "name", "sector", "status", "overdueDays"].includes(k)), []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("lectures des pages : recherche insensible à la casse, tableau de bord, finances, listes", async () => {
  const q = await import("../src/server/queries");
  const f = await import("../src/server/finance");
  const found = await q.listCompanies({ q: "%CABINET%" });
  assert.ok(found.length >= 1);
  assert.ok(await q.getCompany(companyId));
  const invs = await q.listInvoices();
  assert.ok(invs.length >= 5);
  assert.ok(typeof invs[0].totals.ttc === "number");
  assert.ok(await q.getInvoice(invs[0].id));
  await q.listQuotes();
  assert.ok(Array.isArray(await q.listTasks("late")));
  await q.listCatalog();
  const d = await q.dashboardData();
  assert.ok(d);
  await q.getProfile();
  await q.prospectList();
  const fd = await f.financeData();
  assert.ok(fd);
  assert.equal(typeof (await f.cashYearHt()), "number");
});
