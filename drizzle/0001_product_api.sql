DROP INDEX "products_category_idx";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
CREATE INDEX "products_category_gender_idx" ON "products" USING btree ("category","gender");--> statement-breakpoint
CREATE INDEX "products_search_idx" ON "products" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "products_feed_idx" ON "products" USING btree (md5("id"::text),"id") WHERE "products"."status" = 'active' and "products"."is_available";--> statement-breakpoint
-- Search document: name/brand weigh most, canonical category/colours next,
-- merchant description last. 'simple' config: the catalogue mixes Swedish and
-- English, so no language-specific stemming.
CREATE OR REPLACE FUNCTION products_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.brand, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.category, '') || ' ' || coalesce(NEW.subcategory, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(NEW.colors, ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(
      (SELECT string_agg(value, ' ') FROM jsonb_array_elements_text(NEW.source_attributes -> 'colorsRaw')), ''
    )), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER products_search_vector_trg
  BEFORE INSERT OR UPDATE OF name, brand, category, subcategory, colors, source_attributes, description
  ON products FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();
--> statement-breakpoint
UPDATE products SET name = name;
