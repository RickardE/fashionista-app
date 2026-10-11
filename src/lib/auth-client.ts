import { createAuthClient } from "better-auth/client";

/** Browser client for /api/auth (same origin). */
export const authClient = createAuthClient();
