import type { Db } from "@/server/db/client";
import { users } from "@/server/db/schema";

/**
 * Stands in for Better Auth in route tests: a request is signed in as the
 * user id in its `x-test-user` header.
 */
export const testAuth = {
  api: {
    async getSession({ headers }: { headers: Headers }) {
      const id = headers.get("x-test-user");
      return id ? { user: { id, email: `${id}@example.test`, name: "Test", image: null } } : null;
    },
  },
};

export async function createUser(db: Db, email: string): Promise<string> {
  const [user] = await db.insert(users).values({ name: email, email }).returning({ id: users.id });
  return user.id;
}
