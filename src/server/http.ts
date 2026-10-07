import { z } from "zod";
import { createLogger } from "@/server/log";

const log = createLogger("api");

export function jsonError(status: number, error: string, details?: unknown) {
  return Response.json({ error, ...(details ? { details } : {}) }, { status });
}

/** Parses URL search params against a zod schema; returns a 400 response on failure. */
export function parseQuery<T extends z.ZodType>(
  request: Request,
  schema: T,
): { ok: true; data: z.infer<T> } | { ok: false; response: Response } {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const result = schema.safeParse(params);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    response: jsonError(400, "invalid_request", z.flattenError(result.error).fieldErrors),
  };
}

/** Wraps a handler so unexpected failures (e.g. DB down) become a logged 500, never a crash page. */
export function withErrors<A extends unknown[]>(
  name: string,
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      log.error("request failed", { route: name, error: err as Error });
      return jsonError(500, "internal_error");
    }
  };
}

export const limitParam = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);

/** Comma-separated list param: "a,b,c" → ["a","b","c"]. */
export const listParam = z
  .string()
  .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean));
