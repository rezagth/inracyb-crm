import "server-only";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";

/** Options des listes déroulantes des formulaires. */
export async function missionOptions() {
  return (await db.query.missions.findMany({ orderBy: [asc(schema.missions.due)], with: { company: { columns: { name: true } } } }))
    .filter((m) => m.status !== "cloturee")
    .map((m) => ({ id: m.id, name: `${m.title} — ${m.company.name}` }));
}

export const hfmt = (h: number) => `${String(Math.round(h * 10) / 10).replace(".", ",")} h`;
export function weekStart(t: string) {
  const d = new Date(t + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
