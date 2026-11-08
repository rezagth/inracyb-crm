import { getSettings } from "@/server/core";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Bienvenue" };

export default async function WelcomePage() {
  const s = (await getSettings());
  return (
    <Onboarding
      initial={{
        legalName: s.legalName,
        phone: s.phone,
        city: s.city,
        tradeName: s.tradeName,
        iaBrand: s.iaBrand,
        offers: s.offers.split(",").filter(Boolean) as ("audit" | "ciso" | "ia")[],
        prixAudit: s.prixAuditCents ? String(s.prixAuditCents / 100) : "",
        targetSectors: s.targetSectors.split(",").filter(Boolean) as never,
        goalCalls: String(s.goalCalls),
        goalMails: String(s.goalMails),
        goalRdv: String(s.goalRdv),
      }}
    />
  );
}
