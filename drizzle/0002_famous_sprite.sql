-- Tables de suivi (déjà créées à la main en production par drizzle-manuel-suivi.sql) : IF NOT EXISTS partout, sans danger si relancé.
-- Nouveau : une seule séquence « en_cours » par entreprise, toutes campagnes confondues.
CREATE TABLE IF NOT EXISTS "mail_events" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"type" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'cron' NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"stopped" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"waiting" integer DEFAULT 0 NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_events_email_idx" ON "mail_events" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_events_type_idx" ON "mail_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_campaign_items_active_uq" ON "mail_campaign_items" USING btree ("company_id") WHERE "mail_campaign_items"."status" = 'en_cours';