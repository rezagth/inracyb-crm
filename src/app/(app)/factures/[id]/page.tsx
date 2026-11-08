import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getInvoice } from "@/server/queries";
import { getSettings } from "@/server/core";
import { isDraftNumber } from "@/lib/billing";
import { centsToInput, daysBetween, eur, fd, fdt, today } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { DocSheet } from "@/components/documents/doc-sheet";
import { PrintButton } from "@/components/documents/print-button";
import { InvoiceActions } from "./actions-panel";

export const metadata = { title: "Facture" };

const LEVEL = ["", "Rappel courtois", "Relance ferme", "Mise en demeure"];

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const iv = await getInvoice(id);
  if (!iv) notFound();
  const s = (await getSettings());
  const t = today();
  const creditFor = iv.creditForId ? (await db.select({ number: schema.invoices.number }).from(schema.invoices).where(eq(schema.invoices.id, iv.creditForId)).limit(1))[0]?.number : null;
  const credit = iv.kind === "facture" && iv.status === "annulee" ? (await db.select({ id: schema.invoices.id, number: schema.invoices.number }).from(schema.invoices).where(eq(schema.invoices.creditForId, iv.id)).limit(1))[0] : null;
  const contact = iv.company.contacts.find((c) => c.email);
  const signature = `\n\nBien cordialement,\n${s.legalName || s.tradeName}\n${s.tradeName}${s.phone ? `\n${s.phone}` : ""}`;
  const pay = `${s.iban ? `\nIBAN : ${s.iban}` : ""}${s.payLink ? `\nPaiement en ligne : ${s.payLink}` : ""}`;
  const late = daysBetween(iv.dueDate, t);
  const mail = (subject: string, body: string) => (contact ? `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null);
  const ref = `facture ${iv.number} du ${fd(iv.issueDate)} (${eur(iv.totals.rest)})`;
  const hello = `Bonjour ${contact?.firstName ?? ""},\n\n`;
  const mailtoSend = mail(`Facture ${iv.number} — ${iv.subject}`, `${hello}Vous trouverez ci-joint la facture ${iv.number} pour « ${iv.subject} », d'un montant de ${eur(iv.totals.ttc)}, payable au plus tard le ${fd(iv.dueDate)}.${pay}${signature}`);
  const mailtoReminders = [
    mail(`Rappel — facture ${iv.number}`, `${hello}Sauf erreur de ma part, je n'ai pas encore reçu le règlement de la ${ref}, arrivée à échéance le ${fd(iv.dueDate)}. Il s'agit peut-être d'un simple oubli : pourriez-vous vérifier de votre côté ?${pay}${signature}`),
    mail(`Relance — facture ${iv.number} échue depuis ${Math.max(0, late)} jours`, `${hello}Malgré mon précédent rappel, la ${ref} reste impayée à ce jour, ${Math.max(0, late)} jours après son échéance.\n\nJe vous remercie de procéder au règlement sous 8 jours. Pour rappel, des pénalités de retard (${s.latePenalty}) et une indemnité forfaitaire de 40 € pour frais de recouvrement sont exigibles.${pay}${signature}`),
    mail(`Mise en demeure de payer — facture ${iv.number}`, `${hello}Par la présente, je vous mets en demeure de régler la ${ref}, échue le ${fd(iv.dueDate)}, dans un délai de 8 jours à compter de la réception de ce courrier.\n\nÀ défaut, j'engagerai sans autre préavis la procédure de recouvrement adaptée (injonction de payer). Les pénalités de retard et l'indemnité forfaitaire de 40 € restent dues.\n\nUne mise en demeure s'envoie de préférence par lettre recommandée avec accusé de réception.${signature}`),
  ];
  const title = iv.kind === "avoir" ? `Avoir ${iv.number}` : isDraftNumber(iv.number) ? "Facture (brouillon)" : `Facture ${iv.number}`;
  return (
    <>
      <PageHeader
        title={title}
        back={{ href: "/factures", label: "Factures" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={iv.display.tone}>{iv.display.label}</Badge>
            <Link className="link" href={`/entreprises/${iv.companyId}`}>
              {iv.company.name}
            </Link>
            {iv.display.key === "retard" && <span className="text-ko">échue depuis {late} jour{late > 1 ? "s" : ""}</span>}
          </span>
        }
        actions={<PrintButton />}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <DocSheet
          kind={iv.kind === "avoir" ? "avoir" : "facture"}
          number={iv.number}
          issueDate={iv.issueDate}
          dueDate={iv.dueDate}
          subject={iv.subject}
          note={iv.note}
          discountBp={iv.discountBp}
          lines={iv.lines}
          totals={iv.totals}
          company={iv.company}
          settings={s}
          creditFor={creditFor}
          quoteNumber={iv.quote && !isDraftNumber(iv.quote.number) ? iv.quote.number : null}
        />
        <aside className="no-print flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
          <InvoiceActions
            id={iv.id}
            status={iv.status}
            kind={iv.kind}
            restLabel={eur(iv.totals.rest)}
            restInput={centsToInput(iv.totals.rest).replace(".", ",")}
            today={t}
            hasPayments={iv.payments.length > 0}
            reminders={iv.reminders.map((r) => r.level)}
            mailtoSend={mailtoSend}
            mailtoReminders={mailtoReminders}
          />
          {credit && (
            <Card title="Avoir">
              <p className="px-5 py-3 text-[13px]">
                Annulée par{" "}
                <Link className="link font-mono text-xs" href={`/factures/${credit.id}`}>
                  {credit.number}
                </Link>
              </p>
            </Card>
          )}
          {iv.quote && (
            <Card title="Devis d'origine">
              <p className="px-5 py-3 text-[13px]">
                <Link className="link font-mono text-xs" href={`/devis/${iv.quote.id}`}>
                  {isDraftNumber(iv.quote.number) ? "Brouillon" : iv.quote.number}
                </Link>{" "}
                · {iv.quote.subject}
              </p>
            </Card>
          )}
          {iv.payments.length > 0 && (
            <Card title="Paiements reçus">
              <ul>
                {iv.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 border-t border-border-subtle px-5 py-2.5 text-[13px] first:border-t-0">
                    <span className="num text-muted-fg">{fd(p.date)}</span>
                    <span className="text-xs text-subtle-fg">{p.method}</span>
                    <span className="num font-medium">{eur(p.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {iv.reminders.length > 0 && (
            <Card title="Historique des relances">
              <ul>
                {iv.reminders.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 border-t border-border-subtle px-5 py-2.5 text-[13px] first:border-t-0">
                    <span>{LEVEL[r.level] ?? "Relance"}</span>
                    <span className="num text-xs text-subtle-fg">{fdt(r.sentAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
