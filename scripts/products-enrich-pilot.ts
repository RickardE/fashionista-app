/**
 * Runs the deterministic enrichment pilot: a seeded, stratified ~40-product
 * sample. Pilot runs never change what recommendation consumers read; they
 * only record results, so the same sample can be run against several models.
 *
 *   npm run products:enrich-pilot -- --seed 123 --dry-run                       # show the sample only
 *   npm run products:enrich-pilot -- --seed 123 --provider anthropic --model claude-opus-5-5 --effort low
 *   npm run products:enrich-pilot -- --seed 123 --provider anthropic --model claude-sonnet-5-5 --effort low
 *   npm run products:enrich-pilot -- --from-run 7 --provider openai --model <model>   # exact products of run 7
 *
 * Then: npm run products:enrich-report -- --run 7 --run 8 --run 9 --html --csv
 */

import "./env";
import { parseArgs } from "node:util";
import { and, eq, inArray } from "drizzle-orm";
import { connect } from "@/server/db/client";
import type { Db } from "@/server/db/client";
import { enrichmentRuns, productEnrichments, products } from "@/server/db/schema";
import { PROMPT_VERSION } from "@/server/enrichment/prompt";
import { TAXONOMY_VERSION } from "@/server/enrichment/taxonomy";
import { loadPilotCandidates, selectPilot } from "@/server/enrichment/pilot";
import { runEnrichment } from "@/server/enrichment/pipeline";
import { createModelProvider } from "@/server/enrichment/providers/registry";
import { createLogger } from "@/server/log";
import { imageModeFrom, MODEL_OPTIONS, modelConfigFrom, positiveInt, printReasons, statsRows } from "./enrichment-cli";

const log = createLogger("products:enrich-pilot");

/** Products whose content hash differs from what a reference run enriched. */
async function contentDrift(db: Db, runId: number, ids: string[]) {
  const [then, now] = await Promise.all([
    db
      .select({ id: productEnrichments.productId, hash: productEnrichments.inputContentHash })
      .from(productEnrichments)
      .where(and(eq(productEnrichments.runId, runId), inArray(productEnrichments.productId, ids))),
    db.select({ id: products.id, hash: products.contentHash, name: products.name }).from(products).where(inArray(products.id, ids)),
  ]);
  const before = new Map(then.map((r) => [r.id, r.hash]));
  return now.filter((p) => before.get(p.id) !== p.hash).map((p) => ({ id: p.id, name: p.name }));
}

async function main() {
  const { values } = parseArgs({
    options: {
      ...MODEL_OPTIONS,
      // Pilots send byte-identical, fingerprinted images to every model (see enrichment/images.ts).
      "image-mode": { type: "string", default: "inline" },
      seed: { type: "string", default: "123" },
      "allow-changed": { type: "boolean", default: false },
      "from-run": { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const { db, close } = connect({ direct: true });
  try {
    let productIds: string[];
    let selectionSummary: unknown;
    let seed = values.seed;

    if (values["from-run"]) {
      const runId = positiveInt(values["from-run"], "--from-run");
      const [prior] = await db.select().from(enrichmentRuns).where(eq(enrichmentRuns.id, runId));
      const ids = (prior?.params as { productIds?: string[] } | undefined)?.productIds;
      if (!ids?.length) throw new Error(`Run #${runId} has no recorded pilot product ids`);
      productIds = ids;
      seed = String((prior.params as { seed?: string }).seed ?? seed);
      console.log(`Reusing the ${ids.length} products of run #${runId} (seed ${seed})`);
      // A comparison is only fair if the products still have the content run #N saw.
      const drift = await contentDrift(db, runId, ids);
      if (drift.length) {
        console.log(`${drift.length} product(s) changed since run #${runId}:`);
        console.table(drift);
        if (!values["allow-changed"]) {
          throw new Error("Catalogue content changed since the reference run; re-select with --seed, or pass --allow-changed");
        }
      }
      if (prior.taxonomyVersion !== TAXONOMY_VERSION || prior.promptVersion !== PROMPT_VERSION) {
        console.log(
          `Note: run #${runId} used taxonomy ${prior.taxonomyVersion} / prompt ${prior.promptVersion}; ` +
            `this run uses ${TAXONOMY_VERSION} / ${PROMPT_VERSION}.`,
        );
      }
    } else {
      const selection = selectPilot(await loadPilotCandidates(db), seed);
      productIds = selection.productIds;
      selectionSummary = selection.summary;
      console.log(`Pilot sample — seed ${seed}: ${selection.summary.total} products`);
      console.table(selection.summary.segments);
      console.table(selection.summary.flags);
      console.table(
        selection.summary.strata
          .filter((s) => s.seats)
          .map((s) => ({ segment: s.segment, stratum: s.stratum, catalogue: s.catalogue, share: s.catalogueShare, seats: s.seats })),
      );
      console.log(`brands: ${selection.summary.brands.actual} (target ≥ ${selection.summary.brands.target})`);
      if (selection.summary.uncoveredStrata.length) {
        console.log(`strata without a seat (small): ${selection.summary.uncoveredStrata.join(", ")}`);
      }
      if (selection.summary.categoriesMissing.length) {
        console.log(`categories not covered: ${selection.summary.categoriesMissing.join(", ")}`);
      }
    }

    if (values["dry-run"]) {
      const rows = await db
        .select({ id: products.id, name: products.name, brand: products.brand, category: products.category, gender: products.gender })
        .from(products)
        .where(inArray(products.id, productIds));
      const byId = new Map(rows.map((r) => [r.id, r]));
      console.table(productIds.map((id) => byId.get(id)));
      console.log("(dry run — no model calls made)");
      return;
    }

    const config = modelConfigFrom(values);
    const { runId, stats } = await runEnrichment(db, {
      kind: "pilot",
      provider: createModelProvider(config),
      productIds,
      concurrency: positiveInt(values.concurrency, "--concurrency"),
      imageMode: imageModeFrom(values["image-mode"]),
      params: { seed, productIds, fromRun: values["from-run"] ?? null, selection: selectionSummary ?? null },
      logger: log,
    });
    console.log(`\nPilot run #${runId} — ${config.provider}:${config.model}${config.effort ? ` (effort ${config.effort})` : ""}`);
    console.table(statsRows(stats));
    printReasons("Failure reasons", stats.failure_reasons);
    printReasons("Review reasons", stats.review_reasons);
    printReasons("Taxonomy gaps", stats.taxonomy_gaps);
    console.log(`\nReview: npm run products:enrich-report -- --run ${runId} --html --csv`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  log.error("pilot aborted", { error: err as Error });
  process.exit(1);
});
