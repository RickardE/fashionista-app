"use client";

import Link from "next/link";
import { GearIcon, SearchIcon } from "@/components/icons";

export function TopBar({
  title,
  meta,
  metaSlot,
}: {
  title: string;
  meta?: string;
  metaSlot?: React.ReactNode;
}) {
  return (
    <header className="z-20 flex-none bg-paper [padding-top:env(safe-area-inset-top)]">
      <div className="flex h-12 items-center justify-between px-[22px]">
        <span className="text-[11px] font-semibold tracking-[0.42em] uppercase">
          STYLE
        </span>
        <div className="flex items-center gap-1">
          <Link
            href="/search"
            aria-label="Search products"
            className="flex h-8 w-8 items-center justify-center text-neutral-700"
          >
            <SearchIcon />
          </Link>
          <Link
            href="/profile"
            aria-label="Your styles"
            className="flex h-8 w-8 items-center justify-end text-neutral-700"
          >
            <GearIcon />
          </Link>
        </div>
      </div>
      <div className="flex h-11 items-start justify-between px-[22px]">
        <span className="font-serif text-[26px] leading-none">{title}</span>
        {metaSlot ??
          (meta && (
            <span className="pt-[7px] text-[12px] font-medium text-neutral-700">
              {meta}
            </span>
          ))}
      </div>
    </header>
  );
}
