import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Gear inspect popup — bottom-left of the bubble meets top-left of the gear piece.
 * Renders in a portal so inventory overflow / stacking never clips it.
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

      // Anchor: bottom-left of popup ↔ top-left of gear (via translateY(-100%)).
      let left = r.left;
      let top = r.top;

      if (left + bw > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - pad - bw);
      }
      if (left < pad) left = pad;

      // Keep as much of the preferred vertical anchor as possible.
      if (top - bh < pad) {
        top = pad + bh;
      }
      if (top > window.innerHeight - pad) {
        top = window.innerHeight - pad;
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
