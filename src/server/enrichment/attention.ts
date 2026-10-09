/**
 * Attention report: compares two enrichment runs over the same products and
 * keeps only what a human needs to look at — model disagreements, low
 * confidence on required fields, category disagreements and suspicious
 * outputs. Everything else is summarized as agreement statistics. Read-only:
 * it renders from stored attempts and changes nothing.
 */

import { confidenceBucket, fieldConfidence, fieldValue, type loadReviewData } from "./review";

type ReviewData = Awaited<ReturnType<typeof loadReviewData>>;
type Row = ReviewData["rows"][number];
type Attrs = Record<string, unknown>;

export type Severity = "high" | "medium" | "low";

export interface AttentionItem {
  field: string;
  a: { value: string; confidence: string };
  b: { value: string; confidence: string };
  reason: string;
  severity: Severity;
}

export interface AttentionProduct {
  productId: string;
  name: string;
  brand: string | null;
  /** The category the models were given (from the stored input). */
  category: string;
  /** Set when the catalogue entry changed after these runs. */
  changedSince: string | null;
  imageUrl: string | null;
  items: AttentionItem[];
}

export interface FieldSummary {
  field: string;
  identical: number;
  compared: number;
  flagged: number;
  note: string;
}

const SINGLE_FIELDS = ["garment_type", "fit", "colour_primary", "colour_profile", "pattern", "leg_shape", "formality"] as const;
/** Required by the quality gate: low confidence here blocks completion. */
const REQUIRED_SCORED = ["garment_type", "fit", "colour_primary", "pattern", "formality", "seasons"] as const;
const LIST_FIELDS = ["aesthetics", "occasions", "seasons", "materials"] as const;
const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

const list = (attrs: Attrs, field: string): string[] => {
  const v = attrs[field];
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "object" && x ? String((x as { value: unknown }).value) : String(x)));
};
const sameList = (x: string[], y: string[]) => x.length === y.length && [...x].sort().join() === [...y].sort().join();
const confOf = (row: Row, field: string) => fieldConfidence(field as never, (row.confidences ?? {}) as Attrs);
const valOf = (row: Row, field: string) => fieldValue(field as never, (row.attributes ?? {}) as Attrs);
const cell = (row: Row, field: string) => ({ value: valOf(row, field), confidence: confOf(row, field) });
/** What the model was told the category was — not today's catalogue value. */
const inputCategory = (row: Row) => (row.input as { product?: { category?: string } }).product?.category ?? row.category;
/** Rule violations that follow from a wrong catalogue category (explained by the category check). */
const CATEGORY_CONSEQUENCES = new Set(["category_mismatch", "shoe_fit", "garment_fit_not_applicable"]);

function compareProduct(a: Row, b: Row, nameA: string, nameB: string): AttentionItem[] {
  const items: AttentionItem[] = [];
  const push = (field: string, reason: string, severity: Severity) => {
    const existing = items.find((i) => i.field === field);
    if (existing) {
      existing.reason += `; ${reason}`;
      if (RANK[severity] < RANK[existing.severity]) existing.severity = severity;
    } else items.push({ field, a: cell(a, field), b: cell(b, field), reason, severity });
  };

  if (!a.attributes || !b.attributes) {
    const failed = !a.attributes ? nameA : nameB;
    push("(attempt)", `${failed} failed: ${(!a.attributes ? a.error : b.error) ?? "unknown"}`, "high");
    return items;
  }
  const A = a.attributes as Attrs;
  const B = b.attributes as Attrs;
  const given = inputCategory(a);
  const fixedSince = a.currentCategory !== given ? ` (catalogue since changed to ${a.currentCategory})` : "";

  // Category check — a disagreement means the catalogue category may be wrong.
  const cc = (x: Attrs) => x.category_check as { verdict: string; suggested_category: string | null };
  const aDis = cc(A).verdict === "disagrees" && confOf(a, "category_check") !== "low";
  const bDis = cc(B).verdict === "disagrees" && confOf(b, "category_check") !== "low";
  if (aDis && bDis && cc(A).suggested_category === cc(B).suggested_category) {
    const suggested = cc(A).suggested_category;
    if (a.currentCategory === suggested) {
      push("category_check", `both models said ${suggested}, not ${given} — already corrected in the catalogue; confirm`, "low");
    } else {
      push("category_check", `both models say this is ${suggested}, not ${given} — likely catalogue error`, "high");
    }
  } else if (aDis || bDis) {
    push("category_check", `${aDis && bDis ? "both disagree with" : `${aDis ? nameA : nameB} disagrees with`} the catalogue category ${given}${fixedSince}`, "high");
  }

  // Hard rules and blocking issues from validation.
  for (const [row, who] of [[a, nameA], [b, nameB]] as const) {
    const v = row.validation as { errors?: { code: string; message: string }[]; warnings?: { code: string; message: string }[] };
    for (const e of v.errors ?? []) {
      if (CATEGORY_CONSEQUENCES.has(e.code) && (aDis || bDis)) continue; // explained by the category check
      push(e.code === "shoe_fit" || e.code === "garment_fit_not_applicable" ? "fit" : "garment_type", `${who}: ${e.message}`, "high");
    }
    for (const issue of list(row.attributes as Attrs, "issues")) {
      if (issue !== "low_information") push("issues", `${who} reports ${issue.replace(/_/g, " ")}`, "medium");
    }
    for (const w of v.warnings ?? []) {
      if (w.code === "colour_disagrees_with_source") push("colour_primary", `${who}: ${w.message}`, "low");
      else if (w.code !== "summary_truncated" && w.code !== "aesthetics_over_limit") push("(warning)", `${who}: ${w.message}`, "low");
    }
  }

  // Single-value disagreements.
  for (const field of SINGLE_FIELDS) {
    if (A[field] === B[field]) continue;
    if (A[field] === undefined || B[field] === undefined) continue; // added in a later taxonomy version
    if (field === "formality") {
      const d = Math.abs(Number(A[field]) - Number(B[field]));
      push(field, `models differ by ${d} formality level${d > 1 ? "s" : ""}`, d > 1 ? "medium" : "low");
    } else if (field === "colour_profile") {
      push(field, "models disagree", "low");
    } else {
      push(field, "models disagree", "medium");
    }
  }

  // Low confidence on gate-required fields (where the models agree, it's a quicker check).
  for (const field of REQUIRED_SCORED) {
    const lowA = confidenceBucket(confOf(a, field)) === "low";
    const lowB = confidenceBucket(confOf(b, field)) === "low";
    if (!lowA && !lowB) continue;
    const who = lowA && lowB ? "both models" : lowA ? nameA : nameB;
    const agree = field === "seasons" ? sameList(list(A, field), list(B, field)) : A[field] === B[field];
    push(field, `low confidence (${who})${agree ? " — values agree, quick visual check" : ""}`, agree ? "low" : "medium");
  }

  // Multi-label fields: flag only when the models share nothing.
  for (const field of ["aesthetics", "occasions", "seasons"] as const) {
    const x = list(A, field);
    const y = list(B, field);
    if (x.length && y.length && !x.some((v) => y.includes(v))) push(field, "no label in common", "medium");
  }
  // Materials: one model says the text states a material the other doesn't see.
  const stated = (x: Attrs) =>
    ((x.materials as { value: string; evidence: string }[]) ?? []).filter((m) => m.evidence === "stated").map((m) => m.value);
  const sa = stated(A);
  const sb = stated(B);
  if ((sa.length || sb.length) && !sameList(sa, sb)) push("materials", "models disagree on materials stated in the text", "low");

  return items.sort((x, y) => RANK[x.severity] - RANK[y.severity]);
}

/** Short model label, e.g. "claude-opus-5-5" → "opus-5-5". */
export const shortModel = (model: string | undefined, fallback: string) => (model ?? fallback).replace(/^claude-/, "");

export function attentionReport(data: ReviewData, runA: number, runB: number) {
  const nameA = shortModel(data.runs.find((r) => r.id === runA)?.model, `run ${runA}`);
  const nameB = shortModel(data.runs.find((r) => r.id === runB)?.model, `run ${runB}`);
  const byProduct = new Map<string, { a?: Row; b?: Row }>();
  for (const r of data.rows) {
    const slot = byProduct.get(r.productId) ?? {};
    if (r.runId === runA) slot.a = r;
    if (r.runId === runB) slot.b = r;
    byProduct.set(r.productId, slot);
  }
  const pairs = [...byProduct.values()].filter((p): p is { a: Row; b: Row } => !!p.a && !!p.b);

  const products: AttentionProduct[] = pairs
    .map(({ a, b }) => ({
      productId: a.productId,
      name: a.name,
      brand: a.brand,
      category: inputCategory(a),
      changedSince:
        a.currentContentHash !== a.inputContentHash || b.currentContentHash !== b.inputContentHash
          ? a.currentCategory !== inputCategory(a)
            ? `catalogue entry changed since these runs (category now ${a.currentCategory})`
            : "catalogue entry changed since these runs"
          : null,
      imageUrl: a.imageUrl,
      items: compareProduct(a, b, nameA, nameB),
    }))
    .filter((p) => p.items.length)
    .sort(
      (x, y) =>
        RANK[x.items[0].severity] - RANK[y.items[0].severity] ||
        y.items.filter((i) => i.severity !== "low").length - x.items.filter((i) => i.severity !== "low").length ||
        x.name.localeCompare(y.name),
    );

  const ok = pairs.filter((p) => p.a.attributes && p.b.attributes);
  const flaggedCount = (field: string) => products.filter((p) => p.items.some((i) => i.field === field)).length;
  const fields: FieldSummary[] = [
    ...SINGLE_FIELDS.map((field) => {
      const both = ok.filter((p) => (p.a.attributes as Attrs)[field] !== undefined && (p.b.attributes as Attrs)[field] !== undefined);
      const identical = both.filter((p) => (p.a.attributes as Attrs)[field] === (p.b.attributes as Attrs)[field]).length;
      return { field, identical, compared: both.length, flagged: flaggedCount(field), note: "" };
    }),
    ...LIST_FIELDS.map((field) => {
      const A = (p: { a: Row }) => list(p.a.attributes as Attrs, field);
      const B = (p: { b: Row }) => list(p.b.attributes as Attrs, field);
      const identical = ok.filter((p) => sameList(A(p), B(p))).length;
      const overlap = ok.filter((p) => A(p).some((v) => B(p).includes(v)) || (!A(p).length && !B(p).length)).length;
      return { field, identical, compared: ok.length, flagged: flaggedCount(field), note: `${overlap}/${ok.length} share at least one label` };
    }),
    {
      field: "category_check",
      identical: ok.filter((p) => JSON.stringify((p.a.attributes as Attrs).category_check) === JSON.stringify((p.b.attributes as Attrs).category_check)).length,
      compared: ok.length,
      flagged: flaggedCount("category_check"),
      note: "",
    },
  ];
  const clean = pairs.filter((p) => !products.some((x) => x.productId === p.a.productId)).map((p) => `${p.a.brand ?? ""} ${p.a.name}`.trim());
  return { runA, runB, nameA, nameB, compared: pairs.length, products, fields, clean };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function attentionHtml(data: ReviewData, runA: number, runB: number): string {
  const report = attentionReport(data, runA, runB);
  const label = (id: number) => (id === runA ? report.nameA : report.nameB);
  const items = report.products.reduce((n, p) => n + p.items.length, 0);
  const sev = (s: Severity) => report.products.reduce((n, p) => n + p.items.filter((i) => i.severity === s).length, 0);
  const storageKey = `styleai-attention-${runA}-${runB}`;

  const conf = (c: string) => (c ? `<span class="conf ${esc(confidenceBucket(c))}">${esc(c)}</span>` : "");
  const choice = (p: AttentionProduct, i: AttentionItem) => {
    const name = `${p.productId}|${i.field}`;
    return ["A", "B", "both", "neither"]
      .map(
        (v) =>
          `<label><input type="radio" name="${esc(name)}" value="${v}" data-product="${esc(p.productId)}" data-field="${esc(i.field)}">${
            v === "A" ? `${report.nameA} right` : v === "B" ? `${report.nameB} right` : v === "both" ? "both fine" : "neither"
          }</label>`,
      )
      .join("");
  };

  const card = (p: AttentionProduct) => `<section class="card" data-product="${esc(p.productId)}">
  <a class="thumb" href="${esc(p.imageUrl)}" target="_blank" rel="noreferrer">${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy">` : ""}</a>
  <div class="body">
    <h2>${esc(p.brand)} <span>${esc(p.name)}</span></h2>
    <p class="meta">category given to the models: ${esc(p.category)}${p.changedSince ? ` · <b>${esc(p.changedSince)}</b>` : ""}</p>
    <table>
      <thead><tr><th>field</th><th>${esc(label(runA))}</th><th>${esc(label(runB))}</th><th>why</th><th>decision</th></tr></thead>
      <tbody>${p.items
        .map(
          (i) => `<tr class="${i.severity}">
        <td class="field"><span class="dot"></span>${esc(i.field)}</td>
        <td>${esc(i.a.value) || "—"} ${conf(i.a.confidence)}</td>
        <td>${esc(i.b.value) || "—"} ${conf(i.b.confidence)}</td>
        <td class="why">${esc(i.reason)}</td>
        <td class="choice">${choice(p, i)}</td>
      </tr>`,
        )
        .join("")}</tbody>
    </table>
  </div>
</section>`;
  const needsDecision = report.products.filter((p) => p.items.some((i) => i.severity !== "low"));
  const quickChecks = report.products.filter((p) => p.items.every((i) => i.severity === "low"));
  const cards = `<h2 class="section">Needs a decision <small>${needsDecision.length} products — category questions, rule violations, model disagreements</small></h2>
${needsDecision.map(card).join("\n")}
<h2 class="section">Quick visual check <small>${quickChecks.length} products — models agree; only low confidence or minor detail</small></h2>
${quickChecks.map(card).join("\n")}`;

  const fieldRows = report.fields
    .map((f) => {
      const rate = f.compared ? f.identical / f.compared : 0;
      const verdict = f.flagged === 0 && rate >= 0.9 ? "agree — no review needed" : f.flagged === 0 ? "partial overlap only — not flagged" : `${f.flagged} product(s) flagged`;
      return `<tr><td>${esc(f.field)}</td><td>${f.identical}/${f.compared}</td><td>${esc(f.note)}</td><td>${esc(verdict)}</td></tr>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Enrichment review queue</title>
<style>
  :root { --bg:#fafaf8; --fg:#1d1d1b; --muted:#6b6b66; --line:#e3e2dc; --card:#fff; --high:#b3261e; --medium:#a86a00; --low:#6b6b66; --ok:#2f7d4f; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#161615; --fg:#ecebe6; --muted:#9a9a93; --line:#2e2e2b; --card:#1f1f1d; --high:#f2867e; --medium:#e0a84a; --low:#9a9a93; --ok:#7cc79a; } }
  * { box-sizing:border-box; }
  body { margin:0; padding:16px; font:14px/1.45 system-ui,sans-serif; background:var(--bg); color:var(--fg); max-width:1200px; margin-inline:auto; }
  h1 { font-size:22px; margin:8px 0 4px; } h2 { font-size:15px; margin:0 0 2px; } h2 span { font-weight:500; }
  .lede { color:var(--muted); margin:0 0 16px; }
  .stats { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 20px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:8px 12px; min-width:120px; }
  .stat b { display:block; font-size:20px; } .stat span { color:var(--muted); font-size:12px; }
  .bar { position:sticky; top:0; z-index:2; background:var(--bg); padding:8px 0; border-bottom:1px solid var(--line); display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  button { font:inherit; padding:6px 12px; border-radius:6px; border:1px solid var(--line); background:var(--card); color:var(--fg); cursor:pointer; }
  .card { display:flex; gap:14px; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; margin:12px 0; }
  .card.done { opacity:.55; }
  .thumb { flex:none; width:120px; } .thumb img { width:120px; height:150px; object-fit:contain; background:#f1f0eb; border-radius:6px; display:block; }
  .body { flex:1; min-width:0; overflow-x:auto; }
  .meta { color:var(--muted); font-size:12px; margin:0 0 8px; }
  table { border-collapse:collapse; width:100%; }
  th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); font-weight:600; padding:4px 8px 4px 0; border-bottom:1px solid var(--line); }
  td { padding:6px 8px 6px 0; border-bottom:1px solid var(--line); vertical-align:top; }
  td.field { white-space:nowrap; font-weight:600; } .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
  tr.high .dot { background:var(--high); } tr.medium .dot { background:var(--medium); } tr.low .dot { background:var(--low); }
  .why { color:var(--muted); max-width:300px; }
  .conf { font-size:11px; color:var(--muted); } .conf.low { color:var(--high); font-weight:600; } .conf.medium { color:var(--medium); }
  .choice label { display:block; white-space:nowrap; font-size:12px; cursor:pointer; } .choice input { margin-right:4px; }
  .summary td, .summary th { padding:6px 12px 6px 0; }
  h2.section { font-size:17px; margin:24px 0 4px; } h2.section small { font-weight:400; color:var(--muted); font-size:13px; margin-left:6px; }
  details { margin:8px 0 24px; } summary { cursor:pointer; color:var(--muted); }
  @media (max-width:700px) { .card { flex-direction:column; } .thumb, .thumb img { width:100%; height:220px; } }
</style></head><body>
<h1>Enrichment review queue</h1>
<p class="lede">Run ${runA} (${esc(label(runA))}) vs run ${runB} (${esc(label(runB))}) — only products and fields that need a human. Everything not listed is summarized at the bottom.</p>
<div class="stats">
  <div class="stat"><b>${needsDecision.length}</b><span>products need a decision</span></div>
  <div class="stat"><b>${quickChecks.length}</b><span>quick visual checks</span></div>
  <div class="stat"><b>${report.clean.length}</b><span>nothing to review</span></div>
  <div class="stat"><b>${items}</b><span>items to decide</span></div>
  <div class="stat"><b style="color:var(--high)">${sev("high")}</b><span>high — category / rules</span></div>
  <div class="stat"><b style="color:var(--medium)">${sev("medium")}</b><span>medium — disagreement</span></div>
  <div class="stat"><b>${sev("low")}</b><span>low — quick visual check</span></div>
</div>
<div class="bar"><span id="progress"></span><button id="export">Export decisions (CSV)</button><button id="hide">Hide decided</button></div>
${cards}
<h2 style="margin-top:28px">Where the models agree</h2>
<table class="summary"><thead><tr><th>field</th><th>identical</th><th>overlap</th><th>status</th></tr></thead><tbody>${fieldRows}</tbody></table>
<details><summary>${report.clean.length} products with nothing to review</summary><p>${report.clean.map(esc).join(" · ")}</p></details>
<script>
(() => {
  const KEY = ${JSON.stringify(storageKey)};
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  const radios = [...document.querySelectorAll('input[type=radio]')];
  const total = new Set(radios.map(r => r.name)).size;
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} };
  const refresh = () => {
    const done = Object.keys(saved).length;
    document.getElementById("progress").textContent = done + " / " + total + " decided";
    document.querySelectorAll(".card").forEach(card => {
      const names = new Set([...card.querySelectorAll('input[type=radio]')].map(r => r.name));
      card.classList.toggle("done", [...names].every(n => saved[n]));
    });
  };
  radios.forEach(r => {
    if (saved[r.name] === r.value) r.checked = true;
    r.addEventListener("change", () => { saved[r.name] = r.value; persist(); refresh(); });
  });
  let hidden = false;
  document.getElementById("hide").addEventListener("click", e => {
    hidden = !hidden; e.target.textContent = hidden ? "Show decided" : "Hide decided";
    document.querySelectorAll(".card.done").forEach(c => c.style.display = hidden ? "none" : "");
  });
  document.getElementById("export").addEventListener("click", () => {
    const rows = [["product_id", "field", "decision", ${JSON.stringify(`${report.nameA}_value`)}, ${JSON.stringify(`${report.nameB}_value`)}]];
    radios.filter(r => r.checked).forEach(r => {
      const tds = r.closest("tr").querySelectorAll("td");
      rows.push([r.dataset.product, r.dataset.field, r.value, tds[1].innerText.trim(), tds[2].innerText.trim()]);
    });
    const csv = rows.map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(",")).join("\\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "attention-decisions-${runA}-${runB}.csv";
    a.click();
  });
  refresh();
})();
</script>
</body></html>`;
}
