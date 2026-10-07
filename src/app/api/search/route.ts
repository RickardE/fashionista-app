import { z } from "zod";
import { getDb } from "@/server/db/client";
import { limitParam, parseQuery, withErrors } from "@/server/http";
import { SHOPPER_GENDERS } from "@/server/products/eligibility";
import { MAX_LIMIT, searchProducts } from "@/server/products/service";

const query = z.object({
  q: z.string().trim().max(200).default(""),
  limit: limitParam(20, MAX_LIMIT),
  gender: z.enum(SHOPPER_GENDERS).optional(),
});

/** GET /api/search?q=&gender=&limit= — keyword search, same eligibility as the Products feed. */
export const GET = withErrors("search", async (request: Request) => {
  const parsed = parseQuery(request, query);
  if (!parsed.ok) return parsed.response;
  const { q, limit, gender } = parsed.data;
  const products = await searchProducts(getDb(), q, { limit, gender });
  return Response.json({ products });
});
