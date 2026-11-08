"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useTransition } from "react";
import { usePref, writePref } from "@/lib/client-prefs";
import { HELP } from "@/lib/help";
import { removeFavoriteAction } from "@/server/actions/settings";
import { Icon, type IconName } from "../icon";

type Item = { key: string; href: string; label: string; icon: IconName; badge?: number };
type Group = { label: string; items: Item[] };

function helpKey(pathname: string) {
  if (pathname === "/") return "dashboard";
  if (/^\/entreprises\/[^/]+$/.test(pathname) && pathname !== "/entreprises/nouvelle") return "fiche";
  const seg = pathname.split("/")[1];
  return HELP[seg] ? seg : "dashboard";
}

export function Sidebar({ groups, user, favorites }: { groups: Group[]; user: { name: string; email: string }; favorites: { id: string; label: string; href: string }[] }) {
  const pathname = usePathname();
  const collapsed = usePref("icrm-sidebar") === "1";
  const folded = (usePref("icrm-navfold") ?? "").split(",").filter(Boolean);
  const favOpen = usePref("icrm-favs") !== "0";
  const helpRef = useRef<HTMLDialogElement>(null);
  const [, start] = useTransition();
  const toggle = () => writePref("icrm-sidebar", collapsed ? "0" : "1");
  const fold = (g: string) => writePref("icrm-navfold", (folded.includes(g) ? folded.filter((x) => x !== g) : [...folded, g]).join(","));
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hk = helpKey(pathname);
  const pageLabel = groups.flatMap((g) => g.items).find((i) => i.key === hk)?.label ?? (hk === "fiche" ? "Fiche entreprise" : "Tableau de bord");

  return (
    <aside
      className={`no-print sticky top-0 flex h-screen shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-sidebar px-3 py-4 transition-[width] max-md:static max-md:h-auto max-md:w-full max-md:flex-row max-md:items-center max-md:gap-2 max-md:border-b max-md:border-r-0 max-md:py-2 ${collapsed ? "w-[72px]" : "w-[240px]"}`}
    >
      <div className="flex items-center gap-2.5 px-1">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-primary text-primary-fg">
          <Icon name="shield" />
        </span>
        {!collapsed && (
          <span className="flex min-w-0 flex-1 flex-col max-md:hidden">
            <span className="text-sm font-semibold">InfraCyb CRM</span>
            <span className="text-xs text-subtle-fg">Gestion d&apos;entreprise</span>
          </span>
        )}
        <button type="button" onClick={toggle} className="btn btn-ghost size-7 p-0 max-md:hidden" aria-label={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}>
          <Icon name="panel" />
        </button>
      </div>
      <nav aria-label="Navigation principale" className="flex flex-col gap-1.5 max-md:flex-1 max-md:flex-row max-md:gap-1 max-md:overflow-x-auto">
        {groups.map((g) => {
          const isFolded = folded.includes(g.label) && !collapsed && !g.items.some((it) => isActive(it.href));
          return (
            <div key={g.label} className="flex flex-col gap-px max-md:flex-row max-md:gap-1">
              {!collapsed && (
                <button type="button" onClick={() => fold(g.label)} aria-expanded={!isFolded} className="flex items-center justify-between rounded-md px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle-fg hover:text-fg max-md:hidden">
                  {g.label}
                  <span aria-hidden>{isFolded ? "›" : "⌄"}</span>
                </button>
              )}
              {!isFolded &&
                g.items.map((it) => {
                  const active = isActive(it.href);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      title={it.label}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-8 shrink-0 items-center gap-2.5 rounded-full px-2.5 text-[13px] transition-colors ${active ? "bg-muted font-medium text-fg" : "text-muted-fg hover:bg-muted hover:text-fg"}`}
                    >
                      <Icon name={it.icon} />
                      {!collapsed && <span className="flex-1 truncate">{it.label}</span>}
                      {!collapsed && !!it.badge && <span className="pill tone-ko h-[18px] px-1.5 text-[11px] font-semibold">{it.badge}</span>}
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>
      {!collapsed && (
        <div className="flex flex-col gap-px max-md:hidden">
          <button type="button" onClick={() => writePref("icrm-favs", favOpen ? "0" : "1")} aria-expanded={favOpen} className="flex items-center justify-between rounded-md px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle-fg hover:text-fg">
            Favoris
            <span aria-hidden>{favOpen ? "⌄" : "›"}</span>
          </button>
          {favOpen &&
            (favorites.length ? (
              favorites.map((f) => (
                <span key={f.id} className="group flex items-center">
                  <Link href={f.href} className="flex h-[30px] min-w-0 flex-1 items-center rounded-lg pl-8 pr-2 text-[13px] text-muted-fg hover:bg-muted hover:text-fg">
                    <span className="truncate">{f.label}</span>
                  </Link>
                  <button type="button" className="btn btn-ghost size-6 p-0 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Retirer ${f.label} des favoris`} onClick={() => start(async () => void (await removeFavoriteAction(f.id)))}>
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))
            ) : (
              <span className="px-2.5 py-1 text-xs text-subtle-fg">Clique l&apos;étoile en haut d&apos;une page pour l&apos;ajouter ici.</span>
            ))}
        </div>
      )}
      <div className="flex-1 max-md:hidden" />
      <button type="button" onClick={() => helpRef.current?.showModal()} className="flex h-8 items-center gap-2.5 rounded-full px-2.5 text-[13px] text-muted-fg hover:bg-muted hover:text-fg max-md:hidden" title="Guide et démarrage">
        <Icon name="help" />
        {!collapsed && "Guide et démarrage"}
      </button>
      <div className="flex items-center gap-2.5 px-1 max-md:hidden">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-fg">{initials || "IN"}</span>
        {!collapsed && (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-medium">{user.name}</span>
            <span className="truncate text-xs text-subtle-fg">{user.email}</span>
          </span>
        )}
      </div>
      <dialog ref={helpRef} className="modal" aria-labelledby="dlg-help" onClick={(e) => e.target === helpRef.current && helpRef.current?.close()}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="sec">Guide</span>
              <h2 id="dlg-help" className="text-base font-semibold">
                {pageLabel}
              </h2>
            </div>
            <button type="button" className="btn btn-ghost size-8 p-0" aria-label="Fermer" onClick={() => helpRef.current?.close()}>
              <Icon name="x" />
            </button>
          </div>
          <ol className="flex flex-col gap-2.5">
            {(HELP[hk] ?? HELP.dashboard).map((t, i) => (
              <li key={i} className="flex gap-3 text-[13px] leading-normal">
                <span className="stepn size-6 text-[11px]">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4">
            <Link href="/bienvenue" className="btn btn-sec btn-sm" onClick={() => helpRef.current?.close()}>
              Refaire le démarrage accompagné
            </Link>
            <Link href="/" className="btn btn-ghost btn-sm" onClick={() => helpRef.current?.close()}>
              Voir « Bien démarrer »
            </Link>
          </div>
        </div>
      </dialog>
    </aside>
  );
}
