"use client";

import { useState } from "react";
import { PrimaryButton } from "@/components/ui/Button";
import { authClient } from "@/lib/auth-client";

export function GoogleSignIn({ callbackURL }: { callbackURL: string }) {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    // Navigates to Google; on failure Better Auth returns to /login?error=…
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      errorCallbackURL: "/login?error=1",
    });
    if (error) setPending(false);
  }

  return (
    <PrimaryButton onClick={signIn} disabled={pending}>
      {pending ? "Opening Google…" : "Continue with Google"}
    </PrimaryButton>
  );
}
