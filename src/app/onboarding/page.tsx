"use client";

import { useRouter } from "next/navigation";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export default function OnboardingWelcomePage() {
  const router = useRouter();
  const { completeOnboarding } = useStyleProfile();

  function startExploring() {
    completeOnboarding();
    router.push("/discover");
  }

  return (
    <div className="animate-rise flex h-dvh flex-col px-[30px] pb-10">
      <div className="flex flex-1 flex-col justify-center pb-5">
        <div className="mb-[22px] text-[10px] font-semibold tracking-[0.14em] text-neutral-700 uppercase">
          Welcome
        </div>
        <div className="font-serif text-[44px] leading-[1.02] tracking-[-0.015em]">
          Let&rsquo;s find
          <br />
          your style.
        </div>
        <p className="mt-5 max-w-[26ch] text-[15px] leading-[1.6] text-neutral-700 text-pretty">
          Show us a few outfits you love, or start discovering. Your feed
          sharpens with everything you like.
        </p>
      </div>
      <PrimaryButton onClick={() => router.push("/onboarding/upload")}>
        Upload inspiration
      </PrimaryButton>
      <SecondaryButton className="mt-[10px]" onClick={startExploring}>
        Start exploring
      </SecondaryButton>
      <div className="mt-4 text-[12px] leading-[1.5] text-neutral-700">
        No account needed to look around.
      </div>
    </div>
  );
}
