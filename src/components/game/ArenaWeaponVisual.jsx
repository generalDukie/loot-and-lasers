import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { playAttackSound } from "@/lib/arenaBattleSfx";
import ArenaAbilityBurst from "@/components/game/ArenaAbilityBurst";
import { weaponEmojiFor, weaponCombatStyleFor } from "@/lib/gameData";

// Class fallbacks when no weapon is equipped.
const CLASS_FALLBACK = {
  Vanguard:           { type: "shoot", color: "#F87171", emoji: "🔫" },
  "Shadow Operative": { type: "stab",  color: "#A78BFA", emoji: "🗡️" },
  Technomancer:       { type: "shoot", color: "#60A5FA", emoji: "🔮" },
  "Astral Warden":    { type: "shoot", color: "#FBBF24", emoji: "✨" },
  "Void Runner":      { type: "stab",  color: "#22D3EE", emoji: "☄️" },
  "Cosmic Engineer":  { type: "shoot", color: "#4ADE80", emoji: "💥" },
};

const RARITY_COLORS = { common: "#9CA3AF", uncommon: "#22C55E", rare: "#3B82F6", epic: "#A855F7", legendary: "#F59E0B" };

function resolveWeapon(className, weaponItem) {
  const fallback = CLASS_FALLBACK[className] || CLASS_FALLBACK.Vanguard;
  const rarityColor = weaponItem?.rarity ? RARITY_COLORS[weaponItem.rarity] : null;
  const emoji =
    weaponItem?.emoji ||
    (weaponItem ? weaponEmojiFor(weaponItem.name, weaponItem.base_name) : null) ||
    fallback.emoji;
  const type = weaponItem
    ? weaponCombatStyleFor(weaponItem.name, weaponItem.base_name, emoji)
    : fallback.type;
  return {
    emoji,
    type,
    color: rarityColor || fallback.color,
  };
}

// Renders the fighter's equipped weapon in-hand, animates it on attack
// (swing/stab/shoot from the weapon itself), and fires class specials.
export default function ArenaWeaponVisual({ className, attacking, attackEvent, evIdx, side, weaponItem }) {
  const weapon = resolveWeapon(className, weaponItem);
  const dir = side === "player" ? 1 : -1;
  // Only mirror gun-like glyphs (they face left by default). Melee icons are
  // already readable without a flip.
  const aimAtEnemy = side === "player" && weapon.type === "shoot";
  const evType = attackEvent?.type;
  const isAbility = evType === "ability" || evType === "drone";
  const isRegen = evType === "regen" && className === "Astral Warden";
  const showBurst = isAbility || isRegen;

  useEffect(() => {
    if (!attackEvent) return;
    playAttackSound(weapon.type, isAbility || isRegen, className);
  }, [evIdx]);

  const pos = side === "player" ? { right: 0, top: 98 } : { left: 0, top: 98 };

  let animate = { rotate: 0, x: 0 };
  let transition = { duration: 0.5, ease: "easeOut" };
  if (attacking) {
    if (weapon.type === "swing") {
      animate = { rotate: dir > 0 ? [0, -75, 35, 0] : [0, 75, -35, 0] };
      transition = { duration: 0.55, times: [0, 0.3, 0.6, 1], ease: "easeOut" };
    } else if (weapon.type === "stab") {
      animate = { x: dir > 0 ? [0, 30, 0] : [0, -30, 0] };
      transition = { duration: 0.4, times: [0, 0.4, 1], ease: "easeOut" };
    } else {
      animate = { x: dir > 0 ? [0, -8, 0] : [0, 8, 0] };
      transition = { duration: 0.35, times: [0, 0.2, 1], ease: "easeOut" };
    }
  }

  return (
    <>
      <motion.div className="absolute pointer-events-none z-20" style={{ ...pos, fontSize: 38 }} animate={animate} transition={transition}>
        <div style={{ transform: aimAtEnemy ? "scaleX(-1)" : undefined, transformOrigin: "center" }}>
          <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
            <span style={{ filter: `drop-shadow(0 0 6px ${weapon.color}99)`, display: "inline-block" }}>{weapon.emoji}</span>
          </motion.div>
        </div>
      </motion.div>

      <AnimatePresence>
        {attacking && weapon.type === "shoot" && (
          <motion.div
            key={`mf${evIdx}`}
            className="absolute pointer-events-none z-20"
            style={{ ...pos, top: 74, fontSize: 22 }}
            initial={{ scale: 0, opacity: 1, x: dir > 0 ? 8 : -8 }}
            animate={{ scale: [0, 1.4, 0], opacity: [1, 1, 0], x: dir > 0 ? 16 : -16 }}
            transition={{ duration: 0.22 }}
          >
            ⚡
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {attacking && weapon.type === "shoot" && !showBurst && (
          <motion.div
            key={`pr${evIdx}`}
            className="absolute pointer-events-none z-30"
            style={{ ...pos, top: 82 }}
            initial={{ x: dir > 0 ? 10 : -10, opacity: 1, scale: 1 }}
            animate={{ x: dir > 0 ? 75 : -75, opacity: [1, 1, 0], scale: 0.5 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
          >
            <span style={{ fontSize: 14, color: weapon.color, filter: `drop-shadow(0 0 4px ${weapon.color})` }}>●</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Melee slash trails */}
      <AnimatePresence>
        {attacking && weapon.type === "swing" && (
          <motion.div
            key={`sw${evIdx}`}
            className="absolute pointer-events-none z-20"
            style={{ ...pos, top: 70, fontSize: 28 }}
            initial={{ opacity: 0.9, rotate: dir > 0 ? -40 : 40, scale: 0.6 }}
            animate={{ opacity: 0, rotate: dir > 0 ? 50 : -50, scale: 1.3, x: dir > 0 ? 24 : -24 }}
            transition={{ duration: 0.35 }}
          >
            <span style={{ color: weapon.color, filter: `drop-shadow(0 0 6px ${weapon.color})` }}>✧</span>
          </motion.div>
        )}
      </AnimatePresence>

      {showBurst && <ArenaAbilityBurst key={`ab${evIdx}`} className={className} dir={dir} color={weapon.color} evIdx={evIdx} />}
    </>
  );
}
