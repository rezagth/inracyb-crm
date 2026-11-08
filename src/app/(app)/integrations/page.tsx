import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "@/server/core";
import { listInvoices } from "@/server/queries";
import { eur, fd } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/icon";
import { ModTable, ModTip, PillCell, Row, Cell } from "@/components/mod/layout";
import { BankImport, BankRowActions, CopyButton, IntegField } from "./widgets";

export const metadata = { title: "Intégrations" };
const GRID = "100px minmax(0,2fr) 110px minmax(0,1.8fr) 190px";

function Card({ icon, name, desc, status, tone, note, children }: { icon: IconName; name: string; desc: string; status: string; tone: "ok" | "warn" | "info"; note: string; children?: React.ReactNode }) {
  return (
    <article className="card rise flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-fg">
          <Icon name={icon} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <strong className="text-sm">{name}</strong>
          <span className="text-xs text-subtle-fg">{desc}</span>
        </div>
        <span className={`pill tone-${tone}`}>{status}</span>
      </div>
      {children}
      <p className="tip">{note}</p>
    </article>
  );
}

export default async function IntegrationsPage() {
  const s = (await getSettings());
  const invoices = (await listInvoices()).filter((i) => i.kind === "facture" && i.status === "envoyee" && i.totals.rest > 0);
  const lines = await db.query.bankLines.findMany({ orderBy: [desc(schema.bankLines.date)], with: { invoice: { columns: { number: true } } } });
  const toMatch = lines.filter((l) => l.status === "a_rapprocher").length;
  const opts = invoices.map((i) => ({ id: i.id, label: `${i.number} — ${i.company.name} — reste ${eur(i.totals.rest)}` }));
  return (
    <>
      <PageHeader title="Intégrations" />
      <div className="flex flex-col gap-4">
        <ModTip>
          Ce qui marche déjà est marqué « Actif » : export d&apos;agenda, import bancaire, liens de réservation et de paiement, exports comptables. Les connexions automatiques (synchronisation d&apos;agenda, flux bancaire, signature à valeur probante, plateforme de facturation électronique) demanderont un compte chez chaque prestataire.
        </ModTip>
        <section className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          <Card icon="p_rdv" name="Réservation en ligne (Cal)" desc="Tes prospects réservent un créneau eux-mêmes." status={s.calUrl ? "Actif" : "À configurer"} tone={s.calUrl ? "ok" : "warn"} note="Ajouté automatiquement à tes mails de prospection J0 et J+7.">
            <IntegField name="calUrl" label="Lien de ta page de réservation" value={s.calUrl} placeholder="https://cal.com/ton-nom" type="url" />
            {s.calUrl && <CopyButton text={s.calUrl} label="Lien de réservation" />}
          </Card>
          <Card icon="p_rdv" name="Agenda (Google, Outlook, Apple)" desc="Tes rendez-vous du CRM dans ton agenda habituel." status="Actif (export)" tone="ok" note="Importe le fichier dans ton agenda. La synchronisation automatique demandera de connecter ton compte d'agenda.">
            <a href="/api/exports/agenda" className="btn btn-sec btn-sm self-start">
              <Icon name="download" />
              Exporter mes rendez-vous (.ics)
            </a>
          </Card>
          <Card icon="p_tresorerie" name="Banque" desc="Rapproche tes virements reçus de tes factures." status="Actif (import CSV)" tone="ok" note="Exporte ton relevé en CSV depuis ton espace bancaire : seuls les crédits sont repris, et un même relevé importé deux fois ne crée pas de doublon.">
            <IntegField name="bankName" label="Ta banque" value={s.bankName} placeholder="Ex. banque en ligne" />
            <div>
              <BankImport />
            </div>
          </Card>
          <Card icon="p_depenses" name="Paiement en ligne" desc="Tes clients paient en un clic." status={s.payLink ? "Actif" : "À configurer"} tone={s.payLink ? "ok" : "warn"} note="Le lien s'ajoute à tes factures et à tes mails d'envoi.">
            <IntegField name="payLink" label="Lien de paiement de ton prestataire" value={s.payLink} placeholder="https://…" type="url" />
          </Card>
          <Card icon="mail" name="Messagerie" desc="Mails de prospection, devis, factures et relances." status="Actif (ta messagerie)" tone="ok" note="Chaque mail s'ouvre dans ta messagerie, prêt à envoyer. L'envoi direct depuis le CRM demandera de connecter ta boîte mail." />
          <Card icon="p_contrats" name="Signature électronique" desc="Faire signer devis et contrats à distance." status="Accord simple actif" tone="info" note="Le « bon pour accord » (nom, fonction, date) s'enregistre sur chaque devis accepté. Pour une signature à valeur probante, indique le service choisi.">
            <IntegField name="esignProvider" label="Service de signature choisi" value={s.esignProvider} placeholder="Nom du service" />
          </Card>
          <Card icon="p_factures" name="Facturation électronique" desc="Plateforme agréée pour recevoir et émettre tes factures." status={s.einvoicePlatform ? "Plateforme choisie" : "À choisir"} tone={s.einvoicePlatform ? "ok" : "warn"} note="La réforme impose de recevoir les factures électroniques via une plateforme agréée, puis d'en émettre : dates et liste des plateformes à vérifier sur impots.gouv.fr.">
            <IntegField name="einvoicePlatform" label="Plateforme agréée choisie" value={s.einvoicePlatform} placeholder="Nom de la plateforme" />
          </Card>
          <Card icon="download" name="Comptabilité et exports" desc="Tes données pour ton comptable ou tes déclarations." status="Actif" tone="ok" note="En micro-entreprise, le livre des recettes suffit. Si tu changes de statut, ces exports serviront à ton expert-comptable.">
            <div className="flex flex-wrap gap-1.5">
              <a href="/api/exports/journal-des-ventes" className="btn btn-sec btn-sm">Journal des ventes (CSV)</a>
              <a href="/api/exports/depenses" className="btn btn-sec btn-sm">Dépenses (CSV)</a>
              <a href={`/api/exports/livre-des-recettes?annee=${new Date().getFullYear()}`} className="btn btn-sec btn-sm">Livre des recettes (CSV)</a>
            </div>
          </Card>
        </section>
        <ModTable
          title="Rapprochement bancaire"
          base="/integrations"
          search={false}
          actions={<span className="text-xs text-subtle-fg">{toMatch} ligne(s) à rapprocher</span>}
          cols={["Date", "Libellé", "Montant", "Facture correspondante", ""]}
          grid={GRID}
          minW={900}
          empty="Importe un relevé bancaire (CSV) depuis la carte Banque pour rapprocher tes encaissements."
          count={lines.length}
        >
          {lines.map((l) => {
            const sugg = invoices.find((i) => l.label.toUpperCase().includes(i.number.toUpperCase())) ?? invoices.find((i) => i.totals.rest === l.amountCents);
            return (
              <Row key={l.id} grid={GRID}>
                <Cell t={fd(l.date)} className="num" />
                <Cell t={l.label} />
                <Cell t={eur(l.amountCents)} className="num font-semibold" />
                {l.status === "a_rapprocher" ? (
                  <BankRowActions id={l.id} options={opts} suggested={sugg?.id ?? ""} />
                ) : (
                  <>
                    <PillCell t={l.status === "rapproche" ? `Rapproché · ${l.invoice?.number ?? ""}` : "Ignoré"} tone={l.status === "rapproche" ? "ok" : "neu"} />
                    <span />
                  </>
                )}
              </Row>
            );
          })}
        </ModTable>
      </div>
    </>
  );
}
