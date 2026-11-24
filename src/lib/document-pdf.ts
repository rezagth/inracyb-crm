import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Settings } from "@/db/schema";
import type { Totals } from "@/lib/billing";
import { isDraftNumber } from "@/lib/billing";
import { eur, fd, fdt, num } from "@/lib/format";

/** Réglages utilisés par le document (sous-ensemble de Paramètres). */
export type DocSettings = Pick<
  Settings,
  "tradeName" | "legalName" | "legalForm" | "address" | "siret" | "email" | "phone" | "website" | "tvaFranchise" | "payMethod" | "iban" | "payLink" | "latePenalty" | "payDays"
>;

export type DocInput = {
  kind: "devis" | "facture" | "avoir";
  number: string;
  issueDate: string;
  /** Échéance (facture) ou date de validité (devis). */
  dueDate: string;
  subject: string;
  note: string;
  discountBp: number;
  lines: { label: string; quantity: number; unit: string; unitPriceCents: number }[];
  totals: Totals;
  company: { name: string; address: string; city: string; siren: string; contacts: { firstName: string; lastName: string; role: string }[] };
  settings: DocSettings;
  signedBy?: string | null;
  signedAt?: Date | null;
  creditFor?: string | null;
  quoteNumber?: string | null;
};

export type DocModel = {
  title: string;
  issuer: string[];
  meta: string[];
  subject: string;
  client: string[];
  lines: { label: string; qty: string; unit: string; pu: string; total: string }[];
  totals: { label: string; value: string; strong?: boolean }[];
  note: string;
  mentions: string[];
  signature: { left: string[]; right: string } | null;
};

/**
 * Contenu du document, texte par texte : mêmes mentions que la page affichée (components/documents/doc-sheet.tsx).
 * Séparé du dessin pour pouvoir vérifier les mentions légales dans les tests.
 */
export function documentModel(p: DocInput): DocModel {
  const s = p.settings;
  const draft = isDraftNumber(p.number);
  const title = p.kind === "devis" ? "Devis" : p.kind === "avoir" ? "Avoir" : "Facture";
  const contact = p.company.contacts[0];
  const lst = (...xs: (string | false | null | undefined)[]) => xs.filter((x): x is string => !!x);

  const totals: DocModel["totals"] = [];
  if (p.totals.disc !== 0) {
    totals.push({ label: "Sous-total HT", value: eur(p.totals.sub) });
    totals.push({ label: `Remise ${num(p.discountBp / 100)} %`, value: `-${eur(p.totals.disc)}` });
  }
  totals.push({ label: "Total HT", value: eur(p.totals.ht) });
  totals.push({ label: s.tvaFranchise ? "TVA" : "TVA 20 %", value: s.tvaFranchise ? "—" : eur(p.totals.tva) });
  totals.push({ label: p.kind === "avoir" ? "Total de l'avoir" : s.tvaFranchise ? "Net à payer" : "Total TTC", value: eur(p.totals.ttc), strong: true });
  if (p.kind === "facture" && p.totals.paid > 0) {
    totals.push({ label: "Déjà réglé", value: `-${eur(p.totals.paid)}` });
    totals.push({ label: "Reste dû", value: eur(p.totals.rest), strong: true });
  }

  const mentions = lst(s.tvaFranchise && "TVA non applicable, art. 293 B du CGI.");
  if (p.kind === "facture") {
    mentions.push(
      `Paiement à réception, au plus tard le ${fd(p.dueDate)}, par ${s.payMethod.toLowerCase()}.${s.iban ? ` IBAN : ${s.iban}.` : ""}${s.payLink ? ` Paiement en ligne : ${s.payLink}` : ""}`,
      "Pas d'escompte pour paiement anticipé.",
      `En cas de retard de paiement : pénalités au taux de ${s.latePenalty}, exigibles dès le lendemain de l'échéance, et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce).`,
    );
  }
  if (p.kind === "devis") mentions.push(`Devis gratuit, valable jusqu'au ${fd(p.dueDate)}. Conditions de paiement : ${s.payDays} jours à réception de facture.`);
  if (s.legalForm) mentions.push(`${s.legalForm}${s.siret ? ` · SIRET ${s.siret}` : ""}`);

  return {
    title,
    issuer: lst(s.tradeName, s.legalName && `${s.legalName} — EI`, ...(s.address ? s.address.split("\n") : []), s.siret && `SIRET ${s.siret}`, s.email, s.phone, s.website),
    meta: lst(
      draft ? "Brouillon" : `N° ${p.number}`,
      `Date : ${fd(p.issueDate)}`,
      p.kind === "devis" && `Valable jusqu'au ${fd(p.dueDate)}`,
      p.kind === "facture" && `Échéance : ${fd(p.dueDate)}`,
      p.quoteNumber && `Réf. devis ${p.quoteNumber}`,
      p.creditFor && `Annule la facture ${p.creditFor}`,
    ),
    subject: p.subject,
    client: lst(
      p.company.name,
      ...(p.company.address ? p.company.address.split("\n") : []),
      p.company.city,
      p.company.siren && `SIREN ${p.company.siren}`,
      contact && `À l'attention de ${contact.firstName} ${contact.lastName}${contact.role ? `, ${contact.role}` : ""}`.replace(/\s+/g, " "),
    ),
    lines: p.lines.map((l) => ({ label: l.label, qty: num(l.quantity), unit: l.unit, pu: eur(l.unitPriceCents), total: eur(Math.round(l.quantity * l.unitPriceCents)) })),
    totals,
    note: p.note,
    mentions,
    signature:
      p.kind === "devis"
        ? {
            left: p.signedBy
              ? ["Bon pour accord", `Accepté par ${p.signedBy}${p.signedAt ? ` le ${fdt(p.signedAt)}` : ""}`]
              : ["Bon pour accord", "Date, nom, fonction et signature du client, précédés de la mention « Bon pour accord »."],
            right: s.tradeName,
          }
        : null,
  };
}

/* ------------------------------------------------------------------ dessin */

const A4 = { w: 595.28, h: 841.89 };
const M = 50; // marge
const CW = A4.w - 2 * M;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.47);
const RULE = rgb(0.85, 0.85, 0.88);

/** Les polices standard du PDF ne connaissent que le jeu WinAnsi : on remplace le reste (espaces fines du format français, signe moins…). */
export function pdfSafe(text: string, font: PDFFont): string {
  const ok = new Set(font.getCharacterSet());
  return Array.from(
    text
      .replace(/[    ]/g, " ")
      .replace(/−/g, "-")
      .replace(/\t/g, " "),
  )
    .map((c) => (c === "\n" || ok.has(c.codePointAt(0)!) ? c : "?"))
    .join("");
}

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text, font).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const cand = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(cand, size) <= max) {
        line = cand;
        continue;
      }
      if (line) out.push(line);
      // mot plus long que la colonne : coupé
      let w = word;
      while (font.widthOfTextAtSize(w, size) > max && w.length > 1) {
        let i = w.length - 1;
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > max) i--;
        out.push(w.slice(0, i));
        w = w.slice(i);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

/** PDF du devis, de la facture ou de l'avoir (A4, polices standard, plusieurs pages si besoin). */
export async function renderDocumentPdf(p: DocInput): Promise<Uint8Array> {
  const m = documentModel(p);
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(`${m.title} ${isDraftNumber(p.number) ? "(brouillon)" : p.number}`);
  doc.setAuthor(p.settings.tradeName);
  doc.setCreator("InfraCyb CRM");
  doc.setProducer("InfraCyb CRM");
  doc.setLanguage("fr-FR");

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;

  const newPage = () => {
    page = doc.addPage([A4.w, A4.h]);
    y = A4.h - M;
  };
  const ensure = (h: number, onBreak?: () => void) => {
    if (y - h < M + 20) {
      newPage();
      onBreak?.();
    }
  };
  const text = (t: string, x: number, size: number, f = reg, color = INK) => page.drawText(pdfSafe(t, f), { x, y, size, font: f, color });
  const right = (t: string, xRight: number, size: number, f = reg, color = INK) => {
    const safe = pdfSafe(t, f);
    page.drawText(safe, { x: xRight - f.widthOfTextAtSize(safe, size), y, size, font: f, color });
  };
  const rule = (x1 = M, x2 = M + CW, color = RULE) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color });

  /* En-tête : émetteur à gauche, titre et références à droite. */
  const top = y;
  m.issuer.forEach((l, i) => {
    for (const w of wrap(l, i === 0 ? bold : reg, i === 0 ? 13 : 9, CW / 2 - 10)) {
      y -= i === 0 ? 15 : 12;
      text(w, M, i === 0 ? 13 : 9, i === 0 ? bold : reg, i === 0 ? INK : MUTED);
    }
  });
  const leftBottom = y;
  y = top - 20;
  right(m.title, M + CW, 20, bold);
  for (const l of m.meta) {
    y -= 13;
    right(l, M + CW, 9.5, reg, l.startsWith("N°") || l === "Brouillon" ? INK : MUTED);
  }
  y = Math.min(y, leftBottom) - 28;

  /* Objet à gauche, client à droite. */
  const blockTop = y;
  text("OBJET", M, 7.5, bold, MUTED);
  for (const w of wrap(m.subject, reg, 10, CW / 2 - 20)) {
    y -= 13;
    text(w, M, 10);
  }
  const subjectBottom = y;
  y = blockTop;
  const cx = M + CW / 2 + 10;
  text("CLIENT", cx, 7.5, bold, MUTED);
  m.client.forEach((l, i) => {
    for (const w of wrap(l, i === 0 ? bold : reg, 10, CW / 2 - 10)) {
      y -= 13;
      text(w, cx, 10, i === 0 ? bold : reg, i === 0 ? INK : l.startsWith("SIREN") || l.startsWith("À l'attention") ? MUTED : INK);
    }
  });
  y = Math.min(y, subjectBottom) - 26;

  /* Lignes. */
  const col = { label: M, qty: M + 290, unit: M + 298, pu: M + 420, total: M + CW };
  const head = () => {
    text("Désignation", col.label, 8, bold, MUTED);
    right("Qté", col.qty, 8, bold, MUTED);
    text("Unité", col.unit, 8, bold, MUTED);
    right("PU HT", col.pu, 8, bold, MUTED);
    right("Total HT", col.total, 8, bold, MUTED);
    y -= 6;
    rule(M, M + CW, MUTED);
  };
  head();
  for (const l of m.lines) {
    const ls = wrap(l.label, reg, 9.5, 280);
    const unit = wrap(l.unit, reg, 9.5, 70);
    const h = Math.max(ls.length, unit.length) * 12 + 8;
    ensure(h, () => head());
    y -= 14;
    const rowTop = y;
    ls.forEach((w, i) => {
      y = rowTop - i * 12;
      text(w, col.label, 9.5);
    });
    y = rowTop;
    right(l.qty, col.qty, 9.5);
    unit.forEach((w, i) => {
      y = rowTop - i * 12;
      text(w, col.unit, 9.5);
    });
    y = rowTop;
    right(l.pu, col.pu, 9.5);
    right(l.total, col.total, 9.5);
    y = rowTop - (Math.max(ls.length, unit.length) - 1) * 12 - 6;
    rule();
  }

  /* Totaux. */
  y -= 8;
  const tx = M + CW - 220;
  for (const t of m.totals) {
    ensure(22);
    if (t.strong) {
      y -= 6;
      rule(tx, M + CW, MUTED); // trait au-dessus du total, jamais à travers le texte
      y -= 14;
    } else {
      y -= 14;
    }
    text(t.label, tx, t.strong ? 11 : 9.5, t.strong ? bold : reg, t.strong ? INK : MUTED);
    right(t.value, M + CW, t.strong ? 11 : 9.5, t.strong ? bold : reg);
  }

  /* Note. */
  if (m.note.trim()) {
    y -= 22;
    for (const w of wrap(m.note, reg, 9.5, CW)) {
      ensure(13);
      y -= 12;
      text(w, M, 9.5);
    }
  }

  /* Mentions. */
  y -= 22;
  ensure(30);
  rule();
  y -= 4;
  for (const mention of m.mentions) {
    for (const w of wrap(mention, reg, 8, CW)) {
      ensure(11);
      y -= 11;
      text(w, M, 8, reg, MUTED);
    }
    y -= 3;
  }

  /* Bon pour accord (devis). */
  if (m.signature) {
    const boxH = 80;
    const boxW = CW / 2 - 10;
    y -= 14;
    ensure(boxH + 4);
    const boxTop = y;
    for (const x of [M, M + CW / 2 + 10]) {
      page.drawRectangle({ x, y: boxTop - boxH, width: boxW, height: boxH, borderColor: RULE, borderWidth: 0.8, borderDashArray: [3, 2] });
    }
    y = boxTop - 14;
    m.signature.left.forEach((l, i) => {
      for (const w of wrap(l, i === 0 ? bold : reg, 8.5, boxW - 16)) {
        text(w, M + 8, 8.5, i === 0 ? bold : reg, i === 0 ? INK : MUTED);
        y -= 11;
      }
    });
    y = boxTop - 14;
    text(m.signature.right, M + CW / 2 + 18, 8.5, bold);
    y = boxTop - boxH;
  }

  /* Pied de page : numéro de page. */
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    const label = pdfSafe(`${m.title} ${isDraftNumber(p.number) ? "brouillon" : p.number} · page ${i + 1} / ${pages.length}`, reg);
    pg.drawText(label, { x: M + CW - reg.widthOfTextAtSize(label, 7.5), y: M - 20, size: 7.5, font: reg, color: MUTED });
  });

  return doc.save();
}

/** Nom de fichier sûr : « Facture-F-2026-001.pdf ». */
export function documentPdfFilename(kind: DocInput["kind"], number: string): string {
  const t = kind === "devis" ? "Devis" : kind === "avoir" ? "Avoir" : "Facture";
  return `${t}-${number.replace(/[^\w-]/g, "_")}.pdf`;
}
