/**
 * The model boundary. The pipeline only ever talks to a ModelProvider and only
 * ever sees parsed JSON + normalized usage; everything provider-specific
 * (SDKs, structured-output parameters, refusal/stop semantics, token
 * accounting) lives in the adapters next to this file.
 */

export interface ModelConfig {
  /** Adapter key, e.g. "anthropic" or "openai". */
  provider: string;
  model: string;
  /** Provider-specific reasoning effort, passed through as-is. */
  effort?: string;
  /** Output token ceiling for one call (reasoning included where the provider counts it). */
  maxOutputTokens?: number;
}

export type ModelImage =
  | { kind: "url"; url: string }
  | { kind: "base64"; mediaType: string; data: string };

export interface ModelRequest {
  system: string;
  /** User turns in order; a schema retry appends a correction note. */
  userTexts: string[];
  image?: ModelImage;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
}

/**
 * Normalized token usage. `inputTokens` excludes cache reads and writes, so
 * cost = input·in + output·out + cacheRead·cacheRead + cacheWrite·cacheWrite.
 */
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const ZERO_USAGE: ModelUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export type ModelFailureReason = "refusal" | "max_tokens" | "invalid_json" | "provider_error";

export type ModelResult =
  | { ok: true; output: unknown; usage: ModelUsage; latencyMs: number; servedModel?: string }
  | {
      ok: false;
      reason: ModelFailureReason;
      message: string;
      usage: ModelUsage;
      latencyMs: number;
      rawText?: string;
    };

export interface ModelProvider {
  readonly config: ModelConfig;
  generate(request: ModelRequest): Promise<ModelResult>;
}

/** Parses a provider's JSON text into a ModelResult. Shared by adapters. */
export function parseJsonOutput(
  text: string,
  usage: ModelUsage,
  latencyMs: number,
  servedModel?: string,
): ModelResult {
  try {
    return { ok: true, output: JSON.parse(text), usage, latencyMs, servedModel };
  } catch {
    return { ok: false, reason: "invalid_json", message: "model output is not valid JSON", usage, latencyMs, rawText: text };
  }
}
