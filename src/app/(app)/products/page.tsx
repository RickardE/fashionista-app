"use client";

import { FeedDeck } from "@/components/FeedDeck";
import { TopBar } from "@/components/TopBar";

export default function ProductsPage() {
  return (
    <>
      <TopBar title="Products" />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <FeedDeck />
      </main>
    </>
  );
}
