/**
 * Catalog ingestion: fetch → parse → validate → normalize → group → upsert →
 * deactivate missing → recompute product availability/price.
 *
 * Properties:
 *  - Idempotent: identity is (source, group key) for offers and (source,
 *    external id) for variants; reruns update in place.
 *  - Fault-isolated: a failing batch is retried product-by-product, so one bad
 *    product never sinks the import.
 *  - Non-destructive: nothing is deleted; missing rows become inactive, and only
 *    after a full, healthy run.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, notInArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Db } from "@/server/db/client";
import { importRuns, offers, products, rawItems, variants } from "@/server/db/schema";
import { createLogger, type Logger } from "@/server/log";
import { groupVariants } from "./grouping";
import { contentHash } from "./hash";
import { resolveMapping } from "./mapping/profile";
import { normalizeRawProduct } from "./normalize";
import type { CanonicalProductDraft, NormalizedVariant, ProductSource } from "./types";

export interface ImportOptions {
  /** Import from a local feed file instead of the remote source. */
  filePath?: string;
  /** Import only the first N product groups (a "subset" run never deactivates anything). */
  limitGroups?: number;
  /** Ignore If-Modified-Since and the deactivation safety guard. */
  force?: boolean;
  batchSize?: number;
  /**
   * Safety guard: a full run only deactivates missing rows if the feed still
   * contains at least this share of the previously active variants. Protects
   * against a truncated/empty feed wiping the catalog.
   */
  minRetainRatio?: number;
  logger?: Logger;
}

export interface ImportStats {
  rowsReceived: number;
  rowsInvalid: number;
  rowsNormalizeFailed: number;
  duplicateVariants: number;
  groups: number;
  groupsSkippedByLimit: number;
  productsCreated: number;
  productsUpdated: number;
  productsUnchanged: number;
  productsFailed: number;
  variantsUpserted: number;
  offersDeactivated: number;
  variantsDeactivated: number;
  productsDeactivated: number;
  productsReactivated: number;
  productsActive: number;
  productsAvailable: number;
  durationMs: number;
}

export interface ImportResult {
  runId: number;
  status: "succeeded" | "partial" | "failed" | "skipped";
  stats: ImportStats;
  warnings: string[];
}

const STALE_RUN_MS = 2 * 60 * 60 * 1000;

function emptyStats(): ImportStats {
  return {
    rowsReceived: 0, rowsInvalid: 0, rowsNormalizeFailed: 0, duplicateVariants: 0, groups: 0,
    groupsSkippedByLimit: 0, productsCreated: 0, productsUpdated: 0, productsUnchanged: 0,
    productsFailed: 0, variantsUpserted: 0, offersDeactivated: 0, variantsDeactivated: 0,
    productsDeactivated: 0, productsReactivated: 0, productsActive: 0, productsAvailable: 0,
    durationMs: 0,
  };
}

/** `SET col = excluded.col` for an upsert. */
function excluded(columns: Record<string, PgColumn>): Record<string, SQL> {
  return Object.fromEntries(
    Object.entries(columns).map(([key, col]) => [key, sql.raw(`excluded."${col.name}"`)]),
  );
}

/** The canonical, source-agnostic content of a product; its hash drives change detection. */
function productContent(draft: CanonicalProductDraft) {
  return {
    name: draft.name,
    description: draft.description ?? null,
    brand: draft.brand ?? null,
    category: draft.category,
    subcategory: draft.subcategory ?? null,
    gender: draft.gender ?? null,
    colors: draft.colors,
    images: draft.images,
    sourceAttributes: draft.attributes,
  };
}

export async function importFromSource(
  db: Db,
  source: ProductSource,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const started = Date.now();
  const sourceKey = source.identity.key;
  const log = (options.logger ?? createLogger("catalog:import")).child(sourceKey);
  const mode = options.limitGroups ? "subset" : "full";
  const stats = emptyStats();
  const warnings: string[] = [];
  const warn = (msg: string, fields?: Record<string, unknown>) => {
    warnings.push(msg);
    log.warn(msg, fields);
  };

  // --- Concurrency guard: one running import per source ---------------------
  const [running] = await db
    .select({ id: importRuns.id })
    .from(importRuns)
    .where(
      and(
        eq(importRuns.sourceKey, sourceKey),
        eq(importRuns.status, "running"),
        gt(importRuns.startedAt, new Date(Date.now() - STALE_RUN_MS)),
      ),
    )
    .limit(1);
  if (running) {
    throw new Error(`Import run #${running.id} for ${sourceKey} is already running`);
  }

  const [previous] = await db
    .select({ feedLastModified: importRuns.feedLastModified })
    .from(importRuns)
    .where(and(eq(importRuns.sourceKey, sourceKey), inArray(importRuns.status, ["succeeded", "partial"])))
    .orderBy(desc(importRuns.startedAt))
    .limit(1);

  const [run] = await db
    .insert(importRuns)
    .values({ sourceKey, mode })
    .returning({ id: importRuns.id });
  const runId = run.id;
  log.info("import started", { runId, mode, limitGroups: options.limitGroups });

  const finish = async (status: ImportResult["status"], error?: string, feedLastModified?: Date) => {
    stats.durationMs = Date.now() - started;
    await db
      .update(importRuns)
      .set({ status, finishedAt: new Date(), stats: { ...stats }, error, feedLastModified })
      .where(eq(importRuns.id, runId));
    return { runId, status, stats, warnings };
  };

  try {
    // --- Fetch + parse --------------------------------------------------------
    const ifModifiedSince =
      options.force || options.filePath || mode === "subset"
        ? undefined
        : (previous?.feedLastModified ?? undefined);
    const fetched = await source.fetch({ filePath: options.filePath, ifModifiedSince });
    log.info("feed fetched", {
      location: fetched.meta.location,
      bytes: fetched.meta.bytes,
      lastModified: fetched.meta.lastModified?.toISOString(),
      modified: fetched.modified,
    });
    if (!fetched.modified) {
      log.info("feed unchanged since last import — skipping (use --force to reimport)");
      return await finish("skipped", undefined, fetched.meta.lastModified);
    }

    stats.rowsReceived = fetched.rows.length;
    const mapping = resolveMapping(source.mapping);
    const normalized: NormalizedVariant[] = [];
    const invalidSamples: string[] = [];
    for (const row of fetched.rows) {
      if (!row.ok) {
        stats.rowsInvalid++;
        if (invalidSamples.length < 5) invalidSamples.push(`#${row.index} ${row.externalId ?? ""}: ${row.reason}`);
        log.debug("invalid row", { index: row.index, externalId: row.externalId, reason: row.reason });
        continue;
      }
      try {
        normalized.push(normalizeRawProduct(row.product, mapping));
      } catch (err) {
        stats.rowsNormalizeFailed++;
        log.debug("row failed normalization", { externalId: row.product.externalId, error: err as Error });
      }
    }
    log.info("rows parsed", {
      received: stats.rowsReceived,
      valid: normalized.length,
      invalid: stats.rowsInvalid,
      normalizeFailed: stats.rowsNormalizeFailed,
    });
    if (invalidSamples.length) warn(`${stats.rowsInvalid} invalid rows`, { samples: invalidSamples });

    // --- Group variants into canonical products -------------------------------
    const grouped = groupVariants(normalized, source.identity.merchant);
    stats.duplicateVariants = grouped.duplicateVariants;
    let drafts = grouped.products;
    stats.groups = drafts.length;
    if (options.limitGroups && drafts.length > options.limitGroups) {
      stats.groupsSkippedByLimit = drafts.length - options.limitGroups;
      drafts = drafts.slice(0, options.limitGroups);
    }
    log.info("variants grouped", {
      groups: stats.groups,
      importing: drafts.length,
      variants: drafts.reduce((n, d) => n + d.offer.variants.length, 0),
      duplicateVariants: stats.duplicateVariants,
    });

    const rawByExternalId = new Map(normalized.map((n) => [n.externalId, n]));

    // --- Upsert in batches, isolating failures --------------------------------
    const batchSize = options.batchSize ?? 100;
    const failedGroupKeys: string[] = [];
    for (let i = 0; i < drafts.length; i += batchSize) {
      const batch = drafts.slice(i, i + batchSize);
      try {
        await db.transaction((tx) => upsertBatch(tx as unknown as Db, batch, runId, source, rawByExternalId, stats));
      } catch (err) {
        log.warn("batch failed — retrying products individually", { offset: i, error: err as Error });
        for (const draft of batch) {
          try {
            await db.transaction((tx) =>
              upsertBatch(tx as unknown as Db, [draft], runId, source, rawByExternalId, stats),
            );
          } catch (productErr) {
            stats.productsFailed++;
            failedGroupKeys.push(draft.offer.externalGroupKey);
            log.error("product failed to import", {
              groupKey: draft.offer.externalGroupKey,
              error: productErr as Error,
            });
          }
        }
      }
      log.debug("batch done", { done: Math.min(i + batchSize, drafts.length), total: drafts.length });
    }

    // --- Deactivate rows missing from a full feed ----------------------------
    if (mode === "full") {
      const [{ activeBefore }] = await db
        .select({ activeBefore: sql<number>`count(*)::int` })
        .from(variants)
        .where(and(eq(variants.sourceKey, sourceKey), eq(variants.status, "active")));
      const minRatio = options.minRetainRatio ?? 0.5;
      const seen = normalized.length;
      if (!options.force && activeBefore > 0 && seen < activeBefore * minRatio) {
        warn("feed much smaller than current catalog — skipping deactivation (use --force)", {
          seen,
          activeBefore,
        });
      } else {
        await deactivateMissing(db, sourceKey, runId, failedGroupKeys, stats);
      }
    }

    await recomputeProducts(db, sourceKey, stats);

    const status = stats.productsFailed > 0 ? "partial" : "succeeded";
    const result = await finish(status, undefined, fetched.meta.lastModified);
    log.info("import finished", { runId, status, ...stats });
    return result;
  } catch (err) {
    log.error("import failed", { runId, error: err as Error });
    await finish("failed", (err as Error).message);
    throw err;
  }
}

async function upsertBatch(
  db: Db,
  drafts: CanonicalProductDraft[],
  runId: number,
  source: ProductSource,
  rawByExternalId: Map<string, NormalizedVariant>,
  stats: ImportStats,
): Promise<void> {
  const sourceKey = source.identity.key;
  const now = new Date();
  const local = { created: 0, updated: 0, unchanged: 0, variants: 0 };

  const existing = await db
    .select({
      offerId: offers.id,
      groupKey: offers.externalGroupKey,
      productId: offers.productId,
      productHash: products.contentHash,
    })
    .from(offers)
    .innerJoin(products, eq(products.id, offers.productId))
    .where(
      and(
        eq(offers.sourceKey, sourceKey),
        inArray(offers.externalGroupKey, drafts.map((d) => d.offer.externalGroupKey)),
      ),
    );
  const existingByGroup = new Map(existing.map((e) => [e.groupKey, e]));

  const variantRows: (typeof variants.$inferInsert)[] = [];

  for (const draft of drafts) {
    const content = productContent(draft);
    const hash = contentHash(content);
    const offer = draft.offer;
    const offerValues = {
      merchant: offer.merchant,
      url: offer.url ?? null,
      priceMinor: offer.price?.amountMinor ?? null,
      salePriceMinor: offer.salePrice?.amountMinor ?? null,
      currency: offer.price?.currency ?? null,
      availability: offer.availability,
      status: "active" as const,
      lastSeenRunId: runId,
      lastSeenAt: now,
      updatedAt: now,
    };

    let offerId: string;
    const prior = existingByGroup.get(offer.externalGroupKey);
    if (!prior) {
      const productId = randomUUID();
      offerId = randomUUID();
      await db.insert(products).values({ id: productId, ...content, contentHash: hash });
      await db.insert(offers).values({
        id: offerId,
        productId,
        sourceKey,
        externalGroupKey: offer.externalGroupKey,
        ...offerValues,
      });
      local.created++;
    } else {
      offerId = prior.offerId;
      // NOTE: with a single source per product, the offer's content is the
      // product's content. When cross-merchant matching arrives, only the
      // product's primary offer should be allowed to overwrite these fields.
      if (prior.productHash !== hash) {
        await db
          .update(products)
          .set({ ...content, contentHash: hash, updatedAt: now })
          .where(eq(products.id, prior.productId));
        local.updated++;
      } else {
        local.unchanged++;
      }
      await db.update(offers).set(offerValues).where(eq(offers.id, offerId));
    }

    for (const v of offer.variants) {
      variantRows.push({
        offerId,
        sourceKey,
        externalId: v.externalId,
        size: v.size ?? null,
        color: v.color ?? null,
        colorRaw: v.colorRaw ?? null,
        gtin: v.gtin ?? null,
        mpn: v.mpn ?? null,
        priceMinor: v.price?.amountMinor ?? null,
        salePriceMinor: v.salePrice?.amountMinor ?? null,
        currency: v.price?.currency ?? null,
        availability: v.availability,
        imageUrl: v.imageUrl ?? null,
        url: v.productUrl ?? null,
        status: "active",
        lastSeenRunId: runId,
        updatedAt: now,
      });
    }
  }

  if (variantRows.length) {
    await db
      .insert(variants)
      .values(variantRows)
      .onConflictDoUpdate({
        target: [variants.sourceKey, variants.externalId],
        set: excluded({
          offerId: variants.offerId,
          size: variants.size,
          color: variants.color,
          colorRaw: variants.colorRaw,
          gtin: variants.gtin,
          mpn: variants.mpn,
          priceMinor: variants.priceMinor,
          salePriceMinor: variants.salePriceMinor,
          currency: variants.currency,
          availability: variants.availability,
          imageUrl: variants.imageUrl,
          url: variants.url,
          status: variants.status,
          lastSeenRunId: variants.lastSeenRunId,
          updatedAt: variants.updatedAt,
        }),
      });

    const rawRows = variantRows
      .map((v) => rawByExternalId.get(v.externalId))
      .filter((n): n is NormalizedVariant => !!n)
      .map((n) => ({
        sourceKey,
        externalId: n.externalId,
        groupKey: n.groupKey,
        payload: n.raw,
        contentHash: contentHash(n.raw),
        lastSeenAt: now,
        lastRunId: runId,
      }));
    await db
      .insert(rawItems)
      .values(rawRows)
      .onConflictDoUpdate({
        target: [rawItems.sourceKey, rawItems.externalId],
        set: excluded({
          groupKey: rawItems.groupKey,
          payload: rawItems.payload,
          contentHash: rawItems.contentHash,
          lastSeenAt: rawItems.lastSeenAt,
          lastRunId: rawItems.lastRunId,
        }),
      });
  }
  local.variants = variantRows.length;

  // Only count once the transaction body has fully succeeded.
  stats.productsCreated += local.created;
  stats.productsUpdated += local.updated;
  stats.productsUnchanged += local.unchanged;
  stats.variantsUpserted += local.variants;
}

async function deactivateMissing(
  db: Db,
  sourceKey: string,
  runId: number,
  failedGroupKeys: string[],
  stats: ImportStats,
) {
  const now = new Date();
  // Products that failed to upsert this run weren't "missing" — don't deactivate them.
  const notFailed = failedGroupKeys.length
    ? notInArray(offers.externalGroupKey, failedGroupKeys)
    : undefined;

  const deactivatedOffers = await db
    .update(offers)
    .set({ status: "inactive", updatedAt: now })
    .where(
      and(
        eq(offers.sourceKey, sourceKey),
        eq(offers.status, "active"),
        lt(offers.lastSeenRunId, runId),
        notFailed,
      ),
    )
    .returning({ id: offers.id });
  stats.offersDeactivated = deactivatedOffers.length;

  const failedOfferIds = failedGroupKeys.length
    ? db
        .select({ id: offers.id })
        .from(offers)
        .where(and(eq(offers.sourceKey, sourceKey), inArray(offers.externalGroupKey, failedGroupKeys)))
    : undefined;
  const deactivatedVariants = await db
    .update(variants)
    .set({ status: "inactive", updatedAt: now })
    .where(
      and(
        eq(variants.sourceKey, sourceKey),
        eq(variants.status, "active"),
        lt(variants.lastSeenRunId, runId),
        failedOfferIds ? notInArray(variants.offerId, failedOfferIds) : undefined,
      ),
    )
    .returning({ id: variants.id });
  stats.variantsDeactivated = deactivatedVariants.length;
}

/**
 * Recomputes each product's denormalized status / availability / price from
 * all of its offers (any source), for products this source touches.
 */
async function recomputeProducts(db: Db, sourceKey: string, stats: ImportStats) {
  const result = await db.execute<{ was_active: boolean; is_active: boolean }>(sql`
    with touched as (
      select distinct product_id from offers where source_key = ${sourceKey}
    ),
    agg as (
      select o.product_id,
             bool_or(o.status = 'active') as active,
             bool_or(o.status = 'active' and o.availability = 'in_stock') as available
      from offers o join touched t using (product_id)
      group by o.product_id
    ),
    best as (
      select distinct on (o.product_id) o.product_id, o.price_minor, o.sale_price_minor, o.currency
      from offers o join touched t using (product_id)
      where o.status = 'active'
      order by o.product_id,
               (o.availability = 'in_stock') desc,
               coalesce(o.sale_price_minor, o.price_minor) asc nulls last
    ),
    prev as (
      select p.id, p.status from products p join touched t on t.product_id = p.id
    )
    update products p set
      status = case when agg.active then 'active' else 'inactive' end,
      is_available = agg.available,
      price_minor = best.price_minor,
      sale_price_minor = best.sale_price_minor,
      currency = best.currency,
      deactivated_at = case when agg.active then null else coalesce(p.deactivated_at, now()) end
    from agg
      left join best using (product_id)
      join prev on prev.id = agg.product_id
    where p.id = agg.product_id
    returning prev.status = 'active' as was_active, agg.active as is_active
  `);
  const rows = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
  for (const row of rows as { was_active: boolean; is_active: boolean }[]) {
    if (row.was_active && !row.is_active) stats.productsDeactivated++;
    if (!row.was_active && row.is_active) stats.productsReactivated++;
  }

  const [counts] = await db
    .select({
      active: sql<number>`count(*) filter (where ${products.status} = 'active')::int`,
      available: sql<number>`count(*) filter (where ${products.isAvailable})::int`,
    })
    .from(products);
  stats.productsActive = counts.active;
  stats.productsAvailable = counts.available;
}
