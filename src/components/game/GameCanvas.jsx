import React, { useState, useLayoutEffect } from "react";
import { getDisplayScale, getDisplayAnchor } from "@/lib/displayScale";

// Dynamic game canvas. The screen is authored around a 16:9 design ratio but
// the container is sized in real pixels (no transform: scale) so the browser
// re-flows layout naturally — no rasterized stretching, no sub-pixel blur, no
// stray scrollbars. The scale mode (see displayScale.js) controls how the
// 16:9 design maps onto the viewport:
//   "auto"           — fit whole design, letterbox the remainder
//   "cover"          — fill the screen, crop overflow
//   "fill-width"     — match viewport width (height follows ratio)
//   "contain-height" — match viewport height (width follows ratio)
//   number           — fixed zoom factor (e.g. 1.5)
// Anchor places the canvas left / center / right when it is narrower than the
// viewport (handy on ultrawide). Position is set via absolute coordinates so
// flex justification never leaks overflow into the document.
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
        const s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
        width = DESIGN_W * s;
        height = DESIGN_H * s;
      } else {
        const s = Number(mode) || Math.min(vw / DESIGN_W, vh / DESIGN_H);
        width = DESIGN_W * s;
        height = DESIGN_H * s;
      }

      // Horizontal anchor — only meaningful when the canvas is narrower than
      // the viewport; when it overflows we re-center so edges stay clipped.
      let left;
      if (width <= vw) {
        if (anchor === "left") left = 0;
        else if (anchor === "right") left = vw - width;
        else left = (vw - width) / 2;
      } else {
        left = (vw - width) / 2;
      }
      // Vertical: always center (top/bottom clip symmetrically on cover).
      const top = (vh - height) / 2;

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
        }}
      >
        {children}
      </div>
    </div>
  );
}