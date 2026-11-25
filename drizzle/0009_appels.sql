ALTER TABLE "tasks" ADD COLUMN "kind" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "tasks" SET "kind" = 'appel' WHERE "done" = false AND "title" LIKE 'Appeler %';
