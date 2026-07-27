import React, { useState, useEffect } from "react";
import { Clock } from "lucide-react";

// Persistent in-game clock — shows Eastern Time (the game's reset timezone)
// and ticks every second so players always know where the daily rollover sits.
export default function GameClock() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = new Date(now).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <div className="flex items-center gap-2" title="Eastern Time (game clock)">
      <Clock className="w-4 h-4 text-white/80" />
      <span className="font-display font-bold text-sm text-white tabular-nums">{time}</span>
      <span className="text-[10px] text-white/70 font-display tracking-wide">EST</span>
    </div>
  );
}