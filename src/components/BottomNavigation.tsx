"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FeedTabIcon,
  ProfileTabIcon,
  SavedTabIcon,
  SearchIcon,
} from "@/components/icons";

const TABS = [
  { href: "/discover", label: "For You", Icon: FeedTabIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/saved", label: "Saved", Icon: SavedTabIcon },
  { href: "/profile", label: "Profile", Icon: ProfileTabIcon },
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
            className={`flex flex-1 flex-col items-center gap-[7px] pt-[11px] ${
              active ? "opacity-100" : "opacity-[0.62]"
            }`}
          >
            <Icon />
            <span className="text-[8px] font-semibold tracking-[0.16em] uppercase">
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
