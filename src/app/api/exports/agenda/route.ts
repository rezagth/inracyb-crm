import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";

/** Export iCalendar (.ics) des rendez-vous : à importer dans Calendrier, Google Agenda ou Outlook. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Non autorisé", { status: 401 });
  const rows = await db.query.meetings.findMany({ orderBy: [asc(schema.meetings.date)], with: { company: { columns: { name: true } } } });
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const dt = (d: string, h: string) => `${d.replace(/-/g, "")}T${h.replace(":", "")}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//InfraCyb//CRM//FR",
    "CALSCALE:GREGORIAN",
    ...rows.flatMap((r) => [
      "BEGIN:VEVENT",
      `UID:${r.id}@infracyb-crm`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Paris:${dt(r.date, r.start)}`,
      `DTEND;TZID=Europe/Paris:${dt(r.date, r.end)}`,
      `SUMMARY:${esc(r.title + (r.company ? " — " + r.company.name : ""))}`,
      ...(r.location ? [`LOCATION:${esc(r.location)}`] : []),
      `DESCRIPTION:${esc([r.mode, r.note].filter(Boolean).join("\n"))}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="infracyb-agenda.ics"', "Cache-Control": "no-store" } });
}
