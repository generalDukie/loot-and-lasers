import React from "react";

// Shooting-star streaks distributed across the full vertical extent of the
// scene (top → bottom), each with its own speed and timing offset.
const SHOOTERS = [
  { top: "6%",  dur: 9,  delay: 1 },
  { top: "22%", dur: 11, delay: 4 },
  { top: "38%", dur: 8,  delay: 7 },
  { top: "54%", dur: 12, delay: 2 },
  { top: "70%", dur: 10, delay: 6 },
  { top: "86%", dur: 9,  delay: 9 },
];

/**
 * Background artwork rendered INSIDE the fixed 1920×1080 game canvas (not at the
 * viewport level). Fills the canvas absolutely (inset 0, 100% × 100%) so the
 * artwork scales as one unit with every HUD element — no independent cropping
 * or repositioning across aspect ratios.
 */
export default function SpaceBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 nebula-bg" />
      <div className="absolute inset-0 stars-layer" />
      <div className="absolute inset-0 stars-layer-2" />
      <div className="absolute inset-0 shooting-stars">
        {SHOOTERS.map((s, i) => (
          <span key={i} className="shooting-star" style={{ top: s.top, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }} />
        ))}
      </div>
    </div>
  );
}