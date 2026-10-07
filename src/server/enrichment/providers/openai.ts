/**
 * OpenAI adapter: Responses API with strict JSON-schema structured output.
 */

import OpenAI from "openai";
import {
  parseJsonOutput,
  ZERO_USAGE,
  type ModelConfig,
  type ModelProvider,
  type ModelRequest,
  type ModelResult,
  type ModelUsage,
} from "./types";

type Effort = NonNullable<OpenAI.ReasoningEffort>;

export class OpenAIProvider implements ModelProvider {
  private readonly client: OpenAI;

  constructor(
    readonly config: ModelConfig,
    client?: OpenAI,
  ) {
    // SDK retries cover transient failures (429, 5xx, connection errors).
    this.client = client ?? new OpenAI({ maxRetries: 3 });
  }

  async generate(request: ModelRequest): Promise<ModelResult> {
    const started = Date.now();
    const content: OpenAI.Responses.ResponseInputContent[] = [];
    if (request.image) {
      const url =
        request.image.kind === "url"
          ? request.image.url
          : `data:${request.image.mediaType};base64,${request.image.data}`;
      // "high", not "auto": product photos need full detail (pattern, texture, fit),
      // and a fixed setting keeps model comparisons fair.
      content.push({ type: "input_image", image_url: url, detail: "high" });
    }
    for (const text of request.userTexts) content.push({ type: "input_text", text });

    let response: OpenAI.Responses.Response;
    try {
      response = await this.client.responses.create({
        model: this.config.model,
        instructions: request.system,
        input: [{ role: "user", content }],
        max_output_tokens: this.config.maxOutputTokens ?? 16000,
        store: false,
        text: {
          format: { type: "json_schema", name: request.schemaName, schema: request.jsonSchema, strict: true },
        },
        ...(this.config.effort ? { reasoning: { effort: this.config.effort as Effort } } : {}),
      });
    } catch (err) {
      return {
        ok: false,
        reason: "provider_error",
        message: err instanceof Error ? err.message : String(err),
        status: err instanceof OpenAI.APIError ? err.status : undefined,
        usage: ZERO_USAGE,
        latencyMs: Date.now() - started,
      };
    }

    const latencyMs = Date.now() - started;
    // OpenAI's input_tokens include cached tokens; normalize to "uncached input".
    const cached = response.usage?.input_tokens_details?.cached_tokens ?? 0;
    const cacheWrite = response.usage?.input_tokens_details?.cache_write_tokens ?? 0;
    const usage: ModelUsage = {
      inputTokens: Math.max(0, (response.usage?.input_tokens ?? 0) - cached - cacheWrite),
      outputTokens: response.usage?.output_tokens ?? 0,
      cacheReadTokens: cached,
      cacheWriteTokens: cacheWrite,
    };

    const refusal = response.output
      .flatMap((item) => (item.type === "message" ? item.content : []))
      .find((part): part is OpenAI.Responses.ResponseOutputRefusal => part.type === "refusal");
    if (refusal) {
      return { ok: false, reason: "refusal", message: `model refused: ${refusal.refusal}`, usage, latencyMs };
    }
    if (response.status === "incomplete") {
      const reason = response.incomplete_details?.reason;
      return reason === "max_output_tokens"
        ? { ok: false, reason: "max_tokens", message: "output hit max_output_tokens", usage, latencyMs, rawText: response.output_text }
        : reason === "content_filter"
          ? { ok: false, reason: "refusal", message: "output stopped by content filter", usage, latencyMs }
          : { ok: false, reason: "provider_error", message: `incomplete response (${reason ?? "unknown"})`, usage, latencyMs };
    }
    if (response.status === "failed") {
      return { ok: false, reason: "provider_error", message: response.error?.message ?? "response failed", usage, latencyMs };
    }
    return parseJsonOutput(response.output_text, usage, latencyMs, response.model);
  }
}
