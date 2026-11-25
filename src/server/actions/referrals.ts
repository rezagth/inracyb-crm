"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { prescriberKindOf } from "@/lib/prescripteur-mails";
import { commissionLabelFor, partnerTypeFor } from "@/lib/referrals";
import { logEvent } from "../core";
import { prescriberPartnersEnabled } from "../campaigns";

type R = { ok: true; message: string } | { ok: false; error: string };
const idZ = z.string().min(1).max(64);

/** Le cabinet accepte de recommander InfraCyb : sa fiche Partenaire est créée, reliée à sa fiche entreprise. */
export async function becomePartnerAction(companyId: string): Promise<R> {
  await requireUser();
  const id = idZ.safeParse(companyId);
  if (!id.success) return { ok: false, error: "Entreprise invalide." };
  const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, id.data)).limit(1))[0];
  if (!c) return { ok: false, error: "Entreprise introuvable." };
  const already = (await db.select({ id: schema.partners.id }).from(schema.partners).where(eq(schema.partners.companyId, c.id)).limit(1))[0];
  if (already) return { ok: false, error: "Ce cabinet est déjà partenaire : voir la page Partenaires." };
  const kind = prescriberKindOf(c.sector);
  if (kind === "partenaire" && !prescriberPartnersEnabled()) return { ok: false, error: "Les apporteurs avec commission ne sont pas encore activés (PRESCRIPTEUR_PARTENAIRES, après l'immatriculation et l'accord écrit)." };
  const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, c.id)).orderBy(desc(schema.contacts.isPrimary)).limit(1))[0];
  const contact = ct ? [[ct.firstName, ct.lastName].filter((x) => x && !/^standard$/i.test(x)).join(" "), ct.email, ct.phone].filter(Boolean).join(", ") : "";
  await db.transaction(async (tx) => {
    await tx.insert(schema.partners).values({ name: c.name, type: partnerTypeFor(kind), specialty: c.sector, contact: contact.slice(0, 300), commission: commissionLabelFor(kind), status: "actif", companyId: c.id });
    await logEvent(tx, c.id, "note", `Devenu partenaire prescripteur (${commissionLabelFor(kind)})`);
  });
  revalidatePath(`/entreprises/${c.id}`);
  revalidatePath("/partenaires");
  return { ok: true, message: `${c.name} est maintenant partenaire.` };
}

/** « Recommandé par » : relie le client au partenaire qui l'a recommandé (vide = aucun). */
export async function setReferrerAction(companyId: string, partnerId: string): Promise<R> {
  await requireUser();
  const id = idZ.safeParse(companyId);
  if (!id.success) return { ok: false, error: "Entreprise invalide." };
  const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, id.data)).limit(1))[0];
  if (!c) return { ok: false, error: "Entreprise introuvable." };
  if (!partnerId) {
    await db.update(schema.companies).set({ referredBy: null }).where(eq(schema.companies.id, c.id));
    await logEvent(db, c.id, "note", "Recommandation retirée");
    revalidatePath(`/entreprises/${c.id}`);
    revalidatePath("/partenaires");
    return { ok: true, message: "Recommandation retirée." };
  }
  const pid = idZ.safeParse(partnerId);
  if (!pid.success) return { ok: false, error: "Partenaire invalide." };
  const p = (await db.select().from(schema.partners).where(and(eq(schema.partners.id, pid.data), ne(schema.partners.status, "inactif"))).limit(1))[0];
  if (!p) return { ok: false, error: "Partenaire introuvable ou inactif." };
  if (p.companyId === c.id) return { ok: false, error: "Un cabinet ne peut pas se recommander lui-même." };
  await db.update(schema.companies).set({ referredBy: p.id, source: "Partenaire" }).where(eq(schema.companies.id, c.id));
  await logEvent(db, c.id, "note", `Recommandée par ${p.name}`);
  revalidatePath(`/entreprises/${c.id}`);
  revalidatePath("/partenaires");
  return { ok: true, message: `Recommandée par ${p.name}.` };
}
