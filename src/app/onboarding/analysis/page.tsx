"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AnalysisPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.push("/onboarding/style"), 2700);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex h-dvh flex-col justify-end px-[30px] pb-[46px]">
      <div className="animate-rise font-serif text-[34px] leading-[1.08]">
        Understanding
        <br />
        your style&hellip;
      </div>
      <div className="mt-[26px] flex flex-col gap-[9px]">
        <div className="animate-rise text-[12px] text-neutral-700 [animation-delay:0.15s]">
          Reading silhouettes
        </div>
        <div className="animate-rise text-[12px] text-neutral-700 [animation-delay:0.85s]">
          Reading palette
        </div>
        <div className="animate-rise text-[12px] text-neutral-700 [animation-delay:1.6s]">
          Composing your profile
        </div>
      </div>
      <div className="relative mt-[30px] h-[2px] overflow-hidden bg-neutral-300">
        <div className="animate-grow absolute inset-0 bg-ink [animation-duration:2.5s] [animation-timing-function:cubic-bezier(0.4,0.1,0.2,1)]" />
      </div>
    </div>
  );
}
