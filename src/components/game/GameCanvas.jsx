import React, { useState, useLayoutEffect } from "react";
import { getDisplayScale, getDisplayAnchor } from "@/lib/displayScale";

// Dynamic game canvas. Layout reflows in real pixels (no transform: scale) so
// UI stays sharp at every resolution. Scale modes (see displayScale.js):
//   "auto"           — fit the 16:9 design inside the viewport (letterbox/pillarbox)
//   "cover"          — fill the screen, crop overflow
//   "fill-width"     — match viewport width (height follows 16:9 ratio)
//   "contain-height" — match viewport height (may letterbox sides)
//   number           — fixed zoom factor (e.g. 1.5)
// Anchor places the canvas left / center / right when it is narrower than the
// viewport (fixed-zoom / contain-height modes on ultrawide).
const DESIGN_W = 1920;
const DESIGN_H = 1080;
const RATIO = DESIGN_W / DESIGN_H;

export default function GameCanvas({ children, className = "" }) {
  const [dims, setDims] = useState({ width: DESIGN_W, height: DESIGN_H, left: 0, top: 0 });

  useLayoutEffect(() => {
    const recompute = () => {
      const mode = getDisplayScale();
      const anchor = getDisplayAnchor();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let width;
      let height;
      if (mode === "cover") {
        const s = Math.max(vw / DESIGN_W, vh / DESIGN_H);
        width = DESIGN_W * s;
        height = DESIGN_H * s;
      } else if (mode === "fill-width") {
        width = vw;
        height = vw / RATIO;
      } else if (mode === "contain-height") {
        height = vh;
        width = vh * RATIO;
      } else if (mode === "auto") {
        // Always preserve 16:9 — scale to fit, letterbox/pillarbox the remainder.
        const s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
        width = DESIGN_W * s;
        height = DESIGN_H * s;
      } else {
        const s = Number(mode) || Math.min(vw / DESIGN_W, vh / DESIGN_H);
        width = DESIGN_W * s;
        height = DESIGN_H * s;
      }

      let left;
      let top;
      if (width <= vw) {
        if (anchor === "left") left = 0;
        else if (anchor === "right") left = vw - width;
        else left = (vw - width) / 2;
      } else {
        left = (vw - width) / 2;
      }
      top = (vh - height) / 2;

      setDims({ width, height, left, top });
    };
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    window.addEventListener("display-scale-change", recompute);
    window.addEventListener("display-anchor-change", recompute);
    window.addEventListener("storage", recompute);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("orientationchange", recompute);
      window.removeEventListener("display-scale-change", recompute);
      window.removeEventListener("display-anchor-change", recompute);
      window.removeEventListener("storage", recompute);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div
        className={"absolute " + className}
        style={{
          width: dims.width,
          height: dims.height,
          left: dims.left,
          top: dims.top,
          "--game-canvas-w": `${dims.width}px`,
          "--game-canvas-h": `${dims.height}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}