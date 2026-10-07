import { z } from "zod";
import { getDb } from "@/server/db/client";
import { parseQuery, withErrors } from "@/server/http";
import { SHOPPER_GENDERS } from "@/server/products/eligibility";
import { getInspiration } from "@/server/products/service";

const query = z.object({ gender: z.enum(SHOPPER_GENDERS).optional() });

/** GET /api/inspiration?gender= — labelled catalogue images for onboarding and new-style creation. */
export const GET = withErrors("inspiration", async (request: Request) => {
  const parsed = parseQuery(request, query);
  if (!parsed.ok) return parsed.response;
  return Response.json({ tiles: await getInspiration(getDb(), parsed.data.gender) });
});
