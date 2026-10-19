"use client";

import Link from "next/link";
import { SearchIcon } from "@/components/icons";
import { StyleSelector } from "@/components/StyleSelector";

/** The app's header: wordmark, search and the active style (the style switcher), then the page title. */
export function TopBar({ title }: { title: string }) {
  return (
    <header className="z-20 flex-none bg-paper [padding-top:env(safe-area-inset-top)]">
      <div className="flex h-12 items-center justify-between px-[22px]">
        <span className="text-[11px] font-semibold tracking-[0.42em] uppercase">
          STYLE
        </span>
        <div className="flex items-center gap-2">
          <Link
            href="/search"
            aria-label="Search products"
            className="flex h-8 w-8 items-center justify-center text-neutral-700"
          >
            <SearchIcon />
          </Link>
          <StyleSelector />
        </div>
      </div>
      <div className="flex h-11 items-start px-[22px]">
        <span className="truncate font-serif text-[26px] leading-[1.1]">{title}</span>
      </div>
    </header>
  );
}
