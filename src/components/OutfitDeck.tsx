"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FeedStatusCard } from "@/components/FeedStatusCard";
import { GenderChoiceCard } from "@/components/GenderChoice";
import { OutfitFeedCard } from "@/components/OutfitFeedCard";
import { TipBanner } from "@/components/TipBanner";
import { isUndoKey, UndoSwipeButton } from "@/components/UndoSwipeButton";
import { outfitHref } from "@/lib/outfits";
import { useStyleProfile } from "@/lib/store/style-profile-context";
import { useOutfitFeed } from "@/lib/store/use-outfit-feed";
import { pulseSavedTab, useTips } from "@/lib/tips";

/** The Outfits feed: swipe whole outfits. Love saves the outfit to the active style. */
export function OutfitDeck() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeStyle, saveOutfit, reactOutfit, chooseGender, lastSwipe, rememberSwipe, undoSwipe } =
    useStyleProfile();
  const feed = useOutfitFeed();
  const { outfit, nextOutfit } = feed;
  const tips = useTips();
  // Shown with the undo button the first time it appears, until the next swipe.
  const [undoTip, setUndoTip] = useState(false);

  // Undoable while the swiped outfit is still the one just behind this card.
  const undoable =
    lastSwipe?.kind === "outfit" && lastSwipe.styleId === activeStyle.id && lastSwipe.outfitKey === feed.previousKey
      ? lastSwipe
      : null;
  // The outfit an undo just brought back, and the side it left by.
  const [returning, setReturning] = useState<{ key: string; from: 1 | -1 } | null>(null);

  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 2400);
  }, []);

  function decide(direction: 1 | -1) {
    if (!outfit) return;
    const tags = outfit.pieces.flatMap((p) => p.product.tags);
    reactOutfit(tags, direction);
    let savedOutfitId: string | undefined;
    if (direction > 0) {
      savedOutfitId = saveOutfit(outfit.anchorId, outfit.items);
      flash(`Outfit saved to ${activeStyle.name}`);
      if (!tips.hasSeen("first-like")) {
        pulseSavedTab();
        tips.markSeen("first-like");
      }
    } else if (!tips.hasSeen("first-pass")) {
      flash("Got it, less like this");
      tips.markSeen("first-pass");
    } else {
      setNotice("");
    }
    tips.markSeen("outfits");
    setUndoTip(!tips.hasSeen("undo"));
    tips.markSeen("undo");
    const cover = outfit.pieces.find((p) => p.product.id === outfit.anchorId) ?? outfit.pieces[0];
    rememberSwipe({
      kind: "outfit",
      styleId: activeStyle.id,
      outfitKey: outfit.key,
      tags,
      direction,
      savedOutfitId,
      image: cover.product.image,
      label: `Outfit · ${outfit.pieces.length} pieces`,
    });
    setReturning(null);
    feed.advance();
  }

  function undo() {
    if (!undoable) return;
    setReturning({ key: undoable.outfitKey, from: undoable.direction });
    setNotice("");
    setUndoTip(false);
    undoSwipe();
    feed.back();
  }

  useEffect(() => {
    if (pathname !== "/outfits") return;
    function onKey(e: KeyboardEvent) {
      if (isUndoKey(e)) {
        e.preventDefault();
        undo();
        return;
      }
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
  }, [pathname, outfit, undoable]);

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
            enterFrom={returning?.key === outfit.key ? returning.from : undefined}
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

      {feed.status !== "needs_gender" && !tips.hasSeen("outfits") && (
        <TipBanner onDismiss={() => tips.markSeen("outfits")}>
          Whole looks, put together for you. Swipe right to save one, or tap it to swap pieces.
        </TipBanner>
      )}

      <UndoSwipeButton
        visible={!!undoable && feed.status !== "needs_gender"}
        tip={undoTip}
        image={undoable?.image}
        label={undoable?.label}
        onUndo={undo}
      />

      <div
        className="pointer-events-none absolute top-0 right-0 left-0 z-10 bg-ink px-[22px] py-[10px] text-[10px] font-semibold tracking-[0.1em] text-paper uppercase transition-opacity duration-[400ms]"
        style={{ opacity: notice ? 1 : 0 }}
      >
        {notice || " "}
      </div>
    </div>
  );
}
