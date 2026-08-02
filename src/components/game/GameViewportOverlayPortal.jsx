import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GAME_VIEWPORT_OVERLAY_ROOT_ID } from "@/lib/gameViewportDom";

/**
 * Portal into the full 16:9 game viewport (covers nav + chrome + letterbox-safe).
 * Use for combat and other fullscreen-in-game overlays.
 */
export default function GameViewportOverlayPortal({
  as: Comp = "div",
  children,
  className = "",
  style,
  ...rest
}) {
  const [host, setHost] = useState(() =>
    typeof document !== "undefined"
      ? document.getElementById(GAME_VIEWPORT_OVERLAY_ROOT_ID)
      : null,
  );

  useLayoutEffect(() => {
    setHost(document.getElementById(GAME_VIEWPORT_OVERLAY_ROOT_ID));
  }, []);

  const target = host || (typeof document !== "undefined" ? document.body : null);
  if (!target) return null;

  const pos = host ? "absolute inset-0" : "fixed inset-0";
  return createPortal(
    <Comp
      className={`${pos} pointer-events-auto ${className}`.trim()}
      style={style}
      {...rest}
    >
      {children}
    </Comp>,
    target,
  );
}
