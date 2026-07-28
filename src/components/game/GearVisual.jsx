import React, { useId } from "react";
import { motion } from "framer-motion";
import { rarityColor, rarityGlowStrength } from "@/lib/artStyle";
import GearArtSvg from "@/components/game/GearArtSvg";

const MOTION = {
  weapon: { animate: { rotate: [-8, 8, -8] }, transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } },
  armor: { animate: { scale: [1, 1.06, 1] }, transition: { duration: 2, repeat: Infinity, ease: "easeInOut" } },
  helmet: { animate: { y: [0, -3, 0] }, transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" } },
  boots: { animate: { x: [-2, 2, -2] }, transition: { duration: 0.85, repeat: Infinity, ease: "easeInOut" } },
  legs: { animate: { y: [0, -2, 0] }, transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } },
  neck: { animate: { rotate: [0, 8, -8, 0] }, transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } },
  accessory: { animate: { rotate: [0, 360] }, transition: { duration: 8, repeat: Infinity, ease: "linear" } },
  ship_module: { animate: { rotate: [0, 360] }, transition: { duration: 6, repeat: Infinity, ease: "linear" } },
  material: { animate: { y: [0, -2, 0] }, transition: { duration: 2.5, repeat: Infinity, ease: "easeInOut" } },
  consumable: { animate: { scale: [1, 1.08, 1] }, transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } },
};

export default function GearVisual({
  type,
  rarity,
  name,
  baseName,
  level_requirement: levelRequirement,
  levelRequirement: levelRequirementCamel,
  size = 56,
  static: isStatic = false,
}) {
  const uid = useId().replace(/:/g, "");
  const color = rarityColor(rarity);
  const glow = rarityGlowStrength(rarity);
  // Don't name this `motion` — it shadows framer-motion's `motion` and breaks <motion.div>.
  const kitMotion = MOTION[type] || MOTION.material;
  const lv = levelRequirement ?? levelRequirementCamel ?? 1;

  return (
    <div
      className="relative flex items-center justify-center rounded-xl"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color}28, transparent 72%)`,
        boxShadow: `0 0 ${glow.blur}px ${color}${glow.outer}, inset 0 0 8px ${color}${glow.inset}`,
      }}
    >
      <motion.div
        className="relative"
        style={{ width: size * 0.88, height: size * 0.88 }}
        animate={isStatic ? undefined : kitMotion.animate}
        transition={isStatic ? undefined : kitMotion.transition}
      >
        <GearArtSvg
          type={type}
          rarity={rarity}
          name={name}
          baseName={baseName}
          levelRequirement={lv}
          uid={uid}
        />
      </motion.div>
    </div>
  );
}
