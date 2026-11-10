"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { EFFECTIF_CODES, OFFER_ID, SEARCHABLE_SECTORS, type Sector } from "@/lib/prospect-search";
import { estimateAmountCents, priorityFor } from "@/lib/estimate";
import { logEvent } from "../core";
import { getProfile } from "../queries";
import { fetchBySiren, findPlace, searchAnnuaire, type FoundPage } from "../prospect-search";

type Fail = { ok: false; error: string };

const searchZ = z.object({
  offer: z.enum(["audit", "ciso", "ia"]),
  sector: z.enum(SEARCHABLE_SECTORS as [Sector, ...Sector[]]),
  departement: z.string().trim().regex(/^(\d{2,3}|2[AB])?$/, "Département : 2 ou 3 chiffres (ex. 75, 33, 971) ou 2A/2B."),
  effectifs: z.array(z.string()).max(8).refine((a) => a.every((c) => EFFECTIF_CODES.includes(c)), "Taille invalide."),
  query: z.string().trim().max(80),
  page: z.number().int().min(1).max(400),
});

export async function searchProspectsAction(input: unknown): Promise<{ ok: true; page: FoundPage } | Fail> {
  await requireUser();
  const p = searchZ.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Recherche invalide." };
  return searchAnnuaire(p.data);
}

const placeZ = z.object({ name: z.string().trim().min(1).max(200), city: z.string().trim().max(120), postalCode: z.string().regex(/^\d{5}$/) });

/** Cherche téléphone et site web d'une entreprise (Google Places), à la demande pour maîtriser le coût. */
export async function findPhoneAction(input: unknown): Promise<{ ok: true; phone: string; website: string } | Fail> {
  await requireUser();
  const p = placeZ.safeParse(input);
  if (!p.success) return { ok: false, error: "Entreprise invalide." };
  return findPlace(p.data.name, p.data.city, p.data.postalCode);
}

const importZ = z.object({
  offer: z.enum(["audit", "ciso", "ia"]),
  items: z
    .array(z.object({ siren: z.string().regex(/^\d{9}$/), phone: z.string().trim().max(40).default(""), website: z.string().trim().max(200).default("") }))
    .min(1, "Coche au moins une entreprise.")
    .max(25, "25 entreprises maximum par import."),
});

/**
 * Ajoute les entreprises cochées au pipeline (étape « À qualifier »). Pour chaque SIREN, les données sont relues auprès de
 * l'Annuaire : on ignore celles qui se sont opposées à la prospection commerciale et celles déjà présentes dans le CRM.
 */
export async function importProspectsAction(input: unknown): Promise<{ ok: true; message: string; added: string[] } | Fail> {
  await requireUser();
  const p = importZ.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Import invalide." };

  const prixAuditCents = (await getProfile()).prixAuditCents;
  const rows = await db.select({ name: schema.companies.name, siren: schema.companies.siren }).from(schema.companies);
  const sirens = new Set(rows.map((r) => r.siren).filter(Boolean));
  const names = new Set(rows.map((r) => r.name.trim().toLowerCase()));

  let added = 0, dup = 0, blocked = 0, failed = 0;
  const addedSirens: string[] = [];
  const todo = p.data.items.filter((i, k, a) => a.findIndex((x) => x.siren === i.siren) === k);
  for (let k = 0; k < todo.length; k += 5) {
    const batch = await Promise.all(todo.slice(k, k + 5).map(async (it) => ({ it, r: await fetchBySiren(it.siren) })));
    for (const { it, r } of batch) {
      if (!r.ok || !r.company) { failed++; continue; }
      const c = r.company;
      if (c.blocked) { blocked++; continue; }
      if (sirens.has(c.siren) || names.has(c.name.trim().toLowerCase())) { dup++; continue; }
      const website = /^(https?:\/\/)?[^\s]+\.[^\s]+$/.test(it.website) ? it.website : "";
      const amountCents = estimateAmountCents(OFFER_ID[p.data.offer], c.effectifCode, prixAuditCents);
      const notes = [`Trouvée par recherche automatique (Annuaire des Entreprises, SIREN ${c.siren}).`, `Activité (NAF) : ${c.naf} · Taille : ${c.effectif}.`, `Montant estimé calculé automatiquement (${OFFER_ID[p.data.offer]}, taille ${c.effectif}) : à ajuster.`, website ? `Site web : ${website}` : "", "E-mail du dirigeant à trouver avant tout envoi."].filter(Boolean).join("\n");
      await db.transaction(async (tx) => {
        const co = (await tx.insert(schema.companies).values({
          name: c.name, sector: c.sector, source: "Recherche automatique", offer: OFFER_ID[p.data.offer], priority: priorityFor(c.effectifCode), stage: "qualif", amountCents,
          city: c.city, address: c.address, siren: c.siren, notes,
        }).returning({ id: schema.companies.id }))[0];
        if (c.director) await tx.insert(schema.contacts).values({ companyId: co.id, firstName: c.director.firstName, lastName: c.director.lastName, role: c.director.role, phone: it.phone, isPrimary: true });
        else if (it.phone) await tx.insert(schema.contacts).values({ companyId: co.id, firstName: "Standard", lastName: "", role: "Standard", phone: it.phone, isPrimary: true });
        await logEvent(tx, co.id, "create", "Entreprise ajoutée par la recherche automatique de prospects");
      });
      sirens.add(c.siren);
      names.add(c.name.trim().toLowerCase());
      addedSirens.push(c.siren);
      added++;
    }
  }
  revalidatePath("/", "layout");
  const parts = [`${added} entreprise(s) ajoutée(s) au pipeline`];
  if (dup) parts.push(`${dup} déjà dans le CRM`);
  if (blocked) parts.push(`${blocked} ignorée(s) : opposition à la prospection`);
  if (failed) parts.push(`${failed} non relue(s) (réessaie)`);
  return { ok: true, message: parts.join(" · "), added: addedSirens };
}
