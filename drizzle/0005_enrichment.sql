CREATE TABLE "enrichment_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"taxonomy_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"effort" text,
	"status" text DEFAULT 'running' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "product_enrichment_state" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"active_enrichment_id" uuid,
	"enriched_content_hash" text,
	"taxonomy_version" text,
	"prompt_version" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_enrichments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"run_id" integer NOT NULL,
	"taxonomy_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"effort" text,
	"input_content_hash" text NOT NULL,
	"image_url" text,
	"outcome" text NOT NULL,
	"input" jsonb NOT NULL,
	"attributes" jsonb,
	"confidences" jsonb,
	"raw_output" jsonb,
	"validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd_micros" bigint,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_enrichment_state" ADD CONSTRAINT "product_enrichment_state_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_enrichment_state" ADD CONSTRAINT "product_enrichment_state_active_enrichment_id_product_enrichments_id_fk" FOREIGN KEY ("active_enrichment_id") REFERENCES "public"."product_enrichments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_enrichments" ADD CONSTRAINT "product_enrichments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_enrichments" ADD CONSTRAINT "product_enrichments_run_id_enrichment_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."enrichment_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrichment_runs_started_idx" ON "enrichment_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "product_enrichment_state_status_idx" ON "product_enrichment_state" USING btree ("status");--> statement-breakpoint
CREATE INDEX "product_enrichments_product_idx" ON "product_enrichments" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "product_enrichments_run_idx" ON "product_enrichments" USING btree ("run_id");