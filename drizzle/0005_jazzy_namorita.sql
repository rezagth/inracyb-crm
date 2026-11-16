-- Phase D : segment d'une campagne diagnostic, constat cité dans le premier mail. Sans danger si relancé.
ALTER TABLE "mail_campaign_items" ADD COLUMN IF NOT EXISTS "hook" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_campaigns" ADD COLUMN IF NOT EXISTS "segment" text DEFAULT '' NOT NULL;
