CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"actor_role" text,
	"action" text NOT NULL,
	"permission" text,
	"entity_type" text,
	"entity_id" text,
	"outcome" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "site_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_event_id" text NOT NULL,
	"type" text NOT NULL,
	"locale" text,
	"path" text,
	"campaign_code" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_events_client_event_id_unique" UNIQUE("client_event_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"is_demo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catering_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"inquiry_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "catering_checklist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"inquiry_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_by" text,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catering_inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"preferred_contact" text DEFAULT 'email' NOT NULL,
	"company" text,
	"event_date" date NOT NULL,
	"event_time" text,
	"headcount" integer NOT NULL,
	"budget_cents" integer,
	"fulfillment" text DEFAULT 'undecided' NOT NULL,
	"event_address" text,
	"occasion" text,
	"dietary_notes" text,
	"message" text,
	"source" text DEFAULT 'website' NOT NULL,
	"campaign_code" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"assignee_id" text,
	"follow_up_on" date,
	"deposit_status" text DEFAULT 'not_requested' NOT NULL,
	"deposit_note" text,
	"closed_reason" text,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	CONSTRAINT "catering_inquiries_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "catering_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"inquiry_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"notes" text,
	"valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	CONSTRAINT "catering_quote_version_uq" UNIQUE("inquiry_id","version")
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" text PRIMARY KEY NOT NULL,
	"inquiry_id" text,
	"contact_key" text NOT NULL,
	"channel" text NOT NULL,
	"granted" boolean NOT NULL,
	"disclosure_version" text NOT NULL,
	"disclosure_text" text NOT NULL,
	"source" text NOT NULL,
	"locale" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suppressed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaign_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"decision" text NOT NULL,
	"payload_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "campaign_creatives" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"kind" text NOT NULL,
	"locale" text NOT NULL,
	"body" text NOT NULL,
	"origin" text DEFAULT 'template' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "campaign_creative_uq" UNIQUE("campaign_id","kind","locale")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"use_case" text NOT NULL,
	"objective" text NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"offer" jsonb NOT NULL,
	"schedule" jsonb NOT NULL,
	"featured_item_ids" jsonb NOT NULL,
	"landing_path" text NOT NULL,
	"budget_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	CONSTRAINT "campaigns_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "exception_events" (
	"id" text PRIMARY KEY NOT NULL,
	"exception_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"actor_role" text,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "financial_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'suspected' NOT NULL,
	"supplier_id" text NOT NULL,
	"product_key" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence" jsonb NOT NULL,
	"suspected_amount_cents" integer,
	"credit_amount_cents" integer,
	"assignee_id" text,
	"draft_question" jsonb NOT NULL,
	"resolution_note" text,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	CONSTRAINT "financial_exceptions_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by" text,
	"source_label" text NOT NULL,
	"content_hash" text NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	CONSTRAINT "import_batches_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"raw_description" text NOT NULL,
	"product_key" text NOT NULL,
	"quantity" integer NOT NULL,
	"pack_count" integer DEFAULT 1 NOT NULL,
	"pack_size" numeric(12, 3) NOT NULL,
	"pack_unit" text NOT NULL,
	"case_price_cents" integer NOT NULL,
	"extended_cents" integer NOT NULL,
	"is_credit" boolean DEFAULT false NOT NULL,
	"extraction_confidence" numeric(4, 3),
	CONSTRAINT "invoice_line_uq" UNIQUE("invoice_id","line_no")
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"import_batch_id" text,
	"invoice_number" text NOT NULL,
	"invoice_date" date NOT NULL,
	"total_cents" integer NOT NULL,
	"source_document" text NOT NULL,
	"raw_text" text NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catering_activities" ADD CONSTRAINT "catering_activities_inquiry_id_catering_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."catering_inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_checklist_items" ADD CONSTRAINT "catering_checklist_items_inquiry_id_catering_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."catering_inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_inquiries" ADD CONSTRAINT "catering_inquiries_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_quotes" ADD CONSTRAINT "catering_quotes_inquiry_id_catering_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."catering_inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_quotes" ADD CONSTRAINT "catering_quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catering_quotes" ADD CONSTRAINT "catering_quotes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_inquiry_id_catering_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."catering_inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_approvals" ADD CONSTRAINT "campaign_approvals_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_creatives" ADD CONSTRAINT "campaign_creatives_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exception_events" ADD CONSTRAINT "exception_events_exception_id_financial_exceptions_id_fk" FOREIGN KEY ("exception_id") REFERENCES "public"."financial_exceptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_exceptions" ADD CONSTRAINT "financial_exceptions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "site_events_type_idx" ON "site_events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "catering_activity_idx" ON "catering_activities" USING btree ("inquiry_id","at");--> statement-breakpoint
CREATE INDEX "catering_checklist_idx" ON "catering_checklist_items" USING btree ("inquiry_id","kind","sort_order");--> statement-breakpoint
CREATE INDEX "catering_status_idx" ON "catering_inquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "catering_event_date_idx" ON "catering_inquiries" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "consent_contact_idx" ON "consent_records" USING btree ("contact_key","channel");--> statement-breakpoint
CREATE INDEX "campaign_approval_idx" ON "campaign_approvals" USING btree ("campaign_id","decided_at");--> statement-breakpoint
CREATE INDEX "campaign_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "exception_event_idx" ON "exception_events" USING btree ("exception_id","at");--> statement-breakpoint
CREATE INDEX "exception_status_idx" ON "financial_exceptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoice_line_product_idx" ON "supplier_invoice_lines" USING btree ("product_key");--> statement-breakpoint
CREATE INDEX "invoice_supplier_idx" ON "supplier_invoices" USING btree ("supplier_id","invoice_date");