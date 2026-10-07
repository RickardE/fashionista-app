/**
 * Builds the provider-neutral enrichment input from a normalized StyleAI
 * product. Reads only canonical columns plus the generic sourceAttributes —
 * never raw source rows — so it works unchanged for any catalogue source.
 */

import type { ProductSourceAttributes } from "@/server/catalog/types";

/** The product columns enrichment reads (a subset of the products row). */
export interface EnrichableProduct {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  productType: string;
  category: string;
  subcategory: string | null;
  gender: string | null;
  colors: string[];
  images: string[];
  sourceAttributes: ProductSourceAttributes;
  contentHash: string;
}

export interface EnrichmentInput {
  product: {
    name: string;
    brand: string | null;
    description: string | null;
    product_type: string;
    /** StyleAI normalized category — evidence, which the model may disagree with but never change. */
    category: string;
    subcategory: string | null;
    gender: string | null;
    /** StyleAI canonical colours derived from the source. */
    colours: string[];
  };
  /** Retailer-supplied facts, verbatim. Supporting evidence only. */
  source_facts: {
    colour_names: string[];
    material: string | null;
    pattern: string | null;
    category_paths: string[];
    taxonomy_path: string | null;
  };
  image_url: string | null;
}

const MAX_DESCRIPTION_CHARS = 1500;
const MAX_CATEGORY_PATHS = 3;

const clean = (value: string | null | undefined) => {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
};

export function buildEnrichmentInput(product: EnrichableProduct): EnrichmentInput {
  const attrs: Partial<ProductSourceAttributes> = product.sourceAttributes ?? {};
  const description = clean(product.description);
  return {
    product: {
      name: product.name.trim(),
      brand: clean(product.brand),
      description: description && description.length > MAX_DESCRIPTION_CHARS
        ? `${description.slice(0, MAX_DESCRIPTION_CHARS)}…`
        : description,
      product_type: product.productType,
      category: product.category,
      subcategory: clean(product.subcategory),
      gender: clean(product.gender),
      colours: [...product.colors],
    },
    source_facts: {
      colour_names: (attrs.colorsRaw ?? []).map((c) => c.trim()).filter(Boolean),
      material: clean(attrs.material),
      pattern: clean(attrs.pattern),
      category_paths: (attrs.categoryPaths ?? [])
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, MAX_CATEGORY_PATHS),
      taxonomy_path: clean(attrs.taxonomyPath),
    },
    image_url: product.images[0] ?? null,
  };
}
