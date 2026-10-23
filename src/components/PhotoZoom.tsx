"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { CloseIcon } from "@/components/icons";

/** Furthest a photo can be zoomed in. */
const MAX_SCALE = 4;
/** Where a double tap zooms to. */
const DOUBLE_TAP_SCALE = 2.5;
/** Two taps within this many ms are a double tap. */
const DOUBLE_TAP_MS = 300;
/** A press that moves less than this (px) is a tap. */
const TAP_SLOP = 8;
/** Dragging the unzoomed photo down this far (px) closes the viewer. */
const CLOSE_DISTANCE = 110;
const SETTLE = { type: "spring", stiffness: 420, damping: 42 } as const;

type Point = { x: number; y: number };

interface Gesture {
  /** Scale and offset when the current set of fingers went down. */
  scale: number;
  x: number;
  y: number;
  /** Midpoint of the fingers (relative to the viewer's centre) and their spread. */
  mid: Point;
  spread: number;
  moved: boolean;
  pinched: boolean;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * One photo full screen, to look at the details: pinch or double tap to zoom,
 * drag to pan, and drag the unzoomed photo down (or ✕, or Escape) to close.
 */
export function PhotoZoom({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const surface = useRef<HTMLDivElement>(null);
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // Dragging the unzoomed photo down fades the backdrop, a hint that letting go closes.
  const backdrop = useTransform(() =>
    scale.get() > 1 ? 1 : 1 - Math.min(Math.abs(y.get()) / (CLOSE_DISTANCE * 3), 0.6),
  );
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef(0);
  /** The photo's natural aspect ratio (width / height), once loaded, so panning stops at its edges. */
  const aspect = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function local(e: { clientX: number; clientY: number }): Point {
    const rect = surface.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
  }

  /** How far the photo can move from centre at scale `s` before showing past its edges. */
  function bounds(s: number): Point {
    const rect = surface.current!.getBoundingClientRect();
    const ratio = aspect.current ?? rect.width / rect.height;
    // The photo is fitted (object-contain) into the viewer.
    const width = Math.min(rect.width, rect.height * ratio);
    const height = width / ratio;
    return {
      x: Math.max(0, (s * width - rect.width) / 2),
      y: Math.max(0, (s * height - rect.height) / 2),
    };
  }

  function zoomTo(s: number, at: Point, how: "set" | "animate") {
    // Keep the photo point under `at` where it is while the scale changes.
    const k = s / scale.get();
    const max = bounds(s);
    const nx = clamp(at.x - (at.x - x.get()) * k, -max.x, max.x);
    const ny = clamp(at.y - (at.y - y.get()) * k, -max.y, max.y);
    if (how === "set") {
      scale.set(s);
      x.set(nx);
      y.set(ny);
    } else {
      animate(scale, s, SETTLE);
      animate(x, nx, SETTLE);
      animate(y, ny, SETTLE);
    }
  }

  /** Re-bases the gesture whenever a finger goes down or lifts, so the photo doesn't jump. */
  function begin() {
    const points = [...pointers.current.values()];
    const mid = {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    };
    const spread = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
    gesture.current = {
      scale: scale.get(),
      x: x.get(),
      y: y.get(),
      mid,
      spread,
      moved: gesture.current?.moved ?? false,
      pinched: gesture.current?.pinched ?? false,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture unsupported — the gesture still works without it
    }
    scale.stop();
    x.stop();
    y.stop();
    if (pointers.current.size === 0) gesture.current = null;
    pointers.current.set(e.pointerId, local(e));
    begin();
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const points = [...pointers.current.values()];
    const mid = {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    };
    if (Math.hypot(mid.x - g.mid.x, mid.y - g.mid.y) > TAP_SLOP) g.moved = true;

    if (points.length > 1 && g.spread > 0) {
      g.moved = true;
      g.pinched = true;
      const spread = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      // A little give past the limits, settled on release.
      const s = clamp((g.scale * spread) / g.spread, 0.8, MAX_SCALE * 1.15);
      // The photo point that was under the fingers' midpoint stays under it.
      scale.set(s);
      x.set(mid.x - ((g.mid.x - g.x) * s) / g.scale);
      y.set(mid.y - ((g.mid.y - g.y) * s) / g.scale);
    } else if (g.scale > 1) {
      x.set(g.x + mid.x - g.mid.x);
      y.set(g.y + mid.y - g.mid.y);
    } else if (!g.pinched) {
      y.set(g.y + mid.y - g.mid.y);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size > 0) {
      begin();
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;

    if (!g.moved) {
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        zoomTo(scale.get() > 1.01 ? 1 : DOUBLE_TAP_SCALE, local(e), "animate");
      } else {
        lastTap.current = now;
      }
      return;
    }

    const s = scale.get();
    if (s <= 1.01) {
      if (!g.pinched && Math.abs(y.get()) > CLOSE_DISTANCE) {
        onClose();
        return;
      }
      animate(scale, 1, SETTLE);
      animate(x, 0, SETTLE);
      animate(y, 0, SETTLE);
      return;
    }
    const settled = Math.min(s, MAX_SCALE);
    const max = bounds(settled);
    animate(scale, settled, SETTLE);
    animate(x, clamp(x.get(), -max.x, max.x), SETTLE);
    animate(y, clamp(y.get(), -max.y, max.y), SETTLE);
  }

  // Trackpad pinch and the mouse wheel zoom on desktop.
  function onWheel(e: React.WheelEvent) {
    const s = clamp(scale.get() * Math.exp(-e.deltaY * 0.004), 1, MAX_SCALE);
    zoomTo(s, local(e), "set");
  }

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 mx-auto max-w-[480px]"
    >
      <motion.div aria-hidden style={{ opacity: backdrop }} className="absolute inset-0 bg-paper" />
      <div
        ref={surface}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        className="absolute inset-0 touch-none overflow-hidden select-none"
      >
        <motion.div style={{ x, y, scale }} className="absolute inset-0">
          {/* The detail view's copy is already loaded, so something shows at once; the sharper one covers it. */}
          <Image src={src} alt="" fill sizes="480px" className="object-contain" draggable={false} />
          <Image
            src={src}
            alt={alt}
            fill
            sizes="200vw"
            className="object-contain"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalHeight) aspect.current = img.naturalWidth / img.naturalHeight;
            }}
          />
        </motion.div>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        autoFocus
        className="absolute top-[calc(8px+env(safe-area-inset-top))] right-3 flex h-11 w-11 items-center justify-center rounded-full bg-paper/80 backdrop-blur-sm"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
    </motion.div>,
    document.body,
  );
}
