import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Check, X } from "lucide-react";
import { WORMHOLE_ID, getWormholePlanet } from "@/lib/dungeonData";

// Spiral crawl on a square stage (keeps the coil centered & circular).
const WORMHOLE_POS = { x: 50, y: 50 };
const SPIRAL_TURNS = 1.2;
const MAP_MARGIN = 14;

function buildSpiralNodes() {
  const raw = Array.from({ length: 10 }, (_, i) => {
    const t = i / 9;
    const angle = -Math.PI / 2 + t * SPIRAL_TURNS * Math.PI * 2;
    const r = 1 - t * 0.64;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, angle, r };
  });

  let maxReach = 0.18;
  for (const p of raw) {
    maxReach = Math.max(maxReach, p.r + 0.22);
  }
  const scale = (100 - MAP_MARGIN * 2) / (2 * maxReach);

  const mapPt = (x, y) => ({
    x: +(WORMHOLE_POS.x + x * scale).toFixed(2),
    y: +(WORMHOLE_POS.y + y * scale).toFixed(2),
  });

  const nodes = raw.map((p) => mapPt(p.x, p.y));
  const guide = [];
  for (let i = 0; i <= 56; i++) {
    const t = (i / 56) * 1.12;
    const angle = -Math.PI / 2 + Math.min(t, 1) * SPIRAL_TURNS * Math.PI * 2
      + Math.max(0, t - 1) * Math.PI * 0.7;
    const r = Math.max(0, 1 - Math.min(t, 1.12) * 0.72);
    guide.push(mapPt(Math.cos(angle) * r, Math.sin(angle) * r));
  }

  return {
    nodes,
    guidePath: guide.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" "),
  };
}

const { nodes: NODE_POS, guidePath: spiralGuidePath } = buildSpiralNodes();
const WORMHOLE_COLOR = "#C084FC";
const WORMHOLE_CYAN = "#67E8F9";

const STARS = Array.from({ length: 36 }, (_, i) => {
  let s = (i * 2654435761) >>> 0;
  const x = (s % 970) / 10 + 1.5;
  s = (Math.imul(s, 1597334677)) >>> 0;
  const y = (s % 970) / 10 + 1.5;
  s = (Math.imul(s, 2246822519)) >>> 0;
  return {
    x, y,
    size: 0.8 + (s % 16) / 12,
    opacity: 0.2 + (s % 50) / 100,
    delay: (i % 9) * 0.35,
  };
});

function segmentPath(a, b) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const cx = mx * 0.82 + WORMHOLE_POS.x * 0.18;
  const cy = my * 0.82 + WORMHOLE_POS.y * 0.18;
  return `M ${a.x} ${a.y} Q ${cx} ${cy}, ${b.x} ${b.y}`;
}

function radialLabelOffset(pos) {
  const dx = pos.x - WORMHOLE_POS.x;
  const dy = pos.y - WORMHOLE_POS.y;
  const len = Math.hypot(dx, dy) || 1;
  // Percent-of-map nudge outward so names sit outside the coil
  return {
    x: (dx / len) * 8.5,
    y: (dy / len) * 7.5,
  };
}

function WormholeIcon({ unlocked, selected, animate = true }) {
  const live = unlocked && animate;
  return (
    <div className="relative" style={{ width: 92, height: 92 }}>
      <div
        className="absolute inset-[-18%] rounded-full pointer-events-none"
        style={{
          background: unlocked
            ? `radial-gradient(circle, ${WORMHOLE_COLOR}44 0%, ${WORMHOLE_CYAN}18 40%, transparent 70%)`
            : "radial-gradient(circle, rgba(80,80,100,0.25) 0%, transparent 70%)",
        }}
      />

      {live && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${WORMHOLE_COLOR}55 0%, transparent 70%)`,
            filter: "blur(6px)",
          }}
          animate={{ opacity: [0.45, 0.95, 0.45], scale: [0.92, 1.1, 0.92] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {live && [0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border pointer-events-none"
          style={{
            width: 74,
            height: 74,
            borderColor: i % 2 === 0 ? WORMHOLE_COLOR : WORMHOLE_CYAN,
          }}
          animate={{ scale: [0.55, 1.55], opacity: [0.7, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay: i * 0.75 }}
        />
      ))}

      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full drop-shadow-[0_0_20px_rgba(192,132,252,0.55)]">
        <defs>
          <radialGradient id="whCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0a0214" stopOpacity="1" />
            <stop offset="45%" stopColor="#2e1065" stopOpacity="0.95" />
            <stop offset="75%" stopColor={WORMHOLE_COLOR} stopOpacity="0.55" />
            <stop offset="100%" stopColor={WORMHOLE_CYAN} stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle
          cx="50" cy="50" r="46"
          fill="none"
          stroke={unlocked ? WORMHOLE_COLOR : "#444"}
          strokeWidth={selected ? 2.5 : 1.5}
          opacity={unlocked ? 0.55 : 0.3}
        />

        <motion.g
          style={{ transformOrigin: "50px 50px" }}
          animate={live ? { rotate: 360 } : { rotate: 0 }}
          transition={live ? { duration: 10, repeat: Infinity, ease: "linear" } : { duration: 0 }}
        >
          <ellipse cx="50" cy="50" rx="40" ry="16" fill="none"
            stroke={unlocked ? WORMHOLE_CYAN : "#555"} strokeWidth="2"
            opacity={unlocked ? 0.75 : 0.25} transform="rotate(-18 50 50)" />
        </motion.g>
        <motion.g
          style={{ transformOrigin: "50px 50px" }}
          animate={live ? { rotate: -360 } : { rotate: 0 }}
          transition={live ? { duration: 7, repeat: Infinity, ease: "linear" } : { duration: 0 }}
        >
          <ellipse cx="50" cy="50" rx="34" ry="12" fill="none"
            stroke={unlocked ? WORMHOLE_COLOR : "#555"} strokeWidth="2.2"
            opacity={unlocked ? 0.85 : 0.25} transform="rotate(22 50 50)" />
        </motion.g>
        <motion.g
          style={{ transformOrigin: "50px 50px" }}
          animate={live ? { rotate: 360 } : { rotate: 0 }}
          transition={live ? { duration: 4.5, repeat: Infinity, ease: "linear" } : { duration: 0 }}
        >
          <ellipse cx="50" cy="50" rx="26" ry="8" fill="none"
            stroke={unlocked ? "#E9D5FF" : "#555"} strokeWidth="1.6"
            opacity={unlocked ? 0.9 : 0.2} strokeDasharray="4 3" transform="rotate(-8 50 50)" />
        </motion.g>

        <motion.circle
          cx="50" cy="50" r="14"
          fill="url(#whCore)"
          animate={live ? { r: [12, 15, 12] } : undefined}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <circle cx="50" cy="50" r="7" fill="#020010" opacity={unlocked ? 1 : 0.5} />

        {live && [0, 120, 240].map((deg, i) => (
          <motion.g
            key={deg}
            style={{ transformOrigin: "50px 50px" }}
            animate={{ rotate: 360 }}
            transition={{ duration: 3.2 + i * 0.6, repeat: Infinity, ease: "linear" }}
          >
            <circle
              cx={50 + Math.cos((deg * Math.PI) / 180) * 30}
              cy={50 + Math.sin((deg * Math.PI) / 180) * 12}
              r={i === 1 ? 2.4 : 1.8}
              fill={i === 1 ? WORMHOLE_CYAN : "#F5D0FE"}
            />
          </motion.g>
        ))}
      </svg>

      {!unlocked && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
          <Lock className="w-6 h-6 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

const ZOOM_SCALE = 2.4;

export default function DungeonMap({
  planets,
  storyPlanetId,
  inInfinite,
  infiniteDepth = 1,
  selectedId,
  onSelect,
  fill = false,
}) {
  const front = inInfinite ? null : Math.min(storyPlanetId, planets.length);
  const [zoomId, setZoomId] = useState(null);

  const focusPos = zoomId === WORMHOLE_ID
    ? WORMHOLE_POS
    : zoomId != null
    ? NODE_POS[(zoomId) - 1]
    : null;

  const zoomPlanet = zoomId === WORMHOLE_ID
    ? getWormholePlanet(infiniteDepth)
    : planets.find((p) => p.id === zoomId) || null;

  useEffect(() => {
    if (!zoomId) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setZoomId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomId]);

  function handlePlanetClick(p, state) {
    if (state === "locked") return;
    onSelect?.(p.id);
    if (state === "current") {
      setZoomId((id) => (id === p.id ? null : p.id));
    } else if (zoomId) {
      setZoomId(null);
    }
  }

  function handleWormholeClick() {
    if (!inInfinite) return;
    onSelect?.(WORMHOLE_ID);
    setZoomId((id) => (id === WORMHOLE_ID ? null : WORMHOLE_ID));
  }

  const zooming = !!focusPos && !!zoomPlanet;
  const stageTransform = zooming
    ? `translate3d(${(50 - focusPos.x) * ZOOM_SCALE}%, ${(50 - focusPos.y) * ZOOM_SCALE}%, 0) scale(${ZOOM_SCALE})`
    : "translate3d(0, 0, 0) scale(1)";

  return (
    <div className={`relative rounded-2xl p-2 sm:p-3 border border-border/60 bg-gradient-to-b from-card/70 to-background/40 ${fill ? "h-full min-h-0 flex flex-col" : ""}`}>
      <div
        className={`relative w-full rounded-xl overflow-hidden border border-primary/25 ${fill ? "flex-1 min-h-0" : ""}`}
        style={{
          ...(fill ? {} : { aspectRatio: "16 / 9" }),
          background:
            `radial-gradient(ellipse at 50% 50%, rgba(192,132,252,0.22), transparent 36%), radial-gradient(ellipse at 20% 25%, rgba(34,211,238,0.08), transparent 35%), radial-gradient(ellipse at 80% 70%, rgba(168,85,247,0.08), transparent 40%), hsl(230 32% 5%)`,
          boxShadow: "inset 0 0 48px rgba(0,0,0,0.45)",
        }}
      >
        {/* Stars — freeze twinkles while zoomed (scaling animated layers is costly) */}
        <div className="absolute inset-0 pointer-events-none">
          {STARS.map((st, i) => (
            zooming ? (
              <span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  left: `${st.x}%`,
                  top: `${st.y}%`,
                  width: st.size,
                  height: st.size,
                  opacity: st.opacity * 0.7,
                }}
              />
            ) : (
              <motion.span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  left: `${st.x}%`,
                  top: `${st.y}%`,
                  width: st.size,
                  height: st.size,
                  boxShadow: st.size > 1.5 ? "0 0 4px rgba(255,255,255,0.5)" : "none",
                }}
                animate={{ opacity: [st.opacity * 0.4, st.opacity, st.opacity * 0.4] }}
                transition={{ duration: 2.6 + (i % 4) * 0.5, repeat: Infinity, ease: "easeInOut", delay: st.delay }}
              />
            )
          ))}
        </div>

        <div
          className="absolute inset-0 opacity-[0.14] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(hsl(190 90% 60% / 0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(190 90% 60% / 0.3) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
            maskImage: "radial-gradient(ellipse at 50% 50%, black 25%, transparent 78%)",
          }}
        />

        {!zooming && (
          <motion.div
            className="absolute inset-x-0 h-14 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, hsl(190 90% 60% / 0.07), transparent)" }}
            animate={{ y: ["-20%", "125%"] }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          />
        )}

        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.5) 100%)" }}
        />

        {/* Click-catcher to pull back */}
        {zooming && (
          <button
            type="button"
            aria-label="Pull back from planet"
            className="absolute inset-0 z-[25] cursor-zoom-out bg-black/45"
            onClick={() => setZoomId(null)}
          />
        )}

        {/* Square stage — CSS ease (not spring) keeps zoom cheap on the SVG layer */}
        <div className="absolute inset-0 z-[26] flex items-center justify-center pointer-events-none">
          <div
            className={`relative aspect-square h-[94%] max-w-[94%] ${zooming ? "" : "pointer-events-auto"}`}
            style={{
              transform: stageTransform,
              transformOrigin: "50% 50%",
              transition: "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: zooming ? "transform" : "auto",
              contain: "layout paint",
            }}
          >
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="spiralFade" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.35" />
                  <stop offset="55%" stopColor="#A78BFA" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#C084FC" stopOpacity="0.8" />
                </linearGradient>
                {!zooming && (
                  <filter id="routeGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="0.7" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                )}
              </defs>

              <path
                d={spiralGuidePath}
                fill="none"
                stroke="url(#spiralFade)"
                strokeWidth="2.2"
                strokeOpacity="0.22"
                filter={zooming ? undefined : "url(#routeGlow)"}
              />
              {zooming ? (
                <path
                  d={spiralGuidePath}
                  fill="none"
                  stroke={WORMHOLE_COLOR}
                  strokeWidth="0.45"
                  strokeDasharray="1.2 3.2"
                  strokeOpacity="0.35"
                />
              ) : (
                <motion.path
                  d={spiralGuidePath}
                  fill="none"
                  stroke={WORMHOLE_COLOR}
                  strokeWidth="0.45"
                  strokeDasharray="1.2 3.2"
                  strokeOpacity="0.35"
                  animate={{ strokeDashoffset: [0, -18] }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                />
              )}

              {NODE_POS.slice(0, -1).map((a, i) => {
                const b = NODE_POS[i + 1];
                const unlocked = inInfinite || planets[i + 1].id <= (front || 0);
                const stroke = unlocked ? planets[i].color : "#3d3d4a";
                if (zooming) {
                  return (
                    <path
                      key={i}
                      d={segmentPath(a, b)}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={unlocked ? 0.7 : 0.45}
                      strokeDasharray="2 1.8"
                      strokeOpacity={unlocked ? 0.75 : 0.22}
                    />
                  );
                }
                return (
                  <motion.path
                    key={i}
                    d={segmentPath(a, b)}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={unlocked ? 0.7 : 0.45}
                    strokeDasharray="2 1.8"
                    strokeOpacity={unlocked ? 0.75 : 0.22}
                    filter={unlocked ? "url(#routeGlow)" : undefined}
                    animate={unlocked ? { strokeDashoffset: [0, -8] } : undefined}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  />
                );
              })}

              {zooming ? (
                <path
                  d={segmentPath(NODE_POS[9], WORMHOLE_POS)}
                  fill="none"
                  stroke={inInfinite ? WORMHOLE_COLOR : "#3d3d4a"}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  strokeOpacity={inInfinite ? 0.85 : 0.25}
                />
              ) : (
                <motion.path
                  d={segmentPath(NODE_POS[9], WORMHOLE_POS)}
                  fill="none"
                  stroke={inInfinite ? WORMHOLE_COLOR : "#3d3d4a"}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  strokeOpacity={inInfinite ? 0.85 : 0.25}
                  filter={inInfinite ? "url(#routeGlow)" : undefined}
                  animate={inInfinite ? { strokeDashoffset: [0, -14] } : undefined}
                  transition={{ duration: 1.3, repeat: Infinity, ease: "linear" }}
                />
              )}
            </svg>

            {planets.map((p, i) => {
              const pos = NODE_POS[i];
              const state = inInfinite || p.id < front
                ? "cleared"
                : p.id === front
                ? "current"
                : "locked";
              const selected = selectedId === p.id;
              const clickable = state !== "locked";
              const label = radialLabelOffset(pos);
              const isFocus = zoomId === p.id;
              if (zooming && !isFocus) return null;
              return (
                <React.Fragment key={p.id}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlanetClick(p, state);
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center disabled:cursor-default pointer-events-auto ${
                      isFocus ? "z-[30]" : "z-10"
                    } ${state === "current" ? "cursor-zoom-in" : ""}`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    title={
                      state === "current"
                        ? "Inspect this world"
                        : state === "cleared"
                        ? "Patrol this world"
                        : "Locked"
                    }
                  >
                    {state !== "locked" && !zooming && (
                      <span
                        className="absolute w-14 h-14 rounded-full pointer-events-none blur-md opacity-35"
                        style={{ background: `radial-gradient(circle, ${p.color}, transparent 70%)` }}
                      />
                    )}

                    {(state === "current" || selected) && !zooming && (
                      <motion.span
                        className="absolute w-11 h-11 rounded-full border-2"
                        style={{ borderColor: p.color }}
                        animate={{ scale: [1, 1.75], opacity: [0.75, 0] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                      />
                    )}

                    <div
                      className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-base sm:text-xl border-2"
                      style={{
                        borderColor: state === "locked" ? "#444" : selected || isFocus ? "#fff" : p.color,
                        background:
                          state === "locked"
                            ? "rgba(20,20,30,0.7)"
                            : `radial-gradient(circle at 35% 30%, ${p.color}55, ${p.color}18 55%, rgba(10,10,20,0.85))`,
                        boxShadow: state === "locked" ? "none" : `0 0 16px ${p.color}77`,
                        filter: state === "locked" ? "grayscale(1)" : "none",
                        transform: isFocus ? "scale(1.12)" : undefined,
                      }}
                    >
                      {state === "locked" ? (
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      ) : state === "cleared" && !isFocus ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        p.icon
                      )}
                    </div>
                  </button>

                  {!zooming && (
                    <div
                      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[11] flex flex-col items-center"
                      style={{
                        left: `${pos.x + label.x}%`,
                        top: `${pos.y + label.y}%`,
                      }}
                    >
                      <p
                        className="text-[8px] sm:text-[9px] font-display font-bold tracking-wide px-1.5 py-0.5 rounded bg-background/85 border border-border/40 whitespace-nowrap"
                        style={{
                          color: state === "locked" ? "#777" : p.color,
                          borderColor: state === "locked" ? undefined : `${p.color}40`,
                        }}
                      >
                        {p.id}. {p.name}
                      </p>
                      {state === "current" && (
                        <p className="text-[8px] text-primary font-display mt-0.5 tracking-wider">HERE · TAP</p>
                      )}
                      {state === "cleared" && selected && (
                        <p className="text-[8px] text-amber-300 font-display mt-0.5 tracking-wider">PATROL</p>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {(() => {
              const unlocked = inInfinite;
              const selected = selectedId === WORMHOLE_ID;
              const isFocus = zoomId === WORMHOLE_ID;
              if (zooming && !isFocus) return null;
              return (
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleWormholeClick();
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 disabled:cursor-default pointer-events-auto ${
                    isFocus ? "z-[30]" : "z-20"
                  } ${unlocked ? "cursor-zoom-in" : ""}`}
                  style={{
                    left: `${WORMHOLE_POS.x}%`,
                    top: `${WORMHOLE_POS.y}%`,
                  }}
                  title={unlocked ? `Inspect Wormhole · Depth ${infiniteDepth}` : "Clear World Zero to open the Wormhole"}
                >
                  <WormholeIcon unlocked={unlocked} selected={selected || isFocus} animate={!zooming} />
                  {!zooming && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 flex flex-col items-center whitespace-nowrap">
                      <motion.p
                        className="text-[10px] sm:text-xs font-display font-black tracking-[0.14em] uppercase px-2.5 py-1 rounded-full bg-background/90 border"
                        style={{
                          color: unlocked ? WORMHOLE_COLOR : "#777",
                          borderColor: unlocked ? `${WORMHOLE_COLOR}66` : "#444",
                          boxShadow: unlocked ? `0 0 18px ${WORMHOLE_COLOR}55` : "none",
                        }}
                        animate={unlocked ? { opacity: [0.85, 1, 0.85] } : undefined}
                        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                      >
                        {unlocked ? `∞ Wormhole · Depth ${infiniteDepth}` : "∞ Wormhole Sealed"}
                      </motion.p>
                      {unlocked && selected && (
                        <p className="text-[9px] font-display font-bold mt-1 tracking-[0.2em]" style={{ color: WORMHOLE_CYAN }}>
                          ENTER
                        </p>
                      )}
                      {!unlocked && (
                        <p className="text-[8px] text-muted-foreground font-display mt-1 tracking-wide">
                          Clear World Zero
                        </p>
                      )}
                    </div>
                  )}
                </button>
              );
            })()}
          </div>
        </div>

        {/* Lore panel — solid (no backdrop-blur) while inspecting */}
        <AnimatePresence>
          {zooming && zoomPlanet && (
            <motion.div
              key={String(zoomId)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute z-[40] inset-x-3 bottom-3 sm:inset-x-auto sm:left-4 sm:right-auto sm:top-1/2 sm:-translate-y-1/2 sm:bottom-auto sm:w-[min(380px,46%)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="relative overflow-hidden rounded-2xl border-2 bg-background/98 px-4 py-4 sm:px-5 sm:py-5"
                style={{
                  borderColor: `${zoomPlanet.color}99`,
                  boxShadow: `0 0 0 1px ${zoomPlanet.color}33, 0 0 32px ${zoomPlanet.color}33, 0 16px 40px rgba(0,0,0,0.55)`,
                }}
              >
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `linear-gradient(145deg, ${zoomPlanet.color}22 0%, transparent 42%)`,
                  }}
                />
                <div
                  className="absolute top-0 inset-x-0 h-1.5"
                  style={{ background: `linear-gradient(90deg, ${zoomPlanet.color}, ${zoomPlanet.color}55, transparent)` }}
                />

                <button
                  type="button"
                  onClick={() => setZoomId(null)}
                  className="absolute top-3 right-3 z-[1] p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-border/40"
                  aria-label="Close lore"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="relative flex items-center gap-3 pr-8">
                  <div
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-3xl sm:text-4xl border-[3px] shrink-0"
                    style={{
                      borderColor: zoomPlanet.color,
                      background: `radial-gradient(circle at 35% 30%, ${zoomPlanet.color}88, ${zoomPlanet.color}28 55%, #0a0a14)`,
                      boxShadow: `0 0 20px ${zoomPlanet.color}55`,
                    }}
                  >
                    {zoomPlanet.icon}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-[10px] sm:text-[11px] font-display font-bold tracking-[0.22em] uppercase"
                      style={{ color: zoomPlanet.color }}
                    >
                      {zoomId === WORMHOLE_ID ? "Sector Lore" : `World ${zoomPlanet.id} · Lore Brief`}
                    </p>
                    <h3
                      className="font-display font-black text-xl sm:text-2xl tracking-wide leading-tight mt-0.5"
                      style={{ color: zoomPlanet.color }}
                    >
                      {zoomPlanet.name}
                    </h3>
                  </div>
                </div>

                <p className="relative mt-4 text-sm sm:text-[15px] leading-relaxed text-foreground font-medium">
                  {zoomPlanet.lore || zoomPlanet.description}
                </p>

                <div className="relative mt-4 flex flex-wrap gap-2">
                  {zoomPlanet.bossName && (
                    <span
                      className="text-[11px] font-display font-bold px-2.5 py-1 rounded-lg border"
                      style={{
                        color: zoomPlanet.color,
                        borderColor: `${zoomPlanet.color}66`,
                        background: `${zoomPlanet.color}18`,
                      }}
                    >
                      {zoomPlanet.bossEmoji || "☠"} Boss · {zoomPlanet.bossName}
                    </span>
                  )}
                  {zoomPlanet.shipMod && (
                    <span className="text-[11px] font-display font-bold px-2.5 py-1 rounded-lg border border-amber-400/50 bg-amber-400/15 text-amber-200">
                      Clear reward · {zoomPlanet.shipMod}
                    </span>
                  )}
                </div>

                <p className="relative mt-3 text-[10px] text-muted-foreground font-display tracking-wide">
                  Tap empty space or Esc to pull back
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className={`text-[10px] text-muted-foreground text-center ${fill ? "shrink-0 mt-1.5" : "mt-2"}`}>
        {zooming
          ? "Inspecting your current sector — pull back to return to the chart."
          : "Worlds 1–10 spiral into the Wormhole. Tap your current world to inspect its lore."}
      </p>
    </div>
  );
}
