"use client";

import { FeedDeck } from "@/components/FeedDeck";
import { StyleSelector } from "@/components/StyleSelector";
import { TopBar } from "@/components/TopBar";

export default function DiscoverPage() {
  return (
    <>
      <TopBar title="" metaSlot={<StyleSelector />} />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <FeedDeck />
      </main>
    </>
  );
}
