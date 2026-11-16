-- Phase F : alimentation automatique (réglages, parcours des entreprises importées, journal). Sans danger si relancé.
CREATE TABLE IF NOT EXISTS "feed_items" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL CONSTRAINT "feed_items_company_id_companies_id_fk" REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	"segment" text NOT NULL,
	"stage" text DEFAULT 'a_completer' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"service" text DEFAULT '' NOT NULL,
	"tries" integer DEFAULT 0 NOT NULL,
	"imported_on" text NOT NULL,
	"moved_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feed_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'cron' NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"diagnosed" integer DEFAULT 0 NOT NULL,
	"enrolled" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feed_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"feed_diagnostic" boolean DEFAULT true NOT NULL,
	"feed_audit" boolean DEFAULT false NOT NULL,
	"departements" text DEFAULT '' NOT NULL,
	"effectifs" text DEFAULT '02,03,11,12' NOT NULL,
	"import_per_segment" integer DEFAULT 30 NOT NULL,
	"places_daily" integer DEFAULT 30 NOT NULL,
	"places_day" text DEFAULT '' NOT NULL,
	"places_used" integer DEFAULT 0 NOT NULL,
	"cursors" text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_campaigns" ADD COLUMN IF NOT EXISTS "auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feed_items_company_uq" ON "feed_items" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_items_stage_idx" ON "feed_items" USING btree ("stage","segment");
