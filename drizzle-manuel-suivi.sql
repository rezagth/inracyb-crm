-- Suivi des envois : 2 tables, sans toucher aux existantes. Sans danger si relancé (IF NOT EXISTS).
-- À coller dans Neon > SQL Editor.
CREATE TABLE IF NOT EXISTS "mail_events" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "type" text NOT NULL,
  "detail" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "mail_events_email_idx" ON "mail_events" ("email");
CREATE INDEX IF NOT EXISTS "mail_events_type_idx" ON "mail_events" ("type", "created_at");

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
