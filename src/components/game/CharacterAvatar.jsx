import React from "react";
import { motion } from "framer-motion";

// Selectable feature option lists (shared with CharacterCreation)
export const EYES = ["Oval Beams", "Star Pupils", "Three Eyes", "Visor Glow", "Wide Saucer", "Cyber Slits"];
export const EARS = ["Pointed", "Finned", "Antennae", "Leaf", "Horns", "None"];
export const MOUTHS = ["Smirk", "Fanged", "Beak", "Tentacle", "Pursed", "Wide Grin"];
export const NOSES = ["Button", "Slits", "Trunk", "None", "Ridge", "Spike"];
export const BROWS = ["Raised", "Angled", "Thick", "None", "Zigzag", "Soft"];
export const MARKINGS = ["None", "Scar", "Mole Cluster", "Tribal Lines", "Freckles", "Cracks"];

// Comic-book cel-shaded constants
const INK = "#120a1c"; // heavy saturated outline
const SW = 5; // thick cartoon outline
const RIM = "#ffffff"; // rim-light edge

// Race-specific accent palettes
const RACE_ACCENT = {
  Zyrathi: { a: "#FF6B1A", b: "#C9300A" },
  Cognati: { a: "#00E5FF", b: "#1A6B8A" },
  Luminae: { a: "#FFE9A8", b: "#C9B8FF" },
  Grothak: { a: "#FF8C42", b: "#8B7355" },
  Synthara: { a: "#9D6BFF", b: "#2E1A47" },
};

function shade(hex, amt) {
  if (!hex) return "#888";
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  let r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amt));
  let g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amt));
  let b = Math.max(0, Math.min(255, (num & 255) + amt));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function Eyes({ style }) {
  const L = 72, R = 128, Y = 92;
  switch (style) {
    case "Three Eyes":
      return (
        <g>
          {[{ x: L, y: Y }, { x: 100, y: 78 }, { x: R, y: Y }].map((e, i) => (
            <g key={i}>
              <ellipse cx={e.x} cy={e.y} rx="14" ry="17" fill="#fff" stroke={INK} strokeWidth={SW} />
              <circle cx={e.x} cy={e.y + 3} r="8" fill="#00B8D4" stroke={INK} strokeWidth="2" />
              <circle cx={e.x} cy={e.y + 3} r="4" fill={INK} />
              <path d={`M${e.x - 3} ${e.y - 4} l4 2 2 4 -4 -2 z`} fill="#fff" />
            </g>
          ))}
        </g>
      );
    case "Visor Glow":
      return (
        <g>
          <rect x={L - 16} y={Y - 10} width={R - L + 32} height="20" rx="10" fill="#0a0f1e" stroke={INK} strokeWidth={SW} />
          <rect x={L - 12} y={Y - 6} width={R - L + 24} height="12" rx="6" fill="#00E5FF" />
          <path d={`M${L - 4} ${Y - 3} l8 2 2 4 -8 -2 z`} fill="#fff" opacity="0.9" />
        </g>
      );
    case "Wide Saucer":
      return (
        <g>
          {[L, R].map((x, i) => (
            <g key={i}>
              <circle cx={x} cy={Y} r="18" fill="#1a1a2e" stroke={INK} strokeWidth={SW} />
              <circle cx={x - 5} cy={Y - 5} r="7" fill="#fff" />
              <circle cx={x + 5} cy={Y + 5} r="4" fill="#00E5FF" />
              <path d={`M${x - 7} ${Y - 8} l3 4 4 1 -3 -4 z`} fill="#fff" />
            </g>
          ))}
        </g>
      );
    case "Cyber Slits":
      return (
        <g>
          {[L, R].map((x, i) => (
            <g key={i}>
              <rect x={x - 13} y={Y - 6} width="26" height="12" rx="6" fill="#00E5FF" stroke={INK} strokeWidth={SW} />
              <rect x={x - 9} y={Y - 2} width="18" height="4" rx="2" fill="#fff" />
            </g>
          ))}
        </g>
      );
    case "Star Pupils":
      return (
        <g>
          {[L, R].map((x, i) => (
            <g key={i}>
              <ellipse cx={x} cy={Y} rx="15" ry="18" fill="#fff" stroke={INK} strokeWidth={SW} />
              <path d={`M${x} ${Y - 9} l2.5 6 6 1 -4.5 4.5 1.5 6 -5.5 -3.5 -5.5 3.5 1.5 -6 -4.5 -4.5 6 -1 z`} fill="#7C3AED" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
            </g>
          ))}
        </g>
      );
    default: // Oval Beams — big comic eyes
      return (
        <g>
          {[L, R].map((x, i) => (
            <g key={i}>
              <ellipse cx={x} cy={Y} rx="14" ry="18" fill="#fff" stroke={INK} strokeWidth={SW} />
              <circle cx={x} cy={Y + 4} r="9" fill="#00B8D4" stroke={INK} strokeWidth="2" />
              <circle cx={x} cy={Y + 4} r="4.5" fill={INK} />
              <path d={`M${x - 4} ${Y - 4} l5 2 2 5 -5 -2 z`} fill="#fff" />
              <path d={`M${x + 6} ${Y - 8} l1.5 3 3 1.5 -3 1.5 -1.5 3 -1.5 -3 -3 -1.5 3 -1.5 z`} fill="#fff" />
            </g>
          ))}
        </g>
      );
  }
}

function Ears({ style, skin, dark }) {
  const Y = 108;
  switch (style) {
    case "Pointed":
      return (
        <g>
          <path d={`M50 ${Y} l-30 -30 l8 30 z`} fill={skin} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d={`M150 ${Y} l30 -30 l-8 30 z`} fill={skin} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d={`M44 ${Y - 6} l-10 -8`} stroke={shade(skin, 30)} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case "Finned":
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <path d={`M48 ${Y - 10 + i * 10} q-24 -6 -32 3`} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
              <path d={`M152 ${Y - 10 + i * 10} q24 -6 32 3`} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
            </g>
          ))}
        </g>
      );
    case "Antennae":
      return (
        <g>
          <line x1="72" y1="58" x2="54" y2="20" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <circle cx="53" cy="18" r="8" fill="#00E5FF" stroke={INK} strokeWidth={SW} />
          <path d="M49 14 l3 3 3 -1 -3 -3 z" fill="#fff" />
          <line x1="128" y1="58" x2="146" y2="20" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <circle cx="147" cy="18" r="8" fill="#00E5FF" stroke={INK} strokeWidth={SW} />
          <path d="M143 14 l3 3 3 -1 -3 -3 z" fill="#fff" />
        </g>
      );
    case "Leaf":
      return (
        <g>
          <path d={`M50 ${Y} q-30 -16 -32 -42 q24 8 32 42 z`} fill={skin} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d={`M150 ${Y} q30 -16 32 -42 q-24 8 -32 42 z`} fill={skin} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
        </g>
      );
    case "Horns":
      return (
        <g>
          <path d={`M62 54 q-14 -34 8 -48 q10 22 -8 48 z`} fill="#f4e4bc" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d={`M138 54 q14 -34 -8 -48 q-10 22 8 48 z`} fill="#f4e4bc" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
        </g>
      );
    default:
      return null;
  }
}

function Brows({ style }) {
  const Y = 66, L = 60, R = 140;
  switch (style) {
    case "Angled":
      return (
        <g>
          <path d={`M${L} ${Y + 6} l28 -12`} stroke={INK} strokeWidth="7" strokeLinecap="round" />
          <path d={`M${R} ${Y + 6} l-28 -12`} stroke={INK} strokeWidth="7" strokeLinecap="round" />
        </g>
      );
    case "Thick":
      return (
        <g>
          <rect x={L - 5} y={Y - 5} width="34" height="10" rx="5" fill={INK} />
          <rect x={R - 29} y={Y - 5} width="34" height="10" rx="5" fill={INK} />
        </g>
      );
    case "Zigzag":
      return (
        <g>
          <polyline points={`${L},${Y} ${L + 10},${Y - 6} ${L + 20},${Y} ${L + 30},${Y - 6}`} fill="none" stroke={INK} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={`${R},${Y} ${R - 10},${Y - 6} ${R - 20},${Y} ${R - 30},${Y - 6}`} fill="none" stroke={INK} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case "Soft":
      return (
        <g>
          <path d={`M${L} ${Y + 4} q14 -9 30 0`} fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <path d={`M${R} ${Y + 4} q-14 -9 -30 0`} fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
        </g>
      );
    case "None":
      return null;
    default:
      return (
        <g>
          <path d={`M${L} ${Y - 2} q14 -7 30 0`} fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <path d={`M${R} ${Y - 2} q-14 -7 -30 0`} fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
        </g>
      );
  }
}

function Nose({ style, dark }) {
  switch (style) {
    case "Slits":
      return <g><ellipse cx="94" cy="104" rx="3.5" ry="7" fill={INK} /><ellipse cx="106" cy="104" rx="3.5" ry="7" fill={INK} /></g>;
    case "Trunk":
      return <path d="M100 100 q-7 18 0 32 q6 6 11 0 q-6 -14 0 -32" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />;
    case "Ridge":
      return <path d="M100 82 l0 34" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />;
    case "Spike":
      return <path d="M100 94 l8 16 l-16 0 z" fill={shade(dark, 20)} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />;
    case "None":
      return null;
    default:
      return <ellipse cx="100" cy="104" rx="8" ry="7" fill={shade(dark, 35)} stroke={INK} strokeWidth={SW} />;
  }
}

function Mouth({ style }) {
  const Y = 136;
  switch (style) {
    case "Fanged":
      return (
        <g>
          <path d={`M76 ${Y} q24 20 48 0 q-24 12 -48 0 z`} fill="#5b1a1a" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M86 136 l6 14 l6 -14 z" fill="#fff" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M108 136 l6 14 l6 -14 z" fill="#fff" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        </g>
      );
    case "Beak":
      return <path d={`M100 ${Y - 9} l20 16 l-20 16 l-20 -16 z`} fill="#FFA42B" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />;
    case "Tentacle":
      return (
        <g>
          {[76, 88, 100, 112, 124].map((x, i) => (
            <path key={i} d={`M${x} ${Y} q6 14 -3 23 q9 -3 6 -16`} fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          ))}
        </g>
      );
    case "Pursed":
      return <ellipse cx="100" cy={Y} rx="9" ry="6" fill="#5b1a1a" stroke={INK} strokeWidth={SW} />;
    case "Wide Grin":
      return (
        <g>
          <path d={`M74 ${Y} q26 24 52 0 q-26 13 -52 0 z`} fill="#fff" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d={`M74 ${Y} l52 0`} stroke={INK} strokeWidth="2.5" />
          <path d="M84 136 l4 8 4 -8 z M108 136 l4 8 4 -8 z" fill={INK} />
        </g>
      );
    default: // Smirk
      return <path d={`M78 ${Y} q22 18 44 -4`} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />;
  }
}

function Markings({ style, dark }) {
  switch (style) {
    case "Scar":
      return <g><path d="M118 70 l11 24" fill="none" stroke="#d8c4ff" strokeWidth="3.5" strokeLinecap="round" /><path d="M116 78 l8 0 M121 86 l8 0" stroke="#d8c4ff" strokeWidth="2.5" strokeLinecap="round" /></g>;
    case "Mole Cluster":
      return <g><circle cx="116" cy="108" r="3.5" fill={dark} /><circle cx="125" cy="114" r="2.5" fill={dark} /><circle cx="109" cy="112" r="2.5" fill={dark} /></g>;
    case "Tribal Lines":
      return <g><path d="M56 108 l16 -7 l-9 14 z" fill="none" stroke="#d8c4ff" strokeWidth="3" strokeLinejoin="round" /><path d="M144 108 l-16 -7 l9 14 z" fill="none" stroke="#d8c4ff" strokeWidth="3" strokeLinejoin="round" /></g>;
    case "Freckles":
      return <g>{[90, 98, 106, 94, 102].map((x, i) => (<circle key={i} cx={x} cy={100 + (i % 2) * 4} r="2" fill={dark} opacity="0.75" />))}</g>;
    case "Cracks":
      return <g><path d="M100 54 l6 20 l-4 11 l7 13" fill="none" stroke="#9a8ab5" strokeWidth="3" strokeLinecap="round" /><path d="M107 85 l9 6 l-2 7" fill="none" stroke="#9a8ab5" strokeWidth="2.5" strokeLinecap="round" /></g>;
    default:
      return null;
  }
}

function RaceBase({ race, skin, dark, light }) {
  switch (race) {
    case "Zyrathi":
      return (
        <g>
          <path d="M100 150 q-50 0 -50 -8 q0 30 50 30 q50 0 50 -30 q0 8 -50 8 z" fill={RACE_ACCENT.Zyrathi.a} opacity="0.4" />
          <path d="M100 44 q-52 0 -52 48 q0 24 8 36 q0 22 44 22 q44 0 44 -22 q8 -12 8 -36 q0 -48 -52 -48 z" fill={`url(#paint-${race})`} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M100 120 q-18 8 -12 26 q12 6 24 0 q6 -18 -12 -26 z" fill={shade(skin, -16)} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <circle cx="92" cy="142" r="2.4" fill={INK} />
          <circle cx="108" cy="142" r="2.4" fill={INK} />
          {[[68, 92], [132, 92], [76, 112], [124, 112], [100, 128]].map(([x, y], i) => (
            <path key={i} d={`M${x - 8} ${y} q8 -8 16 0`} fill="none" stroke={dark} strokeWidth="2" opacity="0.6" />
          ))}
          {[
            { x: 78, d: -8 },
            { x: 100, d: 0 },
            { x: 122, d: 8 },
          ].map((s, i) => (
            <path key={i} d={`M${s.x} 46 l${s.d} -26 l${s.d === 0 ? 11 : -s.d + 5} 26 z`} fill={shade(skin, 30)} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          ))}
        </g>
      );
    case "Cognati":
      return (
        <g>
          <line x1="100" y1="42" x2="100" y2="22" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <circle cx="100" cy="20" r="6" fill={RACE_ACCENT.Cognati.a} stroke={INK} strokeWidth={SW} />
          <path d="M100 42 q-46 0 -46 14 l0 44 q0 18 8 30 q4 22 38 22 q34 0 38 -22 q8 -12 8 -30 l0 -44 q0 -14 -46 -14 z" fill={`url(#paint-${race})`} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <line x1="100" y1="42" x2="100" y2="164" stroke={RACE_ACCENT.Cognati.a} strokeWidth="3" />
          <path d="M64 62 q-7 26 0 54" fill="none" stroke={RACE_ACCENT.Cognati.a} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M136 62 q7 26 0 54" fill="none" stroke={RACE_ACCENT.Cognati.a} strokeWidth="3.5" strokeLinecap="round" />
          {[[60, 70], [140, 70], [60, 132], [140, 132]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4" fill={dark} stroke={INK} strokeWidth="2" />
          ))}
        </g>
      );
    case "Luminae":
      return (
        <g>
          <circle cx="100" cy="100" r="80" fill={RACE_ACCENT.Luminae.a} opacity="0.14" />
          <circle cx="100" cy="100" r="62" fill={RACE_ACCENT.Luminae.b} opacity="0.22" />
          <path d="M100 40 q-16 -20 -26 -7 q-22 8 -22 66 q0 60 48 60 q48 0 48 -60 q0 -58 -22 -66 q-10 -13 -26 7 z" fill={`url(#paint-${race})`} stroke={shade(light, 12)} strokeWidth={SW} strokeLinejoin="round" />
          {[[62, 56], [100, 28], [138, 56]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y} q5 -18 8 -4 q5 -14 8 4 z`} fill={RACE_ACCENT.Luminae.a} stroke={shade(light, 12)} strokeWidth="2" />
          ))}
          {[[56, 76], [144, 76], [70, 140], [130, 140]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y} l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 z`} fill="#fff" opacity="0.9" />
          ))}
        </g>
      );
    case "Grothak":
      return (
        <g>
          <path d="M100 46 q-60 0 -60 52 q0 18 10 30 q-4 28 50 28 q54 0 50 -28 q10 -12 10 -30 q0 -52 -60 -52 z" fill={`url(#paint-${race})`} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M50 84 q50 -16 100 0" fill="none" stroke={dark} strokeWidth="8" opacity="0.7" strokeLinecap="round" />
          <path d="M100 58 l9 13 l-9 13 l-9 -13 z" fill={RACE_ACCENT.Grothak.a} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M70 128 l6 16 l-3 8" fill="none" stroke={dark} strokeWidth="2.5" opacity="0.5" strokeLinecap="round" />
          <path d="M130 124 l-4 14 l3 10" fill="none" stroke={dark} strokeWidth="2.5" opacity="0.5" strokeLinecap="round" />
          <path d="M56 100 q-6 -8 -2 -14" fill="none" stroke="#6b8e3d" strokeWidth="3" strokeLinecap="round" />
          <path d="M144 100 q6 -8 2 -14" fill="none" stroke="#6b8e3d" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case "Synthara":
      return (
        <g>
          <path d="M52 96 q-18 -6 -20 8 q14 4 20 -8 z" fill={RACE_ACCENT.Synthara.a} opacity="0.45" />
          <path d="M148 96 q18 -6 20 8 q-14 4 -20 -8 z" fill={RACE_ACCENT.Synthara.a} opacity="0.45" />
          <path d="M100 42 q-48 0 -48 56 q0 34 24 50 q10 22 24 22 q14 0 24 -22 q24 -16 24 -50 q0 -56 -48 -56 z" fill={`url(#paint-${race})`} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M56 92 q44 -18 88 0" fill="none" stroke={dark} strokeWidth="4.5" opacity="0.5" strokeLinecap="round" />
          <path d="M54 112 q-10 20 0 34" fill="none" stroke={RACE_ACCENT.Synthara.a} strokeWidth="3.5" opacity="0.5" strokeLinecap="round" />
          <path d="M146 112 q10 20 0 34" fill="none" stroke={RACE_ACCENT.Synthara.a} strokeWidth="3.5" opacity="0.5" strokeLinecap="round" />
        </g>
      );
    default:
      return <ellipse cx="100" cy="100" rx="56" ry="64" fill={`url(#paint-${race})`} stroke={INK} strokeWidth={SW} />;
  }
}

export default function CharacterAvatar({
  race,
  skinColor,
  eyeStyle,
  ears,
  mouth,
  nose,
  eyebrows,
  marking,
  cls,
  size = 180,
}) {
  const skin = skinColor || "#67a832";
  const dark = shade(skin, -50);
  const light = shade(skin, 34);
  const accent = (RACE_ACCENT[race] || RACE_ACCENT.Cognati).a;

  const featureKey = `${race}-${skinColor}-${eyeStyle}-${eyebrows}-${ears}-${nose}-${mouth}-${marking}`;

  return (
    <motion.div
      key={featureKey}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      style={{ width: size, height: size }}
    >
      <motion.div
        animate={{ scaleY: [1, 0.97, 1] }}
        transition={{ duration: 3, ease: [0.4, 0, 0.2, 1], repeat: Infinity }}
        style={{ width: size, height: size, transformOrigin: "bottom center" }}
      >
        <svg viewBox="0 0 200 200" width={size} height={size} className="select-none">
          <defs>
            {/* Cel-shaded hard-stop gradient — 3 flat bands for a comic look */}
            <linearGradient id={`paint-${race}`} x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0%" stopColor={light} />
              <stop offset="42%" stopColor={light} />
              <stop offset="46%" stopColor={skin} />
              <stop offset="74%" stopColor={skin} />
              <stop offset="78%" stopColor={dark} />
              <stop offset="100%" stopColor={dark} />
            </linearGradient>
            <radialGradient id={`aura-${race}`} cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.45" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Painted aura backdrop */}
          <ellipse cx="100" cy="100" rx="84" ry="90" fill={`url(#aura-${race})`} />

          {/* Neck */}
          <rect x="84" y="150" width="32" height="46" rx="12" fill={dark} opacity="0.6" />

          {/* Ears (behind head) */}
          <Ears style={ears} skin={skin} dark={dark} />

          {/* Head */}
          <RaceBase race={race} skin={skin} dark={dark} light={light} />

          {/* Rim-light edge along the head crown */}
          <path d="M100 44 q-52 0 -52 48" fill="none" stroke={RIM} strokeWidth="3" strokeLinecap="round" opacity="0.5" />

          {/* Face features */}
          <motion.g
            animate={{ y: [0, -2.5, 0] }}
            transition={{ duration: 3, ease: [0.4, 0, 0.2, 1], repeat: Infinity, delay: 0.15 }}
          >
            <Brows style={eyebrows} />
            <Eyes style={eyeStyle} />
            <Nose style={nose} dark={dark} />
            <Mouth style={mouth} />
            <Markings style={marking} dark={dark} />
          </motion.g>
        </svg>
      </motion.div>
    </motion.div>
  );
}