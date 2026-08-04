import React from "react";
import { dirtyTrickLabel } from "@/lib/combatPresentation";

/**
 * Persistent in-fight status chips (presentation only).
 */
export default function CombatStatusStrip({ status, align = "left" }) {
  if (!status) return null;
  const chips = [];
  if (status.barrier > 0) {
    chips.push({
      key: "barrier",
      label: `🛡 ${Math.ceil(status.barrier)}${status.barrierMax ? `/${Math.ceil(status.barrierMax)}` : ""}`,
      color: "#67E8F9",
      title: "Astral Barrier remaining",
    });
  }
  if (status.phantomCharges > 0) {
    chips.push({
      key: "phantom",
      label: `👻 ×${status.phantomCharges}`,
      color: "#C084FC",
      title: "Phantom Signal charges (forced miss)",
    });
  }
  if (status.overclockStacks > 0) {
    chips.push({
      key: "oc",
      label: `⚡ OC ${status.overclockStacks}`,
      color: "#38BDF8",
      title: "Overclock stacks (+dealt / +taken)",
    });
  }
  if (status.kineticTantrum) {
    chips.push({
      key: "kt",
      label: status.kineticTantrum === "strong" ? "💥 Tantrum 2.0×" : "💥 Tantrum 1.5×",
      color: "#F87171",
      title: status.kineticTantrum === "strong" ? "Strong Kinetic Tantrum primed" : "Kinetic Tantrum primed",
    });
  }
  if (status.dirtyTrick) {
    chips.push({
      key: "trick",
      label: `🃏 ${dirtyTrickLabel(status.dirtyTrick)}`,
      color: "#FBBF24",
      title: "Dirty Tricks active",
    });
  }
  if (status.droneReady) {
    chips.push({
      key: "drone",
      label: "🛸 Drone",
      color: "#A78BFA",
      title: "Orbital Assistant online",
    });
  }
  if (!chips.length) return null;
  return (
    <div
      className={`flex flex-wrap gap-1 mt-1 max-w-[220px] ${align === "right" ? "justify-end ml-auto" : ""}`}
      aria-label="Combat status"
    >
      {chips.map((c) => (
        <span
          key={c.key}
          title={c.title}
          className="text-[10px] font-display font-bold tracking-wide px-1.5 py-0.5 rounded-md border backdrop-blur-sm"
          style={{
            color: c.color,
            borderColor: `${c.color}66`,
            background: `${c.color}18`,
          }}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}
