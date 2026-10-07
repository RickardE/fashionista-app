"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FeedStatusCard } from "@/components/FeedStatusCard";
import { GenderChoiceCard } from "@/components/GenderChoice";
import { OutfitFeedCard } from "@/components/OutfitFeedCard";
import { outfitHref } from "@/lib/outfits";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import { useOutfitFeed } from "@/lib/store/use-outfit-feed";

/** The Outfits feed: swipe whole outfits. Love saves the outfit to the active style. */
export function OutfitDeck() {
  const router = useRouter();
  const pathname = usePathname();
  const { saveOutfit, reactOutfit, chooseGender } = useStyleProfile();
  const feed = useOutfitFeed();
  const { outfit, nextOutfit } = feed;

  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 2400);
  }, []);

  function decide(direction: 1 | -1) {
    if (!outfit) return;
    reactOutfit(
      outfit.pieces.flatMap((p) => p.product.tags),
      direction,
    );
    if (direction > 0) {
      saveOutfit(outfit.anchorId, outfit.items);
      flash("Outfit saved to your collection");
    }
    feed.advance();
  }

  useEffect(() => {
    if (pathname !== "/outfits") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        decide(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        decide(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, outfit]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {feed.status === "needs_gender" ? (
        <GenderChoiceCard onChoose={chooseGender} />
      ) : outfit ? (
        <>
          {nextOutfit && (
            <OutfitFeedCard
              key={nextOutfit.key}
              pieces={nextOutfit.pieces}
              stackPosition={1}
              onOpen={() => {}}
              onDecide={() => {}}
            />
          )}
          <OutfitFeedCard
            key={outfit.key}
            pieces={outfit.pieces}
            stackPosition={0}
            onOpen={() => router.push(outfitHref(outfit.anchorId, outfit.items))}
            onDecide={decide}
          />
        </>
      ) : feed.status === "error" ? (
        <FeedStatusCard
          kicker="Something went wrong"
          title={<>We couldn&rsquo;t put<br />outfits together.</>}
          body="The product service didn’t respond. Check your connection and try again."
          action={{ label: "Try again", onClick: feed.retry }}
        />
      ) : (
        <FeedStatusCard kicker="One moment" title={<>Putting outfits<br />together&hellip;</>} />
      )}

      <div
        className="pointer-events-none absolute top-0 right-0 left-0 z-10 bg-ink px-[22px] py-[10px] text-[10px] font-semibold tracking-[0.1em] text-paper uppercase transition-opacity duration-[400ms]"
        style={{ opacity: notice ? 1 : 0 }}
      >
        {notice || " "}
      </div>
    </div>
  );
}
