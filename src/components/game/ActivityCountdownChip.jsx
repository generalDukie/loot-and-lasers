import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Rocket, Pickaxe } from "lucide-react";

function fmt(ms) {
  if (ms <= 0) return "READY";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}:${String(sec).padStart(2, "0")}`;
  return `${sec}s`;
}

// Banner bubble for active mining / mission — links to the activity page.
export default function ActivityCountdownChip({ character }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!character) return null;

  const miningEnd = character.mining_end_time ? new Date(character.mining_end_time).getTime() : 0;
  const hasActiveMission = Boolean(character.active_mission_id && character.mission_end_time);
  const missionEnd = hasActiveMission ? new Date(character.mission_end_time).getTime() : 0;

  let active = null;
  if (miningEnd) {
    const remaining = miningEnd - now;
    active = {
      icon: Pickaxe,
      color: "#F59E0B",
      soft: "rgba(245,158,11,0.14)",
      to: "/space-mining",
      remaining,
      complete: remaining <= 0,
      label: remaining <= 0 ? "Mining Complete" : "Mining in Progress",
    };
  } else if (hasActiveMission) {
    const remaining = missionEnd - now;
    // Banner CTA only when the mission timer is done — not during the run.
    if (remaining <= 0) {
      active = {
        icon: Rocket,
        color: "#22C55E",
        soft: "rgba(34,197,94,0.14)",
        to: "/missions",
        remaining,
        complete: true,
        label: "Mission Complete",
      };
    }
  }
  if (!active) return null;

  const Icon = active.icon;
  const done = active.complete;
  const color = done ? "#22C55E" : active.color;

  return (
    <Link
      to={active.to}
      title={done ? "Ready to collect" : active.label}
      className="shrink-0 flex items-center gap-2 rounded-full border px-2.5 py-1.5 sm:px-3 sm:py-2 transition-colors hover:brightness-110"
      style={{
        background: done ? "rgba(34,197,94,0.14)" : active.soft,
        borderColor: `${color}66`,
        boxShadow: `0 0 14px ${color}33`,
      }}
    >
      <motion.div
        animate={done ? { y: [0, -2, 0], rotate: [0, -6, 6, 0] } : { y: [0, -2.5, 0] }}
        transition={{ duration: done ? 0.6 : 1.4, repeat: Infinity, ease: "easeInOut" }}
        className="shrink-0 flex items-center justify-center"
      >
        <Icon
          className="w-4 h-4 sm:w-5 sm:h-5"
          style={{ color, filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      </motion.div>
      <div className="min-w-0 flex flex-col justify-center leading-tight">
        <span
          className="font-display font-bold text-[9px] sm:text-[10px] tracking-wide uppercase truncate max-w-[7.5rem] sm:max-w-[11rem]"
          style={{ color }}
        >
          {active.label}
        </span>
        <span
          className="font-display font-black tabular-nums text-[11px] sm:text-xs leading-none"
          style={{ color, textShadow: done ? "0 0 8px currentColor" : undefined }}
        >
          {fmt(active.remaining)}
        </span>
      </div>
    </Link>
  );
}
