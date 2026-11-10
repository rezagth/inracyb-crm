import "server-only";
import { and, asc, desc, eq, ilike, inArray, like, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeTotals, invoiceDisplayStatus, type Totals } from "@/lib/billing";
import { today } from "@/lib/format";
import { getSettings } from "./core";

/* ---------- entreprises ---------- */
export function listCompanies(opts: { q?: string; stage?: string; status?: string } = {}) {
  const conds = [];
  if (opts.q) {
    const q = `%${opts.q}%`;
    conds.push(or(ilike(schema.companies.name, q), ilike(schema.companies.sector, q), ilike(schema.companies.city, q)));
  }
  if (opts.stage) conds.push(eq(schema.companies.stage, opts.stage));
  if (opts.status === "prospect") conds.push(eq(schema.companies.stage, "qualif"));
  if (opts.status === "discussion") conds.push(inArray(schema.companies.stage, ["contacte", "rdv", "devis", "nego"]));
  if (opts.status === "client") conds.push(eq(schema.companies.stage, "gagne"));
  if (opts.status === "perdu") conds.push(eq(schema.companies.stage, "perdu"));
  return db.query.companies.findMany({
    where: conds.length ? and(...conds) : undefined,
    orderBy: [desc(schema.companies.updatedAt)],
    with: { contacts: { where: eq(schema.contacts.isPrimary, true), limit: 1 } },
  });
}

export function getCompany(id: string) {
  return db.query.companies.findFirst({
    where: eq(schema.companies.id, id),
    with: {
      contacts: { orderBy: [desc(schema.contacts.isPrimary), asc(schema.contacts.firstName)] },
      events: { orderBy: [desc(schema.events.createdAt)], limit: 100 },
      tasks: { orderBy: [asc(schema.tasks.done), asc(schema.tasks.dueDate)] },
      quotes: { orderBy: [desc(schema.quotes.createdAt)] },
      invoices: { orderBy: [desc(schema.invoices.createdAt)], with: { payments: true, lines: true } },
      calls: { orderBy: [desc(schema.calls.date)], limit: 20 },
      meetings: { orderBy: [desc(schema.meetings.date)], limit: 20 },
      contracts: true,
      missions: { with: { times: { columns: { hours: true } } } },
      securityActions: true,
      tickets: true,
      incidents: true,
      audits: true,
    },
  });
}

export async function companyOptions() {
  return (await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).orderBy(asc(schema.companies.name)));
}

/* ---------- factures ---------- */
export type InvoiceWithTotals = Awaited<ReturnType<typeof listInvoices>>[number];

export async function invoiceTotals(inv: { lines: { quantity: number; unitPriceCents: number }[]; discountBp: number; payments: { amountCents: number }[] }): Promise<Totals> {
  const s = (await getSettings());
  const paid = inv.payments.reduce((a, p) => a + p.amountCents, 0);
  return computeTotals(inv.lines, inv.discountBp, s.tvaFranchise, paid);
}

export async function listInvoices() {
  const rows = await db.query.invoices.findMany({
    orderBy: [desc(schema.invoices.issueDate), desc(schema.invoices.createdAt)],
    with: { company: true, lines: true, payments: true },
  });
  const t = today();
  return Promise.all(
    rows.map(async (r) => {
      const totals = await invoiceTotals(r);
      return { ...r, totals, display: invoiceDisplayStatus(r, totals, t) };
    }),
  );
}

export async function getInvoice(id: string) {
  const r = await db.query.invoices.findFirst({
    where: eq(schema.invoices.id, id),
    with: {
      company: { with: { contacts: { orderBy: [desc(schema.contacts.isPrimary)] } } },
      lines: { orderBy: [asc(schema.invoiceLines.position)] },
      payments: { orderBy: [asc(schema.payments.date)] },
      reminders: { orderBy: [asc(schema.reminders.sentAt)] },
      quote: true,
    },
  });
  if (!r) return null;
  const totals = (await invoiceTotals(r));
  return { ...r, totals, display: invoiceDisplayStatus(r, totals, today()) };
}

/* ---------- devis ---------- */
export async function listQuotes() {
  const s = (await getSettings());
  const rows = await db.query.quotes.findMany({
    orderBy: [desc(schema.quotes.issueDate), desc(schema.quotes.createdAt)],
    with: { company: true, lines: true, invoices: { columns: { id: true, totalHtCents: true, status: true, kind: true } } },
  });
  return rows.map((r) => ({ ...r, totals: computeTotals(r.lines, r.discountBp, s.tvaFranchise) }));
}

export async function getQuote(id: string) {
  const s = (await getSettings());
  const r = await db.query.quotes.findFirst({
    where: eq(schema.quotes.id, id),
    with: {
      company: { with: { contacts: { orderBy: [desc(schema.contacts.isPrimary)] } } },
      lines: { orderBy: [asc(schema.quoteLines.position)] },
      invoices: true,
    },
  });
  if (!r) return null;
  const invoicedHt = r.invoices.filter((i) => i.status !== "annulee" && i.kind === "facture").reduce((a, i) => a + i.totalHtCents, 0);
  return { ...r, totals: computeTotals(r.lines, r.discountBp, s.tvaFranchise), invoicedHt };
}

/* ---------- tâches, catalogue ---------- */
export function listTasks(filter: "todo" | "late" | "done" | "all" = "todo") {
  const t = today();
  const where =
    filter === "todo" ? eq(schema.tasks.done, false) : filter === "done" ? eq(schema.tasks.done, true) : filter === "late" ? and(eq(schema.tasks.done, false), sql`${schema.tasks.dueDate} < ${t}`) : undefined;
  return db.query.tasks.findMany({ where, orderBy: [asc(schema.tasks.done), asc(schema.tasks.dueDate)], with: { company: { columns: { id: true, name: true } } } });
}

export async function listCatalog(activeOnly = false) {
  return (await db.select().from(schema.catalogItems).where(activeOnly ? eq(schema.catalogItems.active, true) : undefined).orderBy(asc(schema.catalogItems.offer), asc(schema.catalogItems.name)));
}

/* ---------- tableau de bord ---------- */
export async function dashboardData() {
  const t = today();
  const year = t.slice(0, 4);
  const month = t.slice(0, 7);
  const companies = (await db.select().from(schema.companies));
  const invoices = await listInvoices();
  const pays = (await db.select().from(schema.payments));
  const s = (await getSettings());
  const toHt = (c: number) => (s.tvaFranchise ? c : Math.round(c / 1.2));
  const cashYear = pays.filter((p) => p.date.startsWith(year)).reduce((a, p) => a + toHt(p.amountCents), 0);
  const cashMonth = pays.filter((p) => p.date.startsWith(month)).reduce((a, p) => a + toHt(p.amountCents), 0);
  const open = invoices.filter((i) => i.kind === "facture" && i.status === "envoyee" && i.totals.rest > 0);
  const late = open.filter((i) => i.dueDate < t);
  const months: { key: string; label: string; cents: number }[] = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(t + "T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - k, 1);
    const key = d.toISOString().slice(0, 7);
    months.push({
      key,
      label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d),
      cents: pays.filter((p) => p.date.startsWith(key)).reduce((a, p) => a + toHt(p.amountCents), 0),
    });
  }
  const tasksToday = db.query.tasks.findMany({ where: and(eq(schema.tasks.done, false), sql`${schema.tasks.dueDate} <= ${t}`), orderBy: [asc(schema.tasks.dueDate)], with: { company: { columns: { id: true, name: true } } }, limit: 8 });
  const quotesSent = (await db.select({ c: sql<number>`count(*)::int` }).from(schema.quotes).where(eq(schema.quotes.status, "envoye")).limit(1))[0]?.c ?? 0;
  const recent = db.query.events.findMany({ orderBy: [desc(schema.events.createdAt)], limit: 8, with: { company: { columns: { id: true, name: true } } } });
  return {
    settings: s,
    openDeals: companies.filter((c) => !["gagne", "perdu"].includes(c.stage)),
    clients: companies.filter((c) => c.stage === "gagne").length,
    pipelineCents: companies.filter((c) => !["gagne", "perdu"].includes(c.stage)).reduce((a, c) => a + c.amountCents, 0),
    cashYear,
    cashMonth,
    dueCents: open.reduce((a, i) => a + i.totals.rest, 0),
    late,
    months,
    tasksToday: await tasksToday,
    quotesSent,
    recent: await recent,
  };
}

/* ---------- profil de prospection ---------- */
export async function getProfile() {
  const s = (await getSettings());
  return {
    me: s.legalName,
    company: s.tradeName,
    iaBrand: s.iaBrand,
    phone: s.phone,
    email: s.email,
    website: s.website,
    prixAuditCents: s.prixAuditCents,
    calUrl: s.calUrl,
  };
}

/** Prospects avec leur contact principal, au format attendu par le moteur de scripts. */
export async function prospectList() {
  const rows = await db.query.companies.findMany({
    orderBy: [asc(schema.companies.name)],
    with: { contacts: { orderBy: [desc(schema.contacts.isPrimary)], limit: 1 } },
  });
  return rows.map((c) => {
    const ct = c.contacts[0];
    return {
      id: c.id,
      name: c.name,
      sector: c.sector,
      stage: c.stage,
      priority: c.priority,
      offer: c.offer,
      lastContact: c.lastContact,
      contact: ct ? [ct.firstName, ct.lastName].filter(Boolean).join(" ") : "",
      role: ct?.role ?? "",
      email: ct?.email ?? "",
      phone: ct?.phone ?? "",
    };
  });
}
