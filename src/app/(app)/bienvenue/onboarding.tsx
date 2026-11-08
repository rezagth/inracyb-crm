"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveOnboardingAction, type OnboardInput } from "@/server/actions/settings";
import { OFFER_KIT, NOT_DO, type OfferKey } from "@/lib/prospection";
import { Icon } from "@/components/icon";

const STEPS = ["Bienvenue", "Ton profil", "Tes offres", "Ta cible", "Tes objectifs", "C'est prêt"];
const SECTORS = ["Juridique", "Notariat", "Santé", "Expertise comptable", "Immobilier", "Autres"] as const;

type V = { legalName: string; phone: string; city: string; tradeName: string; iaBrand: string; offers: OfferKey[]; prixAudit: string; targetSectors: string[]; goalCalls: string; goalMails: string; goalRdv: string };

export function Onboarding({ initial }: { initial: V }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [v, setV] = useState<V>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof V) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const toggle = <K extends "offers" | "targetSectors">(k: K, val: string) => setV((x) => ({ ...x, [k]: (x[k] as string[]).includes(val) ? (x[k] as string[]).filter((y) => y !== val) : [...(x[k] as string[]), val] }));
  const next = () => {
    setErr(null);
    if (step === 2 && !v.offers.length) return setErr("Active au moins une offre.");
    if (step < 5) {
      if (step >= 1)
        start(async () => {
          const r = await saveOnboardingAction(v as unknown as OnboardInput, false);
          if (!r.ok) return setErr(r.error);
          setStep(step + 1);
        });
      else setStep(1);
      return;
    }
    start(async () => {
      const r = await saveOnboardingAction(v as unknown as OnboardInput, true);
      if (!r.ok) return setErr(r.error);
      router.push("/");
      router.refresh();
    });
  };
  const field = (k: keyof V, label: string, ph = "", type = "text") => (
    <label className="label">
      {label}
      <input className="input" type={type} value={v[k] as string} onChange={set(k)} placeholder={ph} inputMode={type === "number" ? "numeric" : undefined} />
    </label>
  );
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 py-4">
      <div className="flex flex-col gap-2">
        <span className="sec">
          Étape {step + 1} sur 6 · {STEPS[step]}
        </span>
        <span className="block h-1.5 rounded-full bg-muted">
          <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(((step + 1) / 6) * 100)}%` }} />
        </span>
      </div>
      <section className="card rise flex flex-col gap-4 p-6" key={step}>
        {step === 0 && (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Bienvenue dans ton CRM</h1>
            <p className="say text-muted-fg">En 2 minutes, on le règle pour toi : qui tu es, ce que tu vends, à qui, et tes objectifs. Tout ce que tu saisis sert à écrire tes scripts d&apos;appel, tes mails et tes réponses aux objections à ta place.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["p_appels", "Appels guidés", "Le script s'affiche étape par étape, les réponses aux objections à côté."],
                  ["mail", "Séquences de mails", "J0, J+3, J+7, J+14 : les relances se planifient toutes seules."],
                  ["p_factures", "Gestion complète", "Devis, factures, contrats, missions, trésorerie et conformité au même endroit."],
                ] as const
              ).map(([icon, t, d]) => (
                <div key={t} className="flex flex-col gap-1.5 rounded-xl border border-border-subtle p-4">
                  <span className="text-accent">
                    <Icon name={icon} />
                  </span>
                  <strong className="text-[13px]">{t}</strong>
                  <span className="text-xs text-subtle-fg">{d}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h2 className="text-base font-semibold">Ton profil</h2>
            <p className="text-[13px] text-muted-fg">Ces informations signent tes scripts et tes mails.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("legalName", "Prénom et nom", "Ex. Camille Martin")}
              {field("phone", "Téléphone", "06 …", "tel")}
              {field("city", "Ville")}
              {field("tradeName", "Marque cybersécurité", "InfraCyb")}
              {field("iaBrand", "Marque automatisation IA", "Elyrion Labs")}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h2 className="text-base font-semibold">Tes offres</h2>
            <p className="text-[13px] text-muted-fg">Active tes offres : chacune a son script d&apos;appel, sa séquence de mails et ses réponses aux objections.</p>
            {(["audit", "ciso", "ia"] as const).map((k) => {
              const on = v.offers.includes(k);
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => toggle("offers", k)} className={`flex items-start gap-3 rounded-xl border p-4 text-left ${on ? "border-accent bg-accent-soft" : "border-border-subtle"}`}>
                  <span className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded border ${on ? "border-primary bg-primary text-primary-fg" : "border-border bg-card"}`}>{on && <Icon name="check" size={12} />}</span>
                  <span className="flex flex-col gap-1">
                    <strong className="text-[13px]">
                      {OFFER_KIT[k].full} <span className="chip ml-1">{k === "ia" ? v.iaBrand || "Elyrion Labs" : v.tradeName || "InfraCyb"}</span>
                    </strong>
                    <span className="text-xs text-muted-fg">{OFFER_KIT[k].one}</span>
                  </span>
                </button>
              );
            })}
            {v.offers.includes("audit") && field("prixAudit", "Prix de ton audit forfaitaire (€ HT)", "Laisse vide si pas encore fixé", "number")}
            <div className="flex flex-col gap-1">
              <span className="sec">Ce que tu ne fais pas (dit honnêtement dans tes scripts)</span>
              {NOT_DO.map((x) => (
                <span key={x} className="flex gap-2 text-xs text-muted-fg">
                  <span className="text-ko">
                    <Icon name="x" size={14} />
                  </span>
                  {x}
                </span>
              ))}
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <h2 className="text-base font-semibold">Ta cible</h2>
            <p className="text-[13px] text-muted-fg">Les secteurs que tu appelles en priorité : ils passent en tête de ta file d&apos;appels.</p>
            <div className="flex flex-wrap gap-2">
              {SECTORS.map((sct) => (
                <button key={sct} type="button" aria-pressed={v.targetSectors.includes(sct)} className={`chipb ${v.targetSectors.includes(sct) ? "on" : ""}`} onClick={() => toggle("targetSectors", sct)}>
                  {sct}
                </button>
              ))}
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <h2 className="text-base font-semibold">Tes objectifs</h2>
            <p className="text-[13px] text-muted-fg">Réalistes et tenables : la régularité compte plus que le volume.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {field("goalCalls", "Appels par jour", "", "number")}
              {field("goalMails", "Mails par jour", "", "number")}
              {field("goalRdv", "RDV par semaine", "", "number")}
            </div>
          </>
        )}
        {step === 5 && (
          <>
            <h2 className="text-xl font-semibold tracking-tight">C&apos;est prêt{v.legalName ? `, ${v.legalName.split(" ")[0]}` : ""} !</h2>
            <p className="say text-muted-fg">Tes scripts, tes mails et tes réponses aux objections sont écrits pour tes offres. Prochaine étape : ajoute ton premier vrai prospect, puis lance ton premier appel guidé. La carte « Bien démarrer » du tableau de bord t&apos;accompagne.</p>
            <p className="tip">Pense aussi à compléter ton SIRET, ton adresse et ton IBAN dans Paramètres avant d&apos;envoyer ta première facture.</p>
          </>
        )}
        {err && (
          <p role="alert" className="pill tone-ko h-auto whitespace-normal px-3 py-1.5">
            {err}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-4">
          <button type="button" className="btn btn-ghost" disabled={step === 0 || pending} onClick={() => setStep(step - 1)}>
            ← Retour
          </button>
          <button type="button" className="btn btn-pri" disabled={pending} onClick={next}>
            {step === 0 ? "Commencer" : step === 5 ? "Aller au tableau de bord" : "Continuer"} →
          </button>
        </div>
      </section>
    </div>
  );
}
