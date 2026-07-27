import React from "react";

// Wraps content so it stays within the available area without page scroll.
// Previously used `transform: scale()` to shrink-to-fit, which rasterized the
// whole subtree and caused soft/blurry text. Now it renders children at native
// device-pixel resolution and allows overflow scrolling if content is taller
// than the container — no transforms, no composited layers.
export default function FitToScreen({ children }) {
  return (
    <div className="flex-1 min-h-0 w-full overflow-auto">
      <div className="w-full">{children}</div>
    </div>
  );
}