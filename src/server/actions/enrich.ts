"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { hostOf, pickBestEmail, siteFromNotes } from "@/lib/contact-extract";
import { estimateAmountCents } from "@/lib/estimate";
import { eur } from "@/lib/format";
import { logEvent } from "../core";
import { crawlSite } from "../enrich";
import { fetchByName, fetchBySiren, findPlace } from "../prospect-search";
import { getProfile } from "../queries";

type R = { ok: true; message: string; found: boolean } | { ok: false; error: string };

/**
 * Cherche l'e-mail et le téléphone d'une entreprise : site web (saisi dans les notes « Site web : … » ou trouvé via Google Places),
 * puis lecture des pages Contact et Mentions légales. Ne remplace jamais une coordonnée déjà renseignée.
 */
export async function enrichCompanyAction(companyId: string): Promise<R> {
  await requireUser();
  const id = z.string().min(1).max(64).safeParse(companyId);
  if (!id.success) return { ok: false, error: "Entreprise invalide." };
  const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, id.data)).limit(1))[0];
  if (!c) return { ok: false, error: "Entreprise introuvable." };
  const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, c.id)).orderBy(desc(schema.contacts.isPrimary)).limit(1))[0];

  let site = siteFromNotes(c.notes);
  let placePhone = "";
  if (!site || !ct?.phone) {
    const cp = /\b(\d{5})\b/.exec(c.address)?.[1] ?? "";
    const place = await findPlace(c.name, c.city, cp);
    if (place.ok) {
      placePhone = place.phone;
      if (!site && place.website) site = /^https?:\/\//i.test(place.website) ? place.website : "https://" + place.website;
    } else if (!site) {
      return { ok: false, error: place.error + " Ou ajoute « Site web : https://… » dans les notes de l'entreprise." };
    }
  }

  const crawl = site ? await crawlSite(site) : { emails: [], phones: [], pages: 0 };
  const { best, others } = pickBestEmail(crawl.emails, hostOf(site), ct?.lastName || ct?.firstName || "");
  const phone = placePhone ? placePhone.replace(/\s+/g, " ") : crawl.phones[0] ?? "";

  const newEmail = ct?.email ? "" : best;
  const newPhone = ct?.phone ? "" : phone;
  const noteLines = [
    site && !/site web\s*:/i.test(c.notes) ? `Site web : ${site}` : "",
    others.length ? `Autres e-mails publiés sur le site : ${others.join(", ")}` : "",
  ].filter(Boolean);

  if (newEmail || newPhone || noteLines.length) {
    await db.transaction(async (tx) => {
      if (ct) {
        if (newEmail || newPhone) await tx.update(schema.contacts).set({ ...(newEmail ? { email: newEmail } : {}), ...(newPhone ? { phone: newPhone } : {}) }).where(eq(schema.contacts.id, ct.id));
      } else if (best || phone) {
        await tx.insert(schema.contacts).values({ companyId: c.id, firstName: "Standard", lastName: "", role: "Standard", email: best, phone, isPrimary: true });
      }
      if (noteLines.length) await tx.update(schema.companies).set({ notes: [c.notes.trim(), ...noteLines].filter(Boolean).join("\n") }).where(eq(schema.companies.id, c.id));
      await logEvent(tx, c.id, "note", `Coordonnées cherchées automatiquement${site ? ` sur ${hostOf(site)}` : ""} : ${[newEmail && `e-mail ${newEmail}`, newPhone && `téléphone ${newPhone}`].filter(Boolean).join(", ") || "rien de nouveau"}`);
    });
    revalidatePath("/", "layout");
  }

  const found = !!(newEmail || newPhone);
  const parts = [newEmail && `e-mail ${newEmail}`, newPhone && `téléphone ${newPhone}`].filter(Boolean);
  if (found) return { ok: true, found, message: `${c.name} : ${parts.join(" · ")} ajouté` };
  if (ct?.email && ct?.phone) return { ok: true, found, message: `${c.name} a déjà un e-mail et un téléphone.` };
  if (!site) return { ok: true, found, message: `${c.name} : aucun site web trouvé. Ajoute « Site web : https://… » dans ses notes puis relance.` };
  if (!crawl.pages) return { ok: true, found, message: `${c.name} : le site ${hostOf(site)} n'a pas pu être lu.` };
  return { ok: true, found, message: `${c.name} : aucun e-mail publié sur ${hostOf(site)}.` };
}

/**
 * Complète une entreprise déjà enregistrée avec tout ce qui est trouvable : SIREN, adresse, ville, secteur et dirigeant
 * (Annuaire des Entreprises), montant estimé (selon le service et la taille), puis e-mail, téléphone et site web.
 * Ne remplace jamais une valeur déjà saisie ; le montant n'est calculé que s'il est à 0.
 */
export async function completeCompanyAction(companyId: string): Promise<R> {
  await requireUser();
  const id = z.string().min(1).max(64).safeParse(companyId);
  if (!id.success) return { ok: false, error: "Entreprise invalide." };
  const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, id.data)).limit(1))[0];
  if (!c) return { ok: false, error: "Entreprise introuvable." };
  const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, c.id)).orderBy(desc(schema.contacts.isPrimary)).limit(1))[0];

  const cp = /\b(\d{5})\b/.exec(c.address)?.[1] ?? "";
  const found = /^\d{9}$/.test(c.siren) ? await fetchBySiren(c.siren) : await fetchByName(c.name, cp, c.city);
  const cand = found.ok ? found.company : null;
  if (cand?.blocked) return { ok: true, found: false, message: `${c.name} : s'est opposée à la prospection commerciale, non complétée.` };

  const patch: Partial<typeof schema.companies.$inferInsert> = {};
  const filled: string[] = [];
  const noteLines: string[] = [];
  if (cand) {
    if (!c.siren) { patch.siren = cand.siren; filled.push("SIREN"); }
    if (!c.address.trim() && cand.address) { patch.address = cand.address; filled.push("adresse"); }
    if (!c.city.trim() && cand.city) { patch.city = cand.city; filled.push("ville"); }
    if (c.sector === "Autres" && cand.sector !== "Autres") { patch.sector = cand.sector; filled.push("secteur"); }
    if (!/NAF\)/.test(c.notes)) noteLines.push(`Activité (NAF) : ${cand.naf} · Taille : ${cand.effectif} (Annuaire des Entreprises, SIREN ${cand.siren}).`);
  }
  if (c.amountCents === 0) {
    const prix = (await getProfile()).prixAuditCents;
    patch.amountCents = estimateAmountCents(c.offer, cand?.effectifCode ?? "", prix);
    filled.push(`montant estimé ${eur(patch.amountCents, { round: true })}`);
    noteLines.push(`Montant estimé calculé automatiquement (${c.offer}${cand ? `, taille ${cand.effectif}` : ", taille inconnue"}) : à ajuster.`);
  }

  const dir = cand?.director;
  const placeholder = !!ct && ct.firstName === "Standard" && !ct.lastName;
  if (Object.keys(patch).length || noteLines.length || (dir && (!ct || placeholder))) {
    await db.transaction(async (tx) => {
      const notes = noteLines.length ? { notes: [c.notes.trim(), ...noteLines].filter(Boolean).join("\n") } : {};
      if (Object.keys(patch).length || noteLines.length) await tx.update(schema.companies).set({ ...patch, ...notes }).where(eq(schema.companies.id, c.id));
      if (dir && !ct) {
        await tx.insert(schema.contacts).values({ companyId: c.id, firstName: dir.firstName, lastName: dir.lastName, role: dir.role, isPrimary: true });
        filled.push("dirigeant");
      } else if (dir && ct && placeholder) {
        await tx.update(schema.contacts).set({ firstName: dir.firstName, lastName: dir.lastName, role: dir.role }).where(eq(schema.contacts.id, ct.id));
        filled.push("dirigeant");
      }
      await logEvent(tx, c.id, "note", `Fiche complétée automatiquement : ${filled.join(", ") || "notes"}`);
    });
    revalidatePath("/", "layout");
  }

  const e = await enrichCompanyAction(c.id);
  const parts = filled.length ? `${filled.join(", ")} ajouté(s)` : "";
  if (e.ok) {
    const eMsg = e.found ? e.message.replace(`${c.name} : `, "") : "";
    const msg = [parts, eMsg].filter(Boolean).join(" · ");
    return { ok: true, found: filled.length > 0 || e.found, message: msg ? `${c.name} : ${msg}` : e.message };
  }
  if (filled.length) return { ok: true, found: true, message: `${c.name} : ${parts}. E-mail et téléphone : ${e.error}` };
  return e;
}
