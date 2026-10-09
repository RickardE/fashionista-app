/**
 * Catalog schema (Milestone 1).
 *
 * Identity:
 *   product  — STYLEAI-owned uuid; never derived from a source id.
 *   offer    — (source_key, external_group_key): one merchant's listing of a product.
 *              Resolving an incoming group to a product goes through this key.
 *   variant  — (source_key, external_id): one SKU/size row within an offer.
 *
 * Nothing is hard-deleted: rows that disappear from a feed become `inactive`,
 * so interactions, saved items and analytics keep valid references.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  customType,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ProductSourceAttributes, ProductType } from "@/server/catalog/types";

/** Full-text search document; maintained by a DB trigger (see migration 0001). */
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export type RecordStatus = "active" | "inactive";
export type ImportRunStatus = "running" | "succeeded" | "partial" | "failed" | "skipped";

export const importRuns = pgTable(
  "import_runs",
  {
    id: serial("id").primaryKey(),
    sourceKey: text("source_key").notNull(),
    /** "full" runs may deactivate missing rows; "subset" runs never do. */
    mode: text("mode").$type<"full" | "subset">().notNull(),
    status: text("status").$type<ImportRunStatus>().notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    feedLastModified: timestamp("feed_last_modified", { withTimezone: true }),
    stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
    error: text("error"),
  },
  (t) => [index("import_runs_source_started_idx").on(t.sourceKey, t.startedAt)],
);

/** Verbatim source rows, kept for reprocessing (re-mapping, re-grouping) without refetching. */
export const rawItems = pgTable(
  "raw_items",
  {
    sourceKey: text("source_key").notNull(),
    externalId: text("external_id").notNull(),
    groupKey: text("group_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    contentHash: text("content_hash").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastRunId: integer("last_run_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sourceKey, t.externalId] })],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    brand: text("brand"),
    /** clothing | underwear | swimwear | loungewear | shoes | bags | accessories | other — see productTypeFor. */
    productType: text("product_type").$type<ProductType>().notNull().default("other"),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    gender: text("gender"),
    colors: text("colors").array().notNull().default(sql`'{}'::text[]`),
    images: text("images").array().notNull().default(sql`'{}'::text[]`),
    /** Source-derived facts (raw colours, material, category paths) for enrichment. */
    sourceAttributes: jsonb("source_attributes").$type<ProductSourceAttributes>().notNull(),
    /** Hash of the canonical content; changes trigger re-enrichment/re-embedding later. */
    contentHash: text("content_hash").notNull(),
    // Denormalized from offers for fast filtering/sorting; recomputed after each import.
    status: text("status").$type<RecordStatus>().notNull().default("active"),
    isAvailable: boolean("is_available").notNull().default(false),
    priceMinor: bigint("price_minor", { mode: "number" }),
    salePriceMinor: bigint("sale_price_minor", { mode: "number" }),
    currency: text("currency"),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    searchVector: tsvector("search_vector"),
    ...timestamps,
  },
  (t) => [
    index("products_status_available_idx").on(t.status, t.isAvailable),
    index("products_category_gender_idx").on(t.category, t.gender),
    index("products_search_idx").using("gin", t.searchVector),
    // Stable, brand-mixed feed order with keyset pagination: ORDER BY md5(id), id,
    // within the feed's product type and gender.
    index("products_feed_idx")
      .on(t.productType, t.gender, sql`md5(${t.id}::text)`, t.id)
      .where(sql`${t.status} = 'active' and ${t.isAvailable}`),
  ],
);

export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    sourceKey: text("source_key").notNull(),
    merchant: text("merchant").notNull(),
    externalGroupKey: text("external_group_key").notNull(),
    url: text("url"),
    priceMinor: bigint("price_minor", { mode: "number" }),
    salePriceMinor: bigint("sale_price_minor", { mode: "number" }),
    currency: text("currency"),
    availability: text("availability").notNull(),
    status: text("status").$type<RecordStatus>().notNull().default("active"),
    lastSeenRunId: integer("last_seen_run_id").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("offers_source_group_uq").on(t.sourceKey, t.externalGroupKey),
    index("offers_product_idx").on(t.productId),
  ],
);

export const variants = pgTable(
  "variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => offers.id),
    sourceKey: text("source_key").notNull(),
    externalId: text("external_id").notNull(),
    size: text("size"),
    color: text("color"),
    colorRaw: text("color_raw"),
    gtin: text("gtin"),
    mpn: text("mpn"),
    priceMinor: bigint("price_minor", { mode: "number" }),
    salePriceMinor: bigint("sale_price_minor", { mode: "number" }),
    currency: text("currency"),
    availability: text("availability").notNull(),
    imageUrl: text("image_url"),
    url: text("url"),
    status: text("status").$type<RecordStatus>().notNull().default("active"),
    lastSeenRunId: integer("last_seen_run_id").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("variants_source_external_uq").on(t.sourceKey, t.externalId),
    index("variants_offer_idx").on(t.offerId),
    index("variants_gtin_idx").on(t.gtin),
  ],
);

// ---------------------------------------------------------------------------
// Semantic enrichment (see src/server/enrichment/).
//
//   enrichment_runs           one row per CLI/worker run (pilot, backfill, incremental)
//   product_enrichments       append-only: every model attempt, never updated or deleted
//   product_enrichment_state  one row per product: latest attempt + the active result
//
// Pilot/evaluation runs only append to product_enrichments; production runs
// (backfill, incremental) also claim, lock and update product_enrichment_state.
// ---------------------------------------------------------------------------

export type EnrichmentRunKind = "pilot" | "backfill" | "incremental";
export type EnrichmentRunStatus = "running" | "succeeded" | "failed";
export type EnrichmentOutcome = "completed" | "needs_review" | "failed";
export type EnrichmentStatus = "pending" | "processing" | EnrichmentOutcome;

export const enrichmentRuns = pgTable(
  "enrichment_runs",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").$type<EnrichmentRunKind>().notNull(),
    taxonomyVersion: text("taxonomy_version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    effort: text("effort"),
    status: text("status").$type<EnrichmentRunStatus>().notNull().default("running"),
    /** Run parameters: pilot seed, selected product ids, image mode, flags. */
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
  },
  (t) => [index("enrichment_runs_started_idx").on(t.startedAt)],
);

export const productEnrichments = pgTable(
  "product_enrichments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    runId: integer("run_id")
      .notNull()
      .references(() => enrichmentRuns.id),
    taxonomyVersion: text("taxonomy_version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    effort: text("effort"),
    /** products.content_hash at the time of enrichment. */
    inputContentHash: text("input_content_hash").notNull(),
    imageUrl: text("image_url"),
    outcome: text("outcome").$type<EnrichmentOutcome>().notNull(),
    /** The exact provider-neutral input the model received. */
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    /** Validated, normalized attributes (null when the attempt failed). */
    attributes: jsonb("attributes").$type<Record<string, unknown>>(),
    /** Three-level confidences (low | medium | high) per field / per label. */
    confidences: jsonb("confidences").$type<Record<string, unknown>>(),
    rawOutput: jsonb("raw_output"),
    /** { schemaErrors, errors, warnings, dropped, gateReasons, gateNotes, gateVersion } */
    validation: jsonb("validation").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** Null when no price is configured for the provider/model. */
    costUsdMicros: bigint("cost_usd_micros", { mode: "number" }),
    latencyMs: integer("latency_ms").notNull().default(0),
    /** Model calls made for this attempt (2 after a schema retry). */
    calls: integer("calls").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_enrichments_product_idx").on(t.productId, t.createdAt),
    index("product_enrichments_run_idx").on(t.runId),
  ],
);

export const productEnrichmentState = pgTable(
  "product_enrichment_state",
  {
    productId: uuid("product_id")
      .primaryKey()
      .references(() => products.id),
    /** Outcome of the latest production attempt; "pending" is also derived (see enrichment/state.ts). */
    status: text("status").$type<EnrichmentStatus>().notNull().default("pending"),
    /** The latest completed enrichment — what recommendation consumers read. */
    activeEnrichmentId: uuid("active_enrichment_id").references(() => productEnrichments.id),
    /** products.content_hash of the latest attempt (any outcome). */
    enrichedContentHash: text("enriched_content_hash"),
    taxonomyVersion: text("taxonomy_version"),
    promptVersion: text("prompt_version"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_enrichment_state_status_idx").on(t.status)],
);
