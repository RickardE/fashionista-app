/**
 * Enrichment state: which products need enrichment, claiming them safely,
 * recording outcomes, and recommendation readiness.
 *
 * product_enrichment_state is the queue. "Pending" is mostly derived rather
 * than stored: a product needs enrichment when it has no state row, when its
 * content changed since the last attempt (contentHash), or when the taxonomy
 * or prompt version moved on. Model changes alone never trigger re-enrichment
 * — comparing models is an explicit evaluation run.
 */

import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import {
  productEnrichments,
  productEnrichmentState,
  products,
  type EnrichmentOutcome,
  type EnrichmentStatus,
} from "@/server/db/schema";
import { eligibleFor } from "@/server/products/eligibility";
import { PROMPT_VERSION } from "./prompt";
import { TAXONOMY_VERSION } from "./taxonomy";

/** A processing claim older than this is considered abandoned (crashed worker). */
export const LOCK_TIMEOUT_MINUTES = 15;
export const DEFAULT_MAX_ATTEMPTS = 3;

export interface EnrichmentVersions {
  taxonomyVersion: string;
  promptVersion: string;
}

export const CURRENT_VERSIONS: EnrichmentVersions = {
  taxonomyVersion: TAXONOMY_VERSION,
  promptVersion: PROMPT_VERSION,
};

const rows = <T>(result: unknown): T[] => (Array.isArray(result) ? result : (result as { rows: T[] }).rows);

/**
 * Products enrichment applies to: active catalogue products that may appear in
 * any feed (clothing + shoes, via the central eligibility rules) and have an
 * image. Gender is irrelevant here — a product is described once for everyone.
 */
export const enrichmentCandidate: SQL = and(
  eq(products.status, "active"),
  eligibleFor("outfits", undefined),
  sql`cardinality(${products.images}) > 0`,
)!;

/** The effective status of a product, with pending/abandoned derived (expects products + state joined). */
export function effectiveStatusSql(versions: EnrichmentVersions = CURRENT_VERSIONS): SQL<EnrichmentStatus> {
  const s = productEnrichmentState;
  return sql<EnrichmentStatus>`case
    when ${s.productId} is null then 'pending'
    when ${s.status} = 'processing'
      and ${s.lockedAt} > now() - make_interval(mins => ${LOCK_TIMEOUT_MINUTES}) then 'processing'
    when ${s.enrichedContentHash} is distinct from ${products.contentHash}
      or ${s.taxonomyVersion} is distinct from ${versions.taxonomyVersion}
      or ${s.promptVersion} is distinct from ${versions.promptVersion}
      or ${s.status} in ('pending', 'processing') then 'pending'
    else ${s.status}
  end`;
}

export interface SelectOptions {
  limit?: number;
  /** Also select failed products with fewer than maxAttempts attempts. */
  retryFailed?: boolean;
  maxAttempts?: number;
  /** Also select needs_review products (normally they wait for a human). */
  includeReview?: boolean;
  versions?: EnrichmentVersions;
}

/** Candidate product ids that need a production enrichment, in a stable order. */
export async function selectProductsToEnrich(db: Db, opts: SelectOptions = {}): Promise<string[]> {
  const status = effectiveStatusSql(opts.versions);
  const wanted: SQL[] = [sql`${status} = 'pending'`];
  if (opts.retryFailed) {
    wanted.push(
      sql`(${status} = 'failed' and ${productEnrichmentState.attempts} < ${opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS})`,
    );
  }
  if (opts.includeReview) wanted.push(sql`${status} = 'needs_review'`);

  const query = db
    .select({ id: products.id })
    .from(products)
    .leftJoin(productEnrichmentState, eq(productEnrichmentState.productId, products.id))
    .where(and(enrichmentCandidate, sql`(${sql.join(wanted, sql` or `)})`))
    .orderBy(products.id);
  const result = opts.limit ? await query.limit(opts.limit) : await query;
  return result.map((r) => r.id);
}

/**
 * Atomically claims products for processing. Rows another worker holds (row
 * lock or a live processing claim) are skipped, so two workers never process
 * the same product. Returns the ids actually claimed.
 */
export async function claimProducts(db: Db, productIds: string[]): Promise<string[]> {
  if (!productIds.length) return [];
  const s = productEnrichmentState;
  await db
    .insert(s)
    .values(productIds.map((productId) => ({ productId })))
    .onConflictDoNothing();
  const ids = sql.join(productIds.map((id) => sql`${id}::uuid`), sql`, `);
  const result = await db.execute<{ product_id: string }>(sql`
    update ${s} set status = 'processing', locked_at = now(), attempts = ${s.attempts} + 1, updated_at = now()
    where ${s.productId} in (
      select ${s.productId} from ${s}
      where ${s.productId} in (${ids})
        and (${s.status} <> 'processing' or ${s.lockedAt} is null
             or ${s.lockedAt} <= now() - make_interval(mins => ${LOCK_TIMEOUT_MINUTES}))
      for update skip locked
    )
    returning ${s.productId} as product_id
  `);
  return rows<{ product_id: string }>(result).map((r) => r.product_id);
}

/** Records a production attempt's outcome and releases the claim. */
export async function recordOutcome(
  db: Db,
  update: {
    productId: string;
    enrichmentId: string;
    outcome: EnrichmentOutcome;
    contentHash: string;
    error?: string | null;
    versions?: EnrichmentVersions;
  },
) {
  const versions = update.versions ?? CURRENT_VERSIONS;
  await db
    .update(productEnrichmentState)
    .set({
      status: update.outcome,
      // Only a completed attempt replaces what recommendation consumers read.
      ...(update.outcome === "completed" ? { activeEnrichmentId: update.enrichmentId } : {}),
      enrichedContentHash: update.contentHash,
      taxonomyVersion: versions.taxonomyVersion,
      promptVersion: versions.promptVersion,
      lastError: update.error ?? null,
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(productEnrichmentState.productId, update.productId));
}

/** Releases claims without recording an attempt (e.g. a run aborted before calling the model). */
export async function releaseClaims(db: Db, productIds: string[]) {
  if (!productIds.length) return;
  await db
    .update(productEnrichmentState)
    .set({ status: "pending", lockedAt: null, updatedAt: new Date() })
    .where(and(inArray(productEnrichmentState.productId, productIds), eq(productEnrichmentState.status, "processing")));
}

// ---------------------------------------------------------------------------
// Recommendation readiness
// ---------------------------------------------------------------------------

/**
 * Recommendation-ready = enrichment candidate + an active completed enrichment
 * that still describes the product's current content. (Later: + embedding.)
 *
 * This is a filter for recommendation candidates only. Products that are not
 * ready remain fully valid for product pages, saved items and search.
 */
export const recommendationReady: SQL = and(
  enrichmentCandidate,
  sql`exists (
    select 1 from ${productEnrichmentState} s
    join ${productEnrichments} e on e.id = s.active_enrichment_id
    where s.product_id = ${products.id} and e.input_content_hash = ${products.contentHash}
  )`,
)!;

export async function countRecommendationReady(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(recommendationReady);
  return row.n;
}

/** Catalogue-wide counts by effective status, over enrichment candidates. */
export async function statusCounts(db: Db, versions?: EnrichmentVersions): Promise<Record<EnrichmentStatus, number>> {
  const status = effectiveStatusSql(versions);
  const result = await db
    .select({ status, n: sql<number>`count(*)::int` })
    .from(products)
    .leftJoin(productEnrichmentState, eq(productEnrichmentState.productId, products.id))
    .where(enrichmentCandidate)
    // By position: the parameterized CASE would not match itself in GROUP BY.
    .groupBy(sql`1`);
  const counts: Record<EnrichmentStatus, number> = { pending: 0, processing: 0, completed: 0, needs_review: 0, failed: 0 };
  for (const r of result) counts[r.status] = r.n;
  return counts;
}
