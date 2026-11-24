import { Icon } from "@/components/icon";

/** Téléchargement du PDF généré par le CRM (documents émis uniquement). */
export function PdfButton({ kind, id }: { kind: "devis" | "facture"; id: string }) {
  return (
    <a className="btn btn-sec" href={`/api/exports/pdf/${kind}/${id}?telecharger=1`} download>
      <Icon name="download" />
      Télécharger le PDF
    </a>
  );
}
