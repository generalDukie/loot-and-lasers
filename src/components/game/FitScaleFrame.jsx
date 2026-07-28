import { useLayoutEffect, useRef, useState } from "react";

/**
 * Wraps page content and scales it to fit the available shell pane
 * so the outer page does not scroll. Content is always measured at the
 * container's full width (height-driven scale only) to avoid shrink loops.
 */
export default function FitScaleFrame({ children, className = "", minScale = 0.55 }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [layoutH, setLayoutH] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return undefined;

    const update = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw <= 0 || ch <= 0) return;

      // Measure at full container width so scale isn't fed by a shrinking box.
      content.style.width = `${cw}px`;
      const bh = content.offsetHeight;
      if (bh <= 0) return;

      const raw = Math.min(1, ch / bh);
      const next = raw > 0.995 ? 1 : Math.max(minScale, raw);
      setScale(next);
      setLayoutH(Math.ceil(bh * next));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(content);
    return () => ro.disconnect();
  }, [minScale]);

  return (
    <div
      ref={containerRef}
      className={`flex-1 min-h-0 w-full overflow-hidden ${className}`.trim()}
    >
      <div
        className="relative w-full"
        style={layoutH ? { height: layoutH } : undefined}
      >
        <div
          ref={contentRef}
          className="absolute top-0 left-0"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
