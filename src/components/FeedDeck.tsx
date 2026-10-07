"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { FeedStatusCard } from "@/components/FeedStatusCard";
import { GenderChoiceCard } from "@/components/GenderChoice";
import { ProductFeedCard } from "@/components/ProductFeedCard";
import { useCatalog } from "@/lib/store/product-catalog";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import { useFeed } from "@/lib/store/use-feed";
import type { Product } from "@/lib/types";

export function FeedDeck() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeStyle, next, react, resetFeed, chooseGender } = useStyleProfile();
  const { feedOrder, feedIndex, feedExhausted } = activeStyle;
  const catalog = useCatalog();
  const feed = useFeed();

  const productAt = (i: number): Product | undefined =>
    feedOrder[i] ? catalog.get(feedOrder[i]) : undefined;
  const current = productAt(feedIndex);
  const currentState = feedOrder[feedIndex] ? catalog.stateOf(feedOrder[feedIndex]) : "idle";

  // Products that went out of stock (or vanished) since they were queued are skipped.
  useEffect(() => {
    if ((current && !current.available) || currentState === "missing") next();
  }, [current, currentState, next]);

  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const flash = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 2400);
  }, []);

  useEffect(() => {
    if (pathname !== "/products") return;
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
  }, [pathname, feedIndex, feedOrder, current]);

  function decide(direction: 1 | -1) {
    if (!current) return;
    react(current, direction);
    if (direction > 0) flash("Saved to your collection");
    next();
  }

  const visibleRange = [feedIndex, feedIndex + 1].filter(
    (i) => i >= 0 && i <= feedOrder.length,
  );

  return (
    <div className="relative h-full w-full overflow-hidden">
      {feed.status === "needs_gender" && <GenderChoiceCard onChoose={chooseGender} />}
      {feed.status !== "needs_gender" && visibleRange.map((i) => {
        const stackPosition = (i - feedIndex) as 0 | 1;
        const product = productAt(i);
        if (product) {
          return (
            <ProductFeedCard
              key={product.id}
              product={product}
              stackPosition={stackPosition}
              onOpen={() => router.push(`/product/${product.id}`)}
              onDecide={(direction) => decide(direction)}
            />
          );
        }
        const atEnd = i === feedOrder.length;
        // Behind the last card, the end card peeks through; otherwise only
        // the front position shows end/loading/error states.
        if (stackPosition !== 0 && !(atEnd && feedExhausted)) return null;
        const failed =
          (atEnd && feed.status === "error") || currentState === "error";
        if (atEnd && feedExhausted) {
          return (
            <FeedStatusCard
              key="__end__"
              behind={stackPosition !== 0}
              kicker="That’s today’s edit"
              title={<>You&rsquo;ve seen<br />everything new.</>}
              body="A fresh selection arrives each morning, shaped by what you liked today."
              action={{ label: "Look again", onClick: resetFeed }}
            />
          );
        }
        if (failed) {
          return (
            <FeedStatusCard
              key="__error__"
              kicker="Something went wrong"
              title={<>We couldn&rsquo;t load<br />your edit.</>}
              body="The product service didn’t respond. Check your connection and try again."
              action={{ label: "Try again", onClick: feed.retry }}
            />
          );
        }
        return (
          <FeedStatusCard
            key="__loading__"
            kicker="One moment"
            title={<>Pulling your<br />edit together&hellip;</>}
          />
        );
      })}

      <div
        className="pointer-events-none absolute top-0 right-0 left-0 z-10 bg-ink px-[22px] py-[10px] text-[10px] font-semibold tracking-[0.1em] text-paper uppercase transition-opacity duration-[400ms]"
        style={{ opacity: notice ? 1 : 0 }}
      >
        {notice || " "}
      </div>

      <div
        className="pointer-events-none absolute right-0 bottom-2.5 left-0 flex items-center justify-center gap-[7px] text-[10px] font-semibold tracking-[0.12em] text-neutral-700 uppercase transition-opacity duration-500"
        style={{ opacity: activeStyle.showSwipeHint && feed.status !== "needs_gender" ? 1 : 0 }}
      >
        <ChevronLeftIcon />
        <span>Swipe to explore</span>
        <ChevronRightIcon />
      </div>
    </div>
  );
}

