import React, { useState } from "react";
import { Monitor, AlignHorizontalJustifyCenter } from "lucide-react";
import { DISPLAY_OPTIONS, ANCHOR_OPTIONS, getDisplayScale, setDisplayScale, getDisplayAnchor, setDisplayAnchor } from "@/lib/displayScale";

// Station hub resolution / scale preference. Lets the player match the hub to
// their screen (auto-fit, fill, or a fixed zoom) and anchor it horizontally —
// handy on ultrawide monitors where the 16:9 canvas leaves side bars.
export default function DisplaySettings() {
  const [val, setVal] = useState(() => getDisplayScale());
  const [anchor, setAnchorVal] = useState(() => getDisplayAnchor());
  const choose = (v) => { setVal(v); setDisplayScale(v); };
  const chooseAnchor = (v) => { setAnchorVal(v); setDisplayAnchor(v); };

  return (
    <div className="painted-panel canvas-grain p-4">
      <div className="flex items-center gap-2 mb-3">
        <Monitor className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-sm">Display</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-2">Station hub resolution — match it to your screen.</p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {DISPLAY_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => choose(o.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-semibold border transition-colors ${
              val === o.value
                ? "bg-primary/25 text-primary border-primary/60"
                : "bg-muted/30 text-muted-foreground border-border/40 hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <AlignHorizontalJustifyCenter className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Anchor</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-2">Horizontal placement when the hub is narrower than your screen.</p>
      <div className="flex flex-wrap gap-1.5">
        {ANCHOR_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => chooseAnchor(o.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-semibold border transition-colors ${
              anchor === o.value
                ? "bg-primary/25 text-primary border-primary/60"
                : "bg-muted/30 text-muted-foreground border-border/40 hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}