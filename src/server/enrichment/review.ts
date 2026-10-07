/**
 * Pilot review artifacts: an HTML sheet (one card per product, one column per
 * run, so models can be compared side by side), a CSV for manual marking, and
 * scoring of a marked-up CSV into per-field accuracy and confidence calibration.
 */

import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { enrichmentRuns, productEnrichments, products } from "@/server/db/schema";
import { formatUsd } from "./pricing";
import type { Confidence } from "./taxonomy";

/** Fields exported for review, in display order. */
export const REVIEW_FIELDS = [
  "garment_type",
  "fit",
  "colour_primary",
  "colour_secondary",
  "colour_profile",
  "pattern",
  "materials",
  "aesthetics",
  "formality",
  "occasions",
  "seasons",
  "category_check",
  "issues",
  "summary",
] as const;
type ReviewField = (typeof REVIEW_FIELDS)[number];

type Attrs = Record<string, unknown> & {
  materials?: { value: string; evidence: string }[];
  category_check?: { verdict: string; suggested_category: string | null };
};
type Confs = Record<string, unknown>;

export function fieldValue(field: ReviewField, attrs: Attrs): string {
  const v = attrs[field];
  if (field === "materials") return (attrs.materials ?? []).map((m) => `${m.value} (${m.evidence})`).join(", ");
  if (field === "category_check") {
    const c = attrs.category_check;
    return c ? (c.verdict === "disagrees" ? `disagrees → ${c.suggested_category ?? "?"}` : "agrees") : "";
  }
  if (Array.isArray(v)) return v.join(", ");
  return v === undefined || v === null ? "" : String(v);
}

export function fieldConfidence(field: ReviewField, confs: Confs): string {
  const c = confs[field];
  if (typeof c === "string") return c;
  if (c && typeof c === "object") {
    return Object.entries(c as Record<string, string>)
      .map(([k, level]) => `${k}:${level}`)
      .join("; ");
  }
  return "";
}

/** For calibration, a multi-label field is as confident as its least confident kept label. */
export function confidenceBucket(text: string): Confidence | "none" {
  const levels = text.match(/\b(low|medium|high)\b/g) as Confidence[] | null;
  if (!levels?.length) return "none";
  return levels.includes("low") ? "low" : levels.includes("medium") ? "medium" : "high";
}

export async function loadReviewData(db: Db, runIds: number[]) {
  const runs = await db.select().from(enrichmentRuns).where(inArray(enrichmentRuns.id, runIds));
  const rows = await db
    .select({
      runId: productEnrichments.runId,
      productId: productEnrichments.productId,
      outcome: productEnrichments.outcome,
      attributes: productEnrichments.attributes,
      confidences: productEnrichments.confidences,
      validation: productEnrichments.validation,
      error: productEnrichments.error,
      latencyMs: productEnrichments.latencyMs,
      costUsdMicros: productEnrichments.costUsdMicros,
      inputTokens: productEnrichments.inputTokens,
      outputTokens: productEnrichments.outputTokens,
      imageUrl: productEnrichments.imageUrl,
      input: productEnrichments.input,
      inputContentHash: productEnrichments.inputContentHash,
      name: products.name,
      description: products.description,
      brand: products.brand,
      category: products.category,
      subcategory: products.subcategory,
      gender: products.gender,
      colors: products.colors,
      sourceAttributes: products.sourceAttributes,
    })
    .from(productEnrichments)
    .innerJoin(products, eq(products.id, productEnrichments.productId))
    .where(inArray(productEnrichments.runId, runIds));
  const orderedRuns = runIds.map((id) => runs.find((r) => r.id === id)).filter((r) => !!r);
  return { runs: orderedRuns, rows };
}

type ReviewData = Awaited<ReturnType<typeof loadReviewData>>;

// ---------------------------------------------------------------------------
// Input consistency across compared runs
// ---------------------------------------------------------------------------

export interface InputConsistency {
  /** Products present in at least two of the compared runs. */
  compared: number;
  identical: number;
  differing: { productId: string; name: string; differs: string[] }[];
}

/**
 * Whether compared runs gave each product the same input: same catalogue
 * content, same request (prompt text + schema) and same image. Images are only
 * provably identical when fingerprinted (inline image mode); URL-mode runs are
 * compared by URL and reported as unverified.
 */
export function inputConsistency({ rows }: ReviewData): InputConsistency & { unverifiedImages: number } {
  const byProduct = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r]);
  const result = { compared: 0, identical: 0, differing: [] as InputConsistency["differing"], unverifiedImages: 0 };
  for (const attempts of byProduct.values()) {
    if (attempts.length < 2) continue;
    result.compared++;
    const input = (r: (typeof rows)[number]) =>
      r.input as { request_sha256?: string; image?: { sha256?: string; url?: string } | null };
    const differs: string[] = [];
    const same = (f: (r: (typeof rows)[number]) => unknown) => new Set(attempts.map((a) => JSON.stringify(f(a)))).size === 1;
    if (!same((r) => r.inputContentHash)) differs.push("catalogue content");
    if (!same((r) => input(r).request_sha256)) differs.push("prompt/schema/text");
    if (attempts.every((a) => input(a).image?.sha256)) {
      if (!same((r) => input(r).image?.sha256)) differs.push("image bytes");
    } else {
      result.unverifiedImages++;
      if (!same((r) => input(r).image?.url ?? r.imageUrl)) differs.push("image url");
    }
    if (differs.length) result.differing.push({ productId: attempts[0].productId, name: attempts[0].name, differs });
    else result.identical++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const CSV_HEADER = [
  "run_id",
  "provider",
  "model",
  "product_id",
  "product_name",
  "brand",
  "category",
  "outcome",
  "field",
  "ai_value",
  "confidence",
  "correct",
  "expected_value",
  "notes",
  "image_url",
];

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reviewCsv({ runs, rows }: ReviewData): string {
  const runById = new Map(runs.map((r) => [r.id, r]));
  const lines = [CSV_HEADER.join(",")];
  // Product → field → run, so every model's answer for the same field sits on
  // adjacent rows and can be marked side by side.
  const products = [...new Set(rows.map((r) => r.productId))].sort((a, b) => {
    const na = rows.find((r) => r.productId === a)!.name;
    const nb = rows.find((r) => r.productId === b)!.name;
    return na.localeCompare(nb) || (a < b ? -1 : 1);
  });
  const runOrder = runs.map((r) => r.id);
  for (const productId of products) {
    const attempts = rows
      .filter((r) => r.productId === productId)
      .sort((a, b) => runOrder.indexOf(a.runId) - runOrder.indexOf(b.runId));
    const base = (r: (typeof rows)[number]) => {
      const run = runById.get(r.runId);
      return [r.runId, run?.provider, run?.model, r.productId, r.name, r.brand, r.category, r.outcome];
    };
    for (const r of attempts.filter((a) => !a.attributes)) {
      lines.push([...base(r), "(failed)", r.error, "", "", "", "", r.imageUrl].map(csvCell).join(","));
    }
    for (const field of REVIEW_FIELDS) {
      for (const r of attempts.filter((a) => a.attributes)) {
        const value = fieldValue(field, r.attributes as Attrs);
        const conf = fieldConfidence(field, (r.confidences ?? {}) as Confs);
        lines.push([...base(r), field, value, conf, "", "", "", r.imageUrl].map(csvCell).join(","));
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Minimal RFC 4180 parser (quoted fields, escaped quotes, embedded newlines). */
export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    records.push(row);
  }
  const [header, ...body] = records.filter((r) => r.some((c) => c.trim()));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const YES = new Set(["y", "yes", "1", "true", "correct", "ok", "x"]);
const NO = new Set(["n", "no", "0", "false", "wrong", "incorrect"]);

export interface EvalTable {
  /** "provider:model (run N)" → field → { marked, correct, accuracy } */
  byField: Record<string, Record<string, { marked: number; correct: number; accuracy: number }>>;
  /** "provider:model (run N)" → confidence bucket → { marked, correct, accuracy } */
  calibration: Record<string, Record<string, { marked: number; correct: number; accuracy: number }>>;
  unmarked: number;
}

/** Scores a manually marked review CSV. Rows whose "correct" cell is empty are ignored. */
export function evaluateMarkedCsv(text: string): EvalTable {
  const result: EvalTable = { byField: {}, calibration: {}, unmarked: 0 };
  const bump = (
    table: Record<string, Record<string, { marked: number; correct: number; accuracy: number }>>,
    key: string,
    sub: string,
    ok: boolean,
  ) => {
    const cell = ((table[key] ??= {})[sub] ??= { marked: 0, correct: 0, accuracy: 0 });
    cell.marked++;
    if (ok) cell.correct++;
    cell.accuracy = Math.round((cell.correct / cell.marked) * 1000) / 1000;
  };
  for (const row of parseCsv(text)) {
    if (!row.field || row.field === "(failed)") continue;
    const mark = row.correct?.toLowerCase();
    if (!mark || (!YES.has(mark) && !NO.has(mark))) {
      result.unmarked++;
      continue;
    }
    const ok = YES.has(mark);
    const key = `${row.provider}:${row.model} (run ${row.run_id})`;
    bump(result.byField, key, row.field, ok);
    bump(result.byField, key, "(all fields)", ok);
    bump(result.calibration, key, confidenceBucket(row.confidence ?? ""), ok);
  }
  return result;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function reviewHtml({ runs, rows }: ReviewData, title = "StyleAI enrichment review"): string {
  const byProduct = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r]);
  const productsSorted = [...byProduct.values()].sort((a, b) => a[0].name.localeCompare(b[0].name));

  const runHeader = runs
    .map(
      (r) =>
        `<li><b>Run ${r.id}</b> — ${esc(r.provider)}:${esc(r.model)}${r.effort ? ` (effort ${esc(r.effort)})` : ""} · taxonomy ${esc(r.taxonomyVersion)} · prompt ${esc(r.promptVersion)} · ${esc(r.kind)}${
          (r.params as { seed?: string }).seed ? ` · seed ${esc((r.params as { seed?: string }).seed)}` : ""
        }</li>`,
    )
    .join("");

  const runColumn = (r: (typeof rows)[number] | undefined) => {
    if (!r) return `<td class="run"><p class="runlabel">—</p><i>not in this run</i></td>`;
    const v = r.validation as {
      gateReasons?: string[];
      warnings?: { code: string; message: string }[];
      errors?: { code: string; message: string }[];
      dropped?: string[];
    };
    const attrs = (r.attributes ?? {}) as Attrs;
    const confs = (r.confidences ?? {}) as Confs;
    const fields = r.attributes
      ? `<table class="attrs">${REVIEW_FIELDS.map((f) => {
          const conf = fieldConfidence(f, confs);
          const bucket = confidenceBucket(conf);
          return `<tr><th>${f}</th><td>${esc(fieldValue(f, attrs))}</td><td class="conf ${bucket}">${esc(conf)}</td></tr>`;
        }).join("")}</table>`
      : `<p class="err">${esc(r.error)}</p>`;
    const run = runs.find((x) => x.id === r.runId);
    const served = (r.validation as { servedModel?: string }).servedModel;
    const gaps = (attrs.taxonomy_gaps as string[] | undefined) ?? [];
    const list = (label: string, items: string[] | undefined) =>
      items?.length ? `<p class="small"><b>${label}:</b> ${items.map(esc).join(", ")}</p>` : "";
    return `<td class="run">
      <p class="runlabel">Run ${r.runId} · ${esc(run?.provider)}:${esc(run?.model)}${run?.effort ? ` · ${esc(run.effort)}` : ""}${
        served && served !== run?.model ? ` <span class="small">(served by ${esc(served)})</span>` : ""
      }</p>
      <p class="outcome ${r.outcome}">${r.outcome}</p>
      ${list("gate", v.gateReasons)}
      ${list("rules", v.errors?.map((e) => e.message))}
      ${list("warnings", v.warnings?.map((w) => w.message))}
      ${list("dropped", v.dropped)}
      ${fields}
      ${list("taxonomy gaps", gaps)}
      <p class="small">${r.latencyMs} ms · ${formatUsd(r.costUsdMicros)} · ${r.inputTokens} in / ${r.outputTokens} out tokens</p>
    </td>`;
  };

  const consistency = inputConsistency({ runs, rows });
  const consistencyBanner =
    runs.length < 2
      ? ""
      : `<p class="${consistency.differing.length ? "err" : "ok"}"><b>Input consistency:</b> ${consistency.identical}/${consistency.compared} products received identical input across runs${
          consistency.unverifiedImages ? ` (${consistency.unverifiedImages} with URL-only images — bytes not verified)` : ""
        }${consistency.differing.length ? ` · differing: ${consistency.differing.map((d) => `${esc(d.name)} (${d.differs.join(", ")})`).join("; ")}` : ""}</p>`;

  const cards = productsSorted
    .map((attempts) => {
      const p = attempts[0];
      const src = p.sourceAttributes;
      return `<section class="card">
        <div class="product">
          ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy">` : "<div class='noimg'>no image</div>"}
          <h2>${esc(p.name)}</h2>
          <p><b>${esc(p.brand)}</b> · ${esc(p.gender)} · ${esc(p.category)}${p.subcategory ? ` / ${esc(p.subcategory)}` : ""}</p>
          <p class="small">source colours: ${esc(p.colors.join(", ") || "—")} (${esc(src.colorsRaw.join(", ") || "—")})</p>
          <p class="small">source material: ${esc(src.material ?? "—")} · pattern: ${esc(src.pattern ?? "—")}</p>
          <p class="small">paths: ${esc(src.categoryPaths.join(" | ") || "—")}</p>
          <details><summary class="small">description</summary><p class="small">${esc(p.description ?? "—")}</p></details>
          ${p.imageUrl ? `<p class="small"><a href="${esc(p.imageUrl)}" target="_blank" rel="noreferrer">full-size image</a></p>` : ""}
          <p class="small id">${esc(p.productId)}</p>
        </div>
        <table class="runs"><tr>${runs.map((run) => runColumn(attempts.find((a) => a.runId === run.id))).join("")}</tr></table>
      </section>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --bg:#fafaf8; --fg:#1d1d1b; --muted:#6b6b66; --line:#e3e2dc; --card:#fff; --ok:#2f7d4f; --warn:#a86a00; --bad:#b3261e; }
  body { margin:0; padding:16px; font:14px/1.4 system-ui,sans-serif; background:var(--bg); color:var(--fg); }
  h1 { font-size:20px; } h2 { font-size:15px; margin:8px 0 4px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:12px; margin:12px 0; display:flex; gap:16px; flex-wrap:wrap; }
  .product { width:240px; flex:none; } .product img, .noimg { width:240px; height:300px; object-fit:contain; background:#f1f0eb; border-radius:4px; }
  .runs { border-collapse:collapse; flex:1; min-width:0; } .runs > tbody > tr > td { vertical-align:top; padding:0 8px; border-left:1px solid var(--line); min-width:260px; }
  .attrs { border-collapse:collapse; width:100%; } .attrs th { text-align:left; color:var(--muted); font-weight:500; padding:2px 6px 2px 0; white-space:nowrap; }
  .attrs td { padding:2px 6px 2px 0; } .conf { color:var(--muted); font-size:12px; } .conf.low { color:var(--bad); } .conf.medium { color:var(--warn); }
  .outcome { font-weight:600; margin:0 0 4px; } .completed { color:var(--ok); } .needs_review { color:var(--warn); } .failed, .err { color:var(--bad); }
  .small { font-size:12px; color:var(--muted); margin:2px 0; } .id { font-family:ui-monospace,monospace; }
  .runlabel { font-weight:600; font-size:12px; border-bottom:1px solid var(--line); padding-bottom:4px; margin:0 0 6px; }
  .ok { color:var(--ok); } details p { max-width:240px; }
</style></head><body>
<h1>${esc(title)}</h1><ul>${runHeader}</ul><p>${productsSorted.length} products</p>
${consistencyBanner}
${cards}
</body></html>`;
}
