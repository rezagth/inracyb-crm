ALTER TABLE "feed_settings" ADD COLUMN "feed_prescripteur" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_service_state" ADD COLUMN "ramp_from" text DEFAULT '' NOT NULL;