DROP INDEX "products_feed_idx";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_type" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
CREATE INDEX "products_feed_idx" ON "products" USING btree ("product_type","gender",md5("id"::text),"id") WHERE "products"."status" = 'active' and "products"."is_available";--> statement-breakpoint
-- One-time backfill (mirrors productTypeFor); imports keep it current from here.
UPDATE "products" SET "product_type" = CASE "category"
  WHEN 'underwear' THEN 'underwear'
  WHEN 'shoes' THEN 'shoes'
  WHEN 'bags' THEN 'bags'
  WHEN 'accessories' THEN 'accessories'
  WHEN 'other' THEN 'other'
  ELSE 'clothing'
END;
