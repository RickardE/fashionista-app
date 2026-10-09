/**
 * Enrichment reporting.
 *
 *   npm run products:enrich-report                                  # catalogue status + recent runs
 *   npm run products:enrich-report -- --run 7 --run 8               # side-by-side run comparison + problem products
 *   npm run products:enrich-report -- --run 7 --run 8 --html --csv  # review artifacts in .data/enrichment/
 *   npm run products:enrich-report -- --eval reviewed.csv           # accuracy + calibration from a marked CSV
 *   npm run products:enrich-report -- --run 4 --run 5 --attention   # review queue: only what needs a human
 *   npm run products:enrich-report -- --run 4 --run 6 --compare \
 *       [--decisions .data/enrichment/attention-decisions-4-5.csv --decision-runs 4,5]   # before/after report
 */

import "./env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { connect } from "@/server/db/client";
import { catalogueOverview, computeRunStats, getRuns, listRuns, problemProducts } from "@/server/enrichment/report";
import { attentionHtml, attentionReport } from "@/server/enrichment/attention";
import { compareRuns, comparisonMarkdown, parseDecisions } from "@/server/enrichment/compare";
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
      attention: { type: "boolean", default: false },
      compare: { type: "boolean", default: false },
      decisions: { type: "string" },
      "decision-runs": { type: "string" },
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

    if (values.attention) {
      if (runIds.length !== 2) throw new Error("--attention compares exactly two runs: --run A --run B");
      const data = await loadReviewData(db, runIds);
      const report = attentionReport(data, runIds[0], runIds[1]);
      await mkdir(values.out, { recursive: true });
      const file = path.join(values.out, `attention-runs-${runIds.join("-")}.html`);
      await writeFile(file, attentionHtml(data, runIds[0], runIds[1]));
      const items = report.products.flatMap((p) => p.items);
      console.log(`${report.products.length} of ${report.compared} products need attention (${items.length} items: ` +
        `${items.filter((i) => i.severity === "high").length} high, ${items.filter((i) => i.severity === "medium").length} medium, ${items.filter((i) => i.severity === "low").length} low)`);
      console.table(report.fields.map((f) => ({ field: f.field, identical: `${f.identical}/${f.compared}`, flagged: f.flagged, note: f.note })));
      console.log(`Review queue: ${file}`);
      return;
    }

    if (values.compare) {
      if (runIds.length !== 2) throw new Error("--compare takes exactly two runs: --run BASE --run NEW");
      const decisionRuns = values["decision-runs"]?.split(",").map((r) => positiveInt(r.trim(), "--decision-runs"));
      if (values.decisions && decisionRuns?.length !== 2) throw new Error("--decisions needs --decision-runs A,B (the runs the decisions were made on)");
      const data = await loadReviewData(db, [...new Set([...runIds, ...(decisionRuns ?? [])])]);
      const comparison = compareRuns(data, runIds[0], runIds[1], {
        decisions: values.decisions ? parseDecisions(await readFile(values.decisions, "utf8")) : undefined,
        decisionRuns: decisionRuns as [number, number] | undefined,
      });
      await mkdir(values.out, { recursive: true });
      const file = path.join(values.out, `compare-runs-${runIds.join("-")}.md`);
      const markdown = comparisonMarkdown(comparison);
      await writeFile(file, markdown);
      console.log(markdown);
      console.log(`Written to ${file}`);
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
