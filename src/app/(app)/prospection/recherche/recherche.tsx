"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { findPhoneAction, importProspectsAction, searchProspectsAction } from "@/server/actions/prospect-search";
import { EFFECTIFS, OFFER_SIZES, type OfferKey, type Sector } from "@/lib/prospect-search";
import type { FoundPage } from "@/server/prospect-search";
import { OFFER_KIT } from "@/lib/prospection";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";

type Contact = { phone: string; website: string; none?: boolean };

export function Recherche({ offers, sectors, defaultSector, placesOn }: { offers: OfferKey[]; sectors: { id: Sector; hint: string }[]; defaultSector: Sector; placesOn: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [offer, setOffer] = useState<OfferKey>(offers[0]);
  const [sector, setSector] = useState<Sector>(defaultSector);
  const [dept, setDept] = useState("");
  const [query, setQuery] = useState("");
  const [eff, setEff] = useState<string[]>(OFFER_SIZES[offers[0]]);
  const [res, setRes] = useState<FoundPage | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [info, setInfo] = useState<Record<string, Contact>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const chooseOffer = (o: OfferKey) => {
    setOffer(o);
    setEff(OFFER_SIZES[o]);
  };
  const toggleEff = (c: string) => setEff((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]));

  function run(page: number) {
    start(async () => {
      const r = await searchProspectsAction({ offer, sector, departement: dept.trim().toUpperCase(), effectifs: eff, query, page });
      if (!r.ok) return toast(r.error);
      setRes(r.page);
      setSel(new Set());
    });
  }

  const selectable = (res?.items ?? []).filter((c) => !c.blocked && !c.inCrm);
  const allOn = selectable.length > 0 && selectable.every((c) => sel.has(c.siren));
  const toggle = (siren: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(siren)) n.delete(siren);
      else n.add(siren);
      return n;
    });

  async function lookup(siren: string) {
    const c = res?.items.find((x) => x.siren === siren);
    if (!c) return;
    setBusy(siren);
    const r = await findPhoneAction({ name: c.name, city: c.city, postalCode: c.postalCode });
    setBusy(null);
    if (!r.ok) return toast(r.error);
    if (!r.phone && !r.website) toast("Rien de fiable trouvé pour cette entreprise.");
    setInfo((m) => ({ ...m, [siren]: { phone: r.phone, website: r.website, none: !r.phone && !r.website } }));
  }

  function addSelected() {
    const items = [...sel].map((siren) => ({ siren, phone: info[siren]?.phone ?? "", website: info[siren]?.website ?? "" }));
    start(async () => {
      const r = await importProspectsAction({ offer, items });
      if (!r.ok) return toast(r.error);
      toast(r.message);
      setRes((p) => (p ? { ...p, items: p.items.map((c) => (r.added.includes(c.siren) ? { ...c, inCrm: true } : c)) } : p));
      setSel(new Set());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="card rise flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(1);
        }}
      >
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <label className="label">
            Service à proposer
            <select className="input" value={offer} onChange={(e) => chooseOffer(e.target.value as OfferKey)}>
              {offers.map((o) => (
                <option key={o} value={o}>
                  {OFFER_KIT[o].l}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Secteur
            <select className="input" value={sector} onChange={(e) => setSector(e.target.value as Sector)}>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.hint}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Département (facultatif)
            <input className="input" value={dept} onChange={(e) => setDept(e.target.value)} maxLength={3} placeholder="Toute la France" inputMode="text" />
          </label>
          <label className="label">
            Mot-clé dans le nom (facultatif)
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={80} placeholder="Ex. cabinet, étude…" />
          </label>
        </div>
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 border-0 p-0">
          <legend className="label mb-1 p-0">Taille (salariés) : préréglée selon le service</legend>
          {EFFECTIFS.map((e) => (
            <label key={e.code} className="flex items-center gap-1.5 text-[13px]">
              <input type="checkbox" checked={eff.includes(e.code)} onChange={() => toggleEff(e.code)} />
              {e.label}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-pri" disabled={pending}>
            <Icon name="search" />
            {pending && !res ? "Recherche…" : "Rechercher"}
          </button>
          <span className="text-xs text-subtle-fg">Source : Annuaire des Entreprises (données officielles). Les entreprises qui ont refusé la prospection commerciale sont exclues.</span>
        </div>
      </form>

      {res && (
        <section className="card rise overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-3.5">
            <div className="flex flex-col">
              <strong className="text-sm">{res.total.toLocaleString("fr-FR")} entreprise(s) trouvée(s)</strong>
              <span className="text-xs text-subtle-fg">
                Page {res.page} sur {Math.max(res.totalPages, 1)} · coche celles à ajouter (25 maximum à la fois)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-sec btn-sm" disabled={pending || res.page <= 1} onClick={() => run(res.page - 1)}>
                <Icon name="chevL" />
                Précédente
              </button>
              <button type="button" className="btn btn-sec btn-sm" disabled={pending || res.page >= res.totalPages} onClick={() => run(res.page + 1)}>
                Suivante
                <Icon name="chevR" />
              </button>
              <button type="button" className="btn btn-pri btn-sm" disabled={pending || sel.size === 0} onClick={addSelected}>
                <Icon name="plus" />
                Ajouter {sel.size ? sel.size : ""} au pipeline
              </button>
            </div>
          </div>

          {res.items.length === 0 ? (
            <p className="p-8 text-center text-[13px] text-muted-fg">Aucun résultat avec ces critères. Élargis la taille, retire le département ou le mot-clé.</p>
          ) : (
            <>
              <label className="flex items-center gap-2 border-b border-border-subtle bg-muted px-5 py-2 text-xs text-muted-fg">
                <input type="checkbox" checked={allOn} disabled={!selectable.length} onChange={() => setSel(allOn ? new Set() : new Set(selectable.map((c) => c.siren)))} />
                Tout cocher sur cette page ({selectable.length} possible(s))
              </label>
              <ul>
                {res.items.map((c) => {
                  const off = c.blocked || c.inCrm;
                  const ci = info[c.siren];
                  return (
                    <li key={c.siren} className={`flex flex-wrap items-start gap-3 border-b border-border-subtle px-5 py-3 text-[13px] ${off ? "opacity-60" : ""}`}>
                      <input type="checkbox" className="mt-1" checked={sel.has(c.siren)} disabled={off} onChange={() => toggle(c.siren)} aria-label={`Sélectionner ${c.name}`} />
                      <div className="flex min-w-0 flex-[2_1_240px] flex-col gap-0.5">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-subtle-fg">
                          {c.sector} · NAF {c.naf} · SIREN {c.siren}
                        </span>
                        <span className="text-xs text-muted-fg">{[c.postalCode, c.city].filter(Boolean).join(" ")}</span>
                      </div>
                      <div className="flex min-w-0 flex-[1_1_160px] flex-col gap-0.5">
                        <span>{c.effectif}</span>
                        <span className="text-xs text-muted-fg">{c.director ? `${[c.director.firstName, c.director.lastName].filter(Boolean).join(" ")}${c.director.role ? " · " + c.director.role : ""}` : "Dirigeant non renseigné"}</span>
                      </div>
                      <div className="flex min-w-0 flex-[1_1_180px] flex-col items-start gap-1">
                        {c.blocked && <span className="pill tone-ko">Refuse la prospection</span>}
                        {c.inCrm && <span className="pill tone-ok">Déjà dans le CRM</span>}
                        {!off && ci && (ci.phone || ci.website) && (
                          <span className="text-xs text-muted-fg">
                            {ci.phone}
                            {ci.phone && ci.website ? " · " : ""}
                            {ci.website}
                          </span>
                        )}
                        {!off && ci?.none && <span className="text-xs text-subtle-fg">Rien de fiable trouvé</span>}
                        {!off && !ci && placesOn && (
                          <button type="button" className="btn btn-sec btn-sm" disabled={busy === c.siren} onClick={() => lookup(c.siren)}>
                            <Icon name="phone" />
                            {busy === c.siren ? "Recherche…" : "Téléphone et site"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <p className="tip m-4">
            Cette base ne contient ni e-mail ni téléphone : après l&apos;ajout, retrouve l&apos;e-mail du dirigeant (site de l&apos;entreprise, LinkedIn) avant d&apos;envoyer. Reste sur des envois individuels, vers des adresses professionnelles, avec une phrase de désinscription.
            {!placesOn && " Le bouton « Téléphone et site » apparaît quand GOOGLE_PLACES_API_KEY est configurée."}
          </p>
        </section>
      )}
    </div>
  );
}
