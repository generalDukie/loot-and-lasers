import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getOverlayClampBounds } from "@/lib/gameViewportDom";

/**
 * Gear inspect popup — bottom-left of the bubble meets top-left of the gear piece.
 * Renders in a portal so inventory overflow / stacking never clips it.
 * Clamped to the 16:9 game viewport (not browser letterbox bars).
 */
export default function GearInspectPortal({
  anchorRef,
  open,
  onClose,
  onKeepOpen,
  children,
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const bubbleRef = useRef(null);

  useEffect(() => {
    if (!open || !anchorRef?.current) return undefined;

    const place = () => {
      const r = anchorRef.current.getBoundingClientRect();
      const pad = 8;
      const bw = bubbleRef.current?.offsetWidth || 288;
      const bh = bubbleRef.current?.offsetHeight || 300;
      const bounds = getOverlayClampBounds(pad);

      let left = r.left;
      let top = r.top;

      if (left + bw > bounds.right) {
        left = Math.max(bounds.left, bounds.right - bw);
      }
      if (left < bounds.left) left = bounds.left;

      if (top - bh < bounds.top) {
        top = bounds.top + bh;
      }
      if (top > bounds.bottom) {
        top = bounds.bottom;
      }

      setPos({ top, left });
    };

    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, children]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={bubbleRef}
      className="fixed z-[90] pointer-events-auto"
      style={{ top: pos.top, left: pos.left, transform: "translateY(-100%)" }}
      onMouseEnter={onKeepOpen}
      onMouseLeave={onClose}
    >
      {children}
    </div>,
    document.body,
  );
}
