import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/auth";
import { GoogleSignIn } from "./google-sign-in";

/** Only same-site paths are followed after sign-in (no open redirect). */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next.startsWith("/login") ? "/" : next;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const destination = safeNext(next);
  if (await getAuth().api.getSession({ headers: await headers() })) redirect(destination);

  return (
    <div className="relative h-dvh bg-paper px-[30px] pb-[46px]">
      <div className="absolute top-6 left-[30px] text-[10px] font-semibold tracking-[0.12em] text-neutral-500 uppercase [padding-top:env(safe-area-inset-top)]">
        Stockholm
      </div>
      <div className="animate-rise absolute bottom-[46px] left-[30px] right-[30px]">
        <div className="text-[13px] font-semibold tracking-[0.48em] uppercase">STYLEAI</div>
        <div className="my-4 h-[2px] w-full bg-ink" />
        <div className="font-serif text-[30px] leading-[1.1]">Your style. Found.</div>
        <p className="mt-3 mb-8 text-[13px] text-neutral-700">
          Sign in to keep your styles, likes and saved outfits on every device.
        </p>
        {error && (
          <p role="alert" className="mb-4 text-[13px] text-accent-700">
            Sign-in didn&apos;t complete. Please try again.
          </p>
        )}
        <GoogleSignIn callbackURL={destination} />
        <p className="mt-5 text-[11px] leading-[1.5] text-neutral-500">
          Signing in stores your name, email address, styles, likes and saved outfits so STYLEAI
          can remember them for you during this test.
        </p>
      </div>
    </div>
  );
}
