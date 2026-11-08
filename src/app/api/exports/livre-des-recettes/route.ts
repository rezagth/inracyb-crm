import { asc, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";

/** Livre des recettes (obligatoire en micro-entreprise) : un encaissement par ligne, au format CSV pour Excel/Numbers. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const yearParam = new URL(req.url).searchParams.get("annee") ?? "";
  const year = /^\d{4}$/.test(yearParam) ? yearParam : String(new Date().getFullYear());
  const rows = await db.query.payments
    .findMany({
      where: like(schema.payments.date, `${year}-%`),
      orderBy: [asc(schema.payments.date)],
      with: { invoice: { columns: { number: true, subject: true }, with: { company: { columns: { name: true } } } } },
    });
  // Neutralise les formules (=, +, -, @) pour éviter l'injection dans le tableur.
  const cell = (v: string) => {
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const lines = [
    ["Date d'encaissement", "Client", "Nature de la prestation", "N° de facture", "Montant", "Mode de règlement"].map(cell).join(";"),
    ...rows.map((p) => [p.date.split("-").reverse().join("/"), p.invoice.company.name, p.invoice.subject, p.invoice.number, money(p.amountCents), p.method].map(cell).join(";")),
    ["", "", "", "Total", money(rows.reduce((a, p) => a + p.amountCents, 0)), ""].map(cell).join(";"),
  ];
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="livre-des-recettes-${year}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
