"use client";

import type { ShopperGender } from "@/lib/types";

export const GENDER_LABEL: Record<ShopperGender, string> = { men: "Men", women: "Women" };

/** Men / Women picker. Only these two are offered; unisex products show for both. */
export function GenderToggle({
  value,
  onChange,
}: {
  value: ShopperGender | undefined;
  onChange: (gender: ShopperGender) => void;
}) {
  return (
    <div className="flex gap-2.5" role="radiogroup" aria-label="Shopping for">
      {(["men", "women"] as const).map((g) => (
        <button
          key={g}
          role="radio"
          aria-checked={value === g}
          onClick={() => onChange(g)}
          className={`h-11 flex-1 border text-[12px] font-semibold tracking-[0.12em] uppercase transition-colors ${
            value === g ? "border-ink bg-ink text-paper" : "border-neutral-400 text-ink hover:border-ink"
          }`}
        >
          {GENDER_LABEL[g]}
        </button>
      ))}
    </div>
  );
}

/** Full-card prompt shown in place of a feed until the active style has a gender. */
export function GenderChoiceCard({ onChoose }: { onChoose: (gender: ShopperGender) => void }) {
  return (
    <div className="absolute inset-0 flex h-full w-full flex-col justify-center bg-paper px-[22px]">
      <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
        Before we start
      </div>
      <div className="mt-4 font-serif text-[34px] leading-[1.08]">
        Who are you
        <br />
        shopping for?
      </div>
      <p className="mt-3.5 max-w-[30ch] text-[14px] leading-[1.6] text-neutral-700">
        Products and outfits will follow this. You can change it per style later.
      </p>
      <div className="mt-[26px] mb-[22px] h-[2px] bg-divider" />
      <GenderToggle value={undefined} onChange={onChoose} />
    </div>
  );
}
