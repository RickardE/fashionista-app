/**
 * Before/after comparison of two runs over the same products — typically the
 * same model before and after a taxonomy, prompt or gate change.
 *
 * It separates three effects on the review rate by replaying each run's
 * stored output under each gate version:
 *   gate        the base run's own output would now pass the new gate
 *   prediction  the new run's output passes where the base output still would not
 *   input       the product itself changed between the runs (category fix, new image)
 * Optionally it scores the new run against human decisions made on the base
 * run (the attention-report CSV), the closest thing to ground truth a pilot has.
 */

import type { CanonicalColor } from "@/server/catalog/types";
import { applyGateAs, type GateVersion } from "./gate";
import { parseCsv, type loadReviewData } from "./review";
import { COLOUR_PROFILES_BY_COLOUR, type ColourProfile } from "./taxonomy";
import type { Finding } from "./validate";

type ReviewData = Awaited<ReturnType<typeof loadReviewData>>;
type Row = ReviewData["rows"][number];
type Attrs = Record<string, unknown> & {
  materials?: { value: string }[];
  category_check?: { verdict: string; suggested_category: string | null };
};
type Confs = Record<string, unknown>;

const SINGLE_FIELDS = ["garment_type", "fit", "colour_primary", "colour_profile", "pattern", "leg_shape", "formality"] as const;
const LIST_FIELDS = ["colour_secondary", "materials", "aesthetics", "occasions", "seasons", "issues"] as const;
const COMPARED_FIELDS = [...SINGLE_FIELDS, ...LIST_FIELDS, "category_check"] as const;
const SCORED_FIELDS = ["garment_type", "fit", "colour_primary", "colour_profile", "pattern", "formality", "seasons", "category_check"] as const;
const RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

const inputCategory = (row: Row) =>
  ((row.input as { product?: { category?: string } } | null)?.product?.category ?? row.category) as string;

/**
 * A comparable rendering of one field. Lists are order-free; materials ignore
 * evidence; category_check becomes the category the model believes in, so
 * "disagrees → tops" before a catalogue fix equals "agrees" with tops after it.
 */
export function comparableValue(field: string, row: Row): string | undefined {
  const a = row.attributes as Attrs | null;
  if (!a) return undefined;
  if (field === "category_check") {
    const c = a.category_check;
    return c?.verdict === "disagrees" ? (c.suggested_category ?? "?") : inputCategory(row);
  }
  if (field === "materials") return (a.materials ?? []).map((m) => m.value).sort().join(", ");
  const v = a[field];
  if (v === undefined || v === null) return undefined;
  return Array.isArray(v) ? [...v].map(String).sort().join(", ") : String(v);
}

const confidenceOf = (field: string, row: Row): string | undefined => {
  const c = (row.confidences as Confs | null)?.[field];
  return typeof c === "string" ? c : undefined;
};

function gateAs(version: GateVersion, row: Row) {
  if (!row.attributes) return { outcome: row.outcome, reasons: [] as string[] };
  const v = (row.validation ?? {}) as { errors?: Finding[] };
  return applyGateAs(version, {
    attributes: row.attributes as never,
    confidences: row.confidences as never,
    errors: v.errors ?? [],
  });
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

function runSide(data: ReviewData, runId: number, rows: Row[]) {
  const run = data.runs.find((r) => r.id === runId);
  const count = (o: string) => rows.filter((r) => r.outcome === o).length;
  const cost = rows.reduce((s, r) => s + (r.costUsdMicros ?? 0), 0);
  const latencies = rows.map((r) => r.latencyMs ?? 0);
  return {
    runId,
    model: run ? `${run.provider}:${run.model}${run.effort ? ` (${run.effort})` : ""}` : `run ${runId}`,
    taxonomyVersion: run?.taxonomyVersion ?? "?",
    promptVersion: run?.promptVersion ?? "?",
    gateVersion: ((run?.params as { gateVersion?: string } | undefined)?.gateVersion ?? "1.0.0") as GateVersion,
    products: rows.length,
    completed: count("completed"),
    needsReview: count("needs_review"),
    failed: count("failed"),
    costUsd: cost / 1e6,
    costPerProductUsd: rows.length ? cost / 1e6 / rows.length : 0,
    inputTokens: rows.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
    outputTokens: rows.reduce((s, r) => s + (r.outputTokens ?? 0), 0),
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
    latencyMaxMs: latencies.length ? Math.max(...latencies) : null,
  };
}

export interface Decision {
  productId: string;
  field: string;
  decision: "A" | "B" | "both" | "neither";
}

/** Reads the attention report's exported decisions CSV. Undecided rows are skipped. */
export function parseDecisions(csv: string): Decision[] {
  return parseCsv(csv)
    .filter((r) => ["A", "B", "both", "neither"].includes(r.decision))
    .map((r) => ({ productId: r.product_id, field: r.field, decision: r.decision as Decision["decision"] }));
}

export type DecisionVerdict = "accepted" | "rejected" | "new_value" | "missing";

export function compareRuns(
  data: ReviewData,
  baseRunId: number,
  nextRunId: number,
  opts: { decisions?: Decision[]; decisionRuns?: [number, number] } = {},
) {
  const byRun = (id: number) => new Map(data.rows.filter((r) => r.runId === id).map((r) => [r.productId, r]));
  const baseRows = byRun(baseRunId);
  const nextRows = byRun(nextRunId);
  const ids = [...baseRows.keys()].filter((id) => nextRows.has(id));
  const pairs = ids
    .map((id) => ({ id, base: baseRows.get(id)!, next: nextRows.get(id)! }))
    .sort((x, y) => x.base.name.localeCompare(y.base.name));
  const label = (r: Row) => `${r.brand ? `${r.brand} — ` : ""}${r.name}`;

  const base = runSide(data, baseRunId, pairs.map((p) => p.base));
  const next = runSide(data, nextRunId, pairs.map((p) => p.next));

  // --- outcomes under each gate --------------------------------------------
  const tally = (rows: Row[], version: GateVersion) => {
    const outcomes = rows.map((r) => (r.attributes ? gateAs(version, r).outcome : r.outcome));
    return {
      completed: outcomes.filter((o) => o === "completed").length,
      needsReview: outcomes.filter((o) => o === "needs_review").length,
      failed: outcomes.filter((o) => o === "failed").length,
    };
  };
  const outcomeMatrix = (["1.0.0", "1.1.0"] as const).flatMap((gate) => [
    { run: baseRunId, gate, ...tally(pairs.map((p) => p.base), gate) },
    { run: nextRunId, gate, ...tally(pairs.map((p) => p.next), gate) },
  ]);

  // --- per-product transitions and their cause -----------------------------
  const transitions = pairs
    .map(({ id, base: b, next: n }) => {
      const baseReasons = gateAs(base.gateVersion, b).reasons;
      const nextReasons = gateAs(next.gateVersion, n).reasons;
      const from = b.outcome;
      const to = n.outcome;
      const inputChanged = b.inputContentHash !== n.inputContentHash;
      let cause: "gate" | "prediction" | "regression" | null = null;
      if (from !== "completed" && to === "completed") {
        cause = b.attributes && gateAs(next.gateVersion, b).outcome === "completed" ? "gate" : "prediction";
      } else if (from === "completed" && to !== "completed") cause = "regression";
      return { productId: id, name: label(b), from, to, cause, inputChanged, baseReasons, nextReasons };
    })
    .filter((t) => t.from !== t.to || t.baseReasons.join() !== t.nextReasons.join());

  // --- review reasons ------------------------------------------------------
  const reasonCounts = (rows: Row[], version: GateVersion) => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const reason of gateAs(version, r).reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
    return counts;
  };
  const baseReasons = reasonCounts(pairs.map((p) => p.base), base.gateVersion);
  const nextReasons = reasonCounts(pairs.map((p) => p.next), next.gateVersion);
  const reasons = [...new Set([...baseReasons.keys(), ...nextReasons.keys()])]
    .map((reason) => ({ reason, base: baseReasons.get(reason) ?? 0, next: nextReasons.get(reason) ?? 0 }))
    .sort((x, y) => y.base + y.next - (x.base + x.next));

  // --- field-level changes -------------------------------------------------
  const ok = pairs.filter((p) => p.base.attributes && p.next.attributes);
  const fields = COMPARED_FIELDS.map((field) => {
    const both = ok.filter((p) => comparableValue(field, p.base) !== undefined && comparableValue(field, p.next) !== undefined);
    const changed = both
      .filter((p) => comparableValue(field, p.base) !== comparableValue(field, p.next))
      .map((p) => ({
        productId: p.id,
        name: label(p.base),
        from: comparableValue(field, p.base)!,
        to: comparableValue(field, p.next)!,
        inputChanged: p.base.inputContentHash !== p.next.inputContentHash,
      }));
    return { field, compared: both.length, same: both.length - changed.length, changed };
  });

  // --- confidence shifts on scored fields ----------------------------------
  const confidence = SCORED_FIELDS.map((field) => {
    const shifts = { field, up: 0, down: 0, same: 0, baseLow: 0, nextLow: 0 };
    for (const p of ok) {
      const a = confidenceOf(field, p.base);
      const b = confidenceOf(field, p.next);
      if (!a || !b) continue;
      if (a === "low") shifts.baseLow++;
      if (b === "low") shifts.nextLow++;
      if (RANK[b] > RANK[a]) shifts.up++;
      else if (RANK[b] < RANK[a]) shifts.down++;
      else shifts.same++;
    }
    return shifts;
  });

  // --- label distributions the review called out ---------------------------
  const labelCount = (rows: Row[], field: string, value: string) =>
    rows.filter((r) => {
      const v = (r.attributes as Attrs | null)?.[field];
      return Array.isArray(v) ? v.includes(value) : v === value;
    }).length;
  // Recomputed from attributes, so a run made before the rule existed is judged by it too.
  const inconsistentProfiles = (rows: Row[]) =>
    rows.filter((r) => {
      const a = r.attributes as { colour_primary?: CanonicalColor; colour_profile?: ColourProfile } | null;
      return !!a?.colour_primary && !!a.colour_profile && !COLOUR_PROFILES_BY_COLOUR[a.colour_primary]?.includes(a.colour_profile);
    }).length;
  const signals = [
    { signal: "aesthetic: classic", base: labelCount(ok.map((p) => p.base), "aesthetics", "classic"), next: labelCount(ok.map((p) => p.next), "aesthetics", "classic") },
    { signal: "pattern: texture", base: labelCount(ok.map((p) => p.base), "pattern", "texture"), next: labelCount(ok.map((p) => p.next), "pattern", "texture") },
    { signal: "pattern: check", base: labelCount(ok.map((p) => p.base), "pattern", "check"), next: labelCount(ok.map((p) => p.next), "pattern", "check") },
    {
      signal: "colour profile outside its colour family (1.1 rule)",
      base: inconsistentProfiles(ok.map((p) => p.base)),
      next: inconsistentProfiles(ok.map((p) => p.next)),
    },
  ];

  // --- the new run against human decisions ---------------------------------
  let decisions: {
    total: number;
    byVerdict: Record<DecisionVerdict, number>;
    items: {
      productId: string;
      name: string;
      field: string;
      decision: Decision["decision"];
      accepted: string[];
      rejected: string[];
      next: string | undefined;
      verdict: DecisionVerdict;
      inputChanged: boolean;
    }[];
  } | null = null;
  if (opts.decisions?.length && opts.decisionRuns) {
    const [aRows, bRows] = opts.decisionRuns.map(byRun);
    const items = opts.decisions.flatMap((d) => {
      const a = aRows.get(d.productId);
      const b = bRows.get(d.productId);
      const n = nextRows.get(d.productId);
      if (!a || !b || !n) return [];
      const va = comparableValue(d.field, a) ?? "";
      const vb = comparableValue(d.field, b) ?? "";
      const accepted = d.decision === "A" ? [va] : d.decision === "B" ? [vb] : d.decision === "both" ? [va, vb] : [];
      const rejected = d.decision === "A" ? [vb] : d.decision === "B" ? [va] : d.decision === "neither" ? [va, vb] : [];
      const value = comparableValue(d.field, n);
      const verdict: DecisionVerdict =
        value === undefined ? "missing" : accepted.includes(value) ? "accepted" : rejected.includes(value) ? "rejected" : "new_value";
      return [
        {
          productId: d.productId,
          name: label(n),
          field: d.field,
          decision: d.decision,
          accepted: [...new Set(accepted)],
          rejected: [...new Set(rejected)].filter((v) => !accepted.includes(v)),
          next: value,
          verdict,
          inputChanged: a.inputContentHash !== n.inputContentHash,
        },
      ];
    });
    const byVerdict = { accepted: 0, rejected: 0, new_value: 0, missing: 0 };
    for (const i of items) byVerdict[i.verdict]++;
    decisions = { total: items.length, byVerdict, items };
  }

  return {
    base,
    next,
    products: pairs.length,
    inputChanged: pairs.filter((p) => p.base.inputContentHash !== p.next.inputContentHash).map((p) => label(p.base)),
    outcomeMatrix,
    transitions,
    reasons,
    fields,
    confidence,
    signals,
    decisions,
  };
}

export type RunComparison = ReturnType<typeof compareRuns>;

const usd = (n: number) => `$${n.toFixed(4)}`;
const sec = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);

/** The comparison as a Markdown report. */
export function comparisonMarkdown(c: RunComparison): string {
  const { base: b, next: n } = c;
  const head = (s: typeof b) => `#${s.runId} (taxonomy ${s.taxonomyVersion}, prompt ${s.promptVersion}, gate ${s.gateVersion})`;
  const lines: string[] = [];
  lines.push(`# Run #${b.runId} vs run #${n.runId}`, "");
  lines.push(`- Base: ${head(b)} — ${b.model}`, `- New: ${head(n)} — ${n.model}`, `- Products compared: ${c.products}`);
  if (c.inputChanged.length) lines.push(`- Inputs changed between the runs (${c.inputChanged.length}): ${c.inputChanged.join("; ")}`);
  lines.push("", "## Outcomes", "", `| | #${b.runId} | #${n.runId} |`, "|---|---|---|");
  for (const [k, l] of [["completed", "completed"], ["needsReview", "needs review"], ["failed", "failed"]] as const) {
    lines.push(`| ${l} | ${b[k]} | ${n[k]} |`);
  }
  lines.push(
    `| cost | ${usd(b.costUsd)} (${usd(b.costPerProductUsd)}/product) | ${usd(n.costUsd)} (${usd(n.costPerProductUsd)}/product) |`,
    `| tokens in / out | ${b.inputTokens} / ${b.outputTokens} | ${n.inputTokens} / ${n.outputTokens} |`,
    `| latency p50 / p95 / max | ${sec(b.latencyP50Ms)} / ${sec(b.latencyP95Ms)} / ${sec(b.latencyMaxMs)} | ${sec(n.latencyP50Ms)} / ${sec(n.latencyP95Ms)} / ${sec(n.latencyMaxMs)} |`,
  );

  lines.push("", "## Gate vs prediction", "", "Each run's stored output replayed under each gate version (completed / needs review):", "");
  lines.push(`| gate | #${b.runId} output | #${n.runId} output |`, "|---|---|---|");
  for (const gate of ["1.0.0", "1.1.0"] as const) {
    const cell = (run: number) => {
      const m = c.outcomeMatrix.find((x) => x.gate === gate && x.run === run)!;
      return `${m.completed} / ${m.needsReview}`;
    };
    lines.push(`| ${gate} | ${cell(b.runId)} | ${cell(n.runId)} |`);
  }
  const by = (cause: string) => c.transitions.filter((t) => t.cause === cause);
  lines.push(
    "",
    `- Review → completed because of the gate alone: ${by("gate").length}`,
    `- Review → completed because the prediction changed: ${by("prediction").length}` +
      (by("prediction").some((t) => t.inputChanged) ? ` (of which input changed: ${by("prediction").filter((t) => t.inputChanged).length})` : ""),
    `- Completed → review (regressions): ${by("regression").length}`,
  );

  lines.push("", "## Products whose outcome or reasons changed", "", "| product | before | after | cause |", "|---|---|---|---|");
  for (const t of c.transitions) {
    const fmt = (o: string, r: string[]) => `${o}${r.length ? `: ${r.join(", ")}` : ""}`;
    lines.push(`| ${t.name}${t.inputChanged ? " *(input changed)*" : ""} | ${fmt(t.from, t.baseReasons)} | ${fmt(t.to, t.nextReasons)} | ${t.cause ?? "reasons changed"} |`);
  }

  lines.push("", "## Review reasons", "", `| reason | #${b.runId} | #${n.runId} |`, "|---|---|---|");
  for (const r of c.reasons) lines.push(`| ${r.reason} | ${r.base} | ${r.next} |`);

  lines.push("", "## Field changes", "", "| field | unchanged | changed |", "|---|---|---|");
  for (const f of c.fields) lines.push(`| ${f.field} | ${f.same}/${f.compared} | ${f.changed.length} |`);
  for (const f of c.fields.filter((x) => x.changed.length)) {
    lines.push("", `**${f.field}**`, "");
    for (const ch of f.changed) lines.push(`- ${ch.name}: ${ch.from || "∅"} → ${ch.to || "∅"}${ch.inputChanged ? " *(input changed)*" : ""}`);
  }

  lines.push("", "## Confidence shifts", "", `| field | up | down | same | low in #${b.runId} | low in #${n.runId} |`, "|---|---|---|---|---|---|");
  for (const s of c.confidence) lines.push(`| ${s.field} | ${s.up} | ${s.down} | ${s.same} | ${s.baseLow} | ${s.nextLow} |`);

  lines.push("", "## Signals from the manual review", "", `| signal | #${b.runId} | #${n.runId} |`, "|---|---|---|");
  for (const s of c.signals) lines.push(`| ${s.signal} | ${s.base} | ${s.next} |`);

  if (c.decisions) {
    const d = c.decisions;
    lines.push(
      "",
      "## Against the human decisions",
      "",
      `${d.total} decisions. The new value is: accepted ${d.byVerdict.accepted} · a rejected value ${d.byVerdict.rejected} · a value nobody judged ${d.byVerdict.new_value} · missing ${d.byVerdict.missing}`,
      "",
      "| product | field | decision | accepted | rejected | new run |",
      "|---|---|---|---|---|---|",
    );
    const order: Record<DecisionVerdict, number> = { rejected: 0, new_value: 1, missing: 2, accepted: 3 };
    for (const i of [...d.items].sort((x, y) => order[x.verdict] - order[y.verdict] || x.name.localeCompare(y.name))) {
      lines.push(
        `| ${i.name}${i.inputChanged ? " *(input changed)*" : ""} | ${i.field} | ${i.decision} | ${i.accepted.join(" / ") || "—"} | ${i.rejected.join(" / ") || "—"} | ${i.next ?? "∅"} (${i.verdict.replace("_", " ")}) |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
