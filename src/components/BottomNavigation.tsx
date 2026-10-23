"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FeedTabIcon, OutfitsTabIcon, SavedTabIcon } from "@/components/icons";
import { SAVED_PULSE_EVENT } from "@/lib/tips";

/** The two swipe feeds are separate destinations; Saved holds both kinds. */
const TABS = [
  { href: "/products", label: "Products", Icon: FeedTabIcon },
  { href: "/outfits", label: "Outfits", Icon: OutfitsTabIcon },
  { href: "/saved", label: "Saved", Icon: SavedTabIcon },
] as const;

export function BottomNavigation() {
  const pathname = usePathname();
  // Each save draws the eye to Saved, so people learn where likes go.
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const onPulse = () => setPulse((n) => n + 1);
    window.addEventListener(SAVED_PULSE_EVENT, onPulse);
    return () => window.removeEventListener(SAVED_PULSE_EVENT, onPulse);
  }, []);

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
            <span key={href === "/saved" ? pulse : undefined} className={href === "/saved" && pulse ? "animate-pop" : undefined}>
              <Icon />
            </span>
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
