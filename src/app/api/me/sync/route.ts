import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { jsonError, withErrors } from "@/server/http";
import { applySync, syncBody } from "@/server/users/state";

/** POST /api/me/sync { ops } — applies a batch of style-data changes for the signed-in user. */
export const POST = withErrors("me-sync", async (request: Request) => {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  // Cookies are SameSite=Lax, but a cross-site form POST could still carry them; only accept our own origin.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return jsonError(403, "forbidden_origin");
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return jsonError(415, "expected_json");
  }

  const parsed = syncBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid_request", z.flattenError(parsed.error).fieldErrors);
  return Response.json(await applySync(getDb(), auth.user.id, parsed.data.ops));
});
