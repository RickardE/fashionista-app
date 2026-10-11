import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/server/db/client";
import { accounts, sessions, users, verifications } from "@/server/db/schema";

const DAY = 60 * 60 * 24;

/**
 * Sign-in is Google only (no email/password). Sessions live in the `sessions`
 * table behind an httpOnly cookie: 30 days, extended at most once a day while
 * the app is used. A short signed cookie cache saves a DB read per API call;
 * revoking a session takes effect within its 5 minutes.
 *
 * Env: BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
 */
function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        // Always offer the account chooser, so a shared phone can switch users.
        prompt: "select_account",
      },
    },
    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    // We never call Google APIs on the user's behalf; keep the stored tokens unreadable anyway.
    account: { encryptOAuthTokens: true },
    advanced: { database: { generateId: "uuid" } },
    telemetry: { enabled: false },
    // Lets server actions / route handlers set the session cookie (must be last).
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

// One instance per server process (and across dev hot-reloads), created on
// first use so importing this module never needs env or a database.
const globalForAuth = globalThis as unknown as { __styleaiAuth?: Auth };

export function getAuth(): Auth {
  globalForAuth.__styleaiAuth ??= createAuth();
  return globalForAuth.__styleaiAuth;
}
