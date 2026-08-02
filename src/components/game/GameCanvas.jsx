import React, { useState, useLayoutEffect, useRef } from "react";
import { getDisplayScale, getDisplayAnchor } from "@/lib/displayScale";
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  resolveGameViewportRect,
  gameViewportCssVars,
} from "@/lib/gameViewport";

/**
 * Physical 16:9 game viewport host.
 * Layout reflows in real CSS pixels (no root transform: scale) so UI stays sharp.
 * Outer shell letterboxes/pillarboxes with a thematic near-black field.
 */
export default function GameCanvas({ children, className = "" }) {
  const shellRef = useRef(null);
  const [dims, setDims] = useState({
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    left: 0,
    top: 0,
  });

  useLayoutEffect(() => {
    const recompute = () => {
      const shell = shellRef.current;
      const vw = shell?.clientWidth || window.innerWidth;
      const vh = shell?.clientHeight || window.innerHeight;
      const next = resolveGameViewportRect(
        vw,
        vh,
        getDisplayScale(),
        getDisplayAnchor(),
      );
      setDims((prev) => {
        if (
          prev.width === next.width
          && prev.height === next.height
          && prev.left === next.left
          && prev.top === next.top
        ) {
          return prev;
        }
        return next;
      });
    };

    recompute();

    const shell = shellRef.current;
    let ro;
    if (typeof ResizeObserver !== "undefined" && shell) {
      ro = new ResizeObserver(() => recompute());
      ro.observe(shell);
    }

    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    window.addEventListener("display-scale-change", recompute);
    window.addEventListener("display-anchor-change", recompute);
    window.addEventListener("storage", recompute);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", recompute);
      window.removeEventListener("orientationchange", recompute);
      window.removeEventListener("display-scale-change", recompute);
      window.removeEventListener("display-anchor-change", recompute);
      window.removeEventListener("storage", recompute);
    };
  }, []);

  return (
    <div
      ref={shellRef}
      id="game-shell"
      className="fixed inset-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at center, rgba(25, 15, 40, 0.65), rgba(3, 4, 8, 1) 70%)",
      }}
    >
      <div
        id="game-viewport"
        className={"absolute overflow-hidden " + className}
        style={{
          width: dims.width,
          height: dims.height,
          left: dims.left,
          top: dims.top,
          containerType: "size",
          containerName: "game",
          ...gameViewportCssVars(dims),
        }}
      >
        <div id="game-layout" className="relative h-full w-full min-h-0">
          {children}
          {dims.width > 0 && dims.width < 900 && (
            <div
              className="pointer-events-none absolute bottom-2 left-1/2 z-[210] -translate-x-1/2 rounded-md border border-border/50 bg-card/90 px-3 py-1.5 text-[10px] text-muted-foreground shadow-lg"
              role="status"
            >
              For the best experience, enlarge your browser window.
            </div>
          )}
        </div>
        {/* Full-frame overlays (combat, etc.) — stays inside the 16:9 pane.
            Host ignores hits when empty; direct children re-enable pointer events. */}
        <div
          id="game-viewport-overlay-root"
          className="pointer-events-none absolute inset-0 z-[200] [&>*]:pointer-events-auto"
        />
      </div>
    </div>
  );
}
