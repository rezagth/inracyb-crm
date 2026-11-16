-- Campagne Diagnostic, phase A : une seule séquence en cours par entreprise, tous services confondus.
-- Ne touche à aucune donnée. Sans danger si relancé (IF NOT EXISTS).
-- À coller dans Neon > SQL Editor si `npm run db:migrate` ne peut pas se connecter depuis ton Mac.

-- 1) Contrôle à lancer AVANT : cette requête doit ne renvoyer aucune ligne.
--    Si elle en renvoie, une entreprise est « en cours » dans deux campagnes : arrête l'une des deux
--    depuis la page Campagnes (bouton « Stop » ou « A répondu »), puis relance le contrôle.
SELECT "company_id", count(*) AS sequences_en_cours
FROM "mail_campaign_items"
WHERE "status" = 'en_cours'
GROUP BY "company_id"
HAVING count(*) > 1;

-- 2) L'index. Il échoue (sans rien modifier) tant que le contrôle ci-dessus renvoie des lignes.
CREATE UNIQUE INDEX IF NOT EXISTS "mail_campaign_items_active_uq"
  ON "mail_campaign_items" ("company_id")
  WHERE "status" = 'en_cours';

-- ————————————————————————————————————————————————————————————————
-- Phase B : pause automatique par service, origine des adresses, service des événements Brevo.
-- À appliquer AVANT de déployer le code de la phase B (le CRM lit la colonne contacts.email_source).
-- Sans danger si relancé.
CREATE TABLE IF NOT EXISTS "mail_service_state" (
  "service" text PRIMARY KEY NOT NULL,
  "paused" boolean DEFAULT false NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email_source" text DEFAULT '' NOT NULL;
ALTER TABLE "mail_events" ADD COLUMN IF NOT EXISTS "service" text DEFAULT '' NOT NULL;
-- Adresses déjà présentes : origine « historique » (tolérée pour l'audit en cours, refusée pour le diagnostic).
UPDATE "contacts" SET "email_source" = 'historique' WHERE "email" <> '' AND "email_source" = '';

-- ————————————————————————————————————————————————————————————————
-- Phase C : diagnostics passifs par entreprise (données publiques). Nouvelle table, rien d'existant n'est modifié.
-- À appliquer AVANT de déployer le code de la phase C. Sans danger si relancé.
CREATE TABLE IF NOT EXISTS "company_diagnostics" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL CONSTRAINT "company_diagnostics_company_id_companies_id_fk" REFERENCES "companies"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'a_faire' NOT NULL,
  "mail_domain" text DEFAULT '' NOT NULL,
  "web_host" text DEFAULT '' NOT NULL,
  "findings" text DEFAULT '[]' NOT NULL,
  "main_finding" text DEFAULT '' NOT NULL,
  "certain_count" integer DEFAULT 0 NOT NULL,
  "rules_version" text DEFAULT '' NOT NULL,
  "checked_on" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "company_diagnostics_company_idx" ON "company_diagnostics" ("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "company_diagnostics_status_idx" ON "company_diagnostics" ("status");

-- ————————————————————————————————————————————————————————————————
-- Phase D : segment d'une campagne diagnostic, constat cité dans le premier mail.
-- À appliquer AVANT de déployer le code de la phase D. Sans danger si relancé.
ALTER TABLE "mail_campaign_items" ADD COLUMN IF NOT EXISTS "hook" text DEFAULT '' NOT NULL;
ALTER TABLE "mail_campaigns" ADD COLUMN IF NOT EXISTS "segment" text DEFAULT '' NOT NULL;
