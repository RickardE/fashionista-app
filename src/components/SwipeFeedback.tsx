"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import { CloseIcon, HeartIcon } from "@/components/icons";

/** How far (px) the card must travel before an icon starts to show. */
const FADE_START = 16;
/** Kept below full strength so the photo stays the focus. */
const MAX_OPACITY = 0.9;

/**
 * A faded like (heart) or dislike (✕) icon centred on the photo of a card
 * being swiped. It moves with the card and reaches full strength exactly at
 * the distance where releasing the card makes the decision.
 */
export function SwipeFeedback({ x, decisionDistance }: { x: MotionValue<number>; decisionDistance: number }) {
  const likeOpacity = useTransform(x, [FADE_START, decisionDistance], [0, MAX_OPACITY]);
  const likeScale = useTransform(x, [FADE_START, decisionDistance], [0.8, 1]);
  const passOpacity = useTransform(x, [-decisionDistance, -FADE_START], [MAX_OPACITY, 0]);
  const passScale = useTransform(x, [-decisionDistance, -FADE_START], [1, 0.8]);

  const circle =
    "pointer-events-none absolute top-[calc(50%-74px)] left-1/2 z-10 -mt-12 -ml-12 flex h-24 w-24 items-center justify-center rounded-full bg-paper/75 backdrop-blur-sm";

  return (
    <>
      <motion.div aria-hidden style={{ opacity: likeOpacity, scale: likeScale }} className={circle}>
        <HeartIcon filled className="h-11 w-11 text-accent-700" />
      </motion.div>
      <motion.div aria-hidden style={{ opacity: passOpacity, scale: passScale }} className={circle}>
        <CloseIcon className="h-11 w-11 text-ink" />
      </motion.div>
    </>
  );
}
