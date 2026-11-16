-- Phase C : diagnostics passifs par entreprise. Sans danger si relancé.
CREATE TABLE IF NOT EXISTS "company_diagnostics" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL CONSTRAINT "company_diagnostics_company_id_companies_id_fk" REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_diagnostics_company_idx" ON "company_diagnostics" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_diagnostics_status_idx" ON "company_diagnostics" USING btree ("status");
