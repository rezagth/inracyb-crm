CREATE TABLE "linkedin_auth" (
	"id" integer PRIMARY KEY NOT NULL,
	"token_enc" text DEFAULT '' NOT NULL,
	"person_urn" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "external_url" text DEFAULT '' NOT NULL;