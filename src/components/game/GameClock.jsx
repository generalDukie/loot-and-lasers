import React, { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { estimateServerNowMs } from "@/lib/gameTime";

// Persistent in-game clock — America/New_York (game reset zone). Label uses
// the real short name (EST/EDT) for the current instant — display only.
export default function GameClock() {
  const [now, setNow] = useState(() => estimateServerNowMs());

  useEffect(() => {
    const t = setInterval(() => setNow(estimateServerNowMs()), 1000);
    return () => clearInterval(t);
  }, []);

  const d = new Date(now);
  const time = d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const zoneLabel =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "short",
    })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value || "ET";

  return (
    <div className="flex items-center gap-1.5 pointer-events-none" title="Eastern Time (game clock · America/New_York)">
      <Clock className="w-3.5 h-3.5 text-cyan-300/90" />
      <span className="font-display font-bold text-xs sm:text-sm text-foreground tabular-nums tracking-wide">{time}</span>
      <span className="text-[9px] sm:text-[10px] text-muted-foreground font-display tracking-wide">{zoneLabel}</span>
    </div>
  );
}
