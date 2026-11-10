import { PageHeader } from "@/components/ui";
import { getSettings } from "@/server/core";
import { placesReady } from "@/server/prospect-search";
import { SEARCHABLE_SECTORS, SECTOR_SEARCH, type OfferKey, type Sector } from "@/lib/prospect-search";
import { Recherche } from "./recherche";

export const metadata = { title: "Recherche de prospects" };

export default async function RecherchePage() {
  const s = await getSettings();
  const offers = s.offers.split(",").filter((x): x is OfferKey => ["audit", "ciso", "ia"].includes(x));
  const targets = s.targetSectors.split(",").filter((x): x is Sector => (SEARCHABLE_SECTORS as string[]).includes(x));
  return (
    <>
      <PageHeader
        title="Recherche de prospects"
        subtitle="Trouve des entreprises à démarcher selon ton service : liste officielle, à valider avant de les ajouter au pipeline."
        back={{ href: "/prospection", label: "Prospection" }}
      />
      <Recherche
        offers={offers.length ? offers : ["audit"]}
        sectors={SEARCHABLE_SECTORS.map((k) => ({ id: k, hint: SECTOR_SEARCH[k]!.hint }))}
        defaultSector={targets[0] ?? SEARCHABLE_SECTORS[0]}
        placesOn={placesReady()}
      />
    </>
  );
}
