import { eur, fd } from "@/lib/format";

/** Textes des mails de facturation (envoi du devis, de la facture, relances). Partagés par l'envoi manuel et les relances automatiques. */

export type MailText = { subject: string; text: string };

export type BillingSender = { legalName: string; tradeName: string; phone: string; iban: string; payLink: string; latePenalty: string };

export const REMINDER_LABELS = ["", "Rappel courtois", "Relance ferme", "Mise en demeure"] as const;

function signature(s: BillingSender): string {
  return `\n\nBien cordialement,\n${s.legalName || s.tradeName}\n${s.tradeName}${s.phone ? `\n${s.phone}` : ""}`;
}
function payInfo(s: BillingSender): string {
  return `${s.iban ? `\nIBAN : ${s.iban}` : ""}${s.payLink ? `\nPaiement en ligne : ${s.payLink}` : ""}`;
}
const hello = (firstName: string) => `Bonjour${firstName ? ` ${firstName}` : ""},\n\n`;

export function quoteMail(p: { number: string; subject: string; totalHtCents: number; validUntil: string; firstName: string; sender: BillingSender }): MailText {
  const s = p.sender;
  return {
    subject: `Devis ${p.number} — ${p.subject}`,
    text: `${hello(p.firstName)}Comme convenu, vous trouverez ci-joint le devis ${p.number} pour « ${p.subject} », d'un montant de ${eur(p.totalHtCents)} HT, valable jusqu'au ${fd(p.validUntil)}.\n\nPour l'accepter, il suffit de me le retourner signé avec la mention « Bon pour accord ». Je reste disponible pour en parler.\n\nBien cordialement,\n${s.legalName || s.tradeName}\n${s.tradeName}`,
  };
}

export function invoiceMail(p: { number: string; subject: string; totalTtcCents: number; dueDate: string; firstName: string; sender: BillingSender }): MailText {
  return {
    subject: `Facture ${p.number} — ${p.subject}`,
    text: `${hello(p.firstName)}Vous trouverez ci-joint la facture ${p.number} pour « ${p.subject} », d'un montant de ${eur(p.totalTtcCents)}, payable au plus tard le ${fd(p.dueDate)}.${payInfo(p.sender)}${signature(p.sender)}`,
  };
}

export function creditNoteMail(p: { number: string; creditFor: string; totalTtcCents: number; firstName: string; sender: BillingSender }): MailText {
  return {
    subject: `Avoir ${p.number}${p.creditFor ? ` — annule la facture ${p.creditFor}` : ""}`,
    text: `${hello(p.firstName)}Vous trouverez ci-joint l'avoir ${p.number}${p.creditFor ? `, qui annule la facture ${p.creditFor}` : ""}, d'un montant de ${eur(Math.abs(p.totalTtcCents))}.${signature(p.sender)}`,
  };
}

/** Relance de niveau 1 (rappel courtois), 2 (relance ferme) ou 3 (mise en demeure). `lateDays` : jours écoulés depuis l'échéance. */
export function reminderMail(level: 1 | 2 | 3, p: { number: string; issueDate: string; dueDate: string; restCents: number; lateDays: number; firstName: string; sender: BillingSender }): MailText {
  const s = p.sender;
  const ref = `facture ${p.number} du ${fd(p.issueDate)} (${eur(p.restCents)})`;
  const late = Math.max(0, p.lateDays);
  if (level === 1) {
    return {
      subject: `Rappel — facture ${p.number}`,
      text: `${hello(p.firstName)}Sauf erreur de ma part, je n'ai pas encore reçu le règlement de la ${ref}, arrivée à échéance le ${fd(p.dueDate)}. Il s'agit peut-être d'un simple oubli : pourriez-vous vérifier de votre côté ?${payInfo(s)}${signature(s)}`,
    };
  }
  if (level === 2) {
    return {
      subject: `Relance — facture ${p.number} échue depuis ${late} jours`,
      text: `${hello(p.firstName)}Malgré mon précédent rappel, la ${ref} reste impayée à ce jour, ${late} jours après son échéance.\n\nJe vous remercie de procéder au règlement sous 8 jours. Pour rappel, des pénalités de retard (${s.latePenalty}) et une indemnité forfaitaire de 40 € pour frais de recouvrement sont exigibles.${payInfo(s)}${signature(s)}`,
    };
  }
  return {
    subject: `Mise en demeure de payer — facture ${p.number}`,
    text: `${hello(p.firstName)}Par la présente, je vous mets en demeure de régler la ${ref}, échue le ${fd(p.dueDate)}, dans un délai de 8 jours à compter de la réception de ce courrier.\n\nÀ défaut, j'engagerai sans autre préavis la procédure de recouvrement adaptée (injonction de payer). Les pénalités de retard et l'indemnité forfaitaire de 40 € restent dues.\n\nUne mise en demeure s'envoie de préférence par lettre recommandée avec accusé de réception.${signature(s)}`,
  };
}

export const mailtoHref = (email: string | undefined, m: MailText): string | null =>
  email ? `mailto:${email}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}` : null;
