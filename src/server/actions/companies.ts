"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { OFFERS, PRIORITIES, SECTORS, SOURCES, STAGE_IDS, stageOf } from "@/lib/constants";
import { parseEuroToCents, today } from "@/lib/format";
import { logEvent, type ActionResult } from "../core";
import { autoOn, bumpRuns } from "../automations";

const companySchema = z.object({
  name: z.string().trim().min(1, "Le nom de l'entreprise est obligatoire.").max(160),
  sector: z.enum(SECTORS),
  source: z.enum(SOURCES),
  offer: z.enum(OFFERS.map((o) => o.id) as [string, ...string[]]),
  priority: z.enum(PRIORITIES.map((p) => p.id) as [string, ...string[]]),
  stage: z.enum(STAGE_IDS),
  city: z.string().trim().max(120).default(""),
  address: z.string().trim().max(300).default(""),
  siren: z.string().trim().max(20).regex(/^[\d\s]*$/, "Le SIREN ne contient que des chiffres.").default(""),
  amount: z.string().default("0"),
  notes: z.string().max(5000).default(""),
});

const contactSchema = z.object({
  firstName: z.string().trim().max(80).default(""),
  lastName: z.string().trim().max(80).default(""),
  role: z.string().trim().max(120).default(""),
  email: z.union([z.email("E-mail du contact invalide."), z.literal("")]).default(""),
  phone: z.string().trim().max(40).default(""),
});

export async function createCompanyAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireUser();
  const raw = Object.fromEntries(form);
  const parsed = companySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const contact = contactSchema.safeParse({ firstName: raw.contactFirstName, lastName: raw.contactLastName, role: raw.contactRole, email: String(raw.contactEmail ?? "").trim(), phone: raw.contactPhone });
  if (!contact.success) return { ok: false, error: contact.error.issues[0]?.message ?? "Contact invalide." };
  const v = parsed.data;
  const j0 = (await autoOn("prospectJ0"));
  const id = (await db.transaction(async (tx) => {
      const c = (await tx
            .insert(schema.companies)
            .values({ name: v.name, sector: v.sector, source: v.source, offer: v.offer, priority: v.priority, stage: v.stage, city: v.city, address: v.address, siren: v.siren.replace(/\s/g, ""), amountCents: parseEuroToCents(v.amount), notes: v.notes, lastContact: today() })
            .returning({ id: schema.companies.id }))[0];
      if (contact.data.firstName || contact.data.lastName) await tx.insert(schema.contacts).values({ ...contact.data, firstName: contact.data.firstName || contact.data.lastName, companyId: c.id, isPrimary: true });
      await logEvent(tx, c.id, "create", `Entreprise créée — source : ${v.source}`);
      if (j0 && (v.stage === "qualif" || v.stage === "contacte")) {
        await tx.insert(schema.tasks).values({ title: `Envoyer le mail J0 à ${v.name}`, companyId: c.id, dueDate: today(), priority: "moyenne" });
        await bumpRuns(tx, "prospectJ0");
      }
      return c.id;
    }));
  revalidatePath("/", "layout");
  redirect(`/entreprises/${id}`);
}

export async function updateCompanyAction(id: string, _: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = companySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const v = parsed.data;
  const before = (await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1))[0];
  if (!before) return { ok: false, error: "Entreprise introuvable." };
  await db.transaction(async (tx) => {
            await tx.update(schema.companies)
                          .set({ name: v.name, sector: v.sector, source: v.source, offer: v.offer, priority: v.priority, stage: v.stage, city: v.city, address: v.address, siren: v.siren.replace(/\s/g, ""), amountCents: parseEuroToCents(v.amount), notes: v.notes })
                          .where(eq(schema.companies.id, id));
            if (before.stage !== v.stage) await logEvent(tx, id, "stage", `Étape : ${stageOf(before.stage).label} → ${stageOf(v.stage).label}`);
          });
  revalidatePath("/", "layout");
  return { ok: true, message: "Fiche enregistrée" };
}

export async function moveStageAction(id: string, stage: string): Promise<ActionResult> {
  await requireUser();
  const st = z.enum(STAGE_IDS).safeParse(stage);
  if (!st.success) return { ok: false, error: "Étape inconnue." };
  const before = (await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1))[0];
  if (!before) return { ok: false, error: "Entreprise introuvable." };
  if (before.stage === st.data) return { ok: true };
  await db.transaction(async (tx) => {
            await tx.update(schema.companies).set({ stage: st.data, lastContact: today() }).where(eq(schema.companies.id, id));
            await logEvent(tx, id, "stage", `Étape : ${stageOf(before.stage).label} → ${stageOf(st.data).label}`);
          });
  revalidatePath("/", "layout");
  return { ok: true, message: `${before.name} → ${stageOf(st.data).label}` };
}

export async function addContactAction(companyId: string, _: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = contactSchema.safeParse({ ...Object.fromEntries(form), email: String(form.get("email") ?? "").trim() });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Contact invalide." };
  if (!parsed.data.firstName && !parsed.data.lastName) return { ok: false, error: "Indique au moins un prénom ou un nom." };
  const hasPrimary = (await db.select().from(schema.contacts).where(and(eq(schema.contacts.companyId, companyId), eq(schema.contacts.isPrimary, true))).limit(1))[0];
  await db.insert(schema.contacts).values({ ...parsed.data, firstName: parsed.data.firstName || parsed.data.lastName, companyId, isPrimary: !hasPrimary });
  revalidatePath(`/entreprises/${companyId}`);
  return { ok: true, message: "Contact ajouté" };
}

export async function deleteContactAction(contactId: string, companyId: string) {
  await requireUser();
  await db.delete(schema.contacts).where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.companyId, companyId)));
  revalidatePath(`/entreprises/${companyId}`);
}

const activitySchema = z.object({
  type: z.enum(["note", "call", "mail"]),
  text: z.string().trim().min(1, "Écris quelque chose.").max(4000),
  result: z.string().max(40).optional(),
});

export async function addActivityAction(companyId: string, _: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = activitySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  const { type, text, result } = parsed.data;
  await db.transaction(async (tx) => {
            const label = type === "call" ? `Appel${result ? " — " + result : ""} : ${text}` : type === "mail" ? `Mail : ${text}` : text;
            await logEvent(tx, companyId, type, label);
            if (type !== "note") {
              const c = (await tx.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1))[0];
              const patch: Partial<typeof schema.companies.$inferInsert> = { lastContact: today() };
              if (c?.stage === "qualif") patch.stage = "contacte";
              if (result === "RDV obtenu" && c && ["qualif", "contacte"].includes(c.stage)) patch.stage = "rdv";
              await tx.update(schema.companies).set(patch).where(eq(schema.companies.id, companyId));
            }
          });
  revalidatePath("/", "layout");
  return { ok: true, message: type === "call" ? "Appel enregistré" : type === "mail" ? "Mail noté" : "Note ajoutée" };
}

export async function deleteCompanyAction(id: string) {
  await requireUser();
  const hasDocs =
    (await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.companyId, id)).limit(1))[0] ||
    (await db.select({ id: schema.quotes.id }).from(schema.quotes).where(eq(schema.quotes.companyId, id)).limit(1))[0];
  if (hasDocs) throw new Error("Cette entreprise a des devis ou des factures : elle ne peut pas être supprimée (obligation de conservation). Passe-la en « Perdu ».");
  await db.delete(schema.companies).where(eq(schema.companies.id, id));
  revalidatePath("/", "layout");
  redirect("/entreprises");
}
