/**
 * Anthropic (Claude) adapter: Messages API with JSON-schema structured output.
 *
 * Server-side refusal fallbacks are deliberately not enabled: a fallback would
 * silently serve the answer from a different model, which would corrupt model
 * comparisons and cost attribution. A refusal is recorded as a failed attempt.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  parseJsonOutput,
  ZERO_USAGE,
  type ModelConfig,
  type ModelProvider,
  type ModelRequest,
  type ModelResult,
  type ModelUsage,
} from "./types";

type Effort = NonNullable<Anthropic.OutputConfig["effort"]>;
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

export class AnthropicProvider implements ModelProvider {
  private readonly client: Anthropic;

  constructor(
    readonly config: ModelConfig,
    client?: Anthropic,
  ) {
    if (config.effort && !EFFORTS.includes(config.effort as Effort)) {
      throw new Error(`Unsupported Anthropic effort "${config.effort}" (use ${EFFORTS.join(", ")})`);
    }
    // SDK retries cover transient failures (429, 5xx, connection errors).
    // Keys not scoped to a workspace must name one per request.
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
    this.client =
      client ??
      new Anthropic({ maxRetries: 3, ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}) });
  }

  async generate(request: ModelRequest): Promise<ModelResult> {
    const started = Date.now();
    const content: Anthropic.ContentBlockParam[] = [];
    if (request.image?.kind === "url") {
      content.push({ type: "image", source: { type: "url", url: request.image.url } });
    } else if (request.image?.kind === "base64") {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: request.image.mediaType as Anthropic.Base64ImageSource["media_type"],
          data: request.image.data,
        },
      });
    }
    for (const text of request.userTexts) content.push({ type: "text", text });

    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxOutputTokens ?? 16000,
        // The system prompt (taxonomy + guide) is identical for every product: cache it.
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
        output_config: {
          format: { type: "json_schema", schema: request.jsonSchema },
          ...(this.config.effort ? { effort: this.config.effort as Effort } : {}),
        },
      });
    } catch (err) {
      return {
        ok: false,
        reason: "provider_error",
        message: err instanceof Error ? err.message : String(err),
        status: err instanceof Anthropic.APIError ? err.status : undefined,
        usage: ZERO_USAGE,
        latencyMs: Date.now() - started,
      };
    }

    const latencyMs = Date.now() - started;
    const usage: ModelUsage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    };
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (message.stop_reason === "refusal") {
      const category = message.stop_details?.category;
      return { ok: false, reason: "refusal", message: `model refused${category ? ` (${category})` : ""}`, usage, latencyMs, rawText: text };
    }
    if (message.stop_reason === "max_tokens") {
      return { ok: false, reason: "max_tokens", message: "output hit max_tokens", usage, latencyMs, rawText: text };
    }
    return parseJsonOutput(text, usage, latencyMs, message.model);
  }
}
