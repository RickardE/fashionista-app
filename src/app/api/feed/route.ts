import { z } from "zod";
import { getDb } from "@/server/db/client";
import { limitParam, parseQuery, withErrors } from "@/server/http";
import { SHOPPER_GENDERS } from "@/server/products/eligibility";
import { getFeedPage, MAX_LIMIT } from "@/server/products/service";

const query = z.object({
  cursor: z.uuid().optional(),
  limit: limitParam(20, MAX_LIMIT),
  /** products: clothing only. outfits: clothing + shoes (outfit starting pieces). */
  for: z.enum(["products", "outfits"]).default("products"),
  gender: z.enum(SHOPPER_GENDERS).optional(),
});

/** GET /api/feed?for=products|outfits&gender=men|women&cursor=&limit= — keyset-paginated. */
export const GET = withErrors("feed", async (request: Request) => {
  const parsed = parseQuery(request, query);
  if (!parsed.ok) return parsed.response;
  const { cursor, limit, gender } = parsed.data;
  const page = await getFeedPage(getDb(), { cursor, limit, gender, kind: parsed.data.for });
  return Response.json(page);
});
