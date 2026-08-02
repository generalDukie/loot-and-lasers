/**
 * Authoritative 16:9 game viewport math for Loot & Lasers.
 * Logical design reference: 1920×1080 (matches GameCanvas / Godot SettingsManager).
 *
 * Strategy: fluid logical layout — the playable pane is sized in real CSS pixels
 * to the largest 16:9 rectangle that fits the browser. Layout reflows (no root
 * transform: scale) so text stays sharp at high DPI.
 */

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;
export const DESIGN_ASPECT = DESIGN_WIDTH / DESIGN_HEIGHT;

/**
 * Largest 16:9 rectangle that fits inside availableWidth × availableHeight.
 * @param {number} availableWidth
 * @param {number} availableHeight
 * @returns {{ width: number, height: number }}
 */
export function calculateGameViewport(availableWidth, availableHeight) {
  const aw = Math.max(0, Number(availableWidth) || 0);
  const ah = Math.max(0, Number(availableHeight) || 0);
  if (aw <= 0 || ah <= 0) {
    return { width: 0, height: 0 };
  }
  let width;
  let height;
  if (aw / ah > DESIGN_ASPECT) {
    height = ah;
    width = height * DESIGN_ASPECT;
  } else {
    width = aw;
    height = width / DESIGN_ASPECT;
  }
  return {
    width: Math.round(width * 1000) / 1000,
    height: Math.round(height * 1000) / 1000,
  };
}

/**
 * Place a sized viewport inside the browser area.
 * @param {number} availableWidth
 * @param {number} availableHeight
 * @param {{ width: number, height: number }} size
 * @param {"left"|"center"|"right"} [anchor="center"]
 */
export function placeGameViewport(availableWidth, availableHeight, size, anchor = "center") {
  const { width, height } = size;
  let left;
  if (width <= availableWidth) {
    if (anchor === "left") left = 0;
    else if (anchor === "right") left = availableWidth - width;
    else left = (availableWidth - width) / 2;
  } else {
    left = (availableWidth - width) / 2;
  }
  const top = (availableHeight - height) / 2;
  return {
    width,
    height,
    left: Math.round(left * 1000) / 1000,
    top: Math.round(top * 1000) / 1000,
  };
}

/**
 * Resolve display prefs into a concrete rect.
 * Modes mirror historical displayScale.js options; "auto" is the default 16:9 fit.
 */
export function resolveGameViewportRect(availableWidth, availableHeight, mode = "auto", anchor = "center") {
  const vw = Math.max(0, Number(availableWidth) || 0);
  const vh = Math.max(0, Number(availableHeight) || 0);
  let width;
  let height;

  if (mode === "cover") {
    const s = Math.max(vw / DESIGN_WIDTH, vh / DESIGN_HEIGHT);
    width = DESIGN_WIDTH * s;
    height = DESIGN_HEIGHT * s;
  } else if (mode === "fill-width") {
    width = vw;
    height = vw / DESIGN_ASPECT;
  } else if (mode === "contain-height") {
    height = vh;
    width = vh * DESIGN_ASPECT;
  } else if (mode === "auto" || mode == null || mode === "") {
    ({ width, height } = calculateGameViewport(vw, vh));
  } else {
    const s = Number(mode) || Math.min(vw / DESIGN_WIDTH, vh / DESIGN_HEIGHT);
    width = DESIGN_WIDTH * s;
    height = DESIGN_HEIGHT * s;
  }

  return placeGameViewport(vw, vh, { width, height }, anchor);
}

/** CSS custom properties for the physical game viewport. */
export function gameViewportCssVars(rect) {
  const w = rect?.width || 0;
  const h = rect?.height || 0;
  const uiScale = w > 0 ? w / DESIGN_WIDTH : 1;
  return {
    "--game-canvas-w": `${w}px`,
    "--game-canvas-h": `${h}px`,
    "--design-width": String(DESIGN_WIDTH),
    "--design-height": String(DESIGN_HEIGHT),
    "--ui-scale": String(uiScale),
    "--logical-pixel": `${uiScale}px`,
  };
}

/**
 * Convert browser client coordinates into logical 1920×1080 space.
 * Use when a feature needs design-space math over a scaled viewport.
 */
export function clientToLogicalPoint(clientX, clientY, viewportRect, scale) {
  const s = scale > 0 ? scale : (viewportRect?.width || 0) / DESIGN_WIDTH || 1;
  const left = viewportRect?.left ?? 0;
  const top = viewportRect?.top ?? 0;
  return {
    x: (clientX - left) / s,
    y: (clientY - top) / s,
  };
}

export function getDevicePixelRatio() {
  if (typeof window === "undefined") return 1;
  const dpr = Number(window.devicePixelRatio) || 1;
  return dpr > 0 ? dpr : 1;
}
