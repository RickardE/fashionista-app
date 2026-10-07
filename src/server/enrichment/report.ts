/**
 * Enrichment observability: run statistics and catalogue-wide status, computed
 * from what is stored in the database (never from provider dashboards).
 */

import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { enrichmentRuns, productEnrichments, productEnrichmentState, products } from "@/server/db/schema";
import { countRecommendationReady, statusCounts } from "./state";

export interface RunStats {
  products: number;
  completed: number;
  needs_review: number;
  failed: number;
  success_rate: number;
  review_rate: number;
  failure_rate: number;
  calls: number;
  schema_retries: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  /** Sum over priced attempts; null when nothing in the run is priced. */
  cost_usd_micros: number | null;
  cost_per_product_usd_micros: number | null;
  unpriced: number;
  latency_avg_ms: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  failure_reasons: Record<string, number>;
  review_reasons: Record<string, number>;
  warnings: Record<string, number>;
  taxonomy_gaps: Record<string, number>;
}

/** Nearest-rank percentile. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

const tally = (counts: Record<string, number>, key: string) => {
  counts[key] = (counts[key] ?? 0) + 1;
};
const sortCounts = (counts: Record<string, number>) =>
  Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
const rate = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 1000 : 0);

export async function computeRunStats(db: Db, runId: number): Promise<RunStats> {
  const rows = await db
    .select({
      outcome: productEnrichments.outcome,
      validation: productEnrichments.validation,
      attributes: productEnrichments.attributes,
      inputTokens: productEnrichments.inputTokens,
      outputTokens: productEnrichments.outputTokens,
      cacheReadTokens: productEnrichments.cacheReadTokens,
      cacheWriteTokens: productEnrichments.cacheWriteTokens,
      costUsdMicros: productEnrichments.costUsdMicros,
      latencyMs: productEnrichments.latencyMs,
      calls: productEnrichments.calls,
    })
    .from(productEnrichments)
    .where(eq(productEnrichments.runId, runId));

  const counts = { completed: 0, needs_review: 0, failed: 0 };
  const failure: Record<string, number> = {};
  const review: Record<string, number> = {};
  const warnings: Record<string, number> = {};
  const gaps: Record<string, number> = {};
  let cost = 0;
  let priced = 0;
  for (const r of rows) {
    counts[r.outcome]++;
    const v = r.validation as {
      failureReason?: string;
      gateReasons?: string[];
      warnings?: { code: string }[];
    };
    if (r.outcome === "failed") tally(failure, v.failureReason ?? "unknown");
    if (r.outcome === "needs_review") for (const reason of v.gateReasons ?? []) tally(review, reason);
    for (const w of v.warnings ?? []) tally(warnings, w.code);
    for (const g of ((r.attributes as { taxonomy_gaps?: string[] } | null)?.taxonomy_gaps ?? [])) {
      tally(gaps, g.toLowerCase());
    }
    if (r.costUsdMicros !== null) {
      cost += r.costUsdMicros;
      priced++;
    }
  }
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const latencies = rows.filter((r) => r.calls > 0).map((r) => r.latencyMs);
  const n = rows.length;

  return {
    products: n,
    ...counts,
    success_rate: rate(counts.completed, n),
    review_rate: rate(counts.needs_review, n),
    failure_rate: rate(counts.failed, n),
    calls: sum((r) => r.calls),
    schema_retries: sum((r) => Math.max(0, r.calls - 1)),
    input_tokens: sum((r) => r.inputTokens),
    output_tokens: sum((r) => r.outputTokens),
    cache_read_tokens: sum((r) => r.cacheReadTokens),
    cache_write_tokens: sum((r) => r.cacheWriteTokens),
    cost_usd_micros: priced ? cost : null,
    cost_per_product_usd_micros: priced ? Math.round(cost / priced) : null,
    unpriced: n - priced,
    latency_avg_ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    latency_p50_ms: percentile(latencies, 50),
    latency_p95_ms: percentile(latencies, 95),
    failure_reasons: sortCounts(failure),
    review_reasons: sortCounts(review),
    warnings: sortCounts(warnings),
    taxonomy_gaps: sortCounts(gaps),
  };
}

export async function listRuns(db: Db, limit = 20) {
  return db.select().from(enrichmentRuns).orderBy(desc(enrichmentRuns.id)).limit(limit);
}

export async function getRuns(db: Db, ids: number[]) {
  const runs = await db.select().from(enrichmentRuns).where(inArray(enrichmentRuns.id, ids));
  return ids.map((id) => runs.find((r) => r.id === id)).filter((r) => !!r);
}

/** Failed and needs-review attempts of a run, with product names and reasons. */
export async function problemProducts(db: Db, runId: number) {
  return db
    .select({
      productId: productEnrichments.productId,
      name: products.name,
      brand: products.brand,
      category: products.category,
      outcome: productEnrichments.outcome,
      error: productEnrichments.error,
      reasons: sql<string[] | null>`${productEnrichments.validation} -> 'gateReasons'`,
    })
    .from(productEnrichments)
    .innerJoin(products, eq(products.id, productEnrichments.productId))
    .where(sql`${productEnrichments.runId} = ${runId} and ${productEnrichments.outcome} <> 'completed'`)
    .orderBy(productEnrichments.outcome, products.name);
}

/** Catalogue-wide picture: status counts, readiness, and what the active enrichments came from. */
export async function catalogueOverview(db: Db) {
  const [counts, ready, activeBy] = await Promise.all([
    statusCounts(db),
    countRecommendationReady(db),
    db
      .select({
        provider: productEnrichments.provider,
        model: productEnrichments.model,
        taxonomyVersion: productEnrichments.taxonomyVersion,
        promptVersion: productEnrichments.promptVersion,
        n: sql<number>`count(*)::int`,
      })
      .from(productEnrichmentState)
      .innerJoin(productEnrichments, eq(productEnrichments.id, productEnrichmentState.activeEnrichmentId))
      .groupBy(
        productEnrichments.provider,
        productEnrichments.model,
        productEnrichments.taxonomyVersion,
        productEnrichments.promptVersion,
      ),
  ]);
  const candidates = Object.values(counts).reduce((a, b) => a + b, 0);
  return { candidates, statuses: counts, recommendationReady: ready, activeEnrichments: activeBy };
}
