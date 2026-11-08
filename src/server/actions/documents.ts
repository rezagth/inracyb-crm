"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { computeTotals, isDraftNumber } from "@/lib/billing";
import { PAY_METHODS, UNITS, stageRank } from "@/lib/constants";
import { addDays, eur, parseEuroToCents, today } from "@/lib/format";
import { draftNumber, getSettings, logEvent, nextNumber, type DbOrTx } from "../core";
import { autoOn, bumpRuns } from "../automations";

type Result = { ok: true; id: string; message?: string } | { ok: false; error: string };

const lineSchema = z.object({
  label: z.string().trim().max(500),
  quantity: z.coerce.number().min(0).max(100_000),
  unit: z.enum(UNITS),
  unitPrice: z.string().max(20),
});

const docSchema = z.object({
  companyId: z.string().min(1, "Choisis le client.").max(64),
  subject: z.string().trim().max(300).default(""),
  issueDate: z.iso.date("Date invalide."),
  dueDate: z.iso.date("Date d'échéance invalide."),
  discountPct: z.string().max(10).default("0"),
  note: z.string().max(4000).default(""),
  lines: z.array(lineSchema).max(200),
});
export type DocInput = z.input<typeof docSchema>;

async function prepare(input: unknown) {
  const parsed = docSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Document invalide." } as const;
  const v = parsed.data;
  const lines = v.lines
    .map((l) => ({ label: l.label, quantity: l.quantity || 1, unit: l.unit, unitPriceCents: parseEuroToCents(l.unitPrice) }))
    .filter((l) => l.label || l.unitPriceCents);
  if (!lines.length) return { error: "Ajoute au moins une ligne." } as const;
  if (lines.some((l) => !l.label)) return { error: "Chaque ligne doit avoir une désignation." } as const;
  const discountBp = Math.round(Math.min(100, Math.max(0, Number(String(v.discountPct).replace(",", ".")) || 0)) * 100);
  const totals = computeTotals(lines, discountBp, (await getSettings()).tvaFranchise);
  if (totals.ht <= 0) return { error: "Le total doit être supérieur à 0." } as const;
  const company = (await db.select().from(schema.companies).where(eq(schema.companies.id, v.companyId)).limit(1))[0];
  if (!company) return { error: "Client introuvable." } as const;
  return { v, lines, discountBp, totals, company, subject: v.subject || lines[0].label } as const;
}

async function bumpStage(tx: DbOrTx, companyId: string, target: string) {
  const c = (await tx.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1))[0];
  if (c && c.stage !== "perdu" && stageRank(c.stage) < stageRank(target)) await tx.update(schema.companies).set({ stage: target, lastContact: today() }).where(eq(schema.companies.id, companyId));
}

/* =============================== DEVIS =============================== */

export async function saveQuoteAction(id: string | null, emit: boolean, input: DocInput): Promise<Result> {
  await requireUser();
  const p = (await prepare(input));
  if ("error" in p) return { ok: false, error: p.error as string };
  const s = (await getSettings());
  if (id) {
    const q = (await db.select().from(schema.quotes).where(eq(schema.quotes.id, id)).limit(1))[0];
    if (!q) return { ok: false, error: "Devis introuvable." };
    if (q.status !== "brouillon") return { ok: false, error: "Un devis émis ne se modifie plus : duplique-le." };
  }
  const qid = (await db.transaction(async (tx) => {
      const values = {
        companyId: p.v.companyId,
        subject: p.subject,
        issueDate: p.v.issueDate,
        validUntil: p.v.dueDate,
        discountBp: p.discountBp,
        note: p.v.note,
        totalHtCents: p.totals.ht,
        status: emit ? "envoye" : "brouillon",
      };
      let qid = id;
      if (qid) await tx.update(schema.quotes).set(values).where(eq(schema.quotes.id, qid));
      else qid = (await tx.insert(schema.quotes).values({ ...values, number: draftNumber() }).returning({ id: schema.quotes.id }))[0].id;
      await tx.delete(schema.quoteLines).where(eq(schema.quoteLines.quoteId, qid));
      for (const [i, l] of p.lines.entries()) await tx.insert(schema.quoteLines).values({ ...l, quoteId: qid!, position: i });
      let number = (await tx.select({ n: schema.quotes.number }).from(schema.quotes).where(eq(schema.quotes.id, qid)).limit(1))[0]!.n;
      if (emit && isDraftNumber(number)) {
        number = (await nextNumber(tx, "quote", s.quotePrefix, p.v.issueDate));
        await tx.update(schema.quotes).set({ number }).where(eq(schema.quotes.id, qid));
        await bumpStage(tx, p.v.companyId, "devis");
      }
      await logEvent(tx, p.v.companyId, "quote", `Devis ${emit ? number + " émis" : "enregistré en brouillon"} — ${eur(p.totals.ht)} HT`);
      return qid;
    }));
  revalidatePath("/", "layout");
  return { ok: true, id: qid, message: emit ? "Devis émis" : "Brouillon enregistré" };
}

export async function emitQuoteAction(id: string): Promise<Result> {
  await requireUser();
  const s = (await getSettings());
  const q = (await db.select().from(schema.quotes).where(eq(schema.quotes.id, id)).limit(1))[0];
  if (!q) return { ok: false, error: "Devis introuvable." };
  if (q.status !== "brouillon") return { ok: false, error: "Ce devis est déjà émis." };
  await db.transaction(async (tx) => {
            const number = isDraftNumber(q.number) ? (await nextNumber(tx, "quote", s.quotePrefix, q.issueDate)) : q.number;
            await tx.update(schema.quotes).set({ status: "envoye", number }).where(eq(schema.quotes.id, id));
            await bumpStage(tx, q.companyId, "devis");
            await logEvent(tx, q.companyId, "quote", `Devis ${number} émis — ${eur(q.totalHtCents)} HT`);
          });
  revalidatePath("/", "layout");
  return { ok: true, id, message: "Devis émis" };
}

export async function acceptQuoteAction(id: string, signer: string): Promise<Result> {
  await requireUser();
  const name = z.string().trim().min(2, "Indique le nom et la fonction du signataire.").max(200).safeParse(signer);
  if (!name.success) return { ok: false, error: name.error.issues[0].message };
  const q = (await db.select().from(schema.quotes).where(eq(schema.quotes.id, id)).limit(1))[0];
  if (!q || q.status !== "envoye") return { ok: false, error: "Seul un devis envoyé peut être accepté." };
  await db.transaction(async (tx) => {
            await tx.update(schema.quotes).set({ status: "accepte", signedBy: name.data, signedAt: new Date() }).where(eq(schema.quotes.id, id));
            await tx.update(schema.companies).set({ stage: "gagne", lastContact: today() }).where(eq(schema.companies.id, q.companyId));
            await logEvent(tx, q.companyId, "quote", `Devis ${q.number} accepté par ${name.data}`);
          });
  if ((await autoOn("acompte"))) {
    const r = await invoiceFromQuoteAction(id, "30");
    if (r.ok) {
      await db.transaction(async (tx) => (await bumpRuns(tx, "acompte")));
      return { ok: true, id, message: "Accord enregistré · facture d'acompte de 30 % créée en brouillon" };
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, id, message: "Accord enregistré · tu peux facturer" };
}

export async function refuseQuoteAction(id: string): Promise<Result> {
  await requireUser();
  const q = (await db.select().from(schema.quotes).where(eq(schema.quotes.id, id)).limit(1))[0];
  if (!q || q.status !== "envoye") return { ok: false, error: "Seul un devis envoyé peut être refusé." };
  await db.transaction(async (tx) => {
            await tx.update(schema.quotes).set({ status: "refuse" }).where(eq(schema.quotes.id, id));
            await logEvent(tx, q.companyId, "quote", `Devis ${q.number} refusé`);
          });
  revalidatePath("/", "layout");
  return { ok: true, id, message: "Devis marqué refusé" };
}

export async function invoiceFromQuoteAction(quoteId: string, part: "100" | "30" | "50" | "solde"): Promise<Result> {
  await requireUser();
  const s = (await getSettings());
  const q = await db.query.quotes.findFirst({ where: eq(schema.quotes.id, quoteId), with: { lines: true, invoices: true } });
  if (!q || q.status !== "accepte") return { ok: false, error: "Le devis doit être accepté avant d'être facturé." };
  const already = q.invoices.filter((i) => i.kind === "facture" && i.status !== "annulee").reduce((a, i) => a + i.totalHtCents, 0);
  let lines: { label: string; quantity: number; unit: string; unitPriceCents: number }[];
  let subject: string;
  if (part === "100") {
    if (already > 0) return { ok: false, error: "Ce devis est déjà partiellement facturé : choisis « Solde »." };
    lines = q.lines.map((l) => ({ label: l.label, quantity: l.quantity, unit: l.unit, unitPriceCents: l.unitPriceCents }));
    subject = `${q.subject} (${q.number})`;
  } else {
    const amount = part === "solde" ? q.totalHtCents - already : Math.round((q.totalHtCents * Number(part)) / 100);
    if (amount <= 0) return { ok: false, error: "Ce devis est déjà entièrement facturé." };
    if (already + amount > q.totalHtCents) return { ok: false, error: `Le montant dépasse le devis (déjà facturé : ${eur(already)} HT).` };
    subject = `${part === "solde" ? "Solde" : `Acompte ${part} %`} — ${q.subject} (${q.number})`;
    lines = [{ label: subject, quantity: 1, unit: "forfait", unitPriceCents: amount }];
  }
  const totals = computeTotals(lines, part === "100" ? q.discountBp : 0, s.tvaFranchise);
  const id = (await db.transaction(async (tx) => {
      const inv = (await tx
            .insert(schema.invoices)
            .values({ number: draftNumber(), companyId: q.companyId, subject, status: "brouillon", issueDate: today(), dueDate: addDays(today(), s.payDays), discountBp: part === "100" ? q.discountBp : 0, totalHtCents: totals.ht, quoteId: q.id })
            .returning({ id: schema.invoices.id }))[0];
      for (const [i, l] of lines.entries()) await tx.insert(schema.invoiceLines).values({ ...l, invoiceId: inv.id, position: i });
      await logEvent(tx, q.companyId, "invoice", `Facture créée depuis ${q.number} (brouillon) — ${eur(totals.ht)} HT`);
      return inv.id;
    }));
  revalidatePath("/", "layout");
  return { ok: true, id, message: "Facture créée en brouillon" };
}

/* ============================== FACTURES ============================== */

export async function saveInvoiceAction(id: string | null, emit: boolean, input: DocInput): Promise<Result> {
  await requireUser();
  const p = (await prepare(input));
  if ("error" in p) return { ok: false, error: p.error as string };
  const s = (await getSettings());
  if (id) {
    const inv = (await db.select().from(schema.invoices).where(eq(schema.invoices.id, id)).limit(1))[0];
    if (!inv) return { ok: false, error: "Facture introuvable." };
    if (inv.status !== "brouillon") return { ok: false, error: "Une facture émise ne se modifie plus : crée un avoir." };
  }
  const iid = (await db.transaction(async (tx) => {
      const values = {
        companyId: p.v.companyId,
        subject: p.subject,
        issueDate: p.v.issueDate,
        dueDate: p.v.dueDate,
        discountBp: p.discountBp,
        note: p.v.note,
        totalHtCents: p.totals.ht,
        status: emit ? "envoyee" : "brouillon",
      };
      let iid = id;
      if (iid) await tx.update(schema.invoices).set(values).where(eq(schema.invoices.id, iid));
      else iid = (await tx.insert(schema.invoices).values({ ...values, number: draftNumber() }).returning({ id: schema.invoices.id }))[0].id;
      await tx.delete(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, iid));
      for (const [i, l] of p.lines.entries()) await tx.insert(schema.invoiceLines).values({ ...l, invoiceId: iid!, position: i });
      let number = (await tx.select({ n: schema.invoices.number }).from(schema.invoices).where(eq(schema.invoices.id, iid)).limit(1))[0]!.n;
      if (emit && isDraftNumber(number)) {
        number = (await nextNumber(tx, "invoice", s.invoicePrefix, p.v.issueDate));
        await tx.update(schema.invoices).set({ number }).where(eq(schema.invoices.id, iid));
      }
      await logEvent(tx, p.v.companyId, "invoice", `Facture ${emit ? number + " émise" : "enregistrée en brouillon"} — ${eur(p.totals.ht)} HT`);
      return iid;
    }));
  revalidatePath("/", "layout");
  return { ok: true, id: iid, message: emit ? "Facture émise" : "Brouillon enregistré" };
}

export async function emitInvoiceAction(id: string): Promise<Result> {
  await requireUser();
  const s = (await getSettings());
  const inv = (await db.select().from(schema.invoices).where(eq(schema.invoices.id, id)).limit(1))[0];
  if (!inv) return { ok: false, error: "Facture introuvable." };
  if (inv.status !== "brouillon") return { ok: false, error: "Cette facture est déjà émise." };
  const number = (await db.transaction(async (tx) => {
      const number = isDraftNumber(inv.number) ? (await nextNumber(tx, "invoice", s.invoicePrefix, inv.issueDate)) : inv.number;
      await tx.update(schema.invoices).set({ status: "envoyee", number }).where(eq(schema.invoices.id, id));
      await logEvent(tx, inv.companyId, "invoice", `Facture ${number} émise — ${eur(inv.totalHtCents)} HT`);
      return number;
    }));
  revalidatePath("/", "layout");
  return { ok: true, id, message: `Facture ${number} émise` };
}

const paymentSchema = z.object({ amount: z.string().min(1), date: z.iso.date("Date invalide."), method: z.enum(PAY_METHODS) });

export async function addPaymentAction(id: string, input: { amount: string; date: string; method: string }): Promise<Result> {
  await requireUser();
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Paiement invalide." };
  const s = (await getSettings());
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, id), with: { lines: true, payments: true } });
  if (!inv || inv.kind !== "facture" || inv.status !== "envoyee") return { ok: false, error: "On ne peut encaisser qu'une facture émise et non soldée." };
  const amount = parseEuroToCents(parsed.data.amount);
  const t = computeTotals(inv.lines, inv.discountBp, s.tvaFranchise, inv.payments.reduce((a, x) => a + x.amountCents, 0));
  if (amount <= 0) return { ok: false, error: "Le montant doit être positif." };
  if (amount > t.rest) return { ok: false, error: `Le paiement dépasse le reste dû (${eur(t.rest)}).` };
  await db.transaction(async (tx) => {
            await tx.insert(schema.payments).values({ invoiceId: id, amountCents: amount, date: parsed.data.date, method: parsed.data.method });
            if (amount === t.rest) await tx.update(schema.invoices).set({ status: "payee" }).where(eq(schema.invoices.id, id));
            await logEvent(tx, inv.companyId, "payment", `Paiement reçu — ${eur(amount)} sur la facture ${inv.number}`);
          });
  revalidatePath("/", "layout");
  return { ok: true, id, message: amount === t.rest ? "Facture soldée" : `Paiement enregistré · reste ${eur(t.rest - amount)}` };
}

export async function createCreditNoteAction(id: string): Promise<Result> {
  await requireUser();
  const s = (await getSettings());
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, id), with: { lines: true, payments: true } });
  if (!inv || inv.kind !== "facture" || inv.status !== "envoyee") return { ok: false, error: "Seule une facture émise et non payée peut être annulée par un avoir." };
  if (inv.payments.length) return { ok: false, error: "Cette facture a déjà reçu un paiement : rapproche-toi de ton comptable pour l'avoir." };
  const avId = (await db.transaction(async (tx) => {
      const number = (await nextNumber(tx, "credit", s.creditPrefix));
      const av = (await tx
            .insert(schema.invoices)
            .values({ number, kind: "avoir", companyId: inv.companyId, subject: `Avoir sur la facture ${inv.number}`, status: "emis", issueDate: today(), dueDate: today(), discountBp: inv.discountBp, totalHtCents: -inv.totalHtCents, creditForId: inv.id })
            .returning({ id: schema.invoices.id }))[0];
      for (const [i, l] of inv.lines.entries()) await tx.insert(schema.invoiceLines).values({ invoiceId: av.id, position: i, label: l.label, quantity: l.quantity, unit: l.unit, unitPriceCents: -l.unitPriceCents });
      await tx.update(schema.invoices).set({ status: "annulee" }).where(eq(schema.invoices.id, inv.id));
      await logEvent(tx, inv.companyId, "invoice", `Avoir ${number} émis — facture ${inv.number} annulée`);
      return av.id;
    }));
  revalidatePath("/", "layout");
  return { ok: true, id: avId, message: "Avoir créé · facture annulée" };
}

export async function logReminderAction(id: string, level: number): Promise<Result> {
  await requireUser();
  const inv = (await db.select().from(schema.invoices).where(eq(schema.invoices.id, id)).limit(1))[0];
  if (!inv) return { ok: false, error: "Facture introuvable." };
  const labels = ["", "Rappel courtois", "Relance ferme", "Mise en demeure"];
  await db.transaction(async (tx) => {
            await tx.insert(schema.reminders).values({ invoiceId: id, level });
            await logEvent(tx, inv.companyId, "mail", `${labels[level] ?? "Relance"} envoyé — facture ${inv.number}`);
          });
  revalidatePath(`/factures/${id}`);
  return { ok: true, id, message: `${labels[level]} noté` };
}

export async function deleteDraftAction(kind: "devis" | "facture", id: string): Promise<Result> {
  await requireUser();
  const table = kind === "devis" ? schema.quotes : schema.invoices;
  const row = (await db.select().from(table).where(and(eq(table.id, id), eq(table.status, "brouillon"))).limit(1))[0];
  if (!row) return { ok: false, error: "Seul un brouillon peut être supprimé." };
  await db.delete(table).where(eq(table.id, id));
  revalidatePath("/", "layout");
  return { ok: true, id, message: "Brouillon supprimé" };
}
