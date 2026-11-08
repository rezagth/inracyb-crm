"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { hashPassword, requireUser, verifyPassword, destroySession } from "@/lib/auth";
import { OFFERS, UNITS } from "@/lib/constants";
import { parseEuroToCents } from "@/lib/format";
import { getSettings, type ActionResult } from "../core";
import { redirect } from "next/navigation";

const pctNum = z.string().transform((v) => Number(v.replace(",", ".")) || 0);
const bool = z.string().optional().transform((v) => v === "on" || v === "true");

const settingsSchema = z.object({
  tradeName: z.string().trim().min(1).max(120),
  legalName: z.string().trim().max(120),
  legalForm: z.string().trim().max(160),
  siret: z.string().trim().max(20).regex(/^[\d\s]*$/, "Le SIRET ne contient que des chiffres."),
  address: z.string().trim().max(300),
  email: z.union([z.email("E-mail invalide."), z.literal("")]),
  phone: z.string().trim().max(40),
  website: z.string().trim().max(200),
  iban: z.string().trim().max(50),
  payLink: z.union([z.url("Lien de paiement invalide (https://…)."), z.literal("")]),
  calUrl: z.union([z.url("Lien de réservation invalide (https://…)."), z.literal("")]),
  tvaFranchise: bool,
  socialRate: pctNum,
  acre: bool,
  acreRate: pctNum,
  cfpRate: pctNum,
  vlEnabled: bool,
  vlRate: pctNum,
  caCeiling: z.string(),
  tvaThreshold: z.string(),
  invoicePrefix: z.string().trim().min(1).max(8).regex(/^[A-Za-z0-9]+$/, "Préfixe : lettres et chiffres uniquement."),
  quotePrefix: z.string().trim().min(1).max(8).regex(/^[A-Za-z0-9]+$/, "Préfixe : lettres et chiffres uniquement."),
  payDays: z.coerce.number().int().min(0).max(60, "Délai de paiement : 60 jours maximum en B2B."),
  payMethod: z.string().trim().max(80),
  latePenalty: z.string().trim().max(200),
  tjm: z.string(),
  goalCa: z.string(),
  iaBrand: z.string().trim().max(120).default("Elyrion Labs"),
  city: z.string().trim().max(120).default(""),
  prixAudit: z.string().default("0"),
  goalCalls: z.coerce.number().int().min(0).max(500).default(20),
  goalMails: z.coerce.number().int().min(0).max(500).default(10),
  goalRdv: z.coerce.number().int().min(0).max(100).default(3),
  goalMrr: z.string().default("0"),
  goalClients: z.coerce.number().int().min(0).max(10_000).default(0),
  goalNet: z.string().default("0"),
  avgAudit: z.string().default("0"),
  avgRssi: z.string().default("0"),
  urssafPeriod: z.enum(["mensuelle", "trimestrielle"]).default("mensuelle"),
  bankName: z.string().trim().max(120).default(""),
});

const OFFER_KEYS = ["audit", "ciso", "ia"];
const SECTOR_KEYS = ["Juridique", "Notariat", "Santé", "Expertise comptable", "Immobilier", "Autres"];

export async function updateSettingsAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireUser();
  const raw = Object.fromEntries(form) as Record<string, string>;
  const offers = form.getAll("offers").map(String).filter((x) => OFFER_KEYS.includes(x));
  const sectors = form.getAll("targetSectors").map(String).filter((x) => SECTOR_KEYS.includes(x));
  if (!offers.length) return { ok: false, error: "Active au moins une offre." };
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Paramètres invalides." };
  const v = parsed.data;
  await getSettings();
  await db.update(schema.settings)
            .set({
              tradeName: v.tradeName,
              legalName: v.legalName,
              legalForm: v.legalForm,
              siret: v.siret.replace(/\s/g, ""),
              address: v.address,
              email: v.email,
              phone: v.phone,
              website: v.website,
              iban: v.iban.toUpperCase(),
              payLink: v.payLink,
              calUrl: v.calUrl,
              tvaFranchise: v.tvaFranchise,
              socialRate: v.socialRate,
              acre: v.acre,
              acreRate: v.acreRate,
              cfpRate: v.cfpRate,
              vlEnabled: v.vlEnabled,
              vlRate: v.vlRate,
              caCeilingCents: parseEuroToCents(v.caCeiling),
              tvaThresholdCents: parseEuroToCents(v.tvaThreshold),
              invoicePrefix: v.invoicePrefix.toUpperCase(),
              quotePrefix: v.quotePrefix.toUpperCase(),
              payDays: v.payDays,
              payMethod: v.payMethod,
              latePenalty: v.latePenalty,
              tjmCents: parseEuroToCents(v.tjm),
              goalCaCents: parseEuroToCents(v.goalCa),
              iaBrand: v.iaBrand,
              city: v.city,
              prixAuditCents: parseEuroToCents(v.prixAudit),
              offers: offers.join(","),
              targetSectors: sectors.join(","),
              goalCalls: v.goalCalls,
              goalMails: v.goalMails,
              goalRdv: v.goalRdv,
              goalMrrCents: parseEuroToCents(v.goalMrr),
              goalClients: v.goalClients,
              goalNetCents: parseEuroToCents(v.goalNet),
              avgAuditCents: parseEuroToCents(v.avgAudit),
              avgRssiCents: parseEuroToCents(v.avgRssi),
              urssafPeriod: v.urssafPeriod,
              bankName: v.bankName,
            })
            .where(eq(schema.settings.id, 1));
  revalidatePath("/", "layout");
  return { ok: true, message: "Paramètres enregistrés" };
}

const pwdSchema = z
  .object({ current: z.string().min(1), next: z.string().min(12, "Nouveau mot de passe : 12 caractères minimum.").max(200), confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "Les deux nouveaux mots de passe ne correspondent pas." });

export async function changePasswordAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = pwdSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  const user = (await db.select().from(schema.users).where(eq(schema.users.id, me.id)).limit(1))[0]!;
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) return { ok: false, error: "Mot de passe actuel incorrect." };
  await db.update(schema.users)
            .set({ passwordHash: await hashPassword(parsed.data.next), sessionVersion: sql`${schema.users.sessionVersion} + 1` })
            .where(eq(schema.users.id, me.id));
  await destroySession();
  redirect("/login");
}

/* ---------- catalogue ---------- */
const itemSchema = z.object({
  name: z.string().trim().min(1, "Nom obligatoire.").max(200),
  offer: z.enum(OFFERS.map((o) => o.id) as [string, ...string[]]),
  unit: z.enum(UNITS),
  price: z.string().min(1, "Prix obligatoire."),
  description: z.string().trim().max(500).default(""),
});

export async function saveCatalogItemAction(id: string | null, _: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = itemSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Prestation invalide." };
  const v = parsed.data;
  const cents = parseEuroToCents(v.price);
  if (cents <= 0) return { ok: false, error: "Le prix doit être positif." };
  const values = { name: v.name, offer: v.offer, unit: v.unit, unitPriceCents: cents, description: v.description };
  if (id) await db.update(schema.catalogItems).set(values).where(eq(schema.catalogItems.id, id));
  else await db.insert(schema.catalogItems).values(values);
  revalidatePath("/catalogue");
  return { ok: true, message: id ? "Prestation mise à jour" : "Prestation ajoutée" };
}

export async function toggleCatalogItemAction(id: string) {
  await requireUser();
  const it = (await db.select().from(schema.catalogItems).where(eq(schema.catalogItems.id, id)).limit(1))[0];
  if (it) await db.update(schema.catalogItems).set({ active: !it.active }).where(eq(schema.catalogItems.id, id));
  revalidatePath("/catalogue");
}

/* ---------- démarrage accompagné ---------- */
const onboardSchema = z.object({
  legalName: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  city: z.string().trim().max(120),
  tradeName: z.string().trim().min(1, "Indique le nom de ta marque.").max(120),
  iaBrand: z.string().trim().max(120),
  offers: z.array(z.enum(["audit", "ciso", "ia"])).min(1, "Active au moins une offre."),
  prixAudit: z.string().max(20),
  targetSectors: z.array(z.enum(["Juridique", "Notariat", "Santé", "Expertise comptable", "Immobilier", "Autres"])),
  goalCalls: z.coerce.number().int().min(0).max(500),
  goalMails: z.coerce.number().int().min(0).max(500),
  goalRdv: z.coerce.number().int().min(0).max(100),
});
export type OnboardInput = z.input<typeof onboardSchema>;

export async function saveOnboardingAction(input: OnboardInput, finish: boolean): Promise<ActionResult> {
  await requireUser();
  const p = onboardSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Saisie invalide." };
  const v = p.data;
  await getSettings();
  await db.update(schema.settings)
            .set({
              legalName: v.legalName,
              phone: v.phone,
              city: v.city,
              tradeName: v.tradeName,
              iaBrand: v.iaBrand || "Elyrion Labs",
              offers: v.offers.join(","),
              prixAuditCents: parseEuroToCents(v.prixAudit),
              targetSectors: v.targetSectors.join(","),
              goalCalls: v.goalCalls,
              goalMails: v.goalMails,
              goalRdv: v.goalRdv,
              ...(finish ? { onboardedAt: new Date() } : {}),
            })
            .where(eq(schema.settings.id, 1));
  revalidatePath("/", "layout");
  return { ok: true, message: finish ? "Profil enregistré · tes scripts sont prêts" : "Enregistré" };
}

/* ---------- favoris ---------- */
export async function addFavoriteAction(label: string, href: string): Promise<ActionResult> {
  await requireUser();
  const l = z.string().trim().min(1).max(80).safeParse(label);
  const h = z.string().max(300).regex(/^\/(?!\/)[^\s]*$/, "Lien invalide.").safeParse(href);
  if (!l.success || !h.success) return { ok: false, error: "Favori invalide." };
  if ((await db.select().from(schema.favorites).where(eq(schema.favorites.href, h.data)).limit(1))[0]) return { ok: true, message: "Déjà dans tes favoris" };
  const n = (await db.select({ c: sql<number>`count(*)::int` }).from(schema.favorites).limit(1))[0]?.c ?? 0;
  if (n >= 20) return { ok: false, error: "20 favoris maximum." };
  await db.insert(schema.favorites).values({ label: l.data, href: h.data, position: n });
  revalidatePath("/", "layout");
  return { ok: true, message: "Ajouté aux favoris" };
}

export async function removeFavoriteAction(id: string): Promise<ActionResult> {
  await requireUser();
  await db.delete(schema.favorites).where(eq(schema.favorites.id, id));
  revalidatePath("/", "layout");
  return { ok: true, message: "Retiré des favoris" };
}
