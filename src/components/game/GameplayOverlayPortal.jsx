import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Mount point id — GameLayout places this over the main gameplay column only. */
export const GAMEPLAY_OVERLAY_ROOT_ID = "gameplay-overlay-root";

/**
 * Portal UI into the gameplay content area so overlays center without the side nav.
 * Falls back to fixed fullscreen on document.body when the shell host is missing.
 *
 * Pass `as={motion.div}` (and motion props) when the scrim itself should animate.
 */
export default function GameplayOverlayPortal({
  as: Comp = "div",
  children,
  className = "",
  style,
  ...rest
}) {
  const [host, setHost] = useState(() =>
    typeof document !== "undefined" ? document.getElementById(GAMEPLAY_OVERLAY_ROOT_ID) : null,
  );

  useLayoutEffect(() => {
    setHost(document.getElementById(GAMEPLAY_OVERLAY_ROOT_ID));
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
