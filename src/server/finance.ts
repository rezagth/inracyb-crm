import "server-only";
import { db, schema } from "@/db";
import { listInvoices } from "./queries";
import { getSettings } from "./core";
import { addDays, today } from "@/lib/format";
import { MONTHS_FR, urssafPeriod } from "@/lib/fiscal";

/** Encaissements de l'année, hors taxes, en centimes (partagé avec les rappels fiscaux automatiques). */
export async function cashYearHt(settings?: Awaited<ReturnType<typeof getSettings>>, year = today().slice(0, 4)): Promise<number> {
  const s = settings ?? (await getSettings());
  const toHt = (c: number) => (s.tvaFranchise ? c : Math.round(c / 1.2));
  return (await db.select().from(schema.payments)).filter((p) => p.date.startsWith(year)).reduce((a, p) => a + toHt(p.amountCents), 0);
}

/** Indicateurs de trésorerie partagés (Trésorerie, Rentabilité, tableau de bord). Montants en centimes. */
export async function financeData() {
  const s = (await getSettings());
  const t = today();
  const year = t.slice(0, 4);
  const toHt = (c: number) => (s.tvaFranchise ? c : Math.round(c / 1.2));
  const pays = (await db.select().from(schema.payments));
  const cashYear = pays.filter((p) => p.date.startsWith(year)).reduce((a, p) => a + toHt(p.amountCents), 0);
  const expenses = (await db.select().from(schema.expenses));
  const expYear = expenses.filter((e) => e.date.startsWith(year)).reduce((a, e) => a + e.amountCents, 0);
  const expMonth = expenses.filter((e) => e.date.startsWith(t.slice(0, 7))).reduce((a, e) => a + e.amountCents, 0);
  const recurMonthly = Math.round(expenses.reduce((a, e) => a + (e.recurring === "Mensuel" ? e.amountCents : e.recurring === "Annuel" ? e.amountCents / 12 : 0), 0));
  const effRate = s.socialRate * (s.acre ? 1 - s.acreRate / 100 : 1) + s.cfpRate + (s.vlEnabled ? s.vlRate : 0);
  const cotisYear = Math.round((cashYear * effRate) / 100);
  const mrr = (await db.select().from(schema.contracts)).filter((c) => c.status === "actif").reduce((a, c) => a + c.monthlyCents, 0);
  const invoices = await listInvoices();
  const due = invoices.filter((i) => i.kind === "facture" && i.status === "envoyee").reduce((a, i) => a + i.totals.rest, 0);

  // Prochaine déclaration URSSAF et période couverte (voir lib/fiscal.ts).
  const { label, from, to, deadline } = urssafPeriod(t, s.urssafPeriod);
  const MONTHS = MONTHS_FR;
  const [y, m] = t.split("-").map(Number);
  const urssafBase = pays.filter((p) => p.date >= from && p.date <= to).reduce((a, p) => a + toHt(p.amountCents), 0);

  const months: { key: string; label: string; cents: number }[] = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1));
    const key = d.toISOString().slice(0, 7);
    months.push({ key, label: MONTHS[d.getUTCMonth()], cents: pays.filter((p) => p.date.startsWith(key)).reduce((a, p) => a + toHt(p.amountCents), 0) });
  }
  return {
    s,
    cashYear,
    expYear,
    expMonth,
    recurMonthly,
    effRate,
    cotisYear,
    mrr,
    due,
    urssaf: { label, deadline, base: urssafBase, amount: Math.round((urssafBase * effRate) / 100) },
    forecast: mrr * 3 + due - recurMonthly * 3,
    months,
    expenses,
    in30: addDays(t, 30),
  };
}
