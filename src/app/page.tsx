"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export default function SplashPage() {
  const router = useRouter();
  const { state } = useStyleProfile();
  const advancedRef = useRef(false);

  const destination = state.hasOnboarded ? "/discover" : "/onboarding";

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!advancedRef.current) {
        advancedRef.current = true;
        router.push(destination);
      }
    }, 2300);
    return () => clearTimeout(timer);
  }, [destination, router]);

  function advance() {
    if (advancedRef.current) return;
    advancedRef.current = true;
    router.push(destination);
  }

  return (
    <button
      onClick={advance}
      className="relative block h-dvh w-full bg-paper px-[30px] pb-[46px] text-left"
    >
      <div className="animate-breathe absolute top-6 left-[30px] text-[10px] font-semibold tracking-[0.12em] text-neutral-500 uppercase [padding-top:env(safe-area-inset-top)]">
        Stockholm
      </div>
      <div className="animate-rise absolute bottom-[46px] left-[30px] right-[30px]">
        <div className="text-[13px] font-semibold tracking-[0.48em] uppercase">
          STYLEAI
        </div>
        <div className="animate-grow my-4 h-[2px] w-full bg-ink" />
        <div className="font-serif text-[30px] leading-[1.1]">
          Your style. Found.
        </div>
      </div>
    </button>
  );
}
