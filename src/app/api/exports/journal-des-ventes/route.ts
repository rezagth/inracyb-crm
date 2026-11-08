import { getCurrentUser } from "@/lib/auth";
import { listInvoices } from "@/server/queries";
import { csvResponse } from "@/server/csv";

/** Journal des ventes : une ligne par facture ou avoir émis (montants en euros). */
export async function GET() {
  if (!(await getCurrentUser())) return new Response("Non autorisé", { status: 401 });
  const rows = (await listInvoices()).filter((i) => i.status !== "brouillon").sort((a, b) => a.number.localeCompare(b.number));
  return csvResponse("journal-des-ventes.csv", [
    ["Numéro", "Date", "Client", "Objet", "HT", "TVA", "TTC", "Statut", "Payé", "Reste"],
    ...rows.map((i) => [i.number, i.issueDate.split("-").reverse().join("/"), i.company.name, i.subject, i.totals.ht, i.totals.tva, i.totals.ttc, i.display.label, i.totals.paid, i.totals.rest]),
  ]);
}
