CREATE TABLE "import_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"feed_last_modified" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"merchant" text NOT NULL,
	"external_group_key" text NOT NULL,
	"url" text,
	"price_minor" bigint,
	"sale_price_minor" bigint,
	"currency" text,
	"availability" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen_run_id" integer NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"brand" text,
	"category" text NOT NULL,
	"subcategory" text,
	"gender" text,
	"colors" text[] DEFAULT '{}'::text[] NOT NULL,
	"images" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_attributes" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_available" boolean DEFAULT false NOT NULL,
	"price_minor" bigint,
	"sale_price_minor" bigint,
	"currency" text,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_items" (
	"source_key" text NOT NULL,
	"external_id" text NOT NULL,
	"group_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_id" integer NOT NULL,
	CONSTRAINT "raw_items_source_key_external_id_pk" PRIMARY KEY("source_key","external_id")
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"external_id" text NOT NULL,
	"size" text,
	"color" text,
	"color_raw" text,
	"gtin" text,
	"mpn" text,
	"price_minor" bigint,
	"sale_price_minor" bigint,
	"currency" text,
	"availability" text NOT NULL,
	"image_url" text,
	"url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen_run_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_runs_source_started_idx" ON "import_runs" USING btree ("source_key","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_source_group_uq" ON "offers" USING btree ("source_key","external_group_key");--> statement-breakpoint
CREATE INDEX "offers_product_idx" ON "offers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_status_available_idx" ON "products" USING btree ("status","is_available");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_source_external_uq" ON "variants" USING btree ("source_key","external_id");--> statement-breakpoint
CREATE INDEX "variants_offer_idx" ON "variants" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "variants_gtin_idx" ON "variants" USING btree ("gtin");