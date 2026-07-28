import { createPortal } from "react-dom";

/**
 * Portal a hello-pangea/dnd dragging node to document.body.
 * Prevents clipping by overflow:hidden ancestors (game shell frame) and keeps
 * the preview locked to the cursor across the play window.
 */
export function portalWhileDragging(style, node) {
  if (style?.position === "fixed" && typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
}
