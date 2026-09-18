"use client";

import { FeedDeck } from "@/components/FeedDeck";
import { TopBar } from "@/components/TopBar";

export default function DiscoverPage() {
  return (
    <>
      <TopBar title="For You" />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <FeedDeck />
      </main>
    </>
  );
}
