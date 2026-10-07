import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "../providers/anthropic";
import { OpenAIProvider } from "../providers/openai";
import { createModelProvider } from "../providers/registry";
import type { ModelRequest } from "../providers/types";

const request: ModelRequest = {
  system: "system",
  userTexts: ["describe"],
  image: { kind: "url", url: "https://cdn.example.com/a.jpg" },
  schemaName: "s",
  jsonSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
};

function fakeAnthropic(message: Partial<Anthropic.Message>) {
  const sent: unknown[] = [];
  const client = {
    messages: {
      create: async (params: unknown) => {
        sent.push(params);
        return {
          model: "claude-test",
          content: [{ type: "text", text: '{"a":1}' }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
          ...message,
        };
      },
    },
  } as unknown as Anthropic;
  return { client, sent };
}

describe("AnthropicProvider", () => {
  it("sends structured-output config, image and effort; parses JSON and usage", async () => {
    const { client, sent } = fakeAnthropic({});
    const provider = new AnthropicProvider({ provider: "anthropic", model: "claude-test", effort: "low" }, client);
    const result = await provider.generate(request);
    expect(result).toMatchObject({
      ok: true,
      output: { a: 1 },
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 0 },
    });
    const params = sent[0] as Record<string, unknown> & { output_config: Record<string, unknown>; messages: { content: unknown[] }[] };
    expect(params.output_config).toEqual({ format: { type: "json_schema", schema: request.jsonSchema }, effort: "low" });
    expect(params.messages[0].content[0]).toEqual({ type: "image", source: { type: "url", url: request.image!.kind === "url" ? request.image!.url : "" } });
    expect(params).not.toHaveProperty("fallbacks");
  });

  it("maps refusal and max_tokens to failures", async () => {
    const refusal = new AnthropicProvider({ provider: "anthropic", model: "m" }, fakeAnthropic({ stop_reason: "refusal" }).client);
    expect(await refusal.generate(request)).toMatchObject({ ok: false, reason: "refusal" });
    const truncated = new AnthropicProvider({ provider: "anthropic", model: "m" }, fakeAnthropic({ stop_reason: "max_tokens" }).client);
    expect(await truncated.generate(request)).toMatchObject({ ok: false, reason: "max_tokens" });
  });

  it("reports invalid JSON for the pipeline's schema retry", async () => {
    const { client } = fakeAnthropic({ content: [{ type: "text", text: "not json", citations: null }] });
    const provider = new AnthropicProvider({ provider: "anthropic", model: "m" }, client);
    expect(await provider.generate(request)).toMatchObject({ ok: false, reason: "invalid_json" });
  });

  it("turns API errors into provider_error results, keeping the HTTP status", async () => {
    const client = { messages: { create: async () => Promise.reject(new Error("boom")) } } as unknown as Anthropic;
    const provider = new AnthropicProvider({ provider: "anthropic", model: "m" }, client);
    expect(await provider.generate(request)).toMatchObject({ ok: false, reason: "provider_error", message: "boom" });

    const { APIError } = await import("@anthropic-ai/sdk");
    const apiError = APIError.generate(400, { type: "error", error: { type: "invalid_request_error", message: "not scoped" } }, "not scoped", new Headers());
    const rejecting = { messages: { create: async () => Promise.reject(apiError) } } as unknown as Anthropic;
    const result = await new AnthropicProvider({ provider: "anthropic", model: "m" }, rejecting).generate(request);
    expect(result).toMatchObject({ ok: false, reason: "provider_error", status: 400 });
  });

  it("rejects unknown effort levels up front", () => {
    expect(() => new AnthropicProvider({ provider: "anthropic", model: "m", effort: "turbo" }, {} as Anthropic)).toThrow(/effort/);
  });
});

function fakeOpenAI(response: Partial<OpenAI.Responses.Response>) {
  const sent: unknown[] = [];
  const client = {
    responses: {
      create: async (params: unknown) => {
        sent.push(params);
        return {
          model: "gpt-test",
          status: "completed",
          output: [],
          output_text: '{"a":1}',
          usage: { input_tokens: 110, output_tokens: 5, input_tokens_details: { cached_tokens: 100, cache_write_tokens: 0 } },
          ...response,
        };
      },
    },
  } as unknown as OpenAI;
  return { client, sent };
}

describe("OpenAIProvider", () => {
  it("sends strict JSON schema and normalizes cached input tokens", async () => {
    const { client, sent } = fakeOpenAI({});
    const provider = new OpenAIProvider({ provider: "openai", model: "gpt-test", effort: "low" }, client);
    const result = await provider.generate(request);
    expect(result).toMatchObject({ ok: true, output: { a: 1 }, usage: { inputTokens: 10, cacheReadTokens: 100, outputTokens: 5 } });
    const params = sent[0] as { text: unknown; reasoning: unknown };
    expect(params.text).toEqual({ format: { type: "json_schema", name: "s", schema: request.jsonSchema, strict: true } });
    expect(params.reasoning).toEqual({ effort: "low" });
  });

  it("maps incomplete and refusal responses", async () => {
    const truncated = new OpenAIProvider(
      { provider: "openai", model: "m" },
      fakeOpenAI({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }).client,
    );
    expect(await truncated.generate(request)).toMatchObject({ ok: false, reason: "max_tokens" });
    const refused = new OpenAIProvider(
      { provider: "openai", model: "m" },
      fakeOpenAI({
        output: [
          { type: "message", id: "1", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "no" }] },
        ] as OpenAI.Responses.Response["output"],
      }).client,
    );
    expect(await refused.generate(request)).toMatchObject({ ok: false, reason: "refusal" });
  });
});

describe("provider registry", () => {
  it("rejects unknown providers", () => {
    expect(() => createModelProvider({ provider: "nope", model: "m" })).toThrow(/Unknown model provider/);
  });
});
