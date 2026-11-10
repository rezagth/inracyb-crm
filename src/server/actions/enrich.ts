"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { hostOf, pickBestEmail, siteFromNotes } from "@/lib/contact-extract";
import { logEvent } from "../core";
import { crawlSite } from "../enrich";
import { findPlace } from "../prospect-search";

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
