/**
 * Model pricing, kept apart from the adapters so it can be updated without
 * touching pipeline logic. USD per million tokens, from each provider's public
 * price list. A model missing here is recorded with cost = null ("unpriced")
 * and flagged in reports — tokens are always stored, so cost can be
 * recomputed later.
 *
 * Extra or overriding entries can be supplied without a code change through
 * ENRICHMENT_PRICING_JSON, e.g.
 *   {"openai:some-model": {"input": 1.25, "output": 10, "cacheRead": 0.125}}
 */

import type { ModelUsage } from "./providers/types";

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/**
 * Verified 2026-10-07 against https://platform.claude.com/docs/en/about-claude/pricing
 * (standard first-party rates; global routing, no batch). Cache writes use the
 * 5-minute TTL rate (1.25× input), which is what the adapter requests. Opus
 * 5.5 cache reads are 0.05× input; the others 0.1×. Haiku 4.5 is listed under
 * both its alias and its pinned API ID.
 */
const ANTHROPIC = {
  opus55: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  sonnet55: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  haiku45: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
} satisfies Record<string, ModelPrice>;

const BUILTIN_PRICES: Record<string, ModelPrice> = {
  "anthropic:claude-opus-5-5": ANTHROPIC.opus55,
  "anthropic:claude-sonnet-5-5": ANTHROPIC.sonnet55,
  "anthropic:claude-haiku-4-5": ANTHROPIC.haiku45,
  "anthropic:claude-haiku-4-5-20251001": ANTHROPIC.haiku45,
};

function overrides(): Record<string, ModelPrice> {
  const raw = process.env.ENRICHMENT_PRICING_JSON;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, ModelPrice>;
  } catch {
    throw new Error("ENRICHMENT_PRICING_JSON is not valid JSON");
  }
}

export function priceFor(provider: string, model: string): ModelPrice | undefined {
  const key = `${provider}:${model}`;
  return overrides()[key] ?? BUILTIN_PRICES[key];
}

/**
 * Cost in USD micros. Because prices are per million tokens, tokens × price
 * is already micro-dollars. Cache prices default to the input price.
 */
export function costUsdMicros(usage: ModelUsage, price: ModelPrice | undefined): number | null {
  if (!price) return null;
  return Math.round(
    usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * (price.cacheRead ?? price.input) +
      usage.cacheWriteTokens * (price.cacheWrite ?? price.input),
  );
}

export const formatUsd = (micros: number | null | undefined) =>
  micros === null || micros === undefined ? "unpriced" : `$${(micros / 1_000_000).toFixed(4)}`;
