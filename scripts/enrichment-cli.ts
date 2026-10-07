// Shared flag handling for the products:enrich* scripts.

import type { ImageMode } from "@/server/enrichment/images";
import type { RunStats } from "@/server/enrichment/report";
import { listProviders } from "@/server/enrichment/providers/registry";
import type { ModelConfig } from "@/server/enrichment/providers/types";

export const MODEL_OPTIONS = {
  provider: { type: "string" },
  model: { type: "string" },
  effort: { type: "string" },
  "max-output-tokens": { type: "string" },
  "image-mode": { type: "string", default: "url" },
  concurrency: { type: "string", default: "4" },
} as const;

/** Model configuration from flags, falling back to ENRICHMENT_PROVIDER / _MODEL / _EFFORT. */
export function modelConfigFrom(values: {
  provider?: string;
  model?: string;
  effort?: string;
  "max-output-tokens"?: string;
}): ModelConfig {
  const provider = values.provider ?? process.env.ENRICHMENT_PROVIDER;
  const model = values.model ?? process.env.ENRICHMENT_MODEL;
  if (!provider || !model) {
    throw new Error(
      `--provider and --model are required (or set ENRICHMENT_PROVIDER / ENRICHMENT_MODEL). Providers: ${listProviders().join(", ")}`,
    );
  }
  const effort = values.effort ?? process.env.ENRICHMENT_EFFORT;
  const maxOutputTokens = values["max-output-tokens"] ? positiveInt(values["max-output-tokens"], "--max-output-tokens") : undefined;
  return { provider, model, ...(effort ? { effort } : {}), ...(maxOutputTokens ? { maxOutputTokens } : {}) };
}

export function imageModeFrom(value: string | undefined): ImageMode {
  if (value === "url" || value === "inline") return value;
  throw new Error(`--image-mode must be "url" or "inline"`);
}

export function positiveInt(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} must be a positive integer`);
  return n;
}

const usd = (micros: number | null) => (micros === null ? "unpriced" : `$${(micros / 1_000_000).toFixed(4)}`);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Run stats as display rows (metric → value), shared by enrich and report output. */
export function statsRows(stats: RunStats): Record<string, string | number> {
  return {
    products: stats.products,
    completed: stats.completed,
    needs_review: stats.needs_review,
    failed: stats.failed,
    "success rate": pct(stats.success_rate),
    "review rate": pct(stats.review_rate),
    "failure rate": pct(stats.failure_rate),
    "model calls": stats.calls,
    "schema retries": stats.schema_retries,
    "input tokens": stats.input_tokens,
    "output tokens": stats.output_tokens,
    "cache read tokens": stats.cache_read_tokens,
    "cache write tokens": stats.cache_write_tokens,
    "total cost": usd(stats.cost_usd_micros),
    "cost / product": usd(stats.cost_per_product_usd_micros),
    unpriced: stats.unpriced,
    "latency avg ms": stats.latency_avg_ms,
    "latency p50 ms": stats.latency_p50_ms,
    "latency p95 ms": stats.latency_p95_ms,
  };
}

export function printReasons(label: string, counts: unknown) {
  const entries = Object.entries((counts ?? {}) as Record<string, number>);
  if (!entries.length) return;
  console.log(`\n${label}:`);
  for (const [reason, n] of entries) console.log(`  ${String(n).padStart(4)}  ${reason}`);
}
