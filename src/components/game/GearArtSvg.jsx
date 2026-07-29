import React from "react";
import { ART_INK, ART_SW, shade, rarityColor, gearDetailTier } from "@/lib/artStyle";
import { weaponCombatStyleFor } from "@/lib/gameData";

/**
 * Procedural SVG gear kits — bold cartoon silhouettes that densify with rarity/level.
 * Multiple type-relevant variants rotate by piece (stable hash of base/name).
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

/** Stable 0..count-1 from piece identity so the same item always draws the same kit. */
export function gearArtVariantIndex(name, baseName, type, count = 4) {
  const n = Math.max(1, count | 0);
  const key = `${type || ""}|${baseName || ""}|${name || ""}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % n;
}

function textBlob(name, baseName) {
  return `${baseName || ""} ${name || ""}`.toLowerCase();
}

function pickByKeywords(blob, rules, fallback) {
  for (const [re, idx] of rules) {
    if (re.test(blob)) return idx;
  }
  return fallback;
}

// ── Weapons (combat style + sub-variants) ────────────────────

function WeaponArt({ name, baseName, color, tier, style, variant }) {
  const mid = tier !== "low";
  const high = tier === "high";
  const combat = style || weaponCombatStyleFor(name, baseName);
  const v = variant % 3;

  if (combat === "stab") {
    if (v === 1) {
      // Long needle / rapier
      return (
        <g>
          <Ink d="M48 88 L52 12 L56 14 L52 88 Z" fill={shade(color, 25)} />
          <Ink d="M44 78 L56 78 L54 88 L46 88 Z" fill={shade(color, -30)} />
          {mid && <Ink d="M50 24 L54 22" stroke={shade(color, 50)} sw={2} />}
          <PlasmaEdge show={high} d="M52 12 L50 78" color={color} />
          <HoloSpark show={high} color={color} />
        </g>
      );
    }
    if (v === 2) {
      // Twin short blades
      return (
        <g>
          <Ink d="M28 80 L40 24 L44 26 L34 82 Z" fill={shade(color, 18)} />
          <Ink d="M56 80 L68 24 L72 26 L62 82 Z" fill={shade(color, 18)} />
          <Ink d="M30 82 L38 90 L42 84 Z" fill={shade(color, -30)} />
          <Ink d="M58 82 L66 90 L70 84 Z" fill={shade(color, -30)} />
          {mid && <Rivets points={[[34, 72], [64, 72]]} color={color} />}
          <PlasmaEdge show={high} d="M40 24 L34 78" color={color} />
          <HoloSpark show={high} color={color} />
        </g>
      );
    }
    // Classic dagger
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
    if (v === 1) {
      // Axe / cleaver
      return (
        <g>
          <Ink d="M46 78 L52 28 L58 30 L52 80 Z" fill={shade(color, -20)} />
          <Ink d="M52 28 L88 38 L84 58 L52 48 Z" fill={shade(color, 20)} />
          <Ink d="M48 80 L42 92 L56 88 Z" fill={shade(color, -35)} />
          {mid && <Rivets points={[[60, 40], [72, 46]]} color={color} />}
          <PlasmaEdge show={high} d="M88 40 L52 40" color={color} />
          <HoloSpark show={high} color={color} />
        </g>
      );
    }
    if (v === 2) {
      // Greatsword / claymore
      return (
        <g>
          <Ink d="M46 90 L50 14 L54 14 L58 90 Z" fill={shade(color, 12)} />
          <Ink d="M38 72 L62 72 L60 80 L40 80 Z" fill={shade(color, -25)} />
          <Ink d="M44 90 L50 98 L56 90 Z" fill={shade(color, -40)} />
          {mid && <Ink d="M50 28 L50 68" stroke={shade(color, 45)} sw={2} />}
          <PlasmaEdge show={high} d="M50 14 L50 70" color={color} />
          <HoloSpark show={high} color={color} />
        </g>
      );
    }
    // Saber diagonal
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

  // shoot
  if (v === 1) {
    // Pistol / sidearm
    return (
      <g>
        <Ink d="M28 42 L62 38 L66 52 L32 56 Z" fill={shade(color, 12)} />
        <Ink d="M62 38 L82 34 L84 46 L66 52 Z" fill={shade(color, 35)} />
        <Ink d="M34 56 L42 78 L52 74 L46 56 Z" fill={shade(color, -25)} />
        {mid && <circle cx="48" cy="46" r="3.5" fill={ART_INK} opacity="0.35" />}
        <PlasmaEdge show={high} d="M82 36 L82 44" color={color} />
        {high && <circle cx="84" cy="40" r="4" fill={color} opacity="0.7" />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 2) {
    // Cannon / heavy launcher or arc staff
    const blob = textBlob(name, baseName);
    if (/staff|wand|caster|rod|psi/.test(blob)) {
      return (
        <g>
          <Ink d="M48 88 L52 28 L56 28 L52 88 Z" fill={shade(color, -15)} />
          <circle cx="52" cy="22" r="12" fill={shade(color, 30)} stroke={ART_INK} strokeWidth={ART_SW} />
          <circle cx="52" cy="22" r="5" fill={color} />
          {mid && <Ink d="M48 50 L56 50" stroke={shade(color, 40)} sw={2} />}
          <HoloSpark show={high} color={color} />
        </g>
      );
    }
    return (
      <g>
        <Ink d="M18 46 L58 40 L64 58 L24 64 Z" fill={shade(color, 8)} />
        <Ink d="M58 40 L92 32 L94 48 L64 58 Z" fill={shade(color, 28)} />
        <Ink d="M26 64 L34 84 L48 78 L40 62 Z" fill={shade(color, -28)} />
        {mid && <Rivets points={[[40, 52], [52, 48]]} color={color} />}
        {high && <circle cx="92" cy="40" r="7" fill={color} opacity="0.75" />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  // Rifle / repeater
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

// ── Armor ────────────────────────────────────────────────────

function ArmorArt({ color, tier, variant }) {
  const mid = tier !== "low";
  const high = tier === "high";
  const v = variant % 4;

  if (v === 1) {
    // Mesh / weave vest
    return (
      <g>
        <Ink d="M30 22 L70 22 L76 36 L70 82 L50 90 L30 82 L24 36 Z" fill={shade(color, 18)} />
        <Ink d="M36 34 L64 34 L66 74 L50 80 L34 74 Z" fill={shade(color, -8)} opacity="0.8" />
        {mid && <Ink d="M40 44 L60 44 M38 56 L62 56 M40 68 L60 68" stroke={shade(color, 35)} sw={2} />}
        {high && <Ink d="M50 38 L50 76" stroke={color} sw={2} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 2) {
    // Heavy carapace / layered plates
    return (
      <g>
        <Ink d="M50 16 L82 30 L78 76 L50 92 L22 76 L18 30 Z" fill={shade(color, 8)} />
        <Ink d="M50 28 L70 38 L68 70 L50 80 L32 70 L30 38 Z" fill={shade(color, -15)} />
        <Ink d="M26 42 L38 48 L36 62 L24 56 Z" fill={shade(color, 25)} />
        <Ink d="M74 42 L62 48 L64 62 L76 56 Z" fill={shade(color, 25)} />
        {mid && <Rivets points={[[40, 44], [60, 44], [42, 64], [58, 64]]} color={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 3) {
    // Cloak / shroud over chest
    return (
      <g>
        <Ink d="M34 20 L66 20 L78 40 L72 88 L28 88 L22 40 Z" fill={shade(color, 5)} />
        <Ink d="M40 28 L60 28 L64 56 L50 62 L36 56 Z" fill={shade(color, 30)} opacity="0.9" />
        {mid && <Ink d="M42 72 Q50 82 58 72" stroke={shade(color, -20)} sw={3} />}
        {high && <Ink d="M50 34 L50 58" stroke={color} sw={2.5} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  // Classic cuirass
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

// ── Helmet ───────────────────────────────────────────────────

function HelmetArt({ color, tier, variant }) {
  const mid = tier !== "low";
  const high = tier === "high";
  const v = variant % 4;

  if (v === 1) {
    // Visor / HUD
    return (
      <g>
        <Ink d="M24 40 L76 40 L72 72 Q50 84 28 72 Z" fill={shade(color, 10)} />
        <Ink d="M28 48 L72 48 L70 64 Q50 72 30 64 Z" fill={shade(color, -40)} />
        {mid && <Ink d="M34 56 L66 56" stroke={color} sw={3} />}
        {high && <Ink d="M40 44 L44 44 M56 44 L60 44" stroke={color} sw={2} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 2) {
    // Crown / circlet
    return (
      <g>
        <Ink d="M22 58 L28 36 L40 48 L50 28 L60 48 L72 36 L78 58 Z" fill={shade(color, 20)} />
        <Ink d="M28 58 L72 58 L68 72 Q50 80 32 72 Z" fill={shade(color, -15)} />
        {mid && <Rivets points={[[40, 48], [50, 36], [60, 48]]} color={color} />}
        {high && <circle cx="50" cy="32" r="4" fill={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 3) {
    // Mask
    return (
      <g>
        <Ink d="M30 28 L70 28 L78 52 L70 78 L30 78 L22 52 Z" fill={shade(color, 12)} />
        <Ink d="M36 44 L46 44 L44 54 L34 54 Z" fill={ART_INK} opacity="0.55" />
        <Ink d="M54 44 L64 44 L66 54 L56 54 Z" fill={ART_INK} opacity="0.55" />
        {mid && <Ink d="M42 64 Q50 70 58 64" stroke={shade(color, -30)} sw={3} />}
        {high && <Ink d="M50 32 L50 24" stroke={color} sw={2.5} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  // Full helm
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

// ── Boots ────────────────────────────────────────────────────

function BootsArt({ color, tier, variant }) {
  const mid = tier !== "low";
  const high = tier === "high";
  const v = variant % 4;

  if (v === 1) {
    // Jet treads (thruster soles)
    return (
      <g>
        <Ink d="M26 28 L46 28 L50 62 L22 62 Z" fill={shade(color, 12)} />
        <Ink d="M54 28 L74 28 L78 62 L50 62 Z" fill={shade(color, 12)} />
        <Ink d="M20 62 L52 62 L48 86 L16 86 Z" fill={shade(color, -25)} />
        <Ink d="M52 62 L84 62 L80 86 L48 86 Z" fill={shade(color, -25)} />
        {mid && <Ink d="M28 74 L44 74 M56 74 L72 74" stroke={color} sw={3} />}
        {high && (
          <g>
            <circle cx="36" cy="90" r="4" fill={color} opacity="0.7" />
            <circle cx="64" cy="90" r="4" fill={color} opacity="0.7" />
          </g>
        )}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 2) {
    // Plate greaves
    return (
      <g>
        <Ink d="M30 24 L48 24 L50 78 L28 78 Z" fill={shade(color, 8)} />
        <Ink d="M52 24 L70 24 L72 78 L50 78 Z" fill={shade(color, 8)} />
        <Ink d="M24 78 L54 78 L52 92 L22 92 Z" fill={shade(color, -20)} />
        <Ink d="M50 78 L80 78 L78 92 L48 92 Z" fill={shade(color, -20)} />
        {mid && <Rivets points={[[36, 40], [64, 40], [36, 60], [64, 60]]} color={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 3) {
    // Light runners
    return (
      <g>
        <Ink d="M30 36 L46 32 L50 70 L28 72 Z" fill={shade(color, 15)} />
        <Ink d="M54 32 L70 36 L72 72 L50 70 Z" fill={shade(color, 15)} />
        <Ink d="M26 72 L52 70 L54 86 L24 88 Z" fill={shade(color, -18)} />
        <Ink d="M50 70 L76 72 L78 88 L48 86 Z" fill={shade(color, -18)} />
        {mid && <Ink d="M34 52 L46 50 M54 50 L66 52" stroke={shade(color, 40)} sw={2} />}
        {high && <Ink d="M30 80 L48 78 M54 78 L72 80" stroke={color} sw={2} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  // Classic tall boots
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

// ── Legs ─────────────────────────────────────────────────────

function LegsArt({ color, tier, variant }) {
  const mid = tier !== "low";
  const high = tier === "high";
  const v = variant % 4;

  if (v === 1) {
    // Plate legs with knee caps
    return (
      <g>
        <Ink d="M30 16 L48 16 L52 88 L28 88 Z" fill={shade(color, 6)} />
        <Ink d="M52 16 L70 16 L72 88 L48 88 Z" fill={shade(color, 6)} />
        <circle cx="40" cy="48" r="7" fill={shade(color, 25)} stroke={ART_INK} strokeWidth="2.5" />
        <circle cx="60" cy="48" r="7" fill={shade(color, 25)} stroke={ART_INK} strokeWidth="2.5" />
        {mid && <Rivets points={[[40, 30], [60, 30], [40, 70], [60, 70]]} color={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 2) {
    // Mesh / soft leggings
    return (
      <g>
        <Ink d="M34 16 L48 16 L50 90 L32 90 Z" fill={shade(color, 14)} />
        <Ink d="M52 16 L66 16 L68 90 L50 90 Z" fill={shade(color, 14)} />
        {mid && <Ink d="M36 36 L48 36 M52 36 L64 36 M36 58 L48 58 M52 58 L64 58" stroke={shade(color, 35)} sw={2} />}
        {high && <Ink d="M38 76 Q50 84 62 76" stroke={color} sw={2} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 3) {
    // Shin-guard focus (shorter plates)
    return (
      <g>
        <Ink d="M32 20 L48 20 L50 52 L30 52 Z" fill={shade(color, 10)} opacity="0.85" />
        <Ink d="M52 20 L68 20 L70 52 L50 52 Z" fill={shade(color, 10)} opacity="0.85" />
        <Ink d="M28 52 L50 52 L52 90 L26 90 Z" fill={shade(color, 5)} />
        <Ink d="M50 52 L72 52 L74 90 L48 90 Z" fill={shade(color, 5)} />
        {mid && <Rivets points={[[38, 66], [62, 66]]} color={color} />}
        {high && <Ink d="M32 78 L48 78 M52 78 L68 78" stroke={color} sw={2} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  // Classic greaves
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

// ── Neck ─────────────────────────────────────────────────────

function NeckArt({ color, tier, variant }) {
  const mid = tier !== "low";
  const high = tier === "high";
  const v = variant % 4;

  if (v === 1) {
    // Collar / choker band
    return (
      <g>
        <Ink d="M22 40 L78 40 L74 62 L26 62 Z" fill={shade(color, 15)} />
        <Ink d="M30 48 L70 48" stroke={shade(color, -25)} sw={4} />
        {mid && <Rivets points={[[36, 50], [50, 50], [64, 50]]} color={color} />}
        {high && <circle cx="50" cy="50" r="5" fill={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 2) {
    // Torc (open crescent)
    return (
      <g>
        <Ink d="M28 62 Q28 28 50 24 Q72 28 72 62" fill="none" stroke={ART_INK} strokeWidth="12" />
        <Ink d="M28 62 Q28 28 50 24 Q72 28 72 62" fill="none" stroke={shade(color, 15)} strokeWidth="7" />
        <circle cx="28" cy="64" r="6" fill={shade(color, 30)} stroke={ART_INK} strokeWidth="2.5" />
        <circle cx="72" cy="64" r="6" fill={shade(color, 30)} stroke={ART_INK} strokeWidth="2.5" />
        {mid && <Rivets points={[[40, 30], [60, 30]]} color={color} />}
        {high && <circle cx="50" cy="28" r="4" fill={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 3) {
    // Crystal pendant (diamond gem)
    return (
      <g>
        <Ink d="M50 18 Q66 30 58 44 L50 40 L42 44 Q34 30 50 18 Z" fill={shade(color, 20)} />
        <Ink d="M50 46 L66 62 L50 86 L34 62 Z" fill={shade(color, 10)} />
        <Ink d="M50 52 L58 62 L50 74 L42 62 Z" fill={shade(color, 40)} opacity="0.85" />
        {mid && <Rivets points={[[44, 28], [56, 28]]} color={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  // Classic amulet
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

// ── Accessory (rings / charms) ───────────────────────────────

function RingArt({ color, tier, variant }) {
  const mid = tier !== "low";
  const high = tier === "high";
  const v = variant % 4;

  if (v === 1) {
    // Simple band
    return (
      <g>
        <circle cx="50" cy="52" r="24" fill="none" stroke={ART_INK} strokeWidth="11" />
        <circle cx="50" cy="52" r="24" fill="none" stroke={shade(color, 15)} strokeWidth="6" />
        {mid && <Ink d="M50 28 L50 36" stroke={shade(color, 40)} sw={3} />}
        {high && <circle cx="50" cy="28" r="4" fill={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 2) {
    // Charm / floating shard
    return (
      <g>
        <Ink d="M50 22 L62 48 L50 78 L38 48 Z" fill={shade(color, 20)} />
        <Ink d="M50 30 L56 48 L50 66 L44 48 Z" fill={shade(color, 45)} opacity="0.8" />
        {mid && <circle cx="50" cy="48" r="5" fill={shade(color, -20)} stroke={ART_INK} strokeWidth="2" />}
        {high && <circle cx="50" cy="48" r="2.5" fill={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 3) {
    // Tech capacitor / chip
    return (
      <g>
        <Ink d="M28 36 L72 36 L76 64 L24 64 Z" fill={shade(color, 10)} />
        <Ink d="M34 44 L66 44 L64 56 L36 56 Z" fill={shade(color, -25)} />
        {mid && <Ink d="M40 50 L48 50 M52 50 L60 50" stroke={color} sw={2.5} />}
        {high && <Rivets points={[[32, 40], [68, 40], [32, 60], [68, 60]]} color={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  // Signet ring with gem
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

// ── Ship module ──────────────────────────────────────────────

function ModuleArt({ color, tier, variant }) {
  const mid = tier !== "low";
  const high = tier === "high";
  const v = variant % 4;

  if (v === 1) {
    // Sensor dish / array
    return (
      <g>
        <Ink d="M50 78 L42 52 L58 52 Z" fill={shade(color, -20)} />
        <Ink d="M22 48 Q50 18 78 48 L70 52 Q50 28 30 52 Z" fill={shade(color, 15)} />
        <circle cx="50" cy="44" r="8" fill={shade(color, -30)} stroke={ART_INK} strokeWidth="2.5" />
        {mid && <Ink d="M34 46 L66 46" stroke={shade(color, 40)} sw={2} />}
        {high && <circle cx="50" cy="44" r="3" fill={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 2) {
    // Turbine / engine booster
    return (
      <g>
        <circle cx="50" cy="50" r="28" fill={shade(color, 8)} stroke={ART_INK} strokeWidth={ART_SW} />
        <circle cx="50" cy="50" r="16" fill={shade(color, -20)} stroke={ART_INK} strokeWidth="3" />
        <Ink d="M50 34 L58 50 L50 66 L42 50 Z" fill={shade(color, 35)} />
        {mid && <Rivets points={[[32, 32], [68, 32], [32, 68], [68, 68]]} color={color} />}
        {high && <circle cx="50" cy="50" r="5" fill={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 3) {
    // Turret / box module
    return (
      <g>
        <Ink d="M24 40 L76 40 L76 78 L24 78 Z" fill={shade(color, 10)} />
        <Ink d="M36 28 L64 28 L68 40 L32 40 Z" fill={shade(color, -15)} />
        <Ink d="M44 18 L56 18 L56 28 L44 28 Z" fill={shade(color, 25)} />
        {mid && <Rivets points={[[32, 52], [68, 52], [32, 68], [68, 68]]} color={color} />}
        {high && <Ink d="M50 20 L50 12" stroke={color} sw={2.5} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  // Hex core
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

function MaterialArt({ color, tier, variant }) {
  const high = tier === "high";
  const v = variant % 3;
  if (v === 1) {
    return (
      <g>
        <Ink d="M50 18 L74 50 L50 84 L26 50 Z" fill={shade(color, 10)} />
        <Ink d="M50 28 L64 50 L50 72 L36 50 Z" fill={shade(color, 40)} opacity="0.75" />
        {tier !== "low" && <Rivets points={[[44, 50], [56, 50]]} color={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 2) {
    return (
      <g>
        <Ink d="M32 30 L68 30 L78 70 L22 70 Z" fill={shade(color, -5)} />
        <Ink d="M40 40 L60 40 L56 60 L44 60 Z" fill={shade(color, 30)} opacity="0.8" />
        {tier !== "low" && <Rivets points={[[36, 50], [64, 50]]} color={color} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  return (
    <g>
      <Ink d="M50 20 L78 40 L68 78 L32 78 L22 40 Z" fill={shade(color, -5)} />
      <Ink d="M50 20 L62 48 L38 48 Z" fill={shade(color, 35)} opacity="0.7" />
      {tier !== "low" && <Rivets points={[[40, 58], [58, 62]]} color={color} />}
      <HoloSpark show={high} color={color} />
    </g>
  );
}

function ConsumableArt({ color, tier, variant }) {
  const mid = tier !== "low";
  const high = tier === "high";
  const v = variant % 3;
  if (v === 1) {
    // Capsule / pill
    return (
      <g>
        <Ink d="M30 42 Q30 28 50 28 Q70 28 70 42 L70 58 Q70 72 50 72 Q30 72 30 58 Z" fill={shade(color, 15)} />
        <Ink d="M30 50 L70 50" stroke={ART_INK} sw={2} />
        <Ink d="M32 52 L68 52 L68 58 Q50 68 32 58 Z" fill={color} opacity="0.85" />
        {high && <circle cx="50" cy="40" r="3" fill="#fff" opacity="0.5" />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  if (v === 2) {
    // Syringe
    return (
      <g>
        <Ink d="M42 18 L58 18 L56 28 L44 28 Z" fill={shade(color, -15)} />
        <Ink d="M44 28 L56 28 L54 70 L46 70 Z" fill={shade(color, 20)} />
        <Ink d="M46 70 L54 70 L52 88 L48 88 Z" fill={shade(color, -25)} />
        <Ink d="M46 40 L54 40 L54 62 L46 62 Z" fill={color} opacity="0.85" />
        {mid && <Ink d="M48 48 L52 48" stroke="#fff" sw={2} opacity={0.55} />}
        <HoloSpark show={high} color={color} />
      </g>
    );
  }
  // Vial
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

/** Prefer keyword-matched kits; otherwise stable hash by piece. */
function resolveVariant(type, name, baseName) {
  const blob = textBlob(name, baseName);
  const hashed = (n) => gearArtVariantIndex(name, baseName, type, n);

  switch (type) {
    case "weapon":
      return hashed(3);
    case "armor":
      return pickByKeywords(blob, [
        [/cloak|shroud|shadow/, 3],
        [/mesh|weave|coat|suit/, 1],
        [/carapace|shell|titan|plate|plating/, 2],
      ], hashed(4));
    case "helmet":
      return pickByKeywords(blob, [
        [/visor|hud|scan/, 1],
        [/crown|circlet|astral/, 2],
        [/mask|void/, 3],
      ], hashed(4));
    case "boots":
      return pickByKeywords(blob, [
        [/jet|thruster|warp|storm/, 1],
        [/greave|mag-lock|plate/, 2],
        [/runner|stealth|drift|phase|walker/, 3],
      ], hashed(4));
    case "legs":
      return pickByKeywords(blob, [
        [/plate|titan|ironclad/, 1],
        [/legging|mesh|plasma|photon/, 2],
        [/shin|guard/, 3],
      ], hashed(4));
    case "neck":
      return pickByKeywords(blob, [
        [/collar|choker/, 1],
        [/torc/, 2],
        [/pendant|crystal|amulet/, 3],
      ], hashed(4));
    case "accessory":
      return pickByKeywords(blob, [
        [/band|chrono/, 1],
        [/charm|shard|pendant/, 2],
        [/core|capacitor|beacon|link|data/, 3],
      ], hashed(4));
    case "ship_module":
      return pickByKeywords(blob, [
        [/sensor|array|scan/, 1],
        [/engine|booster|warp|drive/, 2],
        [/turret|shield|hull|cargo|cloak/, 3],
      ], hashed(4));
    case "consumable":
      return hashed(3);
    default:
      return hashed(3);
  }
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
  const variant = resolveVariant(type, name, baseName);

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
          variant={variant}
        />
      );
      break;
    case "armor":
      body = <ArmorArt color={color} tier={tier} variant={variant} />;
      break;
    case "helmet":
      body = <HelmetArt color={color} tier={tier} variant={variant} />;
      break;
    case "boots":
      body = <BootsArt color={color} tier={tier} variant={variant} />;
      break;
    case "legs":
      body = <LegsArt color={color} tier={tier} variant={variant} />;
      break;
    case "neck":
      body = <NeckArt color={color} tier={tier} variant={variant} />;
      break;
    case "accessory":
      body = <RingArt color={color} tier={tier} variant={variant} />;
      break;
    case "ship_module":
      body = <ModuleArt color={color} tier={tier} variant={variant} />;
      break;
    case "consumable":
      body = <ConsumableArt color={color} tier={tier} variant={variant} />;
      break;
    default:
      body = <MaterialArt color={color} tier={tier} variant={variant} />;
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
