import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Rocket, Pickaxe } from "lucide-react";

function fmt(ms) {
  if (ms <= 0) return "READY";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}:${String(sec).padStart(2, "0")}`;
  return `${sec}s`;
}

// Compact mission/mining countdown pill for the header — sits beside the
// currency stack and links to the active activity's page.
export default function ActivityCountdownChip({ character }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!character) return null;

  const miningEnd = character.mining_end_time ? new Date(character.mining_end_time).getTime() : 0;
  const missionEnd = character.mission_end_time ? new Date(character.mission_end_time).getTime() : 0;

  let active = null;
  if (miningEnd) {
    const remaining = miningEnd - now;
    active = { icon: Pickaxe, color: "#F59E0B", to: "/space-mining", remaining, complete: remaining <= 0 };
  } else if (missionEnd) {
    const remaining = missionEnd - now;
    active = { icon: Rocket, color: "#00E5FF", to: "/missions", remaining, complete: remaining <= 0 };
  }
  if (!active) return null;

  const Icon = active.icon;
  const done = active.complete;
  const color = done ? "#22C55E" : active.color;
  return (
    <Link
      to={active.to}
      title={done ? "Ready to collect" : "In progress"}
      className="self-center flex items-center gap-1 px-2 py-1 rounded-lg bg-background/90 border border-border/50 hover:bg-muted/40 transition-colors shrink-0"
    >
      <Icon className="w-3 h-3 shrink-0" style={{ color }} />
      <span className="text-[10px] font-display font-bold tabular-nums leading-none" style={{ color, textShadow: done ? "0 0 6px currentColor" : undefined }}>
        {fmt(active.remaining)}
      </span>
    </Link>
  );
}