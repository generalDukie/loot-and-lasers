import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS } from "@/lib/avatarFeatures";
import { ART_INK, ART_RIM, ART_SW, RACE_ACCENT, shade, paintStops } from "@/lib/artStyle";

export { EYES, EARS, MOUTHS, NOSES, BROWS, MARKINGS };

const INK = ART_INK;
const SW = ART_SW;
const RIM = ART_RIM;

function Eyes({ style }) {
  const L = 70, R = 130, Y = 90;
  switch (style) {
    case "Multi-Lens":
    case "Three Eyes":
      return (
        <g>
          {[{ x: L, y: Y }, { x: 100, y: 74 }, { x: R, y: Y }].map((e, i) => (
            <g key={i}>
              <ellipse cx={e.x} cy={e.y} rx="15" ry="18" fill="#fff" stroke={INK} strokeWidth={SW} />
              <circle cx={e.x} cy={e.y + 3} r="8" fill="#00B8D4" stroke={INK} strokeWidth="2" />
              <circle cx={e.x} cy={e.y + 3} r="4" fill={INK} />
              <path d={`M${e.x - 3} ${e.y - 4} l4 2 2 4 -4 -2 z`} fill="#fff" />
            </g>
          ))}
        </g>
      );
    case "Target Visor":
    case "Visor Glow":
      return (
        <g>
          <rect x={L - 18} y={Y - 12} width={R - L + 36} height="24" rx="12" fill="#0a0f1e" stroke={INK} strokeWidth={SW} />
          <rect x={L - 14} y={Y - 7} width={R - L + 28} height="14" rx="7" fill="#00E5FF" />
          <path d={`M${L - 4} ${Y - 3} l8 2 2 4 -8 -2 z`} fill="#fff" opacity="0.9" />
        </g>
      );
    case "Wide Scan":
    case "Wide Saucer":
      return (
        <g>
          {[L, R].map((x, i) => (
            <g key={i}>
              <circle cx={x} cy={Y} r="19" fill="#1a1a2e" stroke={INK} strokeWidth={SW} />
              <circle cx={x - 5} cy={Y - 5} r="7" fill="#fff" />
              <circle cx={x + 5} cy={Y + 5} r="4" fill="#00E5FF" />
            </g>
          ))}
        </g>
      );
    case "Combat Slits":
    case "Cyber Slits":
      return (
        <g>
          {[L, R].map((x, i) => (
            <g key={i}>
              <rect x={x - 14} y={Y - 7} width="28" height="14" rx="7" fill="#00E5FF" stroke={INK} strokeWidth={SW} />
              <rect x={x - 10} y={Y - 2} width="20" height="5" rx="2" fill="#fff" />
            </g>
          ))}
        </g>
      );
    case "Prism Optics":
    case "Star Pupils":
      return (
        <g>
          {[L, R].map((x, i) => (
            <g key={i}>
              <ellipse cx={x} cy={Y} rx="16" ry="19" fill="#fff" stroke={INK} strokeWidth={SW} />
              <path d={`M${x} ${Y - 9} l2.5 6 6 1 -4.5 4.5 1.5 6 -5.5 -3.5 -5.5 3.5 1.5 -6 -4.5 -4.5 6 -1 z`} fill="#7C3AED" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
            </g>
          ))}
        </g>
      );
    default:
      return (
        <g>
          {[L, R].map((x, i) => (
            <g key={i}>
              <ellipse cx={x} cy={Y} rx="15" ry="19" fill="#fff" stroke={INK} strokeWidth={SW} />
              <circle cx={x} cy={Y + 4} r="9" fill="#00B8D4" stroke={INK} strokeWidth="2" />
              <circle cx={x} cy={Y + 4} r="4.5" fill={INK} />
              <path d={`M${x - 4} ${Y - 4} l5 2 2 5 -5 -2 z`} fill="#fff" />
            </g>
          ))}
        </g>
      );
  }
}

function Ears({ style, skin }) {
  const Y = 108;
  switch (style) {
    case "Tapered":
    case "Pointed":
      return (
        <g>
          <path d={`M48 ${Y} l-32 -34 l10 34 z`} fill={skin} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d={`M152 ${Y} l32 -34 l-10 34 z`} fill={skin} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d={`M42 ${Y - 8} l-12 -10`} stroke={shade(skin, 30)} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case "Finned":
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <path d={`M46 ${Y - 12 + i * 11} q-26 -8 -34 4`} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
              <path d={`M154 ${Y - 12 + i * 11} q26 -8 34 4`} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
            </g>
          ))}
        </g>
      );
    case "Sensor Stalks":
    case "Antennae":
      return (
        <g>
          <line x1="70" y1="56" x2="50" y2="16" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <circle cx="49" cy="14" r="9" fill="#00E5FF" stroke={INK} strokeWidth={SW} />
          <line x1="130" y1="56" x2="150" y2="16" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <circle cx="151" cy="14" r="9" fill="#00E5FF" stroke={INK} strokeWidth={SW} />
        </g>
      );
    case "Elongated":
    case "Leaf":
      return (
        <g>
          <path d={`M48 ${Y} q-34 -18 -36 -46 q28 10 36 46 z`} fill={skin} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d={`M152 ${Y} q34 -18 36 -46 q-28 10 -36 46 z`} fill={skin} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
        </g>
      );
    case "Crest Horns":
    case "Horns":
      return (
        <g>
          <path d="M60 52 q-16 -40 10 -54 q12 26 -10 54 z" fill="#f4e4bc" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M140 52 q16 -40 -10 -54 q-12 26 10 54 z" fill="#f4e4bc" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
        </g>
      );
    default:
      return null;
  }
}

function Brows({ style }) {
  const Y = 64, L = 56, R = 144;
  switch (style) {
    case "Tactical":
    case "Angled":
      return (
        <g>
          <path d={`M${L} ${Y + 8} l32 -14`} stroke={INK} strokeWidth="7" strokeLinecap="round" />
          <path d={`M${R} ${Y + 8} l-32 -14`} stroke={INK} strokeWidth="7" strokeLinecap="round" />
        </g>
      );
    case "Heavy":
    case "Thick":
      return (
        <g>
          <rect x={L - 4} y={Y - 4} width="36" height="11" rx="5" fill={INK} />
          <rect x={R - 32} y={Y - 4} width="36" height="11" rx="5" fill={INK} />
        </g>
      );
    case "Scarred":
    case "Zigzag":
      return (
        <g>
          <polyline points={`${L},${Y} ${L + 10},${Y - 7} ${L + 20},${Y} ${L + 32},${Y - 7}`} fill="none" stroke={INK} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={`${R},${Y} ${R - 10},${Y - 7} ${R - 20},${Y} ${R - 32},${Y - 7}`} fill="none" stroke={INK} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case "Relaxed":
    case "Soft":
      return (
        <g>
          <path d={`M${L} ${Y + 4} q16 -10 34 0`} fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <path d={`M${R} ${Y + 4} q-16 -10 -34 0`} fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
        </g>
      );
    case "None":
      return null;
    default:
      return (
        <g>
          <path d={`M${L} ${Y} q16 -8 34 0`} fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <path d={`M${R} ${Y} q-16 -8 -34 0`} fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
        </g>
      );
  }
}

function Nose({ style, dark }) {
  switch (style) {
    case "Slits":
      return <g><ellipse cx="93" cy="106" rx="4" ry="8" fill={INK} /><ellipse cx="107" cy="106" rx="4" ry="8" fill={INK} /></g>;
    case "Trunk":
      return <path d="M100 102 q-8 20 0 36 q7 7 12 0 q-7 -16 0 -36" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />;
    case "Ridge":
      return <path d="M100 80 l0 38" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />;
    case "Spike":
      return <path d="M100 96 l9 18 l-18 0 z" fill={shade(dark, 20)} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />;
    case "None":
      return null;
    default:
      return <ellipse cx="100" cy="106" rx="9" ry="8" fill={shade(dark, 35)} stroke={INK} strokeWidth={SW} />;
  }
}

function Mouth({ style }) {
  const Y = 138;
  switch (style) {
    case "Tusked":
    case "Fanged":
      return (
        <g>
          <path d={`M74 ${Y} q26 22 52 0 q-26 14 -52 0 z`} fill="#5b1a1a" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M84 138 l7 16 l7 -16 z" fill="#fff" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M108 138 l7 16 l7 -16 z" fill="#fff" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        </g>
      );
    case "Mandible":
    case "Beak":
      return <path d={`M100 ${Y - 10} l22 18 l-22 18 l-22 -18 z`} fill="#FFA42B" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />;
    case "Proboscis":
    case "Tentacle":
      return (
        <g>
          {[74, 87, 100, 113, 126].map((x, i) => (
            <path key={i} d={`M${x} ${Y} q7 16 -3 26`} fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          ))}
        </g>
      );
    case "Closed":
    case "Pursed":
      return <ellipse cx="100" cy={Y} rx="10" ry="7" fill="#5b1a1a" stroke={INK} strokeWidth={SW} />;
    case "Grim Line":
    case "Wide Grin":
      return (
        <g>
          <path d={`M72 ${Y} q28 26 56 0 q-28 14 -56 0 z`} fill="#fff" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d={`M72 ${Y} l56 0`} stroke={INK} strokeWidth="2.5" />
        </g>
      );
    default:
      return <path d={`M76 ${Y} q24 20 48 -4`} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />;
  }
}

function Markings({ style, dark }) {
  switch (style) {
    case "Battle Scar":
    case "Scar":
      return <g><path d="M118 68 l12 26" fill="none" stroke="#d8c4ff" strokeWidth="3.5" strokeLinecap="round" /><path d="M116 76 l9 0 M122 86 l9 0" stroke="#d8c4ff" strokeWidth="2.5" strokeLinecap="round" /></g>;
    case "Plasma Burns":
    case "Mole Cluster":
      return <g><circle cx="116" cy="110" r="3.5" fill={dark} /><circle cx="126" cy="116" r="2.5" fill={dark} /><circle cx="108" cy="114" r="2.5" fill={dark} /></g>;
    case "War Paint":
    case "Tribal Lines":
      return <g><path d="M54 110 l18 -8 l-10 16 z" fill="none" stroke="#d8c4ff" strokeWidth="3" strokeLinejoin="round" /><path d="M146 110 l-18 -8 l10 16 z" fill="none" stroke="#d8c4ff" strokeWidth="3" strokeLinejoin="round" /></g>;
    case "Speckled":
    case "Freckles":
      return <g>{[88, 96, 104, 92, 100].map((x, i) => (<circle key={i} cx={x} cy={102 + (i % 2) * 5} r="2.2" fill={dark} opacity="0.75" />))}</g>;
    case "Fractured":
    case "Cracks":
      return <g><path d="M100 52 l7 22 l-5 12 l8 14" fill="none" stroke="#9a8ab5" strokeWidth="3" strokeLinecap="round" /><path d="M108 84 l10 7 l-2 8" fill="none" stroke="#9a8ab5" strokeWidth="2.5" strokeLinecap="round" /></g>;
    default:
      return null;
  }
}

/** Exaggerated race silhouettes — unique read at small sizes. */
function RaceBase({ race, skin, dark, light, paintId }) {
  const paint = `url(#paint-${paintId || race})`;
  const acc = RACE_ACCENT[race] || RACE_ACCENT.Cognati;

  switch (race) {
    case "Zyrathi":
      // Horned dragonfolk — big snout, scale plates, ember crest
      return (
        <g>
          <ellipse cx="100" cy="168" rx="48" ry="14" fill={acc.a} opacity="0.35" />
          {/* Triple horns */}
          <path d="M58 48 L48 8 L72 42 Z" fill={shade(skin, 25)} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M100 40 L100 2 L114 40 Z" fill={acc.a} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M142 48 L152 8 L128 42 Z" fill={shade(skin, 25)} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          {/* Oversized oval head */}
          <path d="M100 38 Q44 42 40 100 Q42 158 100 168 Q158 158 160 100 Q156 42 100 38 Z" fill={paint} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          {/* Snout plate */}
          <path d="M100 118 Q72 122 68 148 Q100 162 132 148 Q128 122 100 118 Z" fill={shade(skin, -18)} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <circle cx="90" cy="142" r="3" fill={INK} />
          <circle cx="110" cy="142" r="3" fill={INK} />
          {/* Scale arcs */}
          {[[62, 88], [138, 88], [70, 112], [130, 112], [100, 130]].map(([x, y], i) => (
            <path key={i} d={`M${x - 10} ${y} q10 -9 20 0`} fill="none" stroke={dark} strokeWidth="2.5" opacity="0.65" />
          ))}
          <path d="M52 70 Q100 58 148 70" fill="none" stroke={acc.glow} strokeWidth="3" opacity="0.5" />
        </g>
      );

    case "Cognati":
      // Chrome android — faceted panel head, antenna, LED seams
      return (
        <g>
          <line x1="100" y1="40" x2="100" y2="14" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <circle cx="100" cy="12" r="8" fill={acc.a} stroke={INK} strokeWidth={SW} />
          <circle cx="100" cy="12" r="3" fill="#fff" opacity="0.9" />
          {/* Hex-ish chassis head */}
          <path d="M100 40 L148 58 L152 118 L100 168 L48 118 L52 58 Z" fill={paint} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M100 40 L100 168" stroke={acc.a} strokeWidth="3.5" opacity="0.85" />
          <path d="M62 70 Q54 100 62 130" fill="none" stroke={acc.a} strokeWidth="3" strokeLinecap="round" />
          <path d="M138 70 Q146 100 138 130" fill="none" stroke={acc.a} strokeWidth="3" strokeLinecap="round" />
          {[[58, 66], [142, 66], [56, 128], [144, 128]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5" fill={dark} stroke={INK} strokeWidth="2" />
          ))}
          <rect x="78" y="48" width="44" height="8" rx="3" fill={acc.glow} opacity="0.55" stroke={INK} strokeWidth="2" />
        </g>
      );

    case "Luminae":
      // Starfolk — soft halo, pointed crown, constellation sparkles
      return (
        <g>
          <circle cx="100" cy="100" r="88" fill={acc.a} opacity="0.16" />
          <circle cx="100" cy="100" r="70" fill={acc.b} opacity="0.22" />
          {/* Flame-soft head */}
          <path d="M100 36 Q78 18 58 42 Q42 70 44 112 Q48 160 100 170 Q152 160 156 112 Q158 70 142 42 Q122 18 100 36 Z" fill={paint} stroke={shade(light, 20)} strokeWidth={SW} strokeLinejoin="round" />
          {/* Crown flares */}
          {[[62, 40], [100, 22], [138, 40]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y} q6 -20 10 -4 q6 -16 10 4 z`} fill={acc.a} stroke={shade(light, 12)} strokeWidth="2.5" />
          ))}
          {[[50, 78], [150, 78], [64, 148], [136, 148], [100, 52]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y} l2 5 5 1.5 -5 1.5 -2 5 -2 -5 -5 -1.5 5 -1.5 z`} fill="#fff" opacity="0.95" />
          ))}
        </g>
      );

    case "Grothak":
      // High-g tank — massive block head, gem brow, moss cracks
      return (
        <g>
          <path d="M100 42 Q28 48 24 108 Q28 168 100 176 Q172 168 176 108 Q172 48 100 42 Z" fill={paint} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M36 88 Q100 70 164 88" fill="none" stroke={dark} strokeWidth="10" opacity="0.65" strokeLinecap="round" />
          <path d="M100 52 L114 72 L100 92 L86 72 Z" fill={acc.a} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M58 130 l8 20 l-4 10" fill="none" stroke={dark} strokeWidth="3" opacity="0.55" strokeLinecap="round" />
          <path d="M142 126 l-6 18 l4 12" fill="none" stroke={dark} strokeWidth="3" opacity="0.55" strokeLinecap="round" />
          <path d="M40 108 q-8 -10 -4 -18" fill="none" stroke="#6b8e3d" strokeWidth="4" strokeLinecap="round" />
          <path d="M160 108 q8 -10 4 -18" fill="none" stroke="#6b8e3d" strokeWidth="4" strokeLinecap="round" />
          <ellipse cx="100" cy="150" rx="28" ry="10" fill={dark} opacity="0.25" />
        </g>
      );

    case "Synthara":
      // Shadow morph — teardrop face, phase wisps, sly asymmetry
      return (
        <g>
          <path d="M40 96 Q18 88 14 108 Q28 118 42 108 Z" fill={acc.a} opacity="0.55" />
          <path d="M160 96 Q182 88 186 108 Q172 118 158 108 Z" fill={acc.a} opacity="0.55" />
          <path d="M100 36 Q46 44 42 108 Q48 158 100 174 Q152 158 158 108 Q154 44 100 36 Z" fill={paint} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d="M52 94 Q100 74 148 94" fill="none" stroke={dark} strokeWidth="5" opacity="0.45" strokeLinecap="round" />
          <path d="M48 118 Q36 148 52 160" fill="none" stroke={acc.glow} strokeWidth="4" opacity="0.55" strokeLinecap="round" />
          <path d="M152 118 Q164 148 148 160" fill="none" stroke={acc.glow} strokeWidth="4" opacity="0.55" strokeLinecap="round" />
          <path d="M88 48 Q100 58 118 50" fill="none" stroke={acc.a} strokeWidth="2.5" opacity="0.7" />
        </g>
      );

    default:
      return <ellipse cx="100" cy="100" rx="58" ry="66" fill={paint} stroke={INK} strokeWidth={SW} />;
  }
}

function BlinkLids({ skin }) {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let waitTimer;
    let openTimer;
    let secondTimer;

    function schedule() {
      const gapMs = 2000 + Math.random() * 3000; // 2–5s between blinks
      waitTimer = setTimeout(() => {
        if (cancelled) return;
        const doubleBlink = Math.random() < 0.22;
        setClosed(true);
        openTimer = setTimeout(() => {
          if (cancelled) return;
          setClosed(false);
          if (doubleBlink) {
            secondTimer = setTimeout(() => {
              if (cancelled) return;
              setClosed(true);
              openTimer = setTimeout(() => {
                if (cancelled) return;
                setClosed(false);
                schedule();
              }, 110);
            }, 90);
          } else {
            schedule();
          }
        }, 120);
      }, gapMs);
    }

    schedule();
    return () => {
      cancelled = true;
      clearTimeout(waitTimer);
      clearTimeout(openTimer);
      clearTimeout(secondTimer);
    };
  }, []);

  return (
    <>
      <motion.rect x="52" y="76" width="42" rx="10" fill={skin} initial={false} animate={{ height: closed ? 32 : 0 }} transition={{ duration: closed ? 0.045 : 0.08, ease: "easeOut" }} />
      <motion.rect x="106" y="76" width="42" rx="10" fill={skin} initial={false} animate={{ height: closed ? 32 : 0 }} transition={{ duration: closed ? 0.045 : 0.08, ease: "easeOut" }} />
    </>
  );
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
  static: isStatic = false,
  uid,
}) {
  const skin = skinColor || "#67a832";
  const dark = shade(skin, -50);
  const light = shade(skin, 34);
  const accent = (RACE_ACCENT[race] || RACE_ACCENT.Cognati).a;
  const gid = uid || race || "avatar";
  const featureKey = `${race}-${skinColor}-${eyeStyle}-${eyebrows}-${ears}-${nose}-${mouth}-${marking}`;
  const stops = paintStops(skin, light, dark);

  return (
    <motion.div
      key={featureKey}
      initial={{ scale: 0.88, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 18 }}
      style={{ width: size, height: size }}
    >
      <motion.div
        animate={
          isStatic
            ? undefined
            : {
                y: [0, -3, 0],
                scaleY: [1, 0.985, 1],
                scaleX: [1, 1.01, 1],
              }
        }
        transition={isStatic ? undefined : { duration: 3.6, ease: "easeInOut", repeat: Infinity }}
        style={{ width: size, height: size, transformOrigin: "bottom center" }}
      >
        <svg viewBox="0 0 200 200" width={size} height={size} className="select-none overflow-visible">
          <defs>
            <linearGradient id={`paint-${gid}`} x1="0" y1="0" x2="0.35" y2="1">
              {stops.map((s) => (
                <stop key={s.offset} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
            <radialGradient id={`aura-${gid}`} cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.45" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
          </defs>

          <ellipse cx="100" cy="100" rx="84" ry="90" fill={`url(#aura-${gid})`} />

          <rect x="84" y="150" width="32" height="46" rx="12" fill={dark} opacity="0.6" />

          <Ears style={ears} skin={skin} />
          <RaceBase race={race} skin={skin} dark={dark} light={light} paintId={gid} />
          <path d="M100 44 q-52 0 -52 48" fill="none" stroke={RIM} strokeWidth="3" strokeLinecap="round" opacity="0.5" />

          <motion.g
            animate={isStatic ? undefined : { y: [0, -1.5, 0] }}
            transition={isStatic ? undefined : { duration: 3.6, ease: "easeInOut", repeat: Infinity, delay: 0.15 }}
          >
            <Brows style={eyebrows} />
            <Eyes style={eyeStyle} />
            {!isStatic && <BlinkLids skin={skin} />}
            <Nose style={nose} dark={dark} />
            <Mouth style={mouth} />
            <Markings style={marking} dark={dark} />
          </motion.g>
        </svg>
      </motion.div>
    </motion.div>
  );
}
