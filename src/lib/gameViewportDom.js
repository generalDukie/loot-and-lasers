/**
 * Viewport bounds helpers for overlays and pointer clamping.
 * Prefer the authoritative #game-viewport element when present.
 */

import { DESIGN_WIDTH } from "@/lib/gameViewport";

export const GAME_VIEWPORT_ID = "game-viewport";
export const GAME_VIEWPORT_OVERLAY_ROOT_ID = "game-viewport-overlay-root";

/** @returns {DOMRect | null} */
export function getGameViewportClientRect() {
  if (typeof document === "undefined") return null;
  const el = document.getElementById(GAME_VIEWPORT_ID);
  return el ? el.getBoundingClientRect() : null;
}

/** Portal mount for fullscreen-in-game overlays (dialogs, combat, etc.). */
export function getGameViewportOverlayRoot() {
  if (typeof document === "undefined") return null;
  return document.getElementById(GAME_VIEWPORT_OVERLAY_ROOT_ID);
}

/**
 * Clamp a fixed-position box into the game viewport (fallback: browser window).
 * @returns {{ left: number, top: number, right: number, bottom: number, width: number, height: number }}
 */
export function getOverlayClampBounds(pad = 8) {
  const rect = getGameViewportClientRect();
  if (rect) {
    return {
      left: rect.left + pad,
      top: rect.top + pad,
      right: rect.right - pad,
      bottom: rect.bottom - pad,
      width: Math.max(0, rect.width - pad * 2),
      height: Math.max(0, rect.height - pad * 2),
    };
  }
  const w = typeof window !== "undefined" ? window.innerWidth : DESIGN_WIDTH;
  const h = typeof window !== "undefined" ? window.innerHeight : 1080;
  return {
    left: pad,
    top: pad,
    right: w - pad,
    bottom: h - pad,
    width: Math.max(0, w - pad * 2),
    height: Math.max(0, h - pad * 2),
  };
}

/**
 * Resize an HTMLCanvasElement backing store for high-DPI.
 * Resets the 2D transform then applies devicePixelRatio (does not stack).
 */
export function resizeCanvasForDpr(canvas, cssWidth, cssHeight) {
  if (!canvas) return null;
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  const safeDpr = dpr > 0 ? dpr : 1;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * safeDpr);
  canvas.height = Math.round(cssHeight * safeDpr);
  const context = canvas.getContext("2d");
  if (context) {
    context.setTransform(safeDpr, 0, 0, safeDpr, 0, 0);
  }
  return context;
}
