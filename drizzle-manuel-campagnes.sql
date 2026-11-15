-- Campagnes d'envoi en masse : 3 tables, sans toucher aux existantes. Sans danger si relancé (IF NOT EXISTS).
-- À coller dans Neon > SQL Editor si `npm run db:migrate` ne peut pas se connecter depuis ton Mac.
CREATE TABLE IF NOT EXISTS "mail_campaigns" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "offer" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "mail_campaign_items" (
  "id" text PRIMARY KEY NOT NULL,
  "campaign_id" text NOT NULL REFERENCES "mail_campaigns"("id") ON DELETE CASCADE,
  "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "next_step" integer DEFAULT 0 NOT NULL,
  "next_due" text NOT NULL,
  "status" text DEFAULT 'en_cours' NOT NULL,
  "stop_reason" text DEFAULT '' NOT NULL,
  "last_error" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "mail_campaign_items_uq" ON "mail_campaign_items" ("campaign_id", "company_id");
CREATE INDEX IF NOT EXISTS "mail_campaign_items_due_idx" ON "mail_campaign_items" ("status", "next_due");

CREATE TABLE IF NOT EXISTS "mail_optouts" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL UNIQUE,
  "source" text DEFAULT 'lien' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
