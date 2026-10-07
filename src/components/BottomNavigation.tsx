"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FeedTabIcon, OutfitsTabIcon, SavedTabIcon } from "@/components/icons";

/** The two swipe feeds are separate destinations; Saved holds both kinds. */
const TABS = [
  { href: "/products", label: "Products", Icon: FeedTabIcon },
  { href: "/outfits", label: "Outfits", Icon: OutfitsTabIcon },
  { href: "/saved", label: "Saved", Icon: SavedTabIcon },
] as const;

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="z-20 flex h-[76px] flex-none items-start border-t border-neutral-300 bg-paper [padding-bottom:env(safe-area-inset-bottom)]">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-[6px] pt-[11px] ${
              active ? "opacity-100" : "opacity-75"
            }`}
          >
            <Icon />
            <span className="text-[10px] font-semibold tracking-[0.08em] uppercase">
              {label}
            </span>
            <span
              className={`h-[2px] w-[14px] ${active ? "bg-ink" : "bg-transparent"}`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
