import { after } from "next/server";
import { and, eq, lt, ne, sql } from "drizzle-orm";
import { BUILT, NAV } from "@/lib/nav";
import { dailyScan, syncStratcyberIfDue } from "@/server/automations";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { today } from "@/lib/format";
import { Sidebar } from "@/components/shell/sidebar";
import { ToastProvider } from "@/components/mod/toast";
import { Topbar } from "@/components/shell/topbar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await dailyScan();
  after(() => syncStratcyberIfDue());
  const t = today();
  const lateTasks = (await db.select({ c: sql<number>`count(*)::int` }).from(schema.tasks).where(and(eq(schema.tasks.done, false), lt(schema.tasks.dueDate, t))).limit(1))[0]?.c ?? 0;
  const lateInvoices =
    (await db
            .select({ c: sql<number>`count(*)::int` })
            .from(schema.invoices)
            .where(and(eq(schema.invoices.kind, "facture"), eq(schema.invoices.status, "envoyee"), lt(schema.invoices.dueDate, t))).limit(1))[0]?.c ?? 0;

  const hotTickets = (await db.select({ c: sql<number>`count(*)::int` }).from(schema.tickets).where(and(eq(schema.tickets.priority, "haute"), ne(schema.tickets.status, "resolu"))).limit(1))[0]?.c ?? 0;
  const badges: Record<string, number> = { taches: lateTasks, factures: lateInvoices, support: hotTickets };
  const groups = NAV.map((g) => ({ label: g.label, items: g.items.filter((it) => BUILT.has(it.key)).map((it) => ({ key: it.key, href: it.href, label: it.label, icon: it.icon, badge: badges[it.key] })) })).filter((g) => g.items.length);

  return (
    <ToastProvider>
    <div className="flex min-h-screen max-md:flex-col">
      <Sidebar groups={groups} user={{ name: user.name, email: user.email }} favorites={(await db.select({ id: schema.favorites.id, label: schema.favorites.label, href: schema.favorites.href }).from(schema.favorites).orderBy(schema.favorites.position))} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6 max-sm:px-4">{children}</main>
      </div>
    </div>
    </ToastProvider>
  );
}
