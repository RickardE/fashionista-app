import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import type { ModelConfig, ModelProvider } from "./types";

/** All model adapters, by provider key. Adding a provider = adding a line here. */
const PROVIDERS: Record<string, (config: ModelConfig) => ModelProvider> = {
  anthropic: (config) => new AnthropicProvider(config),
  openai: (config) => new OpenAIProvider(config),
};

export function listProviders(): string[] {
  return Object.keys(PROVIDERS);
}

export function createModelProvider(config: ModelConfig): ModelProvider {
  const factory = PROVIDERS[config.provider];
  if (!factory) {
    throw new Error(`Unknown model provider "${config.provider}". Known: ${listProviders().join(", ")}`);
  }
  return factory(config);
}
