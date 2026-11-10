"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { endCallAction, markMailSentAction, sendSequenceMailAction } from "@/server/actions/prospection";
import { NOT_DO, OFFER_FROM_COMPANY, OFFER_KIT, objections, salut, scripts, type OfferKey, type Profile } from "@/lib/prospection";
import { fd } from "@/lib/format";
import { Avatar, toneFor } from "@/components/ui";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";
import { initials } from "@/lib/format";

type P = { id: string; name: string; sector: string; stage: string; priority: string; offer: string; lastContact: string | null; contact: string; role: string; email: string; phone: string };
type Send = { companyId: string; offer: string; step: number; sentOn: string };
const TABS = [
  ["today", "Aujourd'hui"],
  ["call", "Script d'appel"],
  ["mail", "Séquence mails"],
  ["obj", "Objections"],
  ["offers", "Mes offres"],
] as const;
const COACH = [
  "Bloque un créneau d'appels fixe chaque jour, téléphone en main, mails fermés.",
  "Vise le rendez-vous, pas la vente : ton seul objectif au téléphone, c'est 20 minutes en visio.",
  "Après chaque appel, écris une phrase dans les notes : c'est ce qui rendra ta relance personnelle.",
  "Mails : envoie le J0 le matin, puis laisse le CRM te rappeler les relances J+3, J+7 et J+14.",
  "Reste honnête sur ton démarrage : un prix fixe et un livrable concret rassurent plus que des références inventées.",
];

export function Prospection({
  prospects,
  profile,
  offers,
  targets,
  goals,
  counts,
  sends,
  mailReady,
  dailyLimit,
  fromEmail,
  initial,
}: {
  prospects: P[];
  profile: Profile;
  offers: OfferKey[];
  targets: string[];
  goals: { calls: number; mails: number; rdv: number };
  counts: { calls: number; mails: number; rdvWeek: number };
  sends: Send[];
  mailReady: boolean;
  dailyLimit: number;
  fromEmail: string;
  initial: { co?: string; offer?: string; tab?: string; call?: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const offerFor = (c?: P): OfferKey => {
    const k = (c && OFFER_FROM_COMPANY[c.offer]) || "audit";
    return offers.includes(k) ? k : offers[0];
  };
  const prio = { haute: 0, moyenne: 1, basse: 2 } as Record<string, number>;
  const queue = useMemo(
    () =>
      prospects
        .filter((c) => c.stage === "qualif" || c.stage === "contacte")
        .sort((a, b) => Number(targets.includes(b.sector)) - Number(targets.includes(a.sector)) || (prio[a.priority] ?? 1) - (prio[b.priority] ?? 1) || (a.lastContact ?? "").localeCompare(b.lastContact ?? ""))
        .slice(0, 12),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prospects, targets],
  );
  const firstCo = prospects.find((p) => p.id === initial.co) ?? queue[0] ?? prospects[0];
  const [coId, setCoId] = useState(firstCo?.id ?? "");
  const co = prospects.find((p) => p.id === coId);
  const [offer, setOffer] = useState<OfferKey>(initial.offer && offers.includes(initial.offer as OfferKey) ? (initial.offer as OfferKey) : offerFor(firstCo));
  const [tab, setTab] = useState<string>(TABS.some(([k]) => k === initial.tab) ? initial.tab! : "today");
  const sentOf = (cid: string, off: string) => {
    const m: Record<number, string> = {};
    sends.filter((s) => s.companyId === cid && s.offer === off).forEach((s) => (!m[s.step] || s.sentOn < m[s.step]) && (m[s.step] = s.sentOn));
    return m;
  };
  const firstUnsent = (cid: string, off: string) => {
    const m = sentOf(cid, off);
    for (let i = 0; i < 4; i++) if (!m[i]) return i;
    return 3;
  };
  const [mailIdx, setMailIdx] = useState(co ? firstUnsent(co.id, offer) : 0);
  const [objQ, setObjQ] = useState("");
  const [objOpen, setObjOpen] = useState<string | null>(null);
  const [gc, setGc] = useState<{ co: string; offer: OfferKey; step: number; notes: string; objOpen: string | null } | null>(initial.call && firstCo ? { co: firstCo.id, offer: offerFor(firstCo), step: 0, notes: "", objOpen: null } : null);

  const SC = co ? scripts(co, offer, profile) : null;
  const objAll = co ? objections(co, offer, profile) : [];
  const pick = (cid: string, off: OfferKey, t?: string) => {
    setCoId(cid);
    setOffer(off);
    setMailIdx(firstUnsent(cid, off));
    setObjOpen(null);
    if (t) setTab(t);
  };
  const copy = (txt: string, label: string) =>
    navigator.clipboard.writeText(txt).then(
      () => toast(`${label} copié`),
      () => toast("Copie bloquée : sélectionne le texte puis Cmd+C"),
    );

  const goal = (l: string, v: number, g: number, color: string, sub: string) => ({ l, v, g, pct: g ? Math.min(100, Math.round((v / g) * 100)) : 0, color, sub });
  const goalCards = [
    goal("Appels aujourd'hui", counts.calls, goals.calls, "var(--accent)", counts.calls >= goals.calls && counts.calls ? "Objectif atteint, bravo." : `Reste ${Math.max(0, goals.calls - counts.calls)} appel(s) pour ton objectif`),
    goal("Mails envoyés aujourd'hui", counts.mails, goals.mails, "var(--warn-fg)", "Marque tes mails comme envoyés pour les compter"),
    goal("RDV obtenus cette semaine", counts.rdvWeek, goals.rdv, "var(--ok-fg)", "Le seul chiffre qui compte vraiment"),
  ];

  const seq = SC?.mails ?? [];
  const mIdx = Math.max(0, Math.min(mailIdx, seq.length - 1));
  const sent = co ? sentOf(co.id, offer) : {};
  const cm = seq[mIdx];
  const sal = co ? salut(co) : null;

  function markSent() {
    if (!co || !cm) return;
    start(async () => {
      const r = await markMailSentAction(co.id, offer, mIdx, cm.subject);
      if (!r.ok) return toast(r.error);
      toast(r.message);
      if (r.nextStep !== undefined) setMailIdx(r.nextStep);
      router.refresh();
    });
  }

  function sendNow() {
    if (!co || !cm) return;
    if (!window.confirm(`Envoyer le mail ${cm.k} à ${co.email} depuis ${fromEmail} ?`)) return;
    start(async () => {
      const r = await sendSequenceMailAction(co.id, offer, mIdx, cm.subject, cm.body);
      if (!r.ok) return toast(r.error);
      toast(r.message);
      if (r.nextStep !== undefined) setMailIdx(r.nextStep);
      router.refresh();
    });
  }

  if (!prospects.length)
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <span className="text-sm font-medium">Aucun prospect pour l&apos;instant</span>
        <span className="max-w-md text-[13px] text-muted-fg">Ajoute ta première entreprise : ses scripts d&apos;appel, ses mails et les réponses aux objections s&apos;écriront tout seuls.</span>
        <Link href="/entreprises/nouvelle" className="btn btn-pri btn-sm">
          <Icon name="plus" />
          Nouvelle entreprise
        </Link>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <section className="card rise flex flex-wrap items-end gap-4 p-5">
        <label className="label flex-[1_1_240px]">
          Prospect
          <select className="input" value={coId} onChange={(e) => pick(e.target.value, offerFor(prospects.find((p) => p.id === e.target.value)))}>
            {prospects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="label">
          Offre
          <div className="seg" role="group" aria-label="Offre">
            {offers.map((k) => (
              <button key={k} type="button" className={k === offer ? "on" : ""} aria-pressed={k === offer} onClick={() => co && pick(co.id, k)}>
                {OFFER_KIT[k].l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5 text-[13px]">
          <span className="text-xs text-subtle-fg">Scripts personnalisés pour</span>
          <span>
            <strong>{sal?.name}</strong> · {co?.name} · {co?.sector}
          </span>
          <span className="text-xs text-subtle-fg">{co && (offerFor(co) === offer ? `Offre notée sur sa fiche : ${OFFER_KIT[offer].l}` : `Sur sa fiche, l'offre notée est plutôt : ${OFFER_KIT[offerFor(co)].l}`)}</span>
        </div>
        <button type="button" className="btn btn-pri" onClick={() => co && setGc({ co: co.id, offer, step: 0, notes: "", objOpen: null })}>
          <Icon name="phone" />
          Lancer l&apos;appel guidé
        </button>
      </section>

      <div className="tbar" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" type="button" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "today" && (
        <>
          <section className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {goalCards.map((g, i) => (
              <article key={g.l} className="card rise flex flex-col gap-2.5 p-5" style={{ animationDelay: `${i * 50}ms` }}>
                <span className="text-[13px] text-muted-fg">{g.l}</span>
                <span className="num text-[26px] font-semibold tracking-tight">
                  {g.v} <span className="text-[15px] font-medium text-subtle-fg">/ {g.g}</span>
                </span>
                <span className="block h-1.5 rounded-full bg-muted">
                  <span className="block h-full rounded-full transition-[width]" style={{ width: `${g.pct}%`, background: g.color }} />
                </span>
                <span className="text-xs text-subtle-fg">{g.sub}</span>
              </article>
            ))}
          </section>
          <section className="card rise overflow-hidden p-0" style={{ animationDelay: "150ms" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-subtle px-5 py-4">
              <h2 className="text-sm font-medium">File d&apos;appels du jour</h2>
              <span className="text-xs text-subtle-fg">Prospects à qualifier ou déjà contactés · ta cible en premier, puis la priorité</span>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[820px]">
                {queue.map((c) => {
                  const off = offerFor(c);
                  return (
                    <div key={c.id} className="trow grid items-center gap-3 px-5" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1.2fr) 130px 110px 290px" }}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Avatar text={initials(c.name)} tone={toneFor(c.id)} />
                        <span className="flex min-w-0 flex-col">
                          <Link href={`/entreprises/${c.id}`} className="link truncate font-medium">
                            {c.name}
                          </Link>
                          <span className="truncate text-xs text-subtle-fg">
                            {salut(c).name}
                            {c.role ? ` · ${c.role}` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="truncate text-muted-fg">
                        {c.sector} {targets.includes(c.sector) && <span className="text-subtle-fg">· cible</span>}
                      </span>
                      <span>
                        <span className="chip">{OFFER_KIT[off].l}</span>
                      </span>
                      <span className="num text-xs text-subtle-fg">{c.lastContact ? `Contact ${fd(c.lastContact).slice(0, 5)}` : "Jamais contacté"}</span>
                      <span className="flex justify-end gap-1.5">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => pick(c.id, off, "call")}>
                          Script
                        </button>
                        <button type="button" className="btn btn-sec btn-sm" onClick={() => pick(c.id, off, "mail")}>
                          <Icon name="mail" />
                          Mail
                        </button>
                        <button type="button" className="btn btn-pri btn-sm" onClick={() => setGc({ co: c.id, offer: off, step: 0, notes: "", objOpen: null })}>
                          <Icon name="phone" />
                          Appel guidé
                        </button>
                      </span>
                    </div>
                  );
                })}
                {!queue.length && <div className="px-5 py-8 text-center text-[13px] text-muted-fg">Plus personne à appeler : ajoute de nouveaux prospects.</div>}
              </div>
            </div>
          </section>
          <section className="card rise flex flex-col gap-2.5 p-5" style={{ animationDelay: "200ms" }}>
            <h2 className="text-sm font-medium">Conseils du coach</h2>
            {COACH.map((t) => (
              <div key={t} className="flex items-start gap-2.5 text-[13px] leading-normal">
                <span className="mt-0.5 text-accent">
                  <Icon name="check" />
                </span>
                <span>{t}</span>
              </div>
            ))}
          </section>
        </>
      )}

      {tab === "call" && SC && (
        <section className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
            {SC.steps.map((st, i) => (
              <article key={st.t} className="card rise flex gap-3.5 p-5" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="stepn">{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <h3 className="text-sm font-medium">{st.t}</h3>
                  {st.lines.map((ln) => (
                    <p key={ln} className="say">
                      {ln}
                    </p>
                  ))}
                  {st.tip && <p className="tip">Conseil : {st.tip}</p>}
                </div>
              </article>
            ))}
          </div>
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
            <article className="card rise flex flex-col gap-2.5 p-5">
              <h3 className="text-sm font-medium">Message vocal</h3>
              <p className="say text-[13px]">{SC.vm}</p>
              <button type="button" className="btn btn-sec btn-sm self-start" onClick={() => copy(SC.vm, "Message vocal")}>
                <Icon name="copy" />
                Copier
              </button>
            </article>
            <article className="card rise flex flex-col gap-1.5 p-5" style={{ animationDelay: "60ms" }}>
              <h3 className="mb-1 text-sm font-medium">Objections fréquentes</h3>
              {objAll.slice(0, 5).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="mitem py-2"
                  onClick={() => {
                    setTab("obj");
                    setObjOpen(o.id);
                    setObjQ("");
                  }}
                >
                  <span className="flex-1">« {o.q} »</span>
                  <span className="text-subtle-fg">›</span>
                </button>
              ))}
            </article>
            <button type="button" className="btn btn-pri" onClick={() => co && setGc({ co: co.id, offer, step: 0, notes: "", objOpen: null })}>
              <Icon name="phone" />
              Lancer l&apos;appel guidé
            </button>
          </aside>
        </section>
      )}

      {tab === "mail" && cm && co && (
        <section className="flex flex-wrap items-start gap-4">
          <aside className="card rise flex flex-[1_1_260px] flex-col gap-1.5 p-3">
            <span className="sec px-2 py-1.5">Séquence · {OFFER_KIT[offer].l}</span>
            {seq.map((m, i) => (
              <button key={m.k} type="button" className={`mitem items-start py-2.5 ${i === mIdx ? "bg-muted" : ""}`} onClick={() => setMailIdx(i)} aria-current={i === mIdx}>
                <span className={`pill h-5 flex-none text-[11px] ${sent[i] ? "tone-ok" : i === mIdx ? "tone-info" : "tone-neu"}`}>{m.k}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{m.label}</span>
                  <span className="text-xs text-subtle-fg">{sent[i] ? `Envoyé le ${fd(sent[i])}` : i === 0 ? "À envoyer en premier" : `${m.d} jours après le premier mail`}</span>
                </span>
              </button>
            ))}
          </aside>
          <article className="card rise flex min-w-0 flex-[999_1_520px] flex-col gap-3.5 p-5" style={{ animationDelay: "60ms" }}>
            <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-border-subtle pb-3 text-[13px]">
              <span className="text-subtle-fg">À</span>
              <span>{co.email ? `${sal?.name} <${co.email}>` : "[e-mail du prospect à compléter]"}</span>
              <span className="text-subtle-fg">Objet</span>
              <span className="font-semibold">{cm.subject}</span>
              <span className="text-subtle-fg">Envoi</span>
              <span className="text-muted-fg">{sent[mIdx] ? `Envoyé le ${fd(sent[mIdx])}` : mIdx === 0 ? "Maintenant" : sent[0] ? `Prévu ${cm.d} jours après le ${fd(sent[0])}` : `${cm.d} jours après le premier mail`}</span>
            </div>
            <p className="mailbody">{cm.body}</p>
            <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
              <button type="button" className="btn btn-sec" onClick={() => copy(`Objet : ${cm.subject}\n\n${cm.body}`, "Mail")}>
                <Icon name="copy" />
                Copier le mail
              </button>
              <a className="btn btn-sec" href={`mailto:${co.email}?subject=${encodeURIComponent(cm.subject)}&body=${encodeURIComponent(cm.body)}`}>
                <Icon name="mail" />
                Ouvrir dans ma messagerie
              </a>
              <span className="flex-1" />
              <button type="button" className="btn btn-sec" disabled={pending} onClick={markSent}>
                <Icon name="check" />
                {sent[mIdx] ? "Déjà envoyé · marquer à nouveau" : "Marquer comme envoyé"}
              </button>
              <button
                type="button"
                className="btn btn-pri"
                disabled={pending || !mailReady || !co.email || !!sent[mIdx]}
                title={!mailReady ? "Brevo n'est pas configuré (BREVO_API_KEY)" : !co.email ? "Ajoute l'e-mail du contact principal" : sent[mIdx] ? "Cette étape est déjà envoyée" : `Envoi depuis ${fromEmail}`}
                onClick={sendNow}
              >
                <Icon name="mail" />
                Envoyer via Brevo
              </button>
            </div>
            {!mailReady && <p className="tip">Envoi direct désactivé : ajoute BREVO_API_KEY dans .env pour envoyer depuis le CRM.</p>}
            {mailReady && <p className="tip">Envoi direct depuis {fromEmail} · plafond {dailyLimit} mails par jour · les réponses arrivent dans ta boîte.</p>}
            <p className="tip">Conseil : {cm.tip}</p>
          </article>
        </section>
      )}

      {tab === "obj" && (
        <section className="card rise overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-border-subtle px-5 py-3.5">
            <label className="flex h-9 w-[320px] max-w-full items-center gap-2 rounded-lg border border-border px-2.5 text-subtle-fg">
              <Icon name="search" />
              <input value={objQ} onChange={(e) => setObjQ(e.target.value)} placeholder="Ce que le prospect vient de dire…" aria-label="Chercher une objection" className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none" />
            </label>
            <span className="text-xs text-subtle-fg">
              {objAll.length} objections · réponses adaptées à {co?.name} et à l&apos;offre {OFFER_KIT[offer].l}
            </span>
          </div>
          {objAll
            .filter((o) => !objQ.trim() || (o.q + " " + o.a).toLowerCase().includes(objQ.trim().toLowerCase()))
            .map((o) => (
              <div key={o.id} className="border-t border-border-subtle first:border-t-0">
                <button type="button" className="objq" aria-expanded={objOpen === o.id} onClick={() => setObjOpen(objOpen === o.id ? null : o.id)}>
                  <span>« {o.q} »</span>
                  <span className="text-subtle-fg">{objOpen === o.id ? "−" : "+"}</span>
                </button>
                {objOpen === o.id && (
                  <div className="px-3.5 pb-3.5">
                    <p className="say rounded-[10px] bg-muted px-3.5 py-3">{o.a}</p>
                  </div>
                )}
              </div>
            ))}
        </section>
      )}

      {tab === "offers" && (
        <>
          <section className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
            {offers.map((k, i) => {
              const O = OFFER_KIT[k];
              return (
                <article key={k} className="card rise flex flex-col gap-3 p-5" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold">{O.full}</h3>
                    <span className="chip">{k === "ia" ? profile.iaBrand || "Elyrion Labs" : profile.company || "InfraCyb"}</span>
                  </div>
                  <p className="say text-[13px] text-muted-fg">{O.one}</p>
                  <span className="sec">Inclus</span>
                  {O.incl.map((x) => (
                    <div key={x} className="flex gap-2 text-[13px]">
                      <span className="text-ok">
                        <Icon name="check" />
                      </span>
                      <span>{x}</span>
                    </div>
                  ))}
                  {O.hasNot && (
                    <>
                      <span className="sec">Ce que je ne fais pas</span>
                      {NOT_DO.map((x) => (
                        <div key={x} className="flex gap-2 text-[13px] text-muted-fg">
                          <span className="text-ko">
                            <Icon name="x" />
                          </span>
                          <span>{x}</span>
                        </div>
                      ))}
                    </>
                  )}
                  <div className="flex items-center justify-between border-t border-border-subtle pt-3 text-[13px]">
                    <span className="text-muted-fg">Prix</span>
                    <span className="num font-semibold">
                      {k === "audit" ? (profile.prixAuditCents > 0 ? `${Math.round(profile.prixAuditCents / 100).toLocaleString("fr-FR")} € HT, prix fixe` : "Prix fixe à définir") : k === "ciso" ? "Sur devis, selon la taille" : "Sur devis, à partir d'une première tâche"}
                    </span>
                  </div>
                </article>
              );
            })}
          </section>
          <Link href="/parametres#profil" className="btn btn-sec self-start">
            Modifier mes offres et mes prix
          </Link>
        </>
      )}

      {gc && <GuidedCall gc={gc} setGc={setGc} prospects={prospects} profile={profile} onDone={(r, coId, off) => {
        toast(r);
        router.refresh();
        if (r.startsWith("Bravo")) router.push(`/rdv?new=1&co=${coId}`);
        if (r.includes("mail J0")) pick(coId, off, "mail");
      }} />}
    </div>
  );
}

function GuidedCall({
  gc,
  setGc,
  prospects,
  profile,
  onDone,
}: {
  gc: { co: string; offer: OfferKey; step: number; notes: string; objOpen: string | null };
  setGc: (g: typeof gc | null) => void;
  prospects: P[];
  profile: Profile;
  onDone: (message: string, coId: string, offer: OfferKey) => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const c = prospects.find((p) => p.id === gc.co);
  if (!c) return null;
  const sc = scripts(c, gc.offer, profile);
  const steps = sc.steps;
  const st = Math.min(gc.step, steps.length);
  const isEnd = st === steps.length;
  const cur = steps[st];
  const objs = objections(c, gc.offer, profile);
  const set = (o: Partial<typeof gc>) => setGc({ ...gc, ...o });
  const end = (outcome: string) =>
    start(async () => {
      const r = await endCallAction(c.id, gc.offer, outcome, gc.notes);
      if (!r.ok) return toast(r.error);
      setGc(null);
      onDone(r.message, c.id, gc.offer);
    });
  const outcomes = [
    ["rdv", "RDV obtenu", "ok", "Enregistre l'appel et ouvre le formulaire de rendez-vous."],
    ["rappel", "À rappeler", "info", "Rappel planifié dans 2 jours ouvrés."],
    ["mail", "Veut un mail", "info", "Ouvre sa séquence de mails, prête à envoyer."],
    ["messagerie", "Messagerie", "warn", "Laisse le message vocal ; nouvel essai dans 2 jours ouvrés."],
    ["non", "Pas intéressé", "ko", "Enregistre l'appel et passe l'entreprise en Perdu."],
  ] as const;
  return (
    <div className="no-print fixed inset-0 z-40 grid place-items-center bg-[rgb(10_26_58/0.4)] p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={`Appel guidé — ${c.name}`}>
      <div className="card flex max-h-[calc(100dvh-32px)] w-[min(1000px,100%)] flex-col overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="sec">Appel guidé · {OFFER_KIT[gc.offer].l}</span>
            <span className="text-base font-semibold">{c.name}</span>
            <span className="num text-[13px] text-muted-fg">
              {sc.x.sal.name}
              {c.role ? ` · ${c.role}` : ""}
              {c.phone ? (
                <>
                  {" · "}
                  <a className="link" href={`tel:${c.phone.replace(/\s/g, "")}`}>
                    {c.phone}
                  </a>
                </>
              ) : (
                " · numéro à compléter"
              )}
            </span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => confirm("Quitter sans enregistrer l'appel ?") && setGc(null)}>
            Quitter sans enregistrer
          </button>
        </div>
        <div className="flex flex-wrap overflow-y-auto">
          <div className="flex min-w-0 flex-[2_1_440px] flex-col gap-3.5 border-r border-border-subtle p-5">
            <div className="flex gap-1" aria-hidden>
              {Array.from({ length: steps.length + 1 }, (_, i) => (
                <span key={i} className="h-1 flex-1 rounded-full transition-colors" style={{ background: i < st ? "var(--ok-fg)" : i === st ? "var(--accent)" : "var(--muted)" }} />
              ))}
            </div>
            {!isEnd ? (
              <div className="flex flex-col gap-3" aria-live="polite">
                <span className="sec">
                  Étape {st + 1} · {cur.t}
                </span>
                {cur.lines.map((ln) => (
                  <p key={ln} className="say text-base leading-relaxed">
                    {ln}
                  </p>
                ))}
                {cur.tip && <p className="tip">Conseil : {cur.tip}</p>}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <span className="sec">Comment s&apos;est terminé l&apos;appel ?</span>
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                  {outcomes.map(([k, l, tone, s]) => (
                    <button key={k} type="button" disabled={pending} onClick={() => end(k)} className="card flex flex-col items-start gap-1.5 p-3 text-left hover:shadow-[var(--shadow-hover)]">
                      <span className={`pill tone-${tone}`}>{l}</span>
                      <span className="text-xs text-subtle-fg">{s}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="label">
              Notes de l&apos;appel (enregistrées dans l&apos;historique)
              <textarea className="input" value={gc.notes} maxLength={2000} onChange={(e) => set({ notes: e.target.value })} placeholder="Ce qu'il a dit, son besoin, la prochaine étape…" />
            </label>
          </div>
          <div className="flex max-h-[520px] min-w-0 flex-[1_1_280px] flex-col gap-1 overflow-y-auto p-4">
            <span className="sec px-1.5 pb-2 pt-1">Il objecte ? Clique pour la réponse</span>
            {objs.map((o) => (
              <div key={o.id} className="rounded-lg border border-border-subtle">
                <button type="button" className="objq px-2.5 py-2 text-[12.5px]" aria-expanded={gc.objOpen === o.id} onClick={() => set({ objOpen: gc.objOpen === o.id ? null : o.id })}>
                  <span>« {o.q} »</span>
                  <span className="text-subtle-fg">{gc.objOpen === o.id ? "−" : "+"}</span>
                </button>
                {gc.objOpen === o.id && <p className="say px-2.5 pb-2.5 text-[13px]">{o.a}</p>}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
          <button type="button" className="btn btn-ghost" disabled={st === 0} onClick={() => set({ step: st - 1 })}>
            ← Précédent
          </button>
          <span className="num text-xs text-subtle-fg">{isEnd ? "Dernière étape : le résultat" : `Étape ${st + 1} sur ${steps.length}`}</span>
          {!isEnd ? (
            <button type="button" className="btn btn-pri" onClick={() => set({ step: st + 1 })}>
              {st === steps.length - 1 ? "Terminer l'appel" : "Étape suivante"} →
            </button>
          ) : (
            <span className="w-[120px]" />
          )}
        </div>
      </div>
    </div>
  );
}
