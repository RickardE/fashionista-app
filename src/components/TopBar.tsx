"use client";

import Link from "next/link";
import { GearIcon } from "@/components/icons";
import { tuningLabel } from "@/lib/personalization";
import { useStyleProfile } from "@/lib/store/style-profile-context";

export function TopBar({
  title,
  meta,
  metaSlot,
}: {
  title: string;
  meta?: string;
  metaSlot?: React.ReactNode;
}) {
  const { activeStyle } = useStyleProfile();

  return (
    <header className="z-20 flex-none bg-paper [padding-top:env(safe-area-inset-top)]">
      <div className="flex h-12 items-center justify-between px-[22px]">
        <span className="text-[11px] font-semibold tracking-[0.42em] uppercase">
          STYLEAI
        </span>
        <Link
          href="/profile"
          className="flex items-center gap-[7px] text-[10px] font-semibold tracking-[0.1em] text-neutral-700 uppercase"
        >
          <span>{tuningLabel(activeStyle.interactions)}</span>
          <GearIcon />
        </Link>
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
