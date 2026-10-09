import { randomUUID } from "node:crypto";
import type { Db } from "@/server/db/client";
import { products } from "@/server/db/schema";
import type { ModelConfig, ModelProvider, ModelRequest, ModelResult } from "../providers/types";
import type { ModelOutput } from "../taxonomy";

/** A valid model output for a regular-fit navy shirt; override per test. */
export function modelOutput(overrides: Partial<ModelOutput> = {}): ModelOutput {
  return {
    garment_type: { value: "oxford_shirt", confidence: "high" },
    fit: { value: "regular", confidence: "medium" },
    colour_primary: { value: "navy", confidence: "high" },
    colour_secondary: [],
    colour_profile: { value: "neutral_dark", confidence: "high" },
    pattern: { value: "solid", confidence: "high" },
    leg_shape: { value: "not_applicable", confidence: "high" },
    materials: [{ value: "cotton", evidence: "stated", confidence: "high" }],
    aesthetics: [
      { value: "classic", confidence: "high" },
      { value: "preppy", confidence: "medium" },
    ],
    formality: { value: 3, confidence: "high" },
    occasions: [
      { value: "work", confidence: "high" },
      { value: "everyday", confidence: "medium" },
    ],
    seasons: { values: ["spring", "summer", "autumn", "winter"], confidence: "medium" },
    category_check: { verdict: "agrees", suggested_category: null, confidence: "high" },
    issues: [],
    summary: "Navy cotton oxford shirt with button-down collar and regular fit.",
    taxonomy_gaps: [],
    ...overrides,
  };
}

export const usage = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 2000, cacheWriteTokens: 0 };

/** A provider whose responses are scripted per call. */
export function mockProvider(
  respond: (request: ModelRequest, call: number) => ModelResult | Promise<ModelResult>,
  config: Partial<ModelConfig> = {},
): ModelProvider & { calls: ModelRequest[] } {
  const calls: ModelRequest[] = [];
  return {
    config: { provider: "mock", model: "mock-model", ...config },
    calls,
    async generate(request) {
      calls.push(request);
      return respond(request, calls.length);
    },
  };
}

export const ok = (output: unknown): ModelResult => ({ ok: true, output, usage, latencyMs: 100 });

let counter = 0;
export async function insertProduct(db: Db, overrides: Partial<typeof products.$inferInsert> = {}): Promise<string> {
  const id = randomUUID();
  counter++;
  await db.insert(products).values({
    id,
    name: `Oxford Shirt ${counter}`,
    description: "Skjorta i oxfordtyg av bomull med button down-krage.",
    brand: "Example Brand",
    productType: "clothing",
    category: "shirts",
    subcategory: "oxford shirt",
    gender: "men",
    colors: ["navy"],
    images: [`https://images.example.com/p/${counter}.jpg`],
    sourceAttributes: { colorsRaw: ["Marin"], categoryPaths: ["Herr > Skjortor"] },
    contentHash: `hash-${counter}`,
    status: "active",
    isAvailable: true,
    ...overrides,
  });
  return id;
}
