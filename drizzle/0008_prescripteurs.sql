ALTER TABLE "companies" ADD COLUMN "referred_by" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_referred_by_partners_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_referred_by_idx" ON "companies" USING btree ("referred_by");