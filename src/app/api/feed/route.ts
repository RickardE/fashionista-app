import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { limitParam, parseQuery, withErrors } from "@/server/http";
import { SHOPPER_GENDERS } from "@/server/products/eligibility";
import { getFeedPage, MAX_LIMIT } from "@/server/products/service";
import { clientKey, styleProfileIdFor } from "@/server/users/state";

const query = z.object({
  cursor: z.uuid().optional(),
  limit: limitParam(20, MAX_LIMIT),
  /** products: clothing only. outfits: clothing + shoes (outfit starting pieces). */
  for: z.enum(["products", "outfits"]).default("products"),
  gender: z.enum(SHOPPER_GENDERS).optional(),
  /** The style swiping: what it has already been shown is left out. */
  style: clientKey.optional(),
});

/** GET /api/feed?for=products|outfits&gender=men|women&style=&cursor=&limit= — keyset-paginated. */
export const GET = withErrors("feed", async (request: Request) => {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const parsed = parseQuery(request, query);
  if (!parsed.ok) return parsed.response;
  const { cursor, limit, gender, style } = parsed.data;
  const db = getDb();
  // A style not synced yet has seen nothing.
  const styleProfileId = style ? await styleProfileIdFor(db, auth.user.id, style) : undefined;
  const page = await getFeedPage(db, { cursor, limit, gender, kind: parsed.data.for, styleProfileId });
  return Response.json(page);
});
