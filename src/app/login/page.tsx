import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/auth";
import { mosaicImages, ProductMosaic } from "@/components/ProductMosaic";
import { GoogleSignIn } from "./google-sign-in";

/** Only same-site paths are followed after sign-in (no open redirect). */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next.startsWith("/login") ? "/" : next;
}

const STEPS = ["Swipe what catches your eye.", "We learn your style as you go.", "Get outfits built around it."];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const destination = safeNext(next);
  if (await getAuth().api.getSession({ headers: await headers() })) redirect(destination);
  const images = await mosaicImages();

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-paper">
      <div className="relative min-h-0 flex-1">{images.length > 0 && <ProductMosaic images={images} />}</div>
      <div className="animate-rise relative px-6 pb-9">
        <div className="mb-[18px] h-[2px] w-full bg-ink" />
        <h1 className="font-serif text-[46px] leading-none tracking-[-0.01em]">
          Dress like yourself, <em>only sharper.</em>
        </h1>
        <ol className="mt-[22px] mb-[26px] flex flex-col gap-[9px] text-[13px] text-neutral-800">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3.5">
              <span className="w-4 pt-0.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-600">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        {error && (
          <p role="alert" className="mb-4 text-[13px] text-accent-700">
            Sign-in didn&apos;t complete. Please try again.
          </p>
        )}
        <GoogleSignIn callbackURL={destination} />
        <p className="mt-3.5 text-[11px] leading-[1.5] text-neutral-700">
          We save your name, email and style choices so they&apos;re here next time. This is a test
          version.
        </p>
      </div>
    </div>
  );
}
