import { normalizeKey, type ResolvedMapping } from "./mapping/profile";
import type {
  Availability,
  CanonicalColor,
  Category,
  Condition,
  Gender,
  NormalizedVariant,
  RawProduct,
} from "./types";

export function mapColor(value: string | undefined, mapping: ResolvedMapping): CanonicalColor | undefined {
  if (!value) return undefined;
  const whole = mapping.colors[normalizeKey(value)];
  if (whole) return whole;
  // Compound values like "Svart/Vit" or "Navy & White": first recognisable token wins.
  for (const token of value.split(/[\/,&+]|\boch\b|\band\b/i)) {
    const hit = mapping.colors[normalizeKey(token)];
    if (hit) return hit;
  }
  return undefined;
}

export function mapGender(value: string | undefined, mapping: ResolvedMapping): Gender | undefined {
  if (!value) return undefined;
  return mapping.genders[normalizeKey(value)];
}

export function mapAvailability(value: string | undefined, mapping: ResolvedMapping): Availability {
  if (!value) return "unknown";
  return mapping.availability[normalizeKey(value)] ?? "unknown";
}

export function mapCondition(value: string | undefined, mapping: ResolvedMapping): Condition {
  if (!value) return "new";
  return mapping.conditions[normalizeKey(value)] ?? "new";
}

function splitPath(path: string, mapping: ResolvedMapping): string[] {
  return path
    .split(mapping.categorySeparator)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface CategoryMatch {
  category: Category;
  subcategory?: string;
  /** Where the match came from — a category path, "title", or "taxonomy". */
  source?: string;
}

/**
 * Category resolution order: the source's own category paths (deepest segment
 * first, internal/campaign trees skipped) → the product title → a secondary
 * taxonomy. Source categories are treated as hints, never as the only truth.
 */
export function resolveCategory(
  input: { categoryPaths: string[]; title: string; taxonomyPath?: string },
  mapping: ResolvedMapping,
): CategoryMatch {
  const testRules = (text: string) => mapping.categoryRules.find((r) => r.pattern.test(text));

  const usablePaths = input.categoryPaths.filter(
    (p) => !mapping.ignoredCategoryPaths.some((re) => re.test(p)),
  );
  for (const path of usablePaths) {
    const segments = splitPath(path, mapping)
      .filter((s) => !mapping.ignoredCategorySegments.some((re) => re.test(s)))
      .reverse();
    for (const segment of segments) {
      const rule = testRules(segment);
      if (rule) return { category: rule.category, subcategory: rule.subcategory, source: path };
    }
  }

  const byTitle = testRules(input.title);
  if (byTitle) return { category: byTitle.category, subcategory: byTitle.subcategory, source: "title" };

  if (input.taxonomyPath) {
    for (const segment of splitPath(input.taxonomyPath, mapping).reverse()) {
      const rule = testRules(segment);
      if (rule) return { category: rule.category, subcategory: rule.subcategory, source: "taxonomy" };
    }
  }

  return { category: "other" };
}

/** Infers gender from the first segments of category paths (e.g. "Man > Kläder"). */
function genderFromPaths(paths: string[], mapping: ResolvedMapping): Gender | undefined {
  for (const path of paths) {
    for (const segment of splitPath(path, mapping).slice(0, 2)) {
      const g = mapping.genders[normalizeKey(segment)];
      if (g) return g;
    }
  }
  return undefined;
}

function cleanText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return text || undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function normalizeRawProduct(raw: RawProduct, mapping: ResolvedMapping): NormalizedVariant {
  const title = cleanText(raw.title) ?? raw.title;
  const category = resolveCategory(
    { categoryPaths: raw.categoryPaths, title, taxonomyPath: raw.taxonomyPath },
    mapping,
  );

  const images = [raw.imageUrl, ...raw.additionalImageUrls]
    .filter((u): u is string => !!u && isHttpUrl(u))
    .filter((u, i, all) => all.indexOf(u) === i);

  const salePrice =
    raw.salePrice && raw.price && raw.salePrice.amountMinor < raw.price.amountMinor
      ? raw.salePrice
      : undefined;

  return {
    externalId: raw.externalId,
    groupKey: raw.externalGroupId || raw.externalId,
    title,
    description: cleanText(raw.description),
    brand: raw.brand?.trim() || undefined,
    gender: mapGender(raw.gender, mapping) ?? genderFromPaths(raw.categoryPaths, mapping),
    category: category.category,
    subcategory: category.subcategory,
    categorySource: category.source,
    categoryPaths: raw.categoryPaths,
    taxonomyPath: raw.taxonomyPath,
    color: mapColor(raw.color, mapping),
    colorRaw: raw.color?.trim() || undefined,
    material: raw.material?.trim() || undefined,
    pattern: raw.pattern?.trim() || undefined,
    size: raw.size?.trim() || undefined,
    price: raw.price,
    salePrice,
    availability: mapAvailability(raw.availability, mapping),
    condition: mapCondition(raw.condition, mapping),
    productUrl: raw.productUrl && isHttpUrl(raw.productUrl) ? raw.productUrl : undefined,
    images,
    gtin: raw.gtin?.trim() || undefined,
    mpn: raw.mpn?.trim() || undefined,
    raw: raw.raw,
  };
}
