"use client";

import { useState } from "react";
import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import { PERSONAL_STYLES, styleById } from "@/lib/data/styles";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export function StyleSelector() {
  const { state, setActiveStyle } = useStyleProfile();
  const [open, setOpen] = useState(false);
  const active = styleById(state.activeStyleId);

  return (
    <div className="relative pt-[7px]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[12px] font-medium text-neutral-700"
      >
        <span>{active.label}</span>
        <ChevronDownIcon
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          <button
            aria-label="Close style menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute top-full right-0 z-40 mt-2 w-44 border border-neutral-300 bg-paper shadow-[0_14px_30px_rgba(32,30,29,0.14)]">
            {PERSONAL_STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setActiveStyle(s.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between border-b border-neutral-200 px-3.5 py-3 text-left last:border-b-0"
              >
                <span className="text-[13px] font-medium">{s.label}</span>
                {s.id === active.id && <CheckIcon />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
