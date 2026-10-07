"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronDownIcon, PlusIcon } from "@/components/icons";
import { StyleAvatar } from "@/components/StyleAvatar";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export function StyleSelector({
  placement = "bar",
}: {
  /** "bar": compact, top-right of the TopBar. "inline": under a page title, left-aligned. */
  placement?: "bar" | "inline";
}) {
  const inline = placement === "inline";
  const router = useRouter();
  const { styles, activeStyle, setActiveStyle } = useStyleProfile();
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative ${inline ? "inline-block" : "pt-[2px]"}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 ${
          inline
            ? "text-[15px] font-semibold text-ink"
            : "text-[12px] font-medium text-neutral-700"
        }`}
      >
        <StyleAvatar style={activeStyle} size={inline ? 26 : 22} />
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
          <div className={`absolute top-full ${inline ? "left-0" : "right-0"} z-40 mt-2 w-60 border border-neutral-300 bg-paper shadow-[0_14px_30px_rgba(32,30,29,0.14)]`}>
            <div className="px-3.5 pt-3 pb-1.5 text-[9px] font-semibold tracking-[0.12em] text-neutral-500 uppercase">
              My styles
            </div>
            {styles.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  if (s.id !== activeStyle.id) setActiveStyle(s.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 border-b border-neutral-200 px-3.5 py-3 text-left"
              >
                <StyleAvatar style={s} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{s.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-neutral-600">
                    {s.description}
                  </span>
                </span>
                {s.id === activeStyle.id && <CheckIcon />}
              </button>
            ))}
            <button
              onClick={() => {
                setOpen(false);
                router.push("/style/new");
              }}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-[12px] font-medium text-neutral-700"
            >
              <span className="flex h-[30px] w-[30px] flex-none items-center justify-center border border-dashed border-neutral-400">
                <PlusIcon />
              </span>
              Create new style
            </button>
          </div>
        </>
      )}
    </div>
  );
}
