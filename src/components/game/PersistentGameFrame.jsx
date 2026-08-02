import React from "react";

/**
 * Metallic station-console frame around the playable area.
 * Persistent chrome only — children fill the recessed viewport.
 */
export default function PersistentGameFrame({ children, className = "" }) {
  return (
    <div
      className={`relative h-full w-full min-h-0 flex flex-col p-[clamp(0.35rem,0.7cqi,0.65rem)] ${className}`}
      style={{
        background: `
          radial-gradient(ellipse 80% 60% at 50% 0%, hsl(190 40% 18% / 0.35), transparent 55%),
          linear-gradient(165deg, hsl(220 18% 14%) 0%, hsl(222 22% 8%) 45%, hsl(220 16% 11%) 100%)
        `,
      }}
    >
      {/* Outer bevel */}
      <div
        className="absolute inset-[2px] rounded-[1.1rem] pointer-events-none"
        style={{
          boxShadow: `
            inset 0 1px 0 hsl(0 0% 100% / 0.12),
            inset 0 -1px 0 hsl(0 0% 0% / 0.45),
            0 0 0 1px hsl(210 15% 28% / 0.9),
            0 0 0 2px hsl(210 20% 12%),
            0 8px 28px hsl(0 0% 0% / 0.45)
          `,
        }}
        aria-hidden
      />

      {/* Corner rivets */}
      {[
        "top-3 left-3",
        "top-3 right-3",
        "bottom-3 left-3",
        "bottom-3 right-3",
      ].map((pos) => (
        <span
          key={pos}
          className={`absolute ${pos} w-2 h-2 rounded-full pointer-events-none z-[1]`}
          style={{
            background: "radial-gradient(circle at 35% 30%, hsl(210 15% 55%), hsl(210 20% 22%))",
            boxShadow: "0 0 0 1px hsl(210 15% 35%), inset 0 1px 1px hsl(0 0% 100% / 0.35)",
          }}
          aria-hidden
        />
      ))}

      {/* Top engraved rail */}
      <div
        className="absolute top-[0.55rem] left-[12%] right-[12%] h-px pointer-events-none z-[1]"
        style={{
          background: "linear-gradient(90deg, transparent, hsl(190 70% 55% / 0.45), transparent)",
          boxShadow: "0 0 8px hsl(190 90% 50% / 0.25)",
        }}
        aria-hidden
      />

      {/* Side holographic ticks */}
      <div className="absolute left-1.5 top-1/4 bottom-1/4 w-0.5 rounded-full pointer-events-none z-[1] hidden sm:block"
        style={{ background: "linear-gradient(180deg, transparent, hsl(190 80% 50% / 0.35), transparent)" }}
        aria-hidden
      />
      <div className="absolute right-1.5 top-1/4 bottom-1/4 w-0.5 rounded-full pointer-events-none z-[1] hidden sm:block"
        style={{ background: "linear-gradient(180deg, transparent, hsl(270 50% 55% / 0.28), transparent)" }}
        aria-hidden
      />

      {/* Recessed play surface */}
      <div
        className="relative flex-1 min-h-0 flex flex-col rounded-[0.85rem] overflow-hidden border"
        style={{
          borderColor: "hsl(210 18% 22%)",
          background: "hsl(232 28% 5% / 0.92)",
          boxShadow: `
            inset 0 2px 10px hsl(0 0% 0% / 0.55),
            inset 0 0 0 1px hsl(190 40% 40% / 0.08)
          `,
        }}
      >
        {children}
      </div>
    </div>
  );
}
