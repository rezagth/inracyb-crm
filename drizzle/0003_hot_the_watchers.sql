-- Phase B : pause automatique par service, origine des adresses, service des événements Brevo. Sans danger si relancé.
CREATE TABLE IF NOT EXISTS "mail_service_state" (
	"service" text PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email_source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_events" ADD COLUMN IF NOT EXISTS "service" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Adresses déjà présentes : origine « historique » (tolérée pour l'audit en cours, refusée pour le diagnostic).
UPDATE "contacts" SET "email_source" = 'historique' WHERE "email" <> '' AND "email_source" = '';
