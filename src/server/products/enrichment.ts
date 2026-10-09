/**
 * The compact, app-facing view of a product's AI enrichment.
 *
 * Read from the product's *active* enrichment only, and only while it still
 * describes the product's current content (input hash = content hash): a
 * stale, failed or needs_review result is never shown. Only the summary fields
 * below leave the server — never raw model output, confidences or history.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import { CANONICAL_COLORS } from "@/server/catalog/types";
import { productEnrichments, productEnrichmentState } from "@/server/db/schema";
import {
  AESTHETICS,
  COLOUR_PROFILES,
  FITS,
  FORMALITY_LEVELS,
  GARMENT_TYPES,
  LEG_SHAPES,
  MATERIALS,
  PATTERNS,
  SEASONS,
} from "@/server/enrichment/taxonomy";
import type { ProductEnrichment } from "@/lib/types";

/** Select-list column: the current active enrichment's attributes and taxonomy version, or null. */
export const activeEnrichmentColumn = sql<{ taxonomy_version: string; attributes: unknown } | null>`(
  select jsonb_build_object('taxonomy_version', e.taxonomy_version, 'attributes', e.attributes)
  from ${productEnrichmentState} s
  join ${productEnrichments} e on e.id = s.active_enrichment_id
  where s.product_id = "products"."id"
    and e.outcome = 'completed'
    and e.input_content_hash = "products"."content_hash"
)`;

// Lenient on unknown keys (other attributes stay server-side), strict on values.
const StoredAttributes = z.object({
  garment_type: z.enum(GARMENT_TYPES),
  fit: z.enum(FITS),
  /** Since taxonomy 1.1.0. */
  leg_shape: z.enum(LEG_SHAPES).optional(),
  colour_primary: z.enum(CANONICAL_COLORS),
  colour_profile: z.enum(COLOUR_PROFILES),
  pattern: z.enum(PATTERNS),
  formality: z.literal(FORMALITY_LEVELS),
  seasons: z.array(z.enum(SEASONS)),
  aesthetics: z.array(z.enum(AESTHETICS)),
  materials: z.array(z.object({ value: z.enum(MATERIALS) })).default([]),
});

export type StoredEnrichment = { summary: ProductEnrichment; materials: (typeof MATERIALS)[number][] };

/** Parses the column above; anything missing or malformed yields undefined, never a partial summary. */
export function parseActiveEnrichment(raw: { taxonomy_version: string; attributes: unknown } | null | undefined): StoredEnrichment | undefined {
  if (!raw) return undefined;
  const parsed = StoredAttributes.safeParse(raw.attributes);
  if (!parsed.success) return undefined;
  const a = parsed.data;
  return {
    summary: {
      taxonomyVersion: raw.taxonomy_version,
      garmentType: a.garment_type,
      fit: a.fit,
      ...(a.leg_shape && a.leg_shape !== "not_applicable" ? { legShape: a.leg_shape } : {}),
      colourPrimary: a.colour_primary,
      colourProfile: a.colour_profile,
      pattern: a.pattern,
      formality: a.formality,
      seasons: a.seasons,
      aesthetics: a.aesthetics,
    },
    materials: a.materials.map((m) => m.value),
  };
}
