CREATE TABLE IF NOT EXISTS "feed_skipped" (
	"siren" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"segment" text NOT NULL,
	"reason" text NOT NULL,
	"skipped_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feed_skipped_on_idx" ON "feed_skipped" USING btree ("skipped_on");