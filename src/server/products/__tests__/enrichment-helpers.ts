import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { enrichmentRuns, productEnrichments, productEnrichmentState, products } from "@/server/db/schema";
import { TAXONOMY_VERSION, type EnrichmentAttributes } from "@/server/enrichment/taxonomy";

/** Validated attributes for a navy regular-fit smart-casual shirt; override per test. */
export function attributes(overrides: Partial<EnrichmentAttributes> = {}): EnrichmentAttributes {
  return {
    garment_type: "oxford_shirt",
    fit: "regular",
    colour_primary: "navy",
    colour_secondary: [],
    colour_profile: "neutral_dark",
    pattern: "solid",
    leg_shape: "not_applicable",
    materials: [{ value: "cotton", evidence: "stated" }],
    aesthetics: ["classic"],
    formality: 3,
    occasions: ["work"],
    seasons: ["spring", "summer", "autumn", "winter"],
    category_check: { verdict: "agrees", suggested_category: null },
    issues: [],
    summary: "Navy cotton oxford shirt.",
    taxonomy_gaps: [],
    ...overrides,
  };
}

/**
 * Gives a product an active, completed enrichment of its current content, as a
 * production run would (bypassing the model). Returns the enrichment id.
 */
export async function activateEnrichment(
  db: Db,
  productId: string,
  attrs: Partial<EnrichmentAttributes> | Record<string, unknown> = {},
): Promise<string> {
  const [product] = await db.select({ hash: products.contentHash }).from(products).where(eq(products.id, productId));
  const [run] = await db
    .insert(enrichmentRuns)
    .values({ kind: "incremental", taxonomyVersion: TAXONOMY_VERSION, promptVersion: "test", provider: "mock", model: "mock", status: "succeeded" })
    .returning({ id: enrichmentRuns.id });
  const [row] = await db
    .insert(productEnrichments)
    .values({
      productId,
      runId: run.id,
      taxonomyVersion: TAXONOMY_VERSION,
      promptVersion: "test",
      provider: "mock",
      model: "mock",
      inputContentHash: product.hash,
      outcome: "completed",
      input: {},
      attributes: { ...attributes(), ...attrs },
      confidences: {},
    })
    .returning({ id: productEnrichments.id });
  await db
    .insert(productEnrichmentState)
    .values({ productId, status: "completed", activeEnrichmentId: row.id, enrichedContentHash: product.hash, taxonomyVersion: TAXONOMY_VERSION, promptVersion: "test" })
    .onConflictDoUpdate({
      target: productEnrichmentState.productId,
      set: { status: "completed", activeEnrichmentId: row.id, enrichedContentHash: product.hash },
    });
  return row.id;
}
