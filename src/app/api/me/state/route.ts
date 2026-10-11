import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { withErrors } from "@/server/http";
import { getUserState } from "@/server/users/state";

/** GET /api/me/state — the signed-in user's account and style data (`state` is null for a new account). */
export const GET = withErrors("me-state", async (request: Request) => {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { id, email, name, image } = auth.user;
  return Response.json(
    { user: { id, email, name, image }, state: await getUserState(getDb(), id) },
    { headers: { "cache-control": "private, no-store" } },
  );
});
