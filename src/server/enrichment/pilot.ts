/**
 * Deterministic pilot selection: a seeded, stratified sample of enrichment
 * candidates that exercises the taxonomy before any full backfill. The same
 * seed over the same catalogue always yields the same products.
 *
 * Selection is a pure function over pre-computed candidate features
 * (`selectPilot`); `loadPilotCandidates` derives those features from the
 * normalized catalogue. Feature heuristics are review aids only — they decide
 * what gets sampled, never what a product is.
 */

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { resolveMapping } from "@/server/catalog/mapping/profile";
import { resolveCategory } from "@/server/catalog/normalize";
import { getSource, listSourceKeys } from "@/server/catalog/sources/registry";
import type { ProductSourceAttributes } from "@/server/catalog/types";
import type { Db } from "@/server/db/client";
import { offers, products } from "@/server/db/schema";
import { enrichmentCandidate } from "./state";

export type PilotSegment = "men_clothing" | "women_clothing" | "unisex_clothing" | "shoes";

export interface PilotCandidate {
  id: string;
  segment: PilotSegment;
  gender: string | null;
  category: string;
  subcategory: string | null;
  brand: string | null;
  thinDescription: boolean;
  noColour: boolean;
  /** Category was inferred from title/description/brand rather than a category path. */
  titleGuessed: boolean;
  patterned: boolean;
  ambiguous: boolean;
}

export type PilotFlag = "ambiguous" | "titleGuessed" | "thinDescription" | "patterned" | "noColour";
const FLAGS: PilotFlag[] = ["ambiguous", "titleGuessed", "thinDescription", "patterned", "noColour"];

export interface PilotTargets {
  segments: Record<PilotSegment, number>;
  flags: Record<PilotFlag, number>;
  minBrands: number;
  /** Strata (segment × category; shoes: × type) at least this large are guaranteed a seat. */
  minStratumSize: number;
}

export const DEFAULT_PILOT_TARGETS: PilotTargets = {
  segments: { men_clothing: 16, women_clothing: 14, unisex_clothing: 1, shoes: 6 },
  flags: { ambiguous: 5, titleGuessed: 5, thinDescription: 5, patterned: 4, noColour: 3 },
  minBrands: 15,
  minStratumSize: 10,
};

export interface PilotStratum {
  segment: PilotSegment;
  stratum: string;
  catalogue: number;
  /** Share of its segment in the catalogue vs in the sample. */
  catalogueShare: number;
  seats: number;
}

export interface PilotSelection {
  seed: string;
  productIds: string[];
  summary: {
    total: number;
    segments: Record<string, { target: number; actual: number }>;
    flags: Record<string, { target: number; actual: number }>;
    brands: { target: number; actual: number };
    categoriesCovered: string[];
    categoriesMissing: string[];
    strata: PilotStratum[];
    /** Strata with no seat (all below minStratumSize) — visible so the gap is a known one. */
    uncoveredStrata: string[];
  };
}

/** Seeded, order-independent rank: the same (seed, id) always sorts the same. */
export const seededRank = (seed: string, id: string) => createHash("sha256").update(`${seed}:${id}`).digest("hex");

/** Clothing is stratified by category; shoes by type (sneakers, boots, ...). */
export const stratumOf = (c: PilotCandidate) => (c.segment === "shoes" ? (c.subcategory ?? "unspecified") : c.category);

/**
 * Seat allocation per segment: every stratum of at least minStratumSize gets
 * one seat, the rest are distributed proportionally to catalogue size
 * (largest remainder). Then every clothing category the catalogue has is
 * guaranteed one seat somewhere, taken from the most-seated stratum.
 */
function allocateSeats(candidates: PilotCandidate[], targets: PilotTargets): Map<string, number> {
  const seats = new Map<string, number>();
  const key = (segment: string, stratum: string) => `${segment}|${stratum}`;
  const sizes = new Map<string, number>();
  for (const c of candidates) sizes.set(key(c.segment, stratumOf(c)), (sizes.get(key(c.segment, stratumOf(c))) ?? 0) + 1);

  for (const segment of Object.keys(targets.segments) as PilotSegment[]) {
    const quota = targets.segments[segment];
    const strata = [...sizes.entries()]
      .filter(([k]) => k.startsWith(`${segment}|`))
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const total = strata.reduce((s, [, n]) => s + n, 0);
    if (!total || !quota) continue;
    let left = quota;
    for (const [k, n] of strata) {
      if (n >= targets.minStratumSize && left > 0) {
        seats.set(k, 1);
        left--;
      }
    }
    if (left === quota && strata.length) {
      // No stratum is large enough: start with the largest.
      seats.set(strata[0][0], 1);
      left--;
    }
    while (left > 0) {
      const next = strata
        .filter(([k, n]) => (seats.get(k) ?? 0) < n)
        .map(([k, n]) => ({ k, deficit: (quota * n) / total - (seats.get(k) ?? 0) }))
        .sort((a, b) => b.deficit - a.deficit || (a.k < b.k ? -1 : 1))[0];
      if (!next) break;
      seats.set(next.k, (seats.get(next.k) ?? 0) + 1);
      left--;
    }
  }

  // Every clothing category at least once, in the segment where it is largest.
  const clothing = candidates.filter((c) => c.segment !== "shoes");
  for (const category of [...new Set(clothing.map((c) => c.category))].sort()) {
    if ([...seats.keys()].some((k) => !k.startsWith("shoes|") && k.endsWith(`|${category}`))) continue;
    const home = [...sizes.entries()]
      .filter(([k]) => !k.startsWith("shoes|") && k.endsWith(`|${category}`))
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    if (!home) continue;
    const segment = home[0].split("|")[0];
    const donor = [...seats.entries()]
      .filter(([k, n]) => k.startsWith(`${segment}|`) && n > 1)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    if (!donor) continue;
    seats.set(donor[0], donor[1] - 1);
    seats.set(home[0], 1);
  }
  return seats;
}

export function selectPilot(
  candidates: PilotCandidate[],
  seed: string,
  targets: PilotTargets = DEFAULT_PILOT_TARGETS,
): PilotSelection {
  const rank = new Map(candidates.map((c) => [c.id, seededRank(seed, c.id)]));
  const byRank = (a: PilotCandidate, b: PilotCandidate) => (rank.get(a.id)! < rank.get(b.id)! ? -1 : 1);
  const ranked = [...candidates].sort(byRank);
  const seats = allocateSeats(candidates, targets);
  const stratumKey = (c: PilotCandidate) => `${c.segment}|${stratumOf(c)}`;

  const selected: PilotCandidate[] = [];
  const chosen = new Set<string>();
  const brandCount = new Map<string, number>();
  const brandOf = (c: PilotCandidate) => (c.brand ?? "").toLowerCase();
  const flagCount = (f: PilotFlag) => selected.filter((c) => c[f]).length;
  const unmet = (c: PilotCandidate) => FLAGS.filter((f) => c[f] && flagCount(f) < targets.flags[f]).length;
  const shoeGenderCount = (c: PilotCandidate) =>
    c.segment === "shoes" ? selected.filter((s) => s.segment === "shoes" && s.gender === c.gender).length : 0;
  const add = (c: PilotCandidate) => {
    selected.push(c);
    chosen.add(c.id);
    brandCount.set(brandOf(c), (brandCount.get(brandOf(c)) ?? 0) + 1);
  };
  const remove = (c: PilotCandidate) => {
    selected.splice(selected.indexOf(c), 1);
    chosen.delete(c.id);
    brandCount.set(brandOf(c), (brandCount.get(brandOf(c)) ?? 1) - 1);
  };

  // Fill seats, scarcest strata first. Within a stratum prefer: candidates that
  // carry still-unmet hard-case flags, then unseen brands, then the gender least
  // represented among shoes, then the seeded order.
  const order = [...seats.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  for (const [k, n] of order) {
    for (let i = 0; i < n; i++) {
      const pool = ranked.filter((c) => !chosen.has(c.id) && stratumKey(c) === k);
      if (!pool.length) break;
      pool.sort(
        (a, b) =>
          unmet(b) - unmet(a) ||
          (brandCount.get(brandOf(a)) ?? 0) - (brandCount.get(brandOf(b)) ?? 0) ||
          shoeGenderCount(a) - shoeGenderCount(b) ||
          byRank(a, b),
      );
      add(pool[0]);
    }
  }

  // Repair unmet flags by swapping within a stratum, never breaking another flag's minimum.
  for (const f of FLAGS) {
    for (const incoming of ranked) {
      if (flagCount(f) >= targets.flags[f]) break;
      if (chosen.has(incoming.id) || !incoming[f]) continue;
      const outgoing = selected
        .filter((s) => stratumKey(s) === stratumKey(incoming) && !s[f])
        .filter((s) => FLAGS.every((g) => !s[g] || incoming[g] || flagCount(g) - 1 >= targets.flags[g]))
        .sort(byRank)
        .at(-1);
      if (!outgoing) continue;
      remove(outgoing);
      add(incoming);
    }
  }

  const productIds = selected.sort(byRank).map((c) => c.id);
  const covered = [...new Set(selected.filter((c) => c.segment !== "shoes").map((c) => c.category))].sort();
  const clothingCategories = [...new Set(candidates.filter((c) => c.segment !== "shoes").map((c) => c.category))].sort();
  const segmentSize = (s: string) => candidates.filter((c) => c.segment === s).length;
  const strata = [...new Set(candidates.map(stratumKey))].sort().map((k) => {
    const [segment, stratum] = k.split("|") as [PilotSegment, string];
    const catalogue = candidates.filter((c) => stratumKey(c) === k).length;
    return {
      segment,
      stratum,
      catalogue,
      catalogueShare: Math.round((catalogue / segmentSize(segment)) * 1000) / 1000,
      seats: selected.filter((c) => stratumKey(c) === k).length,
    };
  });
  return {
    seed,
    productIds,
    summary: {
      total: selected.length,
      segments: Object.fromEntries(
        (Object.keys(targets.segments) as PilotSegment[]).map((s) => [
          s,
          { target: targets.segments[s], actual: selected.filter((c) => c.segment === s).length },
        ]),
      ),
      flags: Object.fromEntries(FLAGS.map((f) => [f, { target: targets.flags[f], actual: flagCount(f) }])),
      brands: { target: targets.minBrands, actual: new Set(selected.map(brandOf).filter(Boolean)).size },
      categoriesCovered: covered,
      categoriesMissing: clothingCategories.filter((c) => !covered.includes(c)),
      strata,
      uncoveredStrata: strata.filter((s) => !s.seats).map((s) => `${s.segment}:${s.stratum} (${s.catalogue})`),
    },
  };
}

// ---------------------------------------------------------------------------
// Candidate features from the catalogue
// ---------------------------------------------------------------------------

const THIN_DESCRIPTION_CHARS = 40;

// Multilingual review heuristics (English + Swedish, the catalogue's languages today).
const PATTERN_WORDS =
  /(stripe|striped|randig|ränd|rutig|rutor|check|tartan|plaid|houndstooth|pepita|printed|print\b|mönst|floral|blommig|paisley|polka|prickig|camo|kamouflage|jacquard|fair ?isle)/i;
const SWEAT_WORDS = /(sweat|hood|huv|college|fleece)/i;
const KNIT_WORDS = /(knit|stick|merino|cashmere|kashmir|lambswool|ull)/i;
const TAILORED_WORDS = /(blazer|kavaj|jacket|jacka)/i;
const AMBIGUOUS_SUBCATEGORIES = new Set(["overshirt", "half-zip", "rugby shirt", "knitted vest", "cardigan"]);

interface CandidateRow {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  productType: string;
  category: string;
  subcategory: string | null;
  gender: string | null;
  colors: string[];
  sourceAttributes: ProductSourceAttributes;
  sourceKey: string | null;
}

export function candidateFeatures(row: CandidateRow, categorySource: string | undefined): PilotCandidate | null {
  const segment: PilotSegment | null =
    row.productType === "shoes"
      ? "shoes"
      : row.productType === "clothing" && (row.gender === "men" || row.gender === "women" || row.gender === "unisex")
        ? (`${row.gender}_clothing` as PilotSegment)
        : null;
  if (!segment) return null;
  const text = `${row.name} ${row.description ?? ""}`;
  const category = row.category;
  const ambiguous =
    category === "tops" ||
    category === "waistcoats" ||
    AMBIGUOUS_SUBCATEGORIES.has(row.subcategory ?? "") ||
    (category === "knitwear" && SWEAT_WORDS.test(row.name)) ||
    (category === "sweatshirts" && KNIT_WORDS.test(row.name)) ||
    (TAILORED_WORDS.test(row.name) && !["blazers", "suits", "outerwear"].includes(category));
  return {
    id: row.id,
    segment,
    gender: row.gender,
    category,
    subcategory: row.subcategory,
    brand: row.brand,
    thinDescription: (row.description?.trim().length ?? 0) < THIN_DESCRIPTION_CHARS,
    noColour: row.colors.length === 0,
    titleGuessed: categorySource === "title" || categorySource === "description" || categorySource === "brand",
    patterned: PATTERN_WORDS.test(text) || !!row.sourceAttributes?.pattern,
    ambiguous,
  };
}

/**
 * Loads enrichment candidates with their pilot features. Category provenance
 * is not stored, so it is recomputed with each product's own source mapping
 * profile (via the source registry) — no source is special-cased here.
 */
export async function loadPilotCandidates(db: Db): Promise<PilotCandidate[]> {
  const rows: CandidateRow[] = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      brand: products.brand,
      productType: products.productType,
      category: products.category,
      subcategory: products.subcategory,
      gender: products.gender,
      colors: products.colors,
      sourceAttributes: products.sourceAttributes,
      // "products"."id" spelled out: Drizzle renders select-list columns unqualified inside subqueries.
      sourceKey: sql<string | null>`(select o.source_key from ${offers} o where o.product_id = "products"."id" order by o.created_at limit 1)`,
    })
    .from(products)
    .where(enrichmentCandidate)
    .orderBy(products.id);

  const known = new Set(listSourceKeys());
  const mappings = new Map<string, ReturnType<typeof resolveMapping>>();
  const mappingFor = (key: string | null) => {
    if (!key || !known.has(key)) return undefined;
    if (!mappings.has(key)) mappings.set(key, resolveMapping(getSource(key).mapping));
    return mappings.get(key);
  };

  return rows.flatMap((row) => {
    const mapping = mappingFor(row.sourceKey);
    const source = mapping
      ? resolveCategory(
          {
            categoryPaths: row.sourceAttributes?.categoryPaths ?? [],
            title: row.name,
            description: row.description ?? undefined,
            taxonomyPath: row.sourceAttributes?.taxonomyPath,
            brand: row.brand ?? undefined,
          },
          mapping,
        ).source
      : undefined;
    return candidateFeatures(row, source) ?? [];
  });
}
