CREATE TABLE "mail_campaign_items" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"company_id" text NOT NULL,
	"next_step" integer DEFAULT 0 NOT NULL,
	"next_due" text NOT NULL,
	"status" text DEFAULT 'en_cours' NOT NULL,
	"stop_reason" text DEFAULT '' NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"offer" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_optouts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'lien' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_optouts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "website" SET DEFAULT 'infracyb.fr';--> statement-breakpoint
ALTER TABLE "mail_campaign_items" ADD CONSTRAINT "mail_campaign_items_campaign_id_mail_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."mail_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_campaign_items" ADD CONSTRAINT "mail_campaign_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_campaign_items_uq" ON "mail_campaign_items" USING btree ("campaign_id","company_id");--> statement-breakpoint
CREATE INDEX "mail_campaign_items_due_idx" ON "mail_campaign_items" USING btree ("status","next_due");