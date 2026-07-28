import { useLayoutEffect, useRef, useState } from "react";

/**
 * Scale content down to fit a container without scrolling.
 * Keeps a layout box in sync with the scaled visual size.
 */
export default function useFitScale({ minScale = 0.55 } = {}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return undefined;

    const update = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const bw = content.offsetWidth;
      const bh = content.offsetHeight;
      if (bw <= 0 || bh <= 0 || cw <= 0 || ch <= 0) return;
      const next = Math.min(1, cw / bw, ch / bh);
      const s = next > 0.995 ? 1 : Math.max(minScale, next);
      setScale(s);
      setBox({ w: Math.ceil(bw * s), h: Math.ceil(bh * s) });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(content);
    return () => ro.disconnect();
  }, [minScale]);

  return { containerRef, contentRef, scale, box };
}
