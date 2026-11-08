"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addFavoriteAction } from "@/server/actions/settings";
import { useToast } from "@/components/mod/toast";
import { useDarkClass, writePref } from "@/lib/client-prefs";
import { Icon } from "../icon";
import { logoutAction } from "@/app/(auth)/actions";

export function Topbar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const dark = useDarkClass();
  const toast = useToast();
  const [, start] = useTransition();
  const addFav = () =>
    start(async () => {
      const label = (document.title.split(" · ")[0] || "Page").slice(0, 60);
      const href = window.location.pathname + window.location.search;
      const name = prompt("Nom du favori", label);
      if (!name) return;
      const r = await addFavoriteAction(name, href);
      toast(r.ok ? (r.message ?? "Ajouté") : r.error);
      router.refresh();
    });
  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    writePref("icrm-theme", next ? "dark" : "light");
  };
  return (
    <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-6 max-sm:px-4">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/entreprises?q=${encodeURIComponent(q)}`);
        }}
        className="flex h-9 w-full max-w-[320px] items-center gap-2 rounded-lg border border-border bg-bg px-2.5 text-subtle-fg"
      >
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une entreprise…" aria-label="Rechercher une entreprise" className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none" />
      </form>
      <div className="flex items-center gap-2">
        <button type="button" onClick={addFav} className="btn btn-sec size-9 p-0" aria-label="Ajouter cette page aux favoris" title="Ajouter aux favoris">
          <Icon name="star" />
        </button>
        <button type="button" onClick={toggleTheme} className="btn btn-sec size-9 p-0" aria-label={dark ? "Passer en mode clair" : "Passer en mode sombre"}>
          <Icon name={dark ? "sun" : "moon"} />
        </button>
        <form action={logoutAction}>
          <button type="submit" className="btn btn-sec size-9 p-0" aria-label="Se déconnecter" title="Se déconnecter">
            <Icon name="logout" />
          </button>
        </form>
      </div>
    </header>
  );
}
