import { requireUser } from "@/lib/auth";
import { getSettings } from "@/server/core";
import { Card, PageHeader } from "@/components/ui";
import { PasswordForm, RevokeForm, SettingsForm } from "./forms";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const me = await requireUser();
  const s = (await getSettings());
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Ton entreprise, ta facturation et ta sécurité." />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <SettingsForm s={s} />
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Compte">
            <div className="flex flex-col gap-1 px-5 py-4 text-[13px]">
              <span className="font-medium">{me.name}</span>
              <span className="text-muted-fg">{me.email}</span>
            </div>
          </Card>
          <Card title="Mot de passe">
            <div className="p-5">
              <PasswordForm />
            </div>
          </Card>
          <Card title="Sessions">
            <div className="flex flex-col gap-3 p-5 text-[13px] text-muted-fg">
              <p>Un appareil perdu ou un doute ? Déconnecte toutes les sessions ouvertes, y compris celle-ci.</p>
              <RevokeForm />
            </div>
          </Card>
          <Card title="Données et sauvegardes">
            <div className="flex flex-col gap-2 p-5 text-[13px] text-muted-fg">
              <p>Base de données Postgres hébergée (Neon) : la restauration à un instant donné et les branches de sauvegarde se gèrent depuis la console Neon.</p>
              <p>
                Export de secours : <code className="font-mono text-xs">npm run db:backup</code> crée un fichier <code className="font-mono text-xs">.dump</code> à ranger chiffré, hors du dépôt (nécessite <code className="font-mono text-xs">pg_dump</code>).
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
