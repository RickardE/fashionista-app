"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { StyleAvatar } from "@/components/StyleAvatar";
import { useStyleProfile } from "@/lib/store/style-profile-context";

/** A brief full-screen beat when the user switches style, like changing profiles. */
export function StyleSwitchOverlay() {
  const { styleSwitch, state } = useStyleProfile();
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!styleSwitch) return;
    const timer = setTimeout(() => setDismissedAt(styleSwitch.at), 950);
    return () => clearTimeout(timer);
  }, [styleSwitch]);

  const visible = !!styleSwitch && styleSwitch.at !== dismissedAt;
  const style = styleSwitch ? state.styles[styleSwitch.id] : undefined;

  return (
    <AnimatePresence>
      {visible && style && (
        <motion.div
          key={styleSwitch!.at}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-0 z-[60] flex justify-center"
        >
          <div className="flex w-full max-w-[480px] flex-col items-center justify-center bg-paper">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
              className="flex flex-col items-center"
            >
              <StyleAvatar style={style} size={64} />
              <div className="mt-5 font-serif text-[34px] leading-none">
                {style.name}
              </div>
              <div className="mt-3 text-[12px] text-neutral-700">
                {style.description}
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
