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
import { PdfButton } from "@/components/documents/pdf-button";
import { InvoiceActions } from "./actions-panel";
import { creditNoteMail, invoiceMail, mailtoHref, reminderMail, type MailText } from "@/lib/billing-mails";
import { documentPdfFilename } from "@/lib/document-pdf";
import { brevoReady } from "@/server/brevo";
import { lastDocumentSend } from "@/server/queries";

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
  const sender = { legalName: s.legalName, tradeName: s.tradeName, phone: s.phone, iban: s.iban, payLink: s.payLink, latePenalty: s.latePenalty };
  const late = daysBetween(iv.dueDate, t);
  const firstName = contact?.firstName ?? "";
  const sendMail = iv.kind === "avoir" ? creditNoteMail({ number: iv.number, creditFor: creditFor ?? "", totalTtcCents: iv.totals.ttc, firstName, sender }) : invoiceMail({ number: iv.number, subject: iv.subject, totalTtcCents: iv.totals.ttc, dueDate: iv.dueDate, firstName, sender });
  const reminderMails = ([1, 2, 3] as const).map((lvl) => reminderMail(lvl, { number: iv.number, issueDate: iv.issueDate, dueDate: iv.dueDate, restCents: iv.totals.rest, lateDays: late, firstName, sender }));
  const mailtoSend = mailtoHref(contact?.email, sendMail);
  const mailtoReminders = reminderMails.map((m) => mailtoHref(contact?.email, m));
  const lastSent = brevoReady() && !isDraftNumber(iv.number) ? await lastDocumentSend(iv.companyId, `${iv.kind === "avoir" ? "Avoir" : "Facture"} ${iv.number} envoy`) : null;
  const send = brevoReady() && !isDraftNumber(iv.number)
    ? {
        recipients: iv.company.contacts.filter((c) => c.email).map((c) => ({ email: c.email, name: `${c.firstName} ${c.lastName}`.trim() })),
        attachment: documentPdfFilename(iv.kind === "avoir" ? "avoir" : "facture", iv.number),
        mail: sendMail,
        reminders: [reminderMails[0], reminderMails[1]] as [MailText, MailText],
        alreadySent: lastSent ? `Déjà envoyé le ${fdt(lastSent.createdAt)} (${lastSent.text}). Un nouvel envoi repartira avec le PDF.` : null,
      }
    : null;
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
        actions={
          <span className="flex gap-2">
            {!isDraftNumber(iv.number) && <PdfButton kind="facture" id={iv.id} />}
            <PrintButton />
          </span>
        }
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
            send={send}
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
