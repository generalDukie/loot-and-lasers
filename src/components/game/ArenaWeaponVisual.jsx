import React, { useEffect, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { playAttackSound } from "@/lib/arenaBattleSfx";
import ArenaAbilityBurst from "@/components/game/ArenaAbilityBurst";
import GearArtSvg from "@/components/game/GearArtSvg";
import { rarityColor } from "@/lib/artStyle";
import { weaponCombatStyleFor } from "@/lib/gameData";

// When no weapon is equipped, arena combat defaults to bare hands.
const BARE_HANDS = {
  type: "swing",   // drives animation + SFX
  color: "#F87171",
  rarity: "common",
  name: "Fist",
  baseName: "Fist",
  levelRequirement: 1,
};

function resolveWeapon(weaponItem) {
  if (!weaponItem) return { ...BARE_HANDS };

  const rarity = weaponItem.rarity || BARE_HANDS.rarity;
  const color = weaponItem.rarity ? rarityColor(weaponItem.rarity) : BARE_HANDS.color;
  const type = weaponCombatStyleFor(weaponItem.name, weaponItem.base_name);
  return {
    type,
    color,
    rarity,
    name: weaponItem.name,
    baseName: weaponItem.base_name,
    levelRequirement: weaponItem.level_requirement || 1,
  };
}

export default function ArenaWeaponVisual({ className, attacking, attackEvent, evIdx, side, weaponItem }) {
  const weapon = resolveWeapon(weaponItem);
  const isBareHands = !weaponItem;
  const uid = useId().replace(/:/g, "");
  const dir = side === "player" ? 1 : -1;
  // Gear art defaults face left; on the player (left) side flip so the tip aims at the enemy.
  const aimAtEnemy = side === "player";
  const evType = attackEvent?.type;
  const isAbility = evType === "ability" || evType === "drone";
  const isRegen = evType === "regen" && className === "Astral Warden";
  const showBurst = isAbility || isRegen;

  useEffect(() => {
    if (!attackEvent) return;
    playAttackSound(weapon.type, isAbility || isRegen, className);
  }, [evIdx]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <motion.div className="absolute pointer-events-none z-20" style={{ ...pos, width: 44, height: 44 }} animate={animate} transition={transition}>
        <div style={{ transform: aimAtEnemy ? "scaleX(-1)" : undefined, transformOrigin: "center", width: 44, height: 44, filter: `drop-shadow(0 0 6px ${weapon.color}99)` }}>
          <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} style={{ width: 44, height: 44 }}>
            {isBareHands ? (
              <span
                className="select-none"
                style={{
                  display: "block",
                  width: 44,
                  height: 44,
                  fontSize: 30,
                  lineHeight: "44px",
                  textAlign: "center",
                  transform: "translateY(2px)",
                  filter: `drop-shadow(0 0 3px ${weapon.color}AA)`,
                }}
                aria-hidden
              >
                🥊
              </span>
            ) : (
              <GearArtSvg
                type="weapon"
                rarity={weapon.rarity}
                name={weapon.name}
                baseName={weapon.baseName}
                levelRequirement={weapon.levelRequirement}
                uid={`arena-${uid}`}
              />
            )}
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
