"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { addDays, eur, parseEuroToCents, today } from "@/lib/format";
import { stageRank } from "@/lib/constants";
import * as F from "@/lib/forms";
import { logEvent, type DbOrTx } from "../core";

export type RecordResult = { ok: true; id: string; message: string } | { ok: false; error: string };

const str = (max = 300) => z.string().trim().max(max).default("");
const req = (msg: string, max = 300) => z.string().trim().min(1, msg).max(max);
const date = z.union([z.iso.date("Date invalide."), z.literal("")]).default("");
const reqDate = z.iso.date("Date invalide.");
const company = z.string().min(1, "Choisis le client.").max(64);
const optCompany = z.string().max(64).default("");
const pos = (msg: string) => z.string().refine((v) => parseEuroToCents(v) > 0, msg);
const oneOf = <T extends readonly (readonly [string, string])[]>(opts: T) => z.enum(opts.map((x) => x[0]) as [string, ...string[]]);
const listOf = (xs: readonly string[]) => z.enum(xs as unknown as [string, ...string[]]);
const hours = (v: string) => Number(String(v).replace(",", "."));

async function companyName(tx: DbOrTx, id: string) {
  return (await tx.select({ n: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, id)).limit(1))[0]?.n ?? "";
}
async function assertCompany(id: string) {
  if (id && !(await db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.id, id)).limit(1))[0]) throw new Error("Entreprise introuvable.");
}
async function bumpStage(tx: DbOrTx, companyId: string, target: string) {
  const c = (await tx.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1))[0];
  if (c && c.stage !== "perdu" && stageRank(c.stage) < stageRank(target)) await tx.update(schema.companies).set({ stage: target, lastContact: today() }).where(eq(schema.companies.id, companyId));
}
async function addTask(tx: DbOrTx, title: string, companyId: string | null, due: string, priority = "moyenne") {
  await tx.insert(schema.tasks).values({ title: title.slice(0, 300), companyId, dueDate: due, priority });
}
async function autoEnabled(key: string) {
  const row = (await db.select().from(schema.automations).where(eq(schema.automations.key, key)).limit(1))[0];
  return row ? row.enabled : true;
}
async function bumpRuns(tx: DbOrTx, key: string) {
  await tx.insert(schema.automations).values({ key, runs: 1, lastRunAt: new Date() }).onConflictDoUpdate({ target: schema.automations.key, set: { runs: sql`${schema.automations.runs} + 1`, lastRunAt: new Date() } });
}

type Handler = { schema: z.ZodType<Record<string, string>>; save: (v: Record<string, string>, id: string | null) => Promise<{ id: string; message: string }> | { id: string; message: string } };

const H: Record<string, Handler> = {
  call: {
    schema: z.object({ companyId: company, date: reqDate, result: listOf(F.CALL_RESULTS), durationMin: z.string().default("0"), note: str(2000) }) as never,
    save: async (v) =>
      (await db.transaction(async (tx) => {
                const r = (await tx.insert(schema.calls).values({ companyId: v.companyId, date: v.date, result: v.result, durationMin: Math.max(0, Math.round(Number(v.durationMin) || 0)), note: v.note }).returning())[0];
                await logEvent(tx, v.companyId, "call", `Appel — ${v.result}${v.note ? " · " + v.note : ""}`);
                await bumpStage(tx, v.companyId, v.result === "RDV obtenu" ? "rdv" : "contacte");
                await tx.update(schema.companies).set({ lastContact: v.date }).where(eq(schema.companies.id, v.companyId));
                return { id: r.id, message: "Appel enregistré" };
              })),
  },
  meeting: {
    schema: z.object({ companyId: optCompany, title: req("Indique l'objet du rendez-vous.", 200), date: reqDate, start: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide."), end: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide."), mode: listOf(F.MEETING_MODES), location: str(300), note: str(2000) }) as never,
    save: async (v, id) =>
      (await db.transaction(async (tx) => {
                const values = { ...v, companyId: v.companyId || null };
                let rid = id;
                if (rid) await tx.update(schema.meetings).set(values as never).where(eq(schema.meetings.id, rid));
                else rid = (await tx.insert(schema.meetings).values(values as never).returning())[0].id;
                if (!id && v.companyId) {
                  await logEvent(tx, v.companyId, "note", `Rendez-vous planifié : ${v.title} le ${v.date.split("-").reverse().join("/")} à ${v.start} (${v.mode})`);
                  await bumpStage(tx, v.companyId, "rdv");
                  if (v.date > today() && (await tx.select().from(schema.automations).where(eq(schema.automations.key, "rdvPrep")).limit(1))[0]?.enabled !== false) {
                    await addTask(tx, `Préparer le rendez-vous : ${v.title} — ${(await companyName(tx, v.companyId))}`, v.companyId, addDays(v.date, -1));
                    await bumpRuns(tx, "rdvPrep");
                  }
                }
                return { id: rid!, message: id ? "Rendez-vous mis à jour" : "Rendez-vous créé" };
              })),
  },
  partner: {
    schema: z.object({ name: req("Indique le nom.", 200), type: str(80), specialty: str(200), contact: str(300), commission: str(80), status: oneOf(F.PARTNER_STATUS) }) as never,
    save: async (v, id) => {
      if (id) await db.update(schema.partners).set(v as never).where(eq(schema.partners.id, id));
      else id = (await db.insert(schema.partners).values(v as never).returning())[0].id;
      return { id, message: "Partenaire enregistré" };
    },
  },
  contract: {
    schema: z.object({ companyId: company, offer: str(120), monthly: pos("Indique le montant mensuel."), notice: str(40), status: z.enum(["actif", "brouillon"]), start: reqDate, end: date }) as never,
    save: async (v) =>
      (await db.transaction(async (tx) => {
                const cents = parseEuroToCents(v.monthly);
                const r = (await tx.insert(schema.contracts).values({ companyId: v.companyId, offer: v.offer, monthlyCents: cents, notice: v.notice, status: v.status, start: v.start, end: v.end }).returning())[0];
                if (v.status === "actif") await tx.update(schema.companies).set({ stage: "gagne", lastContact: today() }).where(eq(schema.companies.id, v.companyId));
                await logEvent(tx, v.companyId, "quote", `Contrat ${v.offer} — ${eur(cents)} HT par mois (${v.status === "actif" ? "signé" : "brouillon"})`);
                return { id: r.id, message: "Contrat enregistré" };
              })),
  },
  mission: {
    schema: z.object({ companyId: company, title: req("Donne un intitulé à la mission.", 200), offer: str(80), budgetDays: z.string().default("0"), start: reqDate, due: reqDate, status: oneOf(F.MISSION_STATUS) }) as never,
    save: async (v) =>
      (await db.transaction(async (tx) => {
                const r = (await tx.insert(schema.missions).values({ companyId: v.companyId, title: v.title, offer: v.offer, budgetDays: Math.max(0, hours(v.budgetDays) || 0), start: v.start, due: v.due, status: v.status }).returning())[0];
                await logEvent(tx, v.companyId, "task", `Mission créée : ${v.title}`);
                return { id: r.id, message: "Mission créée" };
              })),
  },
  time: {
    schema: z.object({ date: reqDate, hours: z.string().refine((x) => hours(x) > 0 && hours(x) <= 24, "Indique une durée entre 0 et 24 h."), missionId: z.string().max(64).default(""), billable: z.enum(["oui", "non"]), description: str(500) }) as never,
    save: async (v) => {
      if (v.missionId && !(await db.select().from(schema.missions).where(eq(schema.missions.id, v.missionId)).limit(1))[0]) throw new Error("Mission introuvable.");
      const r = (await db.insert(schema.timeEntries).values({ date: v.date, hours: hours(v.hours), missionId: v.missionId || null, billable: v.billable === "oui", description: v.description }).returning())[0];
      return { id: r.id, message: `${String(hours(v.hours)).replace(".", ",")} h enregistrée(s)` };
    },
  },
  ticket: {
    schema: z.object({ companyId: company, priority: z.enum(["haute", "normale", "basse"]), subject: req("Indique le sujet.", 200), description: str(4000) }) as never,
    save: async (v) => {
      const hot = v.priority === "haute" && (await autoEnabled("ticket"));
      return db.transaction(async (tx) => {
        const r = (await tx.insert(schema.tickets).values({ companyId: v.companyId, priority: v.priority, subject: v.subject, description: v.description, openedOn: today() }).returning())[0];
        await logEvent(tx, v.companyId, "note", `Ticket ouvert : ${v.subject}`);
        if (hot) {
          await addTask(tx, `Ticket urgent : ${v.subject} — ${(await companyName(tx, v.companyId))}`, v.companyId, today(), "haute");
          await bumpRuns(tx, "ticket");
        }
        return { id: r.id, message: hot ? "Ticket créé · tâche urgente ajoutée pour aujourd'hui" : "Ticket créé" };
      });
    },
  },
  action: {
    schema: z.object({ companyId: company, title: req("Décris l'action.", 300), priority: oneOf(F.PRIO3), owner: str(40), due: date, status: oneOf(F.ACTION_STATUS) }) as never,
    save: async (v) =>
      (await db.transaction(async (tx) => {
                const r = (await tx.insert(schema.securityActions).values(v as never).returning())[0];
                await logEvent(tx, v.companyId, "note", `Action de sécurité ajoutée : ${v.title}`);
                return { id: r.id, message: "Action ajoutée au plan" };
              })),
  },
  audit: {
    schema: z.object({ companyId: company, date: reqDate }) as never,
    save: async (v) =>
      (await db.transaction(async (tx) => {
                const r = (await tx.insert(schema.audits).values({ companyId: v.companyId, date: v.date }).returning())[0];
                await logEvent(tx, v.companyId, "note", "Audit cyber démarré");
                return { id: r.id, message: "Audit démarré" };
              })),
  },
  incident: {
    schema: z.object({ companyId: company, date: reqDate, title: req("Décris l'incident.", 300), type: str(80), severity: z.enum(["faible", "moyenne", "grave"]), personalData: z.enum(["non", "oui", "inconnu"]), actions: str(4000) }) as never,
    save: async (v) =>
      (await db.transaction(async (tx) => {
                const r = (await tx.insert(schema.incidents).values(v as never).returning())[0];
                await logEvent(tx, v.companyId, "note", `Incident déclaré : ${v.title}`);
                await addTask(tx, `Suivre l'incident : ${v.title} — ${(await companyName(tx, v.companyId))}`, v.companyId, today(), v.severity === "grave" ? "haute" : "moyenne");
                return { id: r.id, message: v.personalData === "oui" ? "Incident enregistré · données personnelles : le client doit évaluer la notification CNIL (72 h)" : "Incident enregistré · tâche de suivi créée" };
              })),
  },
  expense: {
    schema: z.object({ supplier: req("Indique le fournisseur.", 200), date: reqDate, amount: pos("Indique le montant."), category: listOf(F.EXPENSE_CATS), recurring: z.enum(["Non", "Mensuel", "Annuel"]), proof: z.enum(["oui", "non"]) }) as never,
    save: async (v) => {
      const r = (await db.insert(schema.expenses).values({ supplier: v.supplier, date: v.date, amountCents: parseEuroToCents(v.amount), category: v.category, recurring: v.recurring, proof: v.proof === "oui" }).returning())[0];
      return { id: r.id, message: "Dépense enregistrée" };
    },
  },
  doc: {
    schema: z.object({ name: req("Donne un nom au document.", 200), type: str(60), status: oneOf(F.DOC_STATUS), companyId: optCompany, body: str(50_000) }) as never,
    save: async (v, id) => {
      const values = { ...v, companyId: v.companyId || null, updatedOn: today() };
      if (id) await db.update(schema.documents).set(values as never).where(eq(schema.documents.id, id));
      else id = (await db.insert(schema.documents).values(values as never).returning())[0].id;
      return { id, message: "Document enregistré" };
    },
  },
  kb: {
    schema: z.object({ title: req("Donne un titre.", 200), category: str(60), body: str(50_000) }) as never,
    save: async (v, id) => {
      const values = { ...v, updatedOn: today() };
      if (id) await db.update(schema.kbArticles).set(values as never).where(eq(schema.kbArticles.id, id));
      else id = (await db.insert(schema.kbArticles).values(values as never).returning())[0].id;
      return { id, message: "Article enregistré" };
    },
  },
  post: {
    schema: z.object({ topic: req("Indique le sujet.", 300), date: reqDate, network: str(40), pillar: str(60), status: oneOf(F.POST_STATUS) }) as never,
    save: async (v, id) => {
      if (id) await db.update(schema.posts).set(v as never).where(eq(schema.posts.id, id));
      else id = (await db.insert(schema.posts).values(v as never).returning())[0].id;
      return { id, message: "Publication enregistrée" };
    },
  },
  obligation: {
    schema: z.object({ title: req("Indique l'obligation.", 300), category: str(60), due: date, note: str(2000) }) as never,
    save: async (v, id) => {
      if (id) await db.update(schema.obligations).set(v as never).where(eq(schema.obligations.id, id));
      else id = (await db.insert(schema.obligations).values(v as never).returning())[0].id;
      return { id, message: "Obligation enregistrée" };
    },
  },
  rgpd: {
    schema: z.object({ name: req("Indique le traitement.", 200), purpose: str(300), basis: str(120), data: str(300), keep: str(200), status: oneOf(F.RGPD_STATUS) }) as never,
    save: async (v, id) => {
      if (id) await db.update(schema.rgpdRecords).set(v as never).where(eq(schema.rgpdRecords.id, id));
      else id = (await db.insert(schema.rgpdRecords).values(v as never).returning())[0].id;
      return { id, message: "Traitement enregistré" };
    },
  },
};

export async function saveRecordAction(form: string, id: string | null, values: Record<string, string>): Promise<RecordResult> {
  await requireUser();
  const h = H[form];
  if (!h) return { ok: false, error: "Formulaire inconnu." };
  const parsed = h.schema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  try {
    if ("companyId" in parsed.data) await assertCompany(parsed.data.companyId);
    const r = await h.save(parsed.data, id);
    revalidatePath("/", "layout");
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Enregistrement impossible." };
  }
}

/* ---------- modifications en ligne (listes) ---------- */
type Patch = { table: unknown; fields: Record<string, z.ZodType>; after?: (tx: DbOrTx, id: string, field: string, value: unknown) => string | void | Promise<string | void> };

const PATCH: Record<string, Patch> = {
  contract: { table: schema.contracts, fields: { status: oneOf(F.CONTRACT_STATUS) } },
  mission: {
    table: schema.missions,
    fields: { status: oneOf(F.MISSION_STATUS) },
    after: async (tx, id, _f, value) => {
      if (value !== "livree") return;
      const m = (await tx.select().from(schema.missions).where(eq(schema.missions.id, id)).limit(1))[0];
      if (!m) return;
      const on = (await tx.select().from(schema.automations).where(eq(schema.automations.key, "solde")).limit(1))[0]?.enabled !== false;
      await logEvent(tx, m.companyId, "task", `Mission livrée : ${m.title}`);
      const title = `Facturer le solde : ${m.title} — ${(await companyName(tx, m.companyId))}`;
      if (on && (await tx.select().from(schema.tasks).where(eq(schema.tasks.title, title)).limit(1))[0]) return "Mission livrée · la tâche « facturer le solde » existe déjà";
      if (on) {
        await addTask(tx, title, m.companyId, today(), "haute");
        await bumpRuns(tx, "solde");
        return "Mission livrée · tâche « facturer le solde » créée";
      }
      return "Mission livrée · pense à facturer le solde";
    },
  },
  time: { table: schema.timeEntries, fields: { billable: z.boolean() } },
  ticket: {
    table: schema.tickets,
    fields: { status: oneOf(F.TICKET_STATUS) },
    after: async (tx, id, _f, value) => {
      await tx.update(schema.tickets).set({ resolvedOn: value === "resolu" ? today() : null }).where(eq(schema.tickets.id, id));
      return value === "resolu" ? "Ticket résolu" : undefined;
    },
  },
  action: { table: schema.securityActions, fields: { status: oneOf(F.ACTION_STATUS) }, after: (_tx, _id, _f, v) => (v === "fait" ? "Action terminée" : undefined) },
  incident: { table: schema.incidents, fields: { status: oneOf(F.INCIDENT_STATUS) } },
  expense: { table: schema.expenses, fields: { proof: z.boolean() } },
  doc: {
    table: schema.documents,
    fields: { status: oneOf(F.DOC_STATUS) },
    after: async (tx, id) => void (await tx.update(schema.documents).set({ updatedOn: today() }).where(eq(schema.documents.id, id))),
  },
  post: { table: schema.posts, fields: { status: oneOf(F.POST_STATUS) } },
  obligation: { table: schema.obligations, fields: { done: z.boolean() }, after: (_tx, _id, _f, v) => (v ? "Obligation remplie" : "Obligation rouverte") },
  rgpd: { table: schema.rgpdRecords, fields: { status: oneOf(F.RGPD_STATUS) } },
  partner: { table: schema.partners, fields: { status: oneOf(F.PARTNER_STATUS), leads: z.number().int().min(0).max(10_000) } },
};

export async function patchRecordAction(entity: string, id: string, field: string, value: string | boolean | number): Promise<RecordResult> {
  await requireUser();
  const p = PATCH[entity];
  const fz = p?.fields[field];
  if (!p || !fz) return { ok: false, error: "Modification non autorisée." };
  const v = fz.safeParse(value);
  if (!v.success) return { ok: false, error: "Valeur invalide." };
  const table = p.table as typeof schema.missions;
  const msg = (await db.transaction(async (tx) => {
      const res = await tx.update(table).set({ [field]: v.data } as never).where(eq(table.id, id)).returning({ id: table.id });
      if (res.length === 0) throw new Error("Élément introuvable.");
      return (await p.after?.(tx, id, field, v.data));
    }));
  revalidatePath("/", "layout");
  return { ok: true, id, message: msg || "Modifié" };
}

const DELETABLE = { meeting: schema.meetings, partner: schema.partners, time: schema.timeEntries, expense: schema.expenses, doc: schema.documents, kb: schema.kbArticles, post: schema.posts, obligation: schema.obligations, rgpd: schema.rgpdRecords, action: schema.securityActions, call: schema.calls } as const;

export async function deleteRecordAction(entity: string, id: string): Promise<RecordResult> {
  await requireUser();
  const table = DELETABLE[entity as keyof typeof DELETABLE] as typeof schema.posts | undefined;
  if (!table) return { ok: false, error: "Suppression non autorisée." };
  await db.delete(table).where(eq(table.id, id));
  revalidatePath("/", "layout");
  return { ok: true, id, message: "Supprimé" };
}
