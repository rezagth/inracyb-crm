"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { sendDocumentMail } from "../billing-mail";

const schema = z.object({
  kind: z.enum(["devis", "facture"]),
  id: z.string().min(1).max(64),
  to: z.string().trim().max(200),
  toName: z.string().trim().max(200).optional(),
  subject: z.string().trim().min(1, "Objet vide.").max(200),
  text: z.string().trim().min(1, "Message vide.").max(10_000),
  reminderLevel: z.union([z.literal(1), z.literal(2)]).optional(),
});

export type SendDocInput = z.input<typeof schema>;

/** Envoi au client depuis la fenêtre « Envoyer au client » : PDF joint, par Brevo. */
export async function sendDocumentMailAction(input: SendDocInput): Promise<{ ok: true; id: string; message: string } | { ok: false; error: string }> {
  await requireUser();
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Formulaire invalide." };
  const r = await sendDocumentMail(p.data);
  if (!r.ok) return r;
  revalidatePath(p.data.kind === "devis" ? `/devis/${p.data.id}` : `/factures/${p.data.id}`);
  return { ok: true, id: p.data.id, message: r.message };
}
