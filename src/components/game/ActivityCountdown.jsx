import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Rocket, Pickaxe } from "lucide-react";
import { api } from "@/api/gameClient";

function fmt(ms) {
  if (ms <= 0) return "Ready to collect!";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Persistent activity countdown — shows the active mission or space mining
// expedition with exact time remaining and a progress bar.
export default function ActivityCountdown({ character }) {
  const [now, setNow] = useState(Date.now());
  const [missionDuration, setMissionDuration] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch the active mission's duration once for progress-bar math.
  useEffect(() => {
    if (!character?.active_mission_id) { setMissionDuration(0); return; }
    let cancelled = false;
    api.entities.Mission.filter({ id: character.active_mission_id })
      .then((ms) => { if (!cancelled && ms[0]) setMissionDuration((ms[0].duration_seconds || 0) * 1000); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [character?.active_mission_id]);

  if (!character) return null;

  const miningEnd = character.mining_end_time ? new Date(character.mining_end_time).getTime() : 0;
  const missionEnd = character.mission_end_time ? new Date(character.mission_end_time).getTime() : 0;

  let active = null;
  if (miningEnd) {
    const remaining = miningEnd - now;
    const reward = character.mining_reward || 0;
    const durMs = (reward / Math.max(1, (character.level || 1) * 12)) * 3600000;
    active = {
      label: "Space Mining", icon: Pickaxe, color: "#F59E0B", to: "/space-mining",
      remaining, complete: remaining <= 0,
      progress: durMs > 0 ? Math.min(100, Math.max(0, ((durMs - remaining) / durMs) * 100)) : 0,
      reward: `+${reward} ✨`,
    };
  } else if (missionEnd) {
    const remaining = missionEnd - now;
    const durMs = missionDuration;
    active = {
      label: "Mission", icon: Rocket, color: "#00E5FF", to: "/missions",
      remaining, complete: remaining <= 0,
      progress: durMs > 0 ? Math.min(100, Math.max(0, ((durMs - remaining) / durMs) * 100)) : 0,
      reward: null,
    };
  }

  if (!active) return null;

  const Icon = active.icon;
  return (
    <Link to={active.to} className="block">
      <div className="painted-panel canvas-grain px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: active.color + "18" }}>
            <Icon className="w-4 h-4" style={{ color: active.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-display font-bold tracking-wide" style={{ color: active.color }}>
                {active.label} {active.complete ? "Complete" : "In Progress"}
              </span>
              <span className={`text-xs font-display font-bold ${active.complete ? "text-green-400 glow-green" : "text-white"}`}>
                {active.complete ? "READY!" : fmt(active.remaining)}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted/40 overflow-hidden border border-border/30">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${active.complete ? 100 : active.progress}%`, backgroundColor: active.color }}
              />
            </div>
          </div>
          {active.reward && (
            <span className="text-[10px] text-accent font-display font-bold whitespace-nowrap">{active.reward}</span>
          )}
        </div>
      </div>
    </Link>
  );
}