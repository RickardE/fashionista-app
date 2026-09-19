"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";

const TRANSITION = { duration: 0.44, ease: [0.22, 0.61, 0.36, 1] as const };

export function Modal({
  children,
}: {
  children: (close: (to?: string) => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);

  // Passing `to` lets a link inside the modal (e.g. "Build an outfit") close
  // this intercepted sheet first and navigate only once it's gone — routing
  // straight to a page outside the modal's own intercepted segment would
  // otherwise leave this parallel-route slot stuck on top of it.
  function close(to?: string) {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      if (to) router.push(to);
      else router.back();
    }, TRANSITION.duration * 1000);
  }

  return (
    <div
      className={`fixed inset-0 z-40 mx-auto flex max-w-[480px] justify-center ${
        closing ? "pointer-events-none" : ""
      }`}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: closing ? "100%" : 0 }}
        transition={TRANSITION}
        className="h-dvh w-full bg-paper"
      >
        {children(close)}
      </motion.div>
    </div>
  );
}
