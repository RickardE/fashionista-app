"use client";

import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui/Button";

export default function OnboardingWelcomePage() {
  const router = useRouter();

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
        <p className="mt-5 max-w-[28ch] text-[15px] leading-[1.6] text-neutral-700 text-pretty">
          Swipe through clothes: right for what you love, left for what you
          don&rsquo;t. The more you swipe, the better your feed gets.
        </p>
      </div>
      <PrimaryButton onClick={() => router.push("/onboarding/shopping-for")}>Get started</PrimaryButton>
    </div>
  );
}
