/**
 * Enrichment reporting.
 *
 *   npm run products:enrich-report                                  # catalogue status + recent runs
 *   npm run products:enrich-report -- --run 7 --run 8               # side-by-side run comparison + problem products
 *   npm run products:enrich-report -- --run 7 --run 8 --html --csv  # review artifacts in .data/enrichment/
 *   npm run products:enrich-report -- --eval reviewed.csv           # accuracy + calibration from a marked CSV
 */

import "./env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { connect } from "@/server/db/client";
import { catalogueOverview, computeRunStats, getRuns, listRuns, problemProducts } from "@/server/enrichment/report";
import { evaluateMarkedCsv, inputConsistency, loadReviewData, reviewCsv, reviewHtml } from "@/server/enrichment/review";
import { createLogger } from "@/server/log";
import { positiveInt, printReasons, statsRows } from "./enrichment-cli";

const log = createLogger("products:enrich-report");
const OUT_DIR = ".data/enrichment";

async function main() {
  const { values } = parseArgs({
    options: {
      run: { type: "string", multiple: true },
      html: { type: "boolean", default: false },
      csv: { type: "boolean", default: false },
      out: { type: "string", default: OUT_DIR },
      eval: { type: "string" },
    },
  });

  if (values.eval) {
    const result = evaluateMarkedCsv(await readFile(values.eval, "utf8"));
    for (const [run, fields] of Object.entries(result.byField)) {
      console.log(`\nAccuracy — ${run}`);
      console.table(fields);
      console.log(`Confidence calibration — ${run}`);
      console.table(result.calibration[run]);
    }
    console.log(`\n${result.unmarked} row(s) not marked`);
    return;
  }

  const { db, close } = connect({ direct: true });
  try {
    const runIds = (values.run ?? []).map((r) => positiveInt(r, "--run"));
    if (!runIds.length) {
      const overview = await catalogueOverview(db);
      console.log(`Enrichment candidates: ${overview.candidates}`);
      console.table(overview.statuses);
      console.log(`Recommendation-ready: ${overview.recommendationReady}`);
      if (overview.activeEnrichments.length) {
        console.log("\nActive enrichments by model/version:");
        console.table(overview.activeEnrichments);
      }
      const runs = await listRuns(db, 15);
      console.log("\nRecent runs:");
      console.table(
        runs.map((r) => ({
          run: r.id,
          kind: r.kind,
          model: `${r.provider}:${r.model}`,
          effort: r.effort ?? "",
          taxonomy: r.taxonomyVersion,
          prompt: r.promptVersion,
          status: r.status,
          products: (r.stats as { products?: number }).products ?? "",
          started: r.startedAt.toISOString().slice(0, 16).replace("T", " "),
        })),
      );
      return;
    }

    const runs = await getRuns(db, runIds);
    if (runs.length !== runIds.length) throw new Error("Unknown run id");
    const table: Record<string, Record<string, string | number>> = {};
    for (const run of runs) {
      // Recomputed from stored attempts, so the report is right even for interrupted runs.
      const stats = await computeRunStats(db, run.id);
      const key = `#${run.id} ${run.model}`;
      table.provider = { ...table.provider, [key]: run.provider };
      table.effort = { ...table.effort, [key]: run.effort ?? "(provider default)" };
      table["image mode"] = { ...table["image mode"], [key]: String((run.params as { imageMode?: string }).imageMode ?? "") };
      table.concurrency = { ...table.concurrency, [key]: String((run.params as { concurrency?: number }).concurrency ?? "") };
      table.taxonomy = { ...table.taxonomy, [key]: run.taxonomyVersion };
      table.prompt = { ...table.prompt, [key]: run.promptVersion };
      for (const [metric, value] of Object.entries(statsRows(stats))) table[metric] = { ...table[metric], [key]: value };
      console.log(`\n=== Run #${run.id} — ${run.kind} — ${run.provider}:${run.model}`);
      printReasons("Failure reasons", stats.failure_reasons);
      printReasons("Review reasons", stats.review_reasons);
      printReasons("Warnings", stats.warnings);
      printReasons("Taxonomy gaps", stats.taxonomy_gaps);
      const problems = await problemProducts(db, run.id);
      if (problems.length) {
        console.log("\nFailed / needs review:");
        console.table(
          problems.map((p) => ({
            outcome: p.outcome,
            product: `${p.brand ?? ""} ${p.name}`.trim(),
            category: p.category,
            why: p.error ?? (p.reasons ?? []).join(", "),
            id: p.productId,
          })),
        );
      }
    }
    console.log("\nComparison:");
    console.table(table);
    if (runIds.length > 1) {
      const consistency = inputConsistency(await loadReviewData(db, runIds));
      console.log(
        `\nInput consistency: ${consistency.identical}/${consistency.compared} products identical across runs` +
          (consistency.unverifiedImages ? ` (${consistency.unverifiedImages} with URL-only images: bytes not verified)` : ""),
      );
      if (consistency.differing.length) console.table(consistency.differing);
    }
    const overview = await catalogueOverview(db);
    console.log(`\nRecommendation-ready products (catalogue): ${overview.recommendationReady} of ${overview.candidates}`);

    if (values.html || values.csv) {
      const data = await loadReviewData(db, runIds);
      await mkdir(values.out, { recursive: true });
      const base = path.join(values.out, `review-runs-${runIds.join("-")}`);
      if (values.html) {
        await writeFile(`${base}.html`, reviewHtml(data, `StyleAI enrichment review — runs ${runIds.join(", ")}`));
        console.log(`HTML review sheet: ${base}.html`);
      }
      if (values.csv) {
        await writeFile(`${base}.csv`, reviewCsv(data));
        console.log(`Evaluation CSV: ${base}.csv (fill in "correct" with y/n, then --eval it)`);
      }
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  log.error("report failed", { error: err as Error });
  process.exit(1);
});
