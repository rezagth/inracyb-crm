"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";
import { markPostPublishedAction, savePostContentAction } from "@/server/actions/posts";
import type { PostVisual } from "@/lib/post-visual";

/** Détail d'un post : texte à copier, image à télécharger, « publié », et modification du texte et de l'image. */
export function PostPanel({ id, body, visual, published, today }: { id: string; body: string; visual: PostVisual | null; published: boolean; today: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(body);
  const [v, setV] = useState<PostVisual>(visual ?? { kicker: "", big: "", sub: "" });
  const [stamp, setStamp] = useState(0);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? (r.message ?? "OK") : (r.error ?? "Erreur"));
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => toast("Texte copié : colle-le dans LinkedIn"),
      () => toast("Copie bloquée : sélectionne le texte"),
    );
  const img = `/api/posts/${id}/image?v=${stamp}`;

  return (
    <div className={`flex flex-col gap-3 px-5 py-4 text-[13px] ${today && !published ? "bg-muted" : ""}`}>
      {today && !published && <p className="font-medium">À publier aujourd&apos;hui, avant 9 h.</p>}
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-[260px] flex-1 flex-col gap-2">
          {edit ? (
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} rows={14} className="input w-full font-normal" aria-label="Texte du post" />
          ) : (
            <p className="whitespace-pre-line rounded-md border border-border-subtle px-3 py-2">{text || "Pas encore de texte : clique sur « Modifier »."}</p>
          )}
        </div>
        <div className="flex w-[240px] flex-col gap-2">
          {visual || edit ? (
            // eslint-disable-next-line @next/next/no-img-element
            visual && <img src={img} alt={`Image du post : ${visual.big}`} width={240} height={240} className="rounded-md border border-border-subtle" />
          ) : (
            <p className="text-muted-fg">Pas d&apos;image : ajoute un chiffre ou une phrase forte avec « Modifier ».</p>
          )}
          {edit && (
            <>
              <input className="input" value={v.kicker} maxLength={60} placeholder="Surtitre (ex. : DMARC)" onChange={(e) => setV({ ...v, kicker: e.target.value })} aria-label="Surtitre de l'image" />
              <input className="input" value={v.big} maxLength={40} placeholder="Chiffre ou phrase forte (ex. : 57 %)" onChange={(e) => setV({ ...v, big: e.target.value })} aria-label="Chiffre ou phrase forte" />
              <input className="input" value={v.sub} maxLength={140} placeholder="Légende" onChange={(e) => setV({ ...v, sub: e.target.value })} aria-label="Légende de l'image" />
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!edit && text && (
          <button type="button" className="btn btn-pri btn-sm" onClick={copy}>
            <Icon name="copy" />
            Copier le texte
          </button>
        )}
        {!edit && visual && (
          <a className="btn btn-sec btn-sm" href={`/api/posts/${id}/image?download=1`}>
            Télécharger l&apos;image
          </a>
        )}
        {!edit && !published && (
          <button type="button" className="btn btn-sec btn-sm" disabled={pending} onClick={() => run(() => markPostPublishedAction(id))}>
            Marquer comme publié
          </button>
        )}
        {edit ? (
          <>
            <button type="button" className="btn btn-pri btn-sm" disabled={pending} onClick={() => run(() => savePostContentAction({ id, body: text, ...v }), () => { setEdit(false); setStamp(Date.now()); })}>
              Enregistrer
            </button>
            <button type="button" className="btn btn-sec btn-sm" disabled={pending} onClick={() => { setEdit(false); setText(body); setV(visual ?? { kicker: "", big: "", sub: "" }); }}>
              Annuler
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sec btn-sm" onClick={() => setEdit(true)}>
            Modifier
          </button>
        )}
      </div>
    </div>
  );
}
