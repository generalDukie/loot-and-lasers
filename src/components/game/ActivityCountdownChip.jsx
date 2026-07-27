import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Rocket, Pickaxe } from "lucide-react";
import { api } from "@/api/gameClient";

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

// Mission/mining countdown for the header — large rocket + mission name when
// a quest is in flight; links through to the activity page.
export default function ActivityCountdownChip({ character, large = false }) {
  const [now, setNow] = useState(Date.now());
  const [missionName, setMissionName] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!character?.active_mission_id || character.mining_end_time) {
      setMissionName("");
      return;
    }
    let cancelled = false;
    api.entities.Mission.filter({ id: character.active_mission_id })
      .then((list) => {
        if (!cancelled) setMissionName(list[0]?.name || "");
      })
      .catch(() => {
        if (!cancelled) setMissionName("");
      });
    return () => { cancelled = true; };
  }, [character?.active_mission_id, character?.mining_end_time]);

  if (!character) return null;

  const miningEnd = character.mining_end_time ? new Date(character.mining_end_time).getTime() : 0;
  const missionEnd = character.mission_end_time ? new Date(character.mission_end_time).getTime() : 0;

  let active = null;
  if (miningEnd) {
    const remaining = miningEnd - now;
    active = {
      icon: Pickaxe,
      color: "#F59E0B",
      to: "/space-mining",
      remaining,
      complete: remaining <= 0,
      title: "Space Mining",
      kind: "mining",
    };
  } else if (missionEnd) {
    const remaining = missionEnd - now;
    active = {
      icon: Rocket,
      color: "#00E5FF",
      to: "/missions",
      remaining,
      complete: remaining <= 0,
      title: missionName || "Mission",
      kind: "mission",
    };
  }
  if (!active) return null;

  const Icon = active.icon;
  const done = active.complete;
  const color = done ? "#22C55E" : active.color;
  const isMission = active.kind === "mission";

  return (
    <Link
      to={active.to}
      title={done ? "Ready to collect" : active.title}
      className={`self-stretch flex items-center rounded-xl bg-background/90 border border-border/60 hover:border-cyan-400/50 hover:bg-muted/40 transition-colors shrink-0 ${
        large || isMission ? "gap-2.5 px-3 py-2" : "gap-1.5 px-2 py-1.5"
      }`}
      style={{ boxShadow: done ? `0 0 12px ${color}44` : `0 0 10px ${color}22` }}
    >
      <motion.div
        animate={done ? { y: [0, -2, 0], rotate: [0, -6, 6, 0] } : { y: [0, -3, 0] }}
        transition={{ duration: done ? 0.6 : 1.4, repeat: Infinity, ease: "easeInOut" }}
        className="shrink-0 flex items-center justify-center"
      >
        <Icon
          className={isMission || large ? "w-8 h-8 sm:w-10 sm:h-10" : "w-5 h-5"}
          style={{ color, filter: `drop-shadow(0 0 8px ${color}88)` }}
        />
      </motion.div>
      <div className="min-w-0 flex flex-col justify-center gap-0.5">
        <span
          className={`font-display font-bold leading-tight truncate max-w-[9rem] sm:max-w-[14rem] ${
            isMission || large ? "text-xs sm:text-sm" : "text-[10px]"
          }`}
          style={{ color }}
        >
          {active.title}
        </span>
        <span
          className={`font-display font-black tabular-nums leading-none ${
            isMission || large ? "text-sm sm:text-base" : "text-[11px]"
          }`}
          style={{ color, textShadow: done ? "0 0 8px currentColor" : undefined }}
        >
          {fmt(active.remaining)}
        </span>
      </div>
    </Link>
  );
}
