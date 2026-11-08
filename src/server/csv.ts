import "server-only";

/** CSV compatible Excel/Numbers (point-virgule, BOM UTF-8), protégé contre l'injection de formules. */
export function csvResponse(filename: string, rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s0 = typeof v === "number" ? (v / 100).toFixed(2).replace(".", ",") : String(v ?? "");
    const s = /^[=+\-@\t\r]/.test(s0) && typeof v !== "number" ? `'${s0}` : s0;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return new Response("﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
