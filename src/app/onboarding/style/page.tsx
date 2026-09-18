"use client";

import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui/Button";
import { Divider } from "@/components/ui/Kicker";
import { useStyleProfile } from "@/lib/store/style-profile-context";

const SWATCHES = [
  { label: "Black", hex: "#201e1d" },
  { label: "Navy", hex: "#2d3142" },
  { label: "Beige", hex: "#cbbfa8" },
  { label: "White", hex: "#f8f4f4", bordered: true },
];

const KEY_PIECES = [
  { label: "Overshirts", strength: "strong" },
  { label: "Knitwear", strength: "strong" },
  { label: "Wide trousers", strength: "emerging" },
];

export default function StyleProfileIntroPage() {
  const router = useRouter();
  const { completeOnboarding } = useStyleProfile();

  function start() {
    completeOnboarding();
    router.push("/discover");
  }

  return (
    <div className="animate-rise flex h-dvh flex-col">
      <div className="flex-1 overflow-y-auto px-[30px] pt-6 pb-6">
        <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
          Your style
        </div>
        <div className="mt-4 font-serif text-[40px] leading-[1.04] tracking-[-0.015em]">
          Modern
          <br />
          Scandinavian
        </div>
        <div className="mt-3 text-[14px] leading-[1.5] text-neutral-700">
          Relaxed tailoring · Minimal
        </div>

        <Divider className="mt-[26px]" />

        <div className="border-b border-neutral-300 py-[18px]">
          <div className="mb-3 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            Colours
          </div>
          <div className="flex items-center gap-2">
            {SWATCHES.map((s) => (
              <span
                key={s.label}
                className={`h-[26px] w-[26px] ${s.bordered ? "border border-neutral-300" : ""}`}
                style={{ background: s.hex }}
              />
            ))}
            <span className="ml-1.5 text-[13px] text-neutral-700">
              Black · Navy · Beige · White
            </span>
          </div>
        </div>

        <div className="border-b border-neutral-300 py-[18px]">
          <div className="mb-2.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            Fit
          </div>
          <div className="text-[17px] font-semibold">
            Relaxed · Straight · Oversized
          </div>
        </div>

        <div className="py-[18px]">
          <div className="mb-3 text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
            Key pieces
          </div>
          {KEY_PIECES.map((piece) => (
            <div
              key={piece.label}
              className="flex items-baseline justify-between border-t border-neutral-300 py-[9px]"
            >
              <span className="text-[16px] font-semibold">{piece.label}</span>
              <span className="text-[12px] text-neutral-700">
                {piece.strength}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-[30px] pb-8">
        <PrimaryButton onClick={start}>Start discovering</PrimaryButton>
      </div>
    </div>
  );
}
