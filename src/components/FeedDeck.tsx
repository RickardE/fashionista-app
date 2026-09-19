"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { LookFeedCard } from "@/components/LookFeedCard";
import { ProductFeedCard } from "@/components/ProductFeedCard";
import { PRODUCTS_BY_ID } from "@/lib/data/products";
import { generateOutfit } from "@/lib/outfits";
import { useStyleProfile } from "@/lib/store/style-profile-context";

/** Show a complete-look interstitial every Nth card, purely as a local UI beat —
 * it never consumes a feedIndex slot, so the underlying product order/ranking
 * is untouched. */
const LOOK_INTERVAL = 4;

export function FeedDeck() {
  const router = useRouter();
  const pathname = usePathname();
  const { state, next, react, resetFeed, effectiveAffinity, saveOutfit } =
    useStyleProfile();
  const { feedOrder, feedIndex } = state;

  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const flash = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 2400);
  }, []);

  const [dismissedLookAt, setDismissedLookAt] = useState<number | null>(null);
  const showLook =
    feedIndex > 0 &&
    feedIndex % LOOK_INTERVAL === 0 &&
    feedIndex !== dismissedLookAt &&
    feedIndex < feedOrder.length;
  const lookAnchorId = showLook ? feedOrder[feedIndex] : null;
  const lookItems = useMemo(
    () => (lookAnchorId ? generateOutfit(lookAnchorId, effectiveAffinity) : null),
    [lookAnchorId, effectiveAffinity],
  );

  useEffect(() => {
    if (pathname !== "/discover") return;
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
  }, [pathname, feedIndex, feedOrder]);

  function decide(direction: 1 | -1) {
    const id = feedOrder[feedIndex];
    if (!id) return;
    react(id, direction);
    if (direction > 0) {
      flash("Saved to your collection");
    } else if (state.interactions + 1 === 3) {
      flash("Noted — fewer of those");
    }
    if (state.interactions + 1 === 4) {
      setTimeout(() => flash("Your feed is getting to know you"), 2600);
    }
    next();
  }

  function decideLook(direction: 1 | -1) {
    if (direction > 0 && lookAnchorId && lookItems) {
      saveOutfit(lookAnchorId, lookItems);
      flash("Look saved to your collection");
    }
    setDismissedLookAt(feedIndex);
  }

  const visibleRange = [feedIndex, feedIndex + 1].filter(
    (i) => i >= 0 && i <= feedOrder.length,
  );

  return (
    <div className="relative h-full w-full overflow-hidden">
      {showLook && lookAnchorId && lookItems ? (
        <>
          <LookFeedCard
            key={`look-${feedIndex}`}
            items={lookItems}
            onOpen={() => router.push(`/outfit/${lookAnchorId}`)}
            onDecide={decideLook}
          />
          <ProductFeedCard
            key={feedOrder[feedIndex]}
            product={PRODUCTS_BY_ID[feedOrder[feedIndex]]}
            stackPosition={1}
            onOpen={() => router.push(`/product/${feedOrder[feedIndex]}`)}
            onDecide={(direction) => decide(direction)}
          />
        </>
      ) : (
        visibleRange.map((i) => {
          const isEnd = i === feedOrder.length;
          const key = isEnd ? "__end__" : feedOrder[i];
          const stackPosition = (i - feedIndex) as 0 | 1;

          return isEnd ? (
            <div
              key={key}
              className="absolute inset-0 flex h-full w-full flex-col justify-center bg-paper px-[22px]"
              style={{
                transform:
                  stackPosition === 0
                    ? undefined
                    : "scale(0.94) translateY(14px)",
                opacity: stackPosition === 0 ? 1 : 0.92,
                pointerEvents: stackPosition === 0 ? undefined : "none",
              }}
              aria-hidden={stackPosition !== 0}
            >
              <div className="text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase">
                That&rsquo;s today&rsquo;s edit
              </div>
              <div className="mt-4 font-serif text-[34px] leading-[1.08]">
                You&rsquo;ve seen
                <br />
                everything new.
              </div>
              <p className="mt-3.5 max-w-[28ch] text-[14px] leading-[1.6] text-neutral-700">
                A fresh selection arrives each morning, shaped by what you
                liked today.
              </p>
              <div className="mt-[26px] mb-[22px] h-[2px] bg-divider" />
              <button
                onClick={resetFeed}
                className="flex h-[52px] items-center justify-between border border-neutral-400 px-5 text-[13px] font-semibold tracking-[0.1em] uppercase transition-colors hover:border-ink"
              >
                <span>Look again</span>
                <ChevronRightIcon />
              </button>
            </div>
          ) : (
            <ProductFeedCard
              key={key}
              product={PRODUCTS_BY_ID[feedOrder[i]]}
              stackPosition={stackPosition}
              onOpen={() => router.push(`/product/${feedOrder[i]}`)}
              onDecide={(direction) => decide(direction)}
            />
          );
        })
      )}

      <div
        className="pointer-events-none absolute top-0 right-0 left-0 z-10 bg-ink px-[22px] py-[10px] text-[10px] font-semibold tracking-[0.1em] text-paper uppercase transition-opacity duration-[400ms]"
        style={{ opacity: notice ? 1 : 0 }}
      >
        {notice || " "}
      </div>

      <div
        className="pointer-events-none absolute right-0 bottom-2.5 left-0 flex items-center justify-center gap-[7px] text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase transition-opacity duration-500"
        style={{ opacity: state.showSwipeHint ? 1 : 0 }}
      >
        <ChevronLeftIcon />
        <span>Swipe to explore</span>
        <ChevronRightIcon />
      </div>
    </div>
  );
}
