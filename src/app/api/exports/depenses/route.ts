import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { csvResponse } from "@/server/csv";

export async function GET() {
  if (!(await getCurrentUser())) return new Response("Non autorisé", { status: 401 });
  const rows = (await db.select().from(schema.expenses).orderBy(asc(schema.expenses.date)));
  return csvResponse("depenses.csv", [
    ["Date", "Fournisseur", "Catégorie", "Montant TTC", "Récurrence", "Justificatif"],
    ...rows.map((e) => [e.date.split("-").reverse().join("/"), e.supplier, e.category, e.amountCents, e.recurring, e.proof ? "oui" : "non"]),
  ]);
}
