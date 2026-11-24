import { stratcyberHome } from "@/lib/stratcyber-link";

/** Bandeau des pages dont le suivi se fait désormais dans StratCyber (données conservées ici en lecture). */
export function MovedToStratcyber() {
  const href = stratcyberHome(process.env.STRATCYBER_URL);
  return (
    <p className="tip rise text-[13px]">
      <strong>Ce suivi se fait désormais dans StratCyber.</strong> Les données déjà saisies ici restent consultables.{" "}
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
          Ouvrir StratCyber
        </a>
      ) : (
        <>Renseigne STRATCYBER_URL dans la configuration pour afficher le lien.</>
      )}
    </p>
  );
}
