"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";

/** How far (px) the card must travel before a stamp starts to show. */
const FADE_START = 16;

/**
 * The LIKE / NOT FOR ME stamps on a card being swiped. They sit on the card
 * itself (so they move and tilt with it), in the top corner of the photo
 * that faces away from the swipe, and reach full strength exactly at the
 * distance where releasing the card makes the decision.
 */
export function SwipeStamps({ x, decisionDistance }: { x: MotionValue<number>; decisionDistance: number }) {
  const likeOpacity = useTransform(x, [FADE_START, decisionDistance], [0, 1]);
  const likeScale = useTransform(x, [FADE_START, decisionDistance], [0.86, 1]);
  const passOpacity = useTransform(x, [-decisionDistance, -FADE_START], [1, 0]);
  const passScale = useTransform(x, [-decisionDistance, -FADE_START], [1, 0.86]);

  return (
    <>
      <motion.div
        aria-hidden
        style={{ opacity: likeOpacity, scale: likeScale, rotate: -12 }}
        className="pointer-events-none absolute top-7 left-5 z-10 origin-top-left"
      >
        <span className="block border-[3px] border-accent-700 bg-paper/85 px-3 pt-[7px] pb-[6px] text-[26px] leading-none font-semibold tracking-[0.12em] text-accent-700 uppercase">
          Like
        </span>
      </motion.div>
      <motion.div
        aria-hidden
        style={{ opacity: passOpacity, scale: passScale, rotate: 12 }}
        className="pointer-events-none absolute top-7 right-5 z-10 origin-top-right"
      >
        <span className="block border-[3px] border-ink bg-paper/85 px-3 pt-[7px] pb-[6px] text-[22px] leading-none font-semibold tracking-[0.12em] whitespace-nowrap text-ink uppercase">
          Not for me
        </span>
      </motion.div>
    </>
  );
}
