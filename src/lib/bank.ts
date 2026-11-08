/** Lecture d'un relevé bancaire CSV (formats français courants). Seuls les crédits sont gardés. */
export type BankTx = { date: string; label: string; amountCents: number };

export function parseBankCsv(text: string): BankTx[] {
  const rows = String(text || "")
    .replace(/^﻿/, "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim());
  if (rows.length < 2) return [];
  const sep = rows[0].split(";").length >= rows[0].split(",").length ? ";" : ",";
  const split = (l: string) => {
    const out: string[] = [];
    let cur = "",
      q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === sep && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const head = split(rows[0]).map((h) => h.toLowerCase());
  const find = (keys: string[]) => head.findIndex((h) => keys.some((k) => h.includes(k)));
  const iD = find(["date"]),
    iL = find(["libell", "label", "descr", "opération", "operation", "intitul"]),
    iA = find(["montant", "amount"]),
    iC = find(["crédit", "credit"]),
    iDe = find(["débit", "debit"]);
  const toNum = (x?: string) => {
    let s = String(x || "").replace(/[€\s  ]/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    return Number(s) || 0;
  };
  const toDate = (x?: string) => {
    const m = String(x || "").match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const m2 = String(x || "").match(/(\d{4})-(\d{2})-(\d{2})/);
    return m2 ? `${m2[1]}-${m2[2]}-${m2[3]}` : "";
  };
  const out: BankTx[] = [];
  for (const l of rows.slice(1)) {
    const c = split(l);
    const amt = iA >= 0 ? toNum(c[iA]) : (iC >= 0 ? toNum(c[iC]) : 0) - (iDe >= 0 ? Math.abs(toNum(c[iDe])) : 0);
    const date = toDate(iD >= 0 ? c[iD] : "");
    if (amt > 0 && date) out.push({ date, label: (iL >= 0 ? c[iL] : l).slice(0, 300), amountCents: Math.round(amt * 100) });
  }
  return out;
}
