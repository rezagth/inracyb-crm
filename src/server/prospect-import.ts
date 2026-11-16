import "server-only";
import { db, schema } from "@/db";
import { estimateAmountCents, priorityFor } from "@/lib/estimate";
import { OFFER_ID, type Candidate, type OfferKey } from "@/lib/prospect-search";
import { logEvent } from "./core";

/**
 * Crée une entreprise trouvée dans l'Annuaire des Entreprises (étape « À qualifier ») et son dirigeant comme contact.
 * Partagé par l'import manuel de la recherche de prospects et par l'alimentation automatique. Renvoie l'identifiant créé.
 */
export async function insertProspect(c: Candidate, o: { offer: OfferKey; phone?: string; website?: string; prixAuditCents: number; event?: string }): Promise<string> {
  const phone = o.phone ?? "";
  const website = /^(https?:\/\/)?[^\s]+\.[^\s]+$/.test(o.website ?? "") ? (o.website as string) : "";
  const amountCents = estimateAmountCents(OFFER_ID[o.offer], c.effectifCode, o.prixAuditCents);
  const notes = [`Trouvée par recherche automatique (Annuaire des Entreprises, SIREN ${c.siren}).`, `Activité (NAF) : ${c.naf} · Taille : ${c.effectif}.`, `Montant estimé calculé automatiquement (${OFFER_ID[o.offer]}, taille ${c.effectif}) : à ajuster.`, website ? `Site web : ${website}` : "", "E-mail du dirigeant à trouver avant tout envoi."].filter(Boolean).join("\n");
  return db.transaction(async (tx) => {
    const co = (await tx.insert(schema.companies).values({
      name: c.name, sector: c.sector, source: "Recherche automatique", offer: OFFER_ID[o.offer], priority: priorityFor(c.effectifCode), stage: "qualif", amountCents,
      city: c.city, address: c.address, siren: c.siren, notes,
    }).returning({ id: schema.companies.id }))[0];
    if (c.director) await tx.insert(schema.contacts).values({ companyId: co.id, firstName: c.director.firstName, lastName: c.director.lastName, role: c.director.role, phone, isPrimary: true });
    else if (phone) await tx.insert(schema.contacts).values({ companyId: co.id, firstName: "Standard", lastName: "", role: "Standard", phone, isPrimary: true });
    await logEvent(tx, co.id, "create", o.event ?? "Entreprise ajoutée par la recherche automatique de prospects");
    return co.id;
  });
}
