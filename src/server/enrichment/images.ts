/**
 * How the product image reaches the model. "url" passes the catalogue URL
 * through (providers fetch it); "inline" downloads it here and sends base64.
 * Inline is what pilots use: every provider then receives byte-identical
 * images, fingerprinted by SHA-256, and no provider-side fetch can fail or
 * see a different file. Host-agnostic either way.
 */

import { createHash } from "node:crypto";
import type { ModelImage } from "./providers/types";

export type ImageMode = "url" | "inline";

/** Recorded with each attempt, so runs can prove they saw the same image. */
export interface ImageFingerprint {
  mode: ImageMode;
  url: string;
  sha256?: string;
  bytes?: number;
  mediaType?: string;
}

const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** Anthropic's per-image limit is 10 MB base64-encoded; stay well under it for every provider. */
const MAX_INLINE_BYTES = 5 * 1024 * 1024;

export async function resolveImage(
  url: string | null,
  mode: ImageMode,
): Promise<{ image: ModelImage; fingerprint: ImageFingerprint } | undefined> {
  if (!url) return undefined;
  if (mode === "url") return { image: { kind: "url", url }, fingerprint: { mode, url } };

  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`image download failed: HTTP ${response.status}`);
  const mediaType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!SUPPORTED_TYPES.includes(mediaType)) throw new Error(`unsupported image type "${mediaType}"`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_INLINE_BYTES) throw new Error(`image too large (${bytes.length} bytes)`);
  return {
    image: { kind: "base64", mediaType, data: bytes.toString("base64") },
    fingerprint: {
      mode,
      url,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      mediaType,
    },
  };
}
