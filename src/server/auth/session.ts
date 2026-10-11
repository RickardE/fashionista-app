import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/auth";
import { jsonError } from "@/server/http";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

/** The signed-in user for these request headers, or null. Reads only the session cookie. */
async function getSessionUser(requestHeaders: Headers): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, email, name, image } = session.user;
  return { id, email, name, image: image ?? null };
}

/**
 * Every API route except /api/auth/* starts with this. The user id used for
 * any data access comes from here — never from the request body or URL.
 */
export async function requireUser(
  request: Request,
): Promise<{ ok: true; user: SessionUser } | { ok: false; response: Response }> {
  const user = await getSessionUser(request.headers);
  if (user) return { ok: true, user };
  return { ok: false, response: jsonError(401, "unauthorized") };
}

/**
 * For server-rendered pages that read data directly: proxy.ts only checks
 * that a session cookie exists, this verifies it.
 */
export async function requirePageUser(path: string): Promise<SessionUser> {
  const user = await getSessionUser(await headers());
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  return user;
}
