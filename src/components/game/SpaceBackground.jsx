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
 * Animated starfield + nebula. Fills its positioned parent; nebula blobs use
 * fixed pixel ellipses (not %-of-box) so ultrawide canvases scale/crop instead
 * of stretching the backdrop.
 */
export default function SpaceBackground({ className = "", fixed = false }) {
  return (
    <div
      className={`${fixed ? "fixed inset-0 -z-10" : "absolute inset-0"} overflow-hidden pointer-events-none ${className}`}
    >
      <div className="absolute inset-0 nebula-bg" />
      <div className="absolute inset-0 stars-layer" />
      <div className="absolute inset-0 stars-layer-2" />
      <div className="absolute inset-0 shooting-stars">
        {SHOOTERS.map((s, i) => (
          <span
            key={i}
            className="shooting-star"
            style={{ top: s.top, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
          />
        ))}
      </div>
    </div>
  );
}
