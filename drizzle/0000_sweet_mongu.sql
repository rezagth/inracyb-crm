CREATE TABLE "audits" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"date" text NOT NULL,
	"status" text DEFAULT 'en_cours' NOT NULL,
	"answers" text DEFAULT '{}' NOT NULL,
	"notes" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bank_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"label" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'a_rapprocher' NOT NULL,
	"invoice_id" text,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"date" text NOT NULL,
	"result" text NOT NULL,
	"duration_min" integer DEFAULT 0 NOT NULL,
	"offer" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"offer" text DEFAULT 'Audit' NOT NULL,
	"unit" text DEFAULT 'forfait' NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sector" text DEFAULT 'Autres' NOT NULL,
	"stage" text DEFAULT 'qualif' NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'Site web' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"siren" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'moyenne' NOT NULL,
	"offer" text DEFAULT 'Audit' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"last_contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_billings" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"month" text NOT NULL,
	"invoice_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"offer" text DEFAULT 'RSSI externalisé' NOT NULL,
	"monthly_cents" integer NOT NULL,
	"start" text NOT NULL,
	"end" text DEFAULT '' NOT NULL,
	"notice" text DEFAULT '2 mois' NOT NULL,
	"status" text DEFAULT 'actif' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'Modèle' NOT NULL,
	"company_id" text,
	"status" text DEFAULT 'a_rediger' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"updated_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text,
	"type" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"supplier" text NOT NULL,
	"category" text DEFAULT 'Autre' NOT NULL,
	"amount_cents" integer NOT NULL,
	"recurring" text DEFAULT 'Non' NOT NULL,
	"proof" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"href" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"date" text NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'Phishing' NOT NULL,
	"severity" text DEFAULT 'moyenne' NOT NULL,
	"status" text DEFAULT 'ouvert' NOT NULL,
	"personal_data" text DEFAULT 'non' NOT NULL,
	"actions" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"quantity" double precision NOT NULL,
	"unit" text DEFAULT 'forfait' NOT NULL,
	"unit_price_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"kind" text DEFAULT 'facture' NOT NULL,
	"company_id" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'brouillon' NOT NULL,
	"issue_date" text NOT NULL,
	"due_date" text NOT NULL,
	"discount_bp" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"total_ht_cents" integer DEFAULT 0 NOT NULL,
	"quote_id" text,
	"credit_for_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'Procédure' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"updated_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"offer" text NOT NULL,
	"step" integer NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"sent_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text,
	"title" text NOT NULL,
	"date" text NOT NULL,
	"start" text DEFAULT '10:00' NOT NULL,
	"end" text DEFAULT '10:30' NOT NULL,
	"mode" text DEFAULT 'Visio' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"title" text NOT NULL,
	"offer" text DEFAULT 'Audit' NOT NULL,
	"start" text NOT NULL,
	"due" text NOT NULL,
	"budget_days" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'a_demarrer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'Administratif' NOT NULL,
	"due" text DEFAULT '' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'Partenaire (j''oriente)' NOT NULL,
	"specialty" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"commission" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'a_contacter' NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"date" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text DEFAULT 'Virement bancaire' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"network" text DEFAULT 'LinkedIn' NOT NULL,
	"topic" text NOT NULL,
	"pillar" text DEFAULT 'Conseil pratique' NOT NULL,
	"status" text DEFAULT 'idee' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_id" text NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"quantity" double precision NOT NULL,
	"unit" text DEFAULT 'forfait' NOT NULL,
	"unit_price_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"company_id" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'brouillon' NOT NULL,
	"issue_date" text NOT NULL,
	"valid_until" text NOT NULL,
	"discount_bp" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"total_ht_cents" integer DEFAULT 0 NOT NULL,
	"signed_by" text,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"level" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rgpd_records" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"basis" text DEFAULT '' NOT NULL,
	"data" text DEFAULT '' NOT NULL,
	"keep" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'a_valider' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"config" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"title" text NOT NULL,
	"priority" text DEFAULT 'moyenne' NOT NULL,
	"owner" text DEFAULT 'Moi' NOT NULL,
	"due" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'a_faire' NOT NULL,
	"audit_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"trade_name" text DEFAULT 'InfraCyb' NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"legal_form" text DEFAULT 'Entrepreneur individuel (micro-entreprise)' NOT NULL,
	"siret" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"email" text DEFAULT 'infracyb@gmail.com' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"website" text DEFAULT 'infracyb.vercel.app' NOT NULL,
	"iban" text DEFAULT '' NOT NULL,
	"pay_link" text DEFAULT '' NOT NULL,
	"cal_url" text DEFAULT '' NOT NULL,
	"tva_franchise" boolean DEFAULT true NOT NULL,
	"social_rate" double precision DEFAULT 26.1 NOT NULL,
	"acre" boolean DEFAULT true NOT NULL,
	"acre_rate" double precision DEFAULT 25 NOT NULL,
	"cfp_rate" double precision DEFAULT 0.2 NOT NULL,
	"vl_enabled" boolean DEFAULT false NOT NULL,
	"vl_rate" double precision DEFAULT 2.2 NOT NULL,
	"ca_ceiling_cents" integer DEFAULT 7770000 NOT NULL,
	"tva_threshold_cents" integer DEFAULT 3750000 NOT NULL,
	"invoice_prefix" text DEFAULT 'F' NOT NULL,
	"quote_prefix" text DEFAULT 'D' NOT NULL,
	"credit_prefix" text DEFAULT 'AV' NOT NULL,
	"pay_days" integer DEFAULT 30 NOT NULL,
	"pay_method" text DEFAULT 'Virement bancaire' NOT NULL,
	"late_penalty" text DEFAULT '3 fois le taux d''intérêt légal' NOT NULL,
	"tjm_cents" integer DEFAULT 0 NOT NULL,
	"goal_ca_cents" integer DEFAULT 0 NOT NULL,
	"ia_brand" text DEFAULT 'Elyrion Labs' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"prix_audit_cents" integer DEFAULT 0 NOT NULL,
	"offers" text DEFAULT 'audit,ciso,ia' NOT NULL,
	"target_sectors" text DEFAULT 'Juridique,Notariat,Santé,Expertise comptable' NOT NULL,
	"goal_calls" integer DEFAULT 20 NOT NULL,
	"goal_mails" integer DEFAULT 10 NOT NULL,
	"goal_rdv" integer DEFAULT 3 NOT NULL,
	"goal_mrr_cents" integer DEFAULT 0 NOT NULL,
	"goal_clients" integer DEFAULT 0 NOT NULL,
	"goal_net_cents" integer DEFAULT 0 NOT NULL,
	"avg_audit_cents" integer DEFAULT 320000 NOT NULL,
	"avg_rssi_cents" integer DEFAULT 103300 NOT NULL,
	"urssaf_period" text DEFAULT 'mensuelle' NOT NULL,
	"bank_name" text DEFAULT '' NOT NULL,
	"einvoice_platform" text DEFAULT '' NOT NULL,
	"esign_provider" text DEFAULT '' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"company_id" text,
	"due_date" text NOT NULL,
	"priority" text DEFAULT 'moyenne' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"subject" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'normale' NOT NULL,
	"status" text DEFAULT 'ouvert' NOT NULL,
	"opened_on" text NOT NULL,
	"resolved_on" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"mission_id" text,
	"hours" double precision NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_lines" ADD CONSTRAINT "bank_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_billings" ADD CONSTRAINT "contract_billings_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_billings" ADD CONSTRAINT "contract_billings_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_sends" ADD CONSTRAINT "mail_sends_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_actions" ADD CONSTRAINT "security_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_lines_hash_uq" ON "bank_lines" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "calls_date_idx" ON "calls" USING btree ("date");--> statement-breakpoint
CREATE INDEX "calls_company_idx" ON "calls" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "companies_stage_idx" ON "companies" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "companies_name_idx" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_billings_uq" ON "contract_billings" USING btree ("contract_id","month");--> statement-breakpoint
CREATE INDEX "events_company_idx" ON "events" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "events_created_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "invoices_company_idx" ON "invoices" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "mail_sends_idx" ON "mail_sends" USING btree ("company_id","offer");--> statement-breakpoint
CREATE INDEX "meetings_date_idx" ON "meetings" USING btree ("date");--> statement-breakpoint
CREATE INDEX "payments_date_idx" ON "payments" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_number_uq" ON "quotes" USING btree ("number");--> statement-breakpoint
CREATE INDEX "quotes_company_idx" ON "quotes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "quotes_status_idx" ON "quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("done","due_date");--> statement-breakpoint
CREATE INDEX "time_date_idx" ON "time_entries" USING btree ("date");