import { useLayoutEffect, useState } from "react";
import { getGameViewportOverlayRoot } from "@/lib/gameViewportDom";

/** Resolves the 16:9 overlay host once mounted (null → portal to body). */
export function useGameViewportOverlayContainer() {
  const [container, setContainer] = useState(null);
  useLayoutEffect(() => {
    setContainer(getGameViewportOverlayRoot());
  }, []);
  return container;
}

/** Positioning class for overlays: absolute inside the game pane, fixed on body. */
export function overlayPositionClass(container) {
  return container ? "absolute" : "fixed";
}
