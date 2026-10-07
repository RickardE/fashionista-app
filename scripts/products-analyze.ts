/**
 * Dry run: fetch → parse → normalize → group, then report mapping coverage.
 * Writes nothing. Use it when adding a source or tuning a MappingProfile.
 *
 *   npm run products:analyze -- --source adtraction:johnells [--file feed.xml] [--samples 15]
 */

import "./env";
import { parseArgs } from "node:util";
import { groupVariants } from "@/server/catalog/grouping";
import { resolveMapping } from "@/server/catalog/mapping/profile";
import { normalizeRawProduct } from "@/server/catalog/normalize";
import { getSource } from "@/server/catalog/sources/registry";

function top<T>(counts: Map<T, number>, n: number): [T, number][] {
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function bump<T>(map: Map<T, number>, key: T) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: "string", default: "adtraction:johnells" },
      file: { type: "string" },
      samples: { type: "string", default: "15" },
    },
  });
  const samples = Number(values.samples);
  const source = getSource(values.source!);
  const fetched = await source.fetch({ filePath: values.file });
  const mapping = resolveMapping(source.mapping);

  const valid = fetched.rows.flatMap((r) => (r.ok ? [r.product] : []));
  const normalized = valid.map((r) => normalizeRawProduct(r, mapping));
  const { products, duplicateVariants } = groupVariants(normalized, source.identity.merchant);

  const categories = new Map<string, number>();
  const categoryVia = new Map<string, number>();
  const unmappedColors = new Map<string, number>();
  const otherTitles = new Map<string, number>();
  const noGender = new Map<string, number>();
  for (const v of normalized) {
    if (v.colorRaw && !v.color) bump(unmappedColors, v.colorRaw);
    if (!v.gender) bump(noGender, v.raw.gender ? String(v.raw.gender) : "<empty>");
  }
  for (const p of products) {
    bump(categories, `${p.category}${p.subcategory ? ` / ${p.subcategory}` : ""}`);
    const via = normalized.find((n) => n.groupKey === p.offer.externalGroupKey)?.categorySource;
    bump(categoryVia, via === "title" || via === "description" || via === "taxonomy" || !via ? (via ?? "none") : "category path");
    if (p.category === "other") bump(otherTitles, `${p.name}  ⟵  ${p.attributes.categoryPaths[0] ?? ""}`);
  }

  const pct = (n: number, d: number) => `${((100 * n) / Math.max(d, 1)).toFixed(1)}%`;
  const other = categories.get("other") ?? 0;
  console.log(`\n${source.identity.key}`);
  console.table({
    rows: fetched.rows.length,
    invalid: fetched.rows.length - valid.length,
    duplicateVariants,
    products: products.length,
    variants: normalized.length - duplicateVariants,
    "category=other": `${other} (${pct(other, products.length)})`,
    "unmapped colour rows": `${[...unmappedColors.values()].reduce((a, b) => a + b, 0)}`,
    "no gender rows": `${[...noGender.values()].reduce((a, b) => a + b, 0)}`,
  });
  console.log("\nCategory resolved via:");
  console.table(Object.fromEntries(top(categoryVia, 10)));
  console.log("\nCategories (products):");
  console.table(Object.fromEntries(top(categories, 60)));
  if (unmappedColors.size) {
    console.log("\nUnmapped colours (rows):");
    console.table(Object.fromEntries(top(unmappedColors, samples)));
  }
  if (otherTitles.size) {
    console.log(`\nSample products with category=other:`);
    for (const [title] of top(otherTitles, samples)) console.log(`  ${title}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
