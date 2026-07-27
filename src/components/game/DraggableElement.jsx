import React, { useEffect, useRef, useState } from "react";
import { motion, useMotionValue } from "framer-motion";
import { Move } from "lucide-react";
import { useSiteConfig, HUB_GRID_SIZE } from "@/lib/SiteConfigContext";

// Wraps a hub element so an admin in edit-mode can drag it freely.
// The drop position is stored as an ABSOLUTE fraction of the viewport (0..1)
// and re-applied by measuring the element's natural flow position on the
// current screen, so a button lands at the same spot on every player's screen
// regardless of resolution or mobile/desktop layout reflow.
export default function DraggableElement({ id, editMode, positions, onSave, children, className = "" }) {
  const { snapGrid } = useSiteConfig();
  const pos = positions[id];
  const hasPos = pos && typeof pos.x === "number" && typeof pos.y === "number";
  const elRef = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  const [vh, setVh] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 720));
  // Defer the first placement until entrance animations settle, so the measured
  // natural position isn't mid-animation.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onResize = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    window.addEventListener("resize", onResize);
    const t = setTimeout(() => setReady(true), 450);
    return () => { window.removeEventListener("resize", onResize); clearTimeout(t); };
  }, []);

  // Translate the element from its natural flow position to its stored
  // viewport-fraction. Runs after entrance animations settle, on resize, and
  // whenever the stored position changes — never fights an in-progress drag
  // (pos only changes at dragEnd, when the drag is already over).
  // Horizontal placement anchors to the viewport width the element was
  // positioned on (refVw) and centers that reference frame in the current
  // viewport. On a wider screen the arrangement keeps the same gaps as the edit
  // screen (not stretched) and stays centered (not shifted left); on a narrower
  // screen it scales down to fit. Positions saved before this change have no
  // refVw and fall back to pure proportional placement (previous behavior).
  useEffect(() => {
    if (!ready || !hasPos || !elRef.current) return;
    const el = elRef.current;
    const r = el.getBoundingClientRect();
    const naturalLeft = r.left - x.get();
    const naturalTop = r.top - y.get();
    const refVw = (pos && pos.refVw) || vw;
    const effVw = Math.min(vw, refVw);
    const xOffset = (vw - effVw) / 2;
    x.set(xOffset + pos.x * effVw - naturalLeft);
    y.set(pos.y * vh - naturalTop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hasPos, pos, vw, vh]);

  return (
    <motion.div
      ref={elRef}
      drag={editMode}
      dragMomentum={false}
      style={{ x, y }}
      onDragEnd={() => {
        const el = elRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        let leftPx = r.left;
        let topPx = r.top;
        if (snapGrid) {
          leftPx = Math.round(leftPx / HUB_GRID_SIZE) * HUB_GRID_SIZE;
          topPx = Math.round(topPx / HUB_GRID_SIZE) * HUB_GRID_SIZE;
        }
        onSave(id, {
          x: leftPx / window.innerWidth,
          y: topPx / window.innerHeight,
          refVw: window.innerWidth,
        });
      }}
      className={`relative ${editMode ? "cursor-move ring-2 ring-primary/50 ring-offset-2 ring-offset-background rounded-xl" : ""} ${className}`}
    >
      {editMode && (
        <div className="absolute -top-2 -right-2 z-50 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg pointer-events-none">
          <Move className="w-3 h-3" />
        </div>
      )}
      <div className={editMode ? "pointer-events-none select-none" : ""}>{children}</div>
    </motion.div>
  );
}