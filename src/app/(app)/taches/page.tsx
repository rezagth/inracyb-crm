import Link from "next/link";
import { companyOptions, listTasks } from "@/server/queries";
import { PRIORITIES } from "@/lib/constants";
import { fd, today } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { TaskCheck } from "./task-check";
import { DeleteTaskButton, StandaloneTaskForm } from "./task-forms";

export const metadata = { title: "Tâches" };

const FILTERS = [
  ["todo", "À faire"],
  ["late", "En retard"],
  ["done", "Faites"],
  ["all", "Toutes"],
] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "todo" } = await searchParams;
  const filter = (FILTERS.find(([k]) => k === f)?.[0] ?? "todo") as (typeof FILTERS)[number][0];
  const rows = await listTasks(filter);
  const t = today();
  const groups: { title: string; items: typeof rows }[] =
    filter === "todo"
      ? [
          { title: "En retard", items: rows.filter((r) => r.dueDate < t) },
          { title: "Aujourd'hui", items: rows.filter((r) => r.dueDate === t) },
          { title: "À venir", items: rows.filter((r) => r.dueDate > t) },
        ]
      : [{ title: "", items: rows }];
  return (
    <>
      <PageHeader title="Tâches" subtitle="Relances, rappels et suivis. Les tâches liées à un client apparaissent aussi sur sa fiche." />
      <Card className="mb-4">
        <div className="p-5">
          <StandaloneTaskForm companies={(await companyOptions())} />
        </div>
      </Card>
      <Card>
        <div className="border-b border-border-subtle px-5 py-3">
          <nav className="seg" aria-label="Filtre">
            {FILTERS.map(([k, l]) => (
              <Link key={k} href={`/taches?f=${k}`} className={filter === k ? "on" : ""} aria-current={filter === k ? "page" : undefined}>
                {l}
              </Link>
            ))}
          </nav>
        </div>
        {rows.length === 0 ? (
          <EmptyState title={filter === "todo" ? "Rien à faire, profites-en" : "Aucune tâche"} />
        ) : (
          groups
            .filter((g) => g.items.length)
            .map((g) => (
              <div key={g.title || "all"}>
                {g.title && <h2 className={`px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-[0.06em] ${g.title === "En retard" ? "text-ko" : "text-subtle-fg"}`}>{g.title}</h2>}
                <ul>
                  {g.items.map((tk) => {
                    const pr = PRIORITIES.find((p) => p.id === tk.priority);
                    return (
                      <li key={tk.id} className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-5 py-2.5 first:border-t-0">
                        <TaskCheck id={tk.id} done={tk.done} label={tk.title} />
                        <span className={`min-w-[200px] flex-1 text-[13px] ${tk.done ? "text-subtle-fg line-through" : "font-medium"}`}>{tk.title}</span>
                        {tk.company && (
                          <Link className="link text-xs" href={`/entreprises/${tk.company.id}?tab=taches`}>
                            {tk.company.name}
                          </Link>
                        )}
                        {pr && !tk.done && <Badge tone={pr.tone}>{pr.label}</Badge>}
                        <span className={`num w-[84px] text-right text-xs ${!tk.done && tk.dueDate < t ? "text-ko" : "text-subtle-fg"}`}>{fd(tk.dueDate)}</span>
                        <DeleteTaskButton id={tk.id} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
        )}
      </Card>
    </>
  );
}
