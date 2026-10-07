"use client";

import { OutfitDeck } from "@/components/OutfitDeck";
import { StyleSelector } from "@/components/StyleSelector";
import { TopBar } from "@/components/TopBar";

export default function OutfitsPage() {
  return (
    <>
      <TopBar title="Outfits" metaSlot={<StyleSelector />} />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <OutfitDeck />
      </main>
    </>
  );
}
