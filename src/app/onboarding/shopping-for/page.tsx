"use client";

import { useRouter } from "next/navigation";
import { GenderToggle } from "@/components/GenderChoice";
import { ChevronLeftIcon } from "@/components/icons";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export default function OnboardingShoppingForPage() {
  const router = useRouter();
  const { activeStyle, chooseGender } = useStyleProfile();

  return (
    <div className="animate-rise flex h-dvh flex-col px-[30px] pb-10">
      <div className="pt-4 [padding-top:env(safe-area-inset-top)]">
        <button
          onClick={() => router.push("/onboarding")}
          className="flex items-center gap-1.5 py-2 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase"
        >
          <ChevronLeftIcon />
          Back
        </button>
      </div>
      <div className="flex flex-1 flex-col justify-center pb-5">
        <div className="mb-[22px] text-[10px] font-semibold tracking-[0.14em] text-neutral-700 uppercase">
          Step 1 of 2
        </div>
        <div className="font-serif text-[36px] leading-[1.06]">
          Who are you
          <br />
          shopping for?
        </div>
        <p className="mt-3.5 mb-[26px] max-w-[30ch] text-[14px] leading-[1.6] text-neutral-700">
          Products and outfits will follow this. You can change it per style later.
        </p>
        <GenderToggle
          value={activeStyle.gender}
          onChange={(gender) => {
            chooseGender(gender);
            router.push("/onboarding/favourites");
          }}
        />
      </div>
    </div>
  );
}
