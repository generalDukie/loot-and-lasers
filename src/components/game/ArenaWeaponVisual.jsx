import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { playAttackSound } from "@/lib/arenaBattleSfx";
import ArenaAbilityBurst from "@/components/game/ArenaAbilityBurst";

// Weapon per class — emoji, attack motion style, and accent color.
const WEAPONS = {
  Vanguard:           { emoji: "🔫", type: "shoot", color: "#F87171" },
  "Shadow Operative": { emoji: "🔫", type: "shoot", color: "#A78BFA" },
  Technomancer:       { emoji: "🔫", type: "shoot", color: "#60A5FA" },
  "Astral Warden":    { emoji: "🔫", type: "shoot", color: "#FBBF24" },
  "Cosmic Engineer":  { emoji: "🔫", type: "shoot", color: "#4ADE80" },
};

const RARITY_COLORS = { common: "#9CA3AF", uncommon: "#22C55E", rare: "#3B82F6", epic: "#A855F7", legendary: "#F59E0B" };

// All weapons are guns — the in-hand emoji always reflects a firearm.
function weaponEmojiFor(name) {
  if (!name) return null;
  return "🔫";
}

// Renders the fighter's weapon in-hand, animates it on attack (swing/stab/shoot),
// and fires a class-specific ability burst + sound when a special triggers.
// When `weaponItem` (the equipped weapon Item record) is supplied, the in-hand
// emoji + glow color reflect that item instead of the class default.
export default function ArenaWeaponVisual({ className, attacking, attackEvent, evIdx, side, flip, weaponItem }) {
  const base = WEAPONS[className] || WEAPONS.Vanguard;
  const rarityColor = weaponItem?.rarity ? RARITY_COLORS[weaponItem.rarity] : null;
  const weapon = {
    emoji: (weaponItem?.name && weaponEmojiFor(weaponItem.name)) || base.emoji,
    type: base.type,
    color: rarityColor || base.color,
  };
  const dir = side === "player" ? 1 : -1;
  const evType = attackEvent?.type;
  const isAbility = evType === "ability" || evType === "drone";
  const isRegen = evType === "regen" && className === "Astral Warden";
  const showBurst = isAbility || isRegen;

  useEffect(() => {
    if (!attackEvent) return;
    playAttackSound(weapon.type, isAbility || isRegen, className);
  }, [evIdx]);

  const pos = side === "player" ? { right: 0, top: 76 } : { left: 0, top: 76 };

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
      {/* Weapon in hand — idle bob + attack motion */}
      <motion.div className="absolute pointer-events-none z-20" style={{ ...pos, fontSize: 38 }} animate={animate} transition={transition}>
        <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} style={{ transform: flip ? "scaleX(-1)" : undefined }}>
          <span style={{ filter: `drop-shadow(0 0 6px ${weapon.color}99)` }}>{weapon.emoji}</span>
        </motion.div>
      </motion.div>

      {/* Muzzle flash for ranged attacks */}
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

      {/* Energy projectile for ranged attacks (suppressed during abilities) */}
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

      {/* Class special ability burst */}
      {showBurst && <ArenaAbilityBurst key={`ab${evIdx}`} className={className} dir={dir} color={weapon.color} evIdx={evIdx} />}
    </>
  );
}