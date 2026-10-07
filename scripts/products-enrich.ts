/**
 * Production enrichment: enriches products that need it (new, changed, or on
 * an older taxonomy/prompt version) and makes the results active.
 *
 *   npm run products:enrich -- --provider anthropic --model claude-opus-5-5 --effort low --limit 50
 *   npm run products:enrich -- --provider openai --model <model> --ids <uuid> --ids <uuid>
 *   npm run products:enrich -- ... --retry-failed --limit 100
 *   npm run products:enrich -- ... --all --kind backfill          # whole catalogue (after the pilot!)
 *   npm run products:enrich -- ... --limit 5 --dry-run            # show selection + first prompt, no calls
 *
 * Model/provider can also come from ENRICHMENT_PROVIDER / ENRICHMENT_MODEL / ENRICHMENT_EFFORT.
 */

import "./env";
import { parseArgs } from "node:util";
import { connect } from "@/server/db/client";
import { buildEnrichmentInput } from "@/server/enrichment/input";
import { runEnrichment } from "@/server/enrichment/pipeline";
import { buildUserPrompt } from "@/server/enrichment/prompt";
import { createModelProvider } from "@/server/enrichment/providers/registry";
import { DEFAULT_MAX_ATTEMPTS, selectProductsToEnrich } from "@/server/enrichment/state";
import { products } from "@/server/db/schema";
import { createLogger } from "@/server/log";
import { inArray } from "drizzle-orm";
import { imageModeFrom, MODEL_OPTIONS, modelConfigFrom, positiveInt, printReasons, statsRows } from "./enrichment-cli";

const log = createLogger("products:enrich");

async function main() {
  const { values } = parseArgs({
    options: {
      ...MODEL_OPTIONS,
      ids: { type: "string", multiple: true },
      limit: { type: "string" },
      all: { type: "boolean", default: false },
      kind: { type: "string", default: "incremental" },
      "retry-failed": { type: "boolean", default: false },
      "include-review": { type: "boolean", default: false },
      "max-attempts": { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const kind = values.kind;
  if (kind !== "incremental" && kind !== "backfill") throw new Error(`--kind must be "incremental" or "backfill"`);
  if (!values.ids?.length && !values.limit && !values.all) {
    throw new Error("Pass --limit N, explicit --ids, or --all (full catalogue — run the pilot first)");
  }
  const config = modelConfigFrom(values);
  const imageMode = imageModeFrom(values["image-mode"]);
  const concurrency = positiveInt(values.concurrency, "--concurrency");

  const { db, close } = connect({ direct: true });
  try {
    const productIds = values.ids?.length
      ? values.ids
      : await selectProductsToEnrich(db, {
          limit: values.limit ? positiveInt(values.limit, "--limit") : undefined,
          retryFailed: values["retry-failed"],
          includeReview: values["include-review"],
          maxAttempts: values["max-attempts"] ? positiveInt(values["max-attempts"], "--max-attempts") : DEFAULT_MAX_ATTEMPTS,
        });
    console.log(`${productIds.length} product(s) selected for ${config.provider}:${config.model}`);
    if (!productIds.length) return;

    if (values["dry-run"]) {
      const [first] = await db.select().from(products).where(inArray(products.id, productIds.slice(0, 1)));
      if (first) {
        console.log(`\nFirst product: ${first.name} (${first.id})\n--- user prompt ---`);
        console.log(buildUserPrompt(buildEnrichmentInput(first)));
      }
      console.log("\n(dry run — no model calls made)");
      return;
    }

    const { runId, stats } = await runEnrichment(db, {
      kind,
      provider: createModelProvider(config),
      productIds,
      concurrency,
      imageMode,
      params: { explicitIds: !!values.ids?.length, retryFailed: values["retry-failed"] },
      logger: log,
    });
    console.log(`\nEnrichment run #${runId} (${kind})`);
    console.table(statsRows(stats));
    printReasons("Failure reasons", stats.failure_reasons);
    printReasons("Review reasons", stats.review_reasons);
  } finally {
    await close();
  }
}

main().catch((err) => {
  log.error("enrichment aborted", { error: err as Error });
  process.exit(1);
});
