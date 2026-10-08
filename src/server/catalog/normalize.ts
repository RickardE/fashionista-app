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

/** Catch-all categories that a more specific signal should override. */
const WEAK_CATEGORIES = new Set<Category>(["tops"]);

export interface CategoryMatch {
  category: Category;
  subcategory?: string;
  /** Where the match came from — a category path, "title", or "taxonomy". */
  source?: string;
}

/**
 * The first two sentences of a description, without "■ Model wears…" style
 * fit notes. Merchants usually name the garment type up front.
 */
export function descriptionLead(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const text = description.replace(/■[^■]*■/g, " ").replace(/■/g, " ").trim();
  return text.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ") || undefined;
}

/**
 * Removes a leading brand name from a category segment, so brand trees don't
 * masquerade as categories: "Polo Ralph Lauren" → "" (skipped),
 * "Polo Ralph Lauren Oxfordskjortor" → "Oxfordskjortor".
 */
function stripBrand(segment: string, brand: string | undefined): string {
  if (!brand) return segment;
  const b = normalizeKey(brand);
  const s = normalizeKey(segment);
  return s.startsWith(b) ? segment.slice(brand.trim().length).trim() : segment;
}

/**
 * Category resolution order: the source's own category paths (deepest segment
 * first, internal/campaign trees skipped) → the product title → a secondary
 * taxonomy. Source categories are treated as hints, never as the only truth.
 */
export function resolveCategory(
  input: {
    categoryPaths: string[];
    title: string;
    description?: string;
    taxonomyPath?: string;
    brand?: string;
  },
  mapping: ResolvedMapping,
): CategoryMatch {
  const testRules = (text: string) => mapping.categoryRules.find((r) => r.pattern.test(text));

  const byBrand = input.brand ? mapping.brandCategories[normalizeKey(input.brand)] : undefined;
  if (byBrand) return { ...byBrand, source: "brand" };

  // Brand names are not garment words ("… från Polo Ralph Lauren" is no polo).
  const withoutBrand = (text: string) => (input.brand ? text.split(input.brand).join(" ") : text);
  const lead = descriptionLead(input.description && withoutBrand(input.description));

  for (const [text, source] of [[withoutBrand(input.title), "title"], [lead, "description"]] as const) {
    const decisive = text ? mapping.decisiveRules.find((r) => r.pattern.test(text)) : undefined;
    if (decisive) return { category: decisive.category, subcategory: decisive.subcategory, source };
  }

  const usablePaths = input.categoryPaths.filter(
    (p) => !mapping.ignoredCategoryPaths.some((re) => re.test(p)),
  );
  // A path match on a catch-all category ("Tröjor" → tops) is kept only as a
  // fallback: a specific answer from the title or description beats it.
  let weakPathMatch: CategoryMatch | undefined;
  for (const path of usablePaths) {
    const segments = splitPath(path, mapping)
      .filter((s, i, all) => !(i > 0 && mapping.brandIndexSegments.some((re) => re.test(all[i - 1]))))
      .filter((s) => !mapping.ignoredCategorySegments.some((re) => re.test(s)))
      .map((s) => stripBrand(s, input.brand))
      .filter(Boolean)
      .reverse();
    for (const segment of segments) {
      const rule = testRules(segment);
      if (!rule) continue;
      const match = { category: rule.category, subcategory: rule.subcategory, source: path };
      if (!WEAK_CATEGORIES.has(rule.category)) return match;
      weakPathMatch ??= match;
      break;
    }
  }

  const byTitle = testRules(withoutBrand(input.title));
  if (byTitle?.ambiguousInTitle && lead) {
    const byLead = testRules(lead);
    const leadNamesTitleCategory = mapping.categoryRules.some((r) => r.category === byTitle.category && r.pattern.test(lead));
    if (byLead && byLead.category !== byTitle.category && !leadNamesTitleCategory) {
      return { category: byLead.category, subcategory: byLead.subcategory, source: "description" };
    }
  }
  if (byTitle && !(weakPathMatch && WEAK_CATEGORIES.has(byTitle.category))) {
    return { category: byTitle.category, subcategory: byTitle.subcategory, source: "title" };
  }

  const byDescription = lead ? testRules(lead) : undefined;
  if (byDescription && !(weakPathMatch && WEAK_CATEGORIES.has(byDescription.category))) {
    return { category: byDescription.category, subcategory: byDescription.subcategory, source: "description" };
  }

  if (weakPathMatch) return weakPathMatch;

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
  const description = cleanText(raw.description);
  const category = resolveCategory(
    { categoryPaths: raw.categoryPaths, title, description, taxonomyPath: raw.taxonomyPath, brand: raw.brand },
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
    description,
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
