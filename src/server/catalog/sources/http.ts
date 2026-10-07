import { createLogger } from "@/server/log";

const log = createLogger("source:http");

export interface DownloadResult {
  modified: boolean;
  body?: string;
  lastModified?: Date;
  bytes?: number;
}

export class SourceUnavailableError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SourceUnavailableError";
  }
}

/** Feed URLs carry affiliate tokens — only ever log the host. */
export function redactUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "<invalid-url>";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Downloads a feed with a timeout, retries on network errors / 5xx / 429, and
 * conditional GET support. Only called with operator-configured URLs (env),
 * never with user input.
 */
export async function downloadFeed(
  url: string,
  options: {
    ifModifiedSince?: Date;
    timeoutMs?: number;
    retries?: number;
    signal?: AbortSignal;
  } = {},
): Promise<DownloadResult> {
  const { ifModifiedSince, timeoutMs = 120_000, retries = 3 } = options;
  const host = redactUrl(url);

  for (let attempt = 1; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    try {
      const res = await fetch(url, {
        signal,
        headers: {
          "user-agent": "STYLEAI-catalog/1.0",
          ...(ifModifiedSince ? { "if-modified-since": ifModifiedSince.toUTCString() } : {}),
        },
      });
      const lastModifiedHeader = res.headers.get("last-modified");
      const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : undefined;

      if (res.status === 304) return { modified: false, lastModified };
      if (res.ok) {
        const body = await res.text();
        return { modified: true, body, lastModified, bytes: Buffer.byteLength(body) };
      }
      const retryable = res.status >= 500 || res.status === 429;
      if (!retryable || attempt > retries) {
        throw new SourceUnavailableError(`Feed request failed with HTTP ${res.status}`, res.status);
      }
      log.warn("feed request failed, retrying", { host, status: res.status, attempt });
    } catch (err) {
      if (err instanceof SourceUnavailableError) throw err;
      if (options.signal?.aborted) throw err;
      if (attempt > retries) {
        throw new SourceUnavailableError(`Feed unreachable: ${(err as Error).message}`);
      }
      log.warn("feed request errored, retrying", { host, attempt, error: err as Error });
    }
    await sleep(1000 * 2 ** (attempt - 1));
  }
}
