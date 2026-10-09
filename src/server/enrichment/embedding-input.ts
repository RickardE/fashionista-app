/**
 * The future embedding boundary. Embeddings are not generated in this
 * milestone; this fixes what they will be built from: validated attributes
 * plus name and brand, rendered deterministically — never raw model output.
 * Hashing the text (input_hash) lets embeddings be regenerated independently
 * whenever attributes or the embedding model change.
 */

import { createHash } from "node:crypto";
import type { EnrichmentAttributes } from "./taxonomy";

const FORMALITY_LABEL = ["", "lounge/sport", "casual", "smart casual", "business", "formal"];
const words = (v: string) => v.replace(/_/g, " ");
const list = (values: string[]) => values.map(words).join(", ");

export function embeddingText(product: { name: string; brand: string | null }, a: EnrichmentAttributes): string {
  const lines = [
    `${product.brand ? `${product.brand} ` : ""}${product.name}`,
    `type: ${words(a.garment_type)}`,
    `fit: ${words(a.fit)}`,
    `colour: ${words(a.colour_primary)}${a.colour_secondary.length ? ` with ${list(a.colour_secondary)}` : ""} (${words(a.colour_profile)})`,
    `pattern: ${a.pattern}`,
    a.leg_shape && a.leg_shape !== "not_applicable" ? `leg shape: ${a.leg_shape}` : "",
    a.materials.length ? `materials: ${a.materials.map((m) => m.value).join(", ")}` : "",
    `aesthetics: ${list(a.aesthetics)}`,
    `formality: ${FORMALITY_LABEL[a.formality]}`,
    `occasions: ${list(a.occasions)}`,
    `seasons: ${a.seasons.join(", ")}`,
    a.summary,
  ];
  return lines.filter(Boolean).join("\n");
}

export const embeddingInputHash = (text: string) => createHash("sha256").update(text).digest("hex");
