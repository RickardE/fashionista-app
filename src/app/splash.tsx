"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStyleProfile } from "@/lib/store/style-profile-context";

/** A short, personal greeting before the feed (or onboarding); tap anywhere to skip it. */
export function Splash({ mosaic }: { mosaic: ReactNode }) {
  const router = useRouter();
  const { state, account } = useStyleProfile();
  const advancedRef = useRef(false);

  const destination = state.hasOnboarded ? "/products" : "/onboarding";
  const firstName = account?.name.trim().split(/\s+/)[0];
  const styleName = state.styles[state.activeStyleId]?.name;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!advancedRef.current) {
        advancedRef.current = true;
        router.push(destination);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [destination, router]);

  function advance() {
    if (advancedRef.current) return;
    advancedRef.current = true;
    router.push(destination);
  }

  return (
    <button onClick={advance} className="relative flex h-dvh w-full flex-col bg-paper text-left">
      <div className="relative min-h-0 w-full flex-1">{mosaic}</div>
      <div className="animate-rise relative w-full px-6 pb-12">
        <div className="animate-grow mb-[18px] h-[2px] w-full bg-ink" />
        <div className="text-[10px] font-semibold tracking-[0.14em] text-neutral-700 uppercase">
          {state.hasOnboarded ? "Welcome back" : "Welcome"}
        </div>
        <div className="mt-2 font-serif text-[46px] leading-none tracking-[-0.01em]">
          {firstName ? `Hi, ${firstName}.` : "Hi there."}
        </div>
        <div className="mt-3 text-[14px] text-neutral-800">
          {state.hasOnboarded && styleName ? (
            <>
              Picking up where you left off · <em className="font-serif text-[17px]">{styleName}</em>
            </>
          ) : (
            "Let's find your style."
          )}
        </div>
      </div>
    </button>
  );
}
