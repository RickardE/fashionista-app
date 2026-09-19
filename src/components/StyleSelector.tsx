"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronDownIcon, PlusIcon } from "@/components/icons";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export function StyleSelector() {
  const router = useRouter();
  const { styles, activeStyle, setActiveStyle } = useStyleProfile();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative pt-[7px]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[12px] font-medium text-neutral-700"
      >
        <span>{activeStyle.name}</span>
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
          <div className="absolute top-full right-0 z-40 mt-2 w-48 border border-neutral-300 bg-paper shadow-[0_14px_30px_rgba(32,30,29,0.14)]">
            <div className="px-3.5 pt-3 pb-1.5 text-[9px] font-semibold tracking-[0.12em] text-neutral-500 uppercase">
              Select style
            </div>
            {styles.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setActiveStyle(s.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between border-b border-neutral-200 px-3.5 py-3 text-left last:border-b-0"
              >
                <span className="text-[13px] font-medium">{s.name}</span>
                {s.id === activeStyle.id && <CheckIcon />}
              </button>
            ))}
            <button
              onClick={() => {
                setOpen(false);
                router.push("/style/new");
              }}
              className="flex w-full items-center gap-1.5 px-3.5 py-3 text-left text-[12px] font-medium text-neutral-700"
            >
              <PlusIcon />
              Create new style
            </button>
          </div>
        </>
      )}
    </div>
  );
}
