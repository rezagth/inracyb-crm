"use client";

import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";

/** Document texte prêt à copier ou imprimer (rapport d'audit, compte rendu de comité…). */
export function TextDoc({ title, text }: { title: string; text: string }) {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sec"
          onClick={() =>
            navigator.clipboard.writeText(text).then(
              () => toast("Texte copié"),
              () => toast("Copie bloquée : sélectionne le texte puis Cmd+C"),
            )
          }
        >
          <Icon name="copy" />
          Copier le texte
        </button>
        <button type="button" className="btn btn-sec" onClick={() => window.print()}>
          <Icon name="printer" />
          Imprimer / PDF
        </button>
      </div>
      <article className="printable card mx-auto w-full max-w-[820px] p-8 sm:p-10" aria-label={title}>
        <pre className="whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed">{text}</pre>
      </article>
    </div>
  );
}
