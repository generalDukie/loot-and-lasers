import React from "react";
import { ART_INK, ART_SW, shade, rarityColor, gearDetailTier } from "@/lib/artStyle";
import { weaponCombatStyleFor } from "@/lib/gameData";

/**
 * Procedural SVG gear kits — bold cartoon silhouettes that densify with rarity/level.
 * viewBox 0 0 100 100. Export for GearVisual + ArenaWeaponVisual.
 */

function Ink({ d, fill, stroke = ART_INK, sw = ART_SW, opacity = 1 }) {
  return <path d={d} fill={fill || "none"} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" opacity={opacity} />;
}

function Rivets({ points, color }) {
  return points.map(([x, y], i) => (
    <circle key={i} cx={x} cy={y} r="2.2" fill={shade(color, -40)} stroke={ART_INK} strokeWidth="1.5" />
  ));
}

function PlasmaEdge({ d, color, show }) {
  if (!show) return null;
  return <path d={d} fill="none" stroke={color} strokeWidth="3" opacity="0.75" strokeLinecap="round" />;
}

function HoloSpark({ show, color }) {
  if (!show) return null;
  return (
    <g opacity="0.9">
      <path d="M78 22 l2 5 5 1.5 -5 1.5 -2 5 -2 -5 -5 -1.5 5 -1.5 z" fill={color} />
      <path d="M18 70 l1.5 4 4 1 -4 1 -1.5 4 -1.5 -4 -4 -1 4 -1 z" fill="#fff" opacity="0.85" />
    </g>
  );
}

function WeaponArt({ name, baseName, color, tier, style }) {
  const mid = tier !== "low";
  const high = tier === "high";
  const combat = style || weaponCombatStyleFor(name, baseName);

  if (combat === "stab") {
    return (
      <g>
        <Ink d="M42 78 L58 22 L62 24 L48 80 Z" fill={shade(color, 20)} />
        <Ink d="M48 80 L42 92 L52 88 Z" fill={shade(color, -30)} />
        {mid && <Ink d="M50 30 L54 28" stroke={shade(color, 50)} sw={2} />}
        <PlasmaEdge show={high} d="M58 22 L48 78" color={color} />
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (combat === "swing") {
    return (
      <g>
        <Ink d="M28 72 L72 28 L78 34 L34 78 Z" fill={shade(color, 15)} />
        <Ink d="M34 78 L26 88 L40 82 Z" fill={shade(color, -35)} />
        {mid && <Ink d="M40 60 L60 40" stroke={shade(color, 45)} sw={2.5} />}
        {mid && <Rivets points={[[36, 70], [48, 58]]} color={color} />}
        <PlasmaEdge show={high} d="M72 28 L34 78" color={color} />
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  return (
    <g>
      <Ink d="M22 48 L68 42 L72 52 L26 58 Z" fill={shade(color, 10)} />
      <Ink d="M68 42 L88 38 L90 48 L72 52 Z" fill={shade(color, 35)} />
      <Ink d="M30 58 L38 78 L48 74 L42 58 Z" fill={shade(color, -25)} />
      {mid && <circle cx="58" cy="48" r="4" fill={ART_INK} opacity="0.35" />}
      {mid && <Ink d="M40 46 L40 54" stroke={ART_INK} sw={2} />}
      <PlasmaEdge show={high} d="M88 40 L88 46" color={color} />
      {high && <circle cx="90" cy="43" r="5" fill={color} opacity="0.7" />}
      <HoloSpark show={high} color={color} />
    </g>
  );
}

function ArmorArt({ color, tier }) {
  const mid = tier !== "low";
  const high = tier === "high";
  return (
    <g>
      <Ink d="M50 18 L78 28 L74 78 L50 88 L26 78 L22 28 Z" fill={shade(color, 15)} />
      <Ink d="M50 28 L66 34 L64 68 L50 74 L36 68 L34 34 Z" fill={shade(color, -10)} opacity="0.85" />
      {mid && <Rivets points={[[34, 40], [66, 40], [36, 62], [64, 62]]} color={color} />}
      {mid && <Ink d="M50 34 L50 70" stroke={shade(color, 40)} sw={2} />}
      {high && <Ink d="M42 48 Q50 56 58 48" stroke={color} sw={2.5} />}
      <HoloSpark show={high} color={color} />
    </g>
  );
}

function HelmetArt({ color, tier }) {
  const mid = tier !== "low";
  const high = tier === "high";
  return (
    <g>
      <Ink d="M22 58 Q22 22 50 18 Q78 22 78 58 L72 72 Q50 82 28 72 Z" fill={shade(color, 12)} />
      <Ink d="M30 58 L70 58 L66 68 Q50 74 34 68 Z" fill={shade(color, -35)} />
      {mid && <Ink d="M36 48 L64 48" stroke={color} sw={4} />}
      {mid && <Rivets points={[[32, 36], [68, 36]]} color={color} />}
      {high && <Ink d="M50 20 L50 12 M44 14 L56 14" stroke={color} sw={2.5} />}
      <HoloSpark show={high} color={color} />
    </g>
  );
}

function BootsArt({ color, tier }) {
  const mid = tier !== "low";
  const high = tier === "high";
  return (
    <g>
      <Ink d="M28 30 L44 30 L48 70 L22 70 Z" fill={shade(color, 10)} />
      <Ink d="M22 70 L52 70 L56 88 L18 88 Z" fill={shade(color, -20)} />
      <Ink d="M56 30 L72 30 L76 70 L52 70 Z" fill={shade(color, 10)} />
      <Ink d="M52 70 L82 70 L86 88 L48 88 Z" fill={shade(color, -20)} />
      {mid && <Rivets points={[[34, 50], [64, 50]]} color={color} />}
      {high && <Ink d="M24 78 L48 78 M54 78 L80 78" stroke={color} sw={2} />}
      <HoloSpark show={high} color={color} />
    </g>
  );
}

function LegsArt({ color, tier }) {
  const mid = tier !== "low";
  const high = tier === "high";
  return (
    <g>
      <Ink d="M32 18 L48 18 L52 88 L28 88 Z" fill={shade(color, 8)} />
      <Ink d="M52 18 L68 18 L72 88 L48 88 Z" fill={shade(color, 8)} />
      {mid && <Ink d="M34 40 L50 40 M50 40 L66 40" stroke={shade(color, -30)} sw={3} />}
      {mid && <Rivets points={[[40, 55], [60, 55]]} color={color} />}
      {high && <Ink d="M36 70 Q50 78 64 70" stroke={color} sw={2.5} />}
      <HoloSpark show={high} color={color} />
    </g>
  );
}

function NeckArt({ color, tier }) {
  const mid = tier !== "low";
  const high = tier === "high";
  return (
    <g>
      <Ink d="M50 18 Q70 28 62 48 L50 42 L38 48 Q30 28 50 18 Z" fill={shade(color, 25)} />
      <circle cx="50" cy="58" r="18" fill={shade(color, 5)} stroke={ART_INK} strokeWidth={ART_SW} />
      <circle cx="50" cy="58" r="10" fill={shade(color, 40)} stroke={ART_INK} strokeWidth="2" />
      {mid && <Rivets points={[[42, 28], [58, 28]]} color={color} />}
      {high && <circle cx="50" cy="58" r="6" fill={color} opacity="0.85" />}
      <HoloSpark show={high} color={color} />
    </g>
  );
}

function RingArt({ color, tier }) {
  const mid = tier !== "low";
  const high = tier === "high";
  return (
    <g>
      <circle cx="50" cy="58" r="22" fill="none" stroke={ART_INK} strokeWidth="10" />
      <circle cx="50" cy="58" r="22" fill="none" stroke={shade(color, 10)} strokeWidth="6" />
      <Ink d="M38 32 L62 32 L58 48 L42 48 Z" fill={shade(color, 30)} />
      {mid && <circle cx="50" cy="40" r="5" fill={shade(color, -20)} stroke={ART_INK} strokeWidth="2" />}
      {high && <circle cx="50" cy="40" r="3" fill={color} />}
      <HoloSpark show={high} color={color} />
    </g>
  );
}

function ModuleArt({ color, tier }) {
  const mid = tier !== "low";
  const high = tier === "high";
  return (
    <g>
      <Ink d="M28 28 L72 28 L78 50 L72 72 L28 72 L22 50 Z" fill={shade(color, 8)} />
      <circle cx="50" cy="50" r="14" fill={shade(color, -25)} stroke={ART_INK} strokeWidth="3" />
      <circle cx="50" cy="50" r="6" fill={color} stroke={ART_INK} strokeWidth="2" />
      {mid && <Rivets points={[[34, 36], [66, 36], [34, 64], [66, 64]]} color={color} />}
      {high && (
        <g>
          <Ink d="M50 28 L50 22 M72 50 L78 50 M50 72 L50 78 M28 50 L22 50" stroke={color} sw={2.5} />
        </g>
      )}
      <HoloSpark show={high} color={color} />
    </g>
  );
}

function MaterialArt({ color, tier }) {
  const high = tier === "high";
  return (
    <g>
      <Ink d="M50 20 L78 40 L68 78 L32 78 L22 40 Z" fill={shade(color, -5)} />
      <Ink d="M50 20 L62 48 L38 48 Z" fill={shade(color, 35)} opacity="0.7" />
      {tier !== "low" && <Rivets points={[[40, 58], [58, 62]]} color={color} />}
      <HoloSpark show={high} color={color} />
    </g>
  );
}

function ConsumableArt({ color, tier }) {
  const mid = tier !== "low";
  const high = tier === "high";
  return (
    <g>
      <Ink d="M40 22 L60 22 L58 36 L62 40 L62 82 Q50 92 38 82 L38 40 L42 36 Z" fill={shade(color, 20)} />
      <Ink d="M42 48 L58 48 L58 78 Q50 84 42 78 Z" fill={color} opacity="0.85" />
      <Ink d="M36 22 L64 22 L64 28 L36 28 Z" fill={shade(color, -15)} />
      {mid && <Ink d="M46 56 L54 56" stroke="#fff" sw={2} opacity={0.6} />}
      {high && <circle cx="50" cy="64" r="4" fill="#fff" opacity="0.5" />}
      <HoloSpark show={high} color={color} />
    </g>
  );
}

export function resolveGearCombatStyle(name, baseName, type) {
  if (type !== "weapon") return null;
  return weaponCombatStyleFor(name, baseName);
}

/** Core SVG artwork for a gear piece (100×100 viewBox). */
export default function GearArtSvg({
  type = "material",
  rarity = "common",
  name,
  baseName,
  levelRequirement = 1,
  uid = "g",
}) {
  const color = rarityColor(rarity);
  const tier = gearDetailTier(rarity, levelRequirement);
  const light = shade(color, 45);
  const dark = shade(color, -45);

  let body;
  switch (type) {
    case "weapon":
      body = (
        <WeaponArt
          name={name}
          baseName={baseName}
          color={color}
          tier={tier}
          style={resolveGearCombatStyle(name, baseName, type)}
        />
      );
      break;
    case "armor":
      body = <ArmorArt color={color} tier={tier} />;
      break;
    case "helmet":
      body = <HelmetArt color={color} tier={tier} />;
      break;
    case "boots":
      body = <BootsArt color={color} tier={tier} />;
      break;
    case "legs":
      body = <LegsArt color={color} tier={tier} />;
      break;
    case "neck":
      body = <NeckArt color={color} tier={tier} />;
      break;
    case "accessory":
      body = <RingArt color={color} tier={tier} />;
      break;
    case "ship_module":
      body = <ModuleArt color={color} tier={tier} />;
      break;
    case "consumable":
      body = <ConsumableArt color={color} tier={tier} />;
      break;
    default:
      body = <MaterialArt color={color} tier={tier} />;
  }

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className="select-none overflow-visible">
      <defs>
        <radialGradient id={`gear-glow-${uid}`} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor={light} stopOpacity="0.45" />
          <stop offset="100%" stopColor={dark} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="52" rx="40" ry="38" fill={`url(#gear-glow-${uid})`} />
      {body}
    </svg>
  );
}
