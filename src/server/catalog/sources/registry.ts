import type { ProductSource } from "../types";
import { createJohnellsSource } from "./adtraction/johnells";

/** All configured product sources, by key. Adding a source = adding a line here. */
const SOURCES: Record<string, () => ProductSource> = {
  "adtraction:johnells": () => createJohnellsSource(),
};

export function listSourceKeys(): string[] {
  return Object.keys(SOURCES);
}

export function getSource(key: string): ProductSource {
  const factory = SOURCES[key];
  if (!factory) {
    throw new Error(`Unknown product source "${key}". Known: ${listSourceKeys().join(", ")}`);
  }
  return factory();
}
