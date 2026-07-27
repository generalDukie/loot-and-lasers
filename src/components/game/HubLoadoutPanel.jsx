import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import EquippedFrame from "@/components/game/EquippedFrame";
import CharacterAvatar from "@/components/game/CharacterAvatar";
import { useEquippedItems } from "@/hooks/useEquippedItems";
import { computePower } from "@/lib/arenaEngine";

// Hub-stage loadout doll — portrait framed by equipped gear, links to Character.
export default function HubLoadoutPanel({ character }) {
  const equippedItems = useEquippedItems(character?.id);
  if (!character) return null;

  const ap = character.appearance || {};
  const power = computePower(character, equippedItems);

  return (
    <Link
      to="/character"
      className="block group focus:outline-none shrink-0 origin-bottom-left scale-[0.82] sm:scale-100"
      title="View character & inventory"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
        className="rounded-2xl bg-background/90 border border-border/60 shadow-lg painted-panel p-2.5 sm:p-3 group-hover:border-primary/50 transition-colors"
      >
        <EquippedFrame equippedItems={equippedItems} size={28}>
          <div className="relative">
            <div
              className="rounded-lg overflow-hidden border border-primary/40"
              style={{ boxShadow: "0 0 12px hsl(190 90% 50% / 0.28)" }}
            >
              <CharacterAvatar
                race={character.race}
                skinColor={ap.skin_color}
                eyeStyle={ap.eye_style}
                ears={ap.ears}
                mouth={ap.mouth}
                nose={ap.nose}
                eyebrows={ap.eyebrows}
                marking={ap.marking}
                cls={character.class}
                size={80}
              />
            </div>
            <span className="absolute -bottom-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-primary text-primary-foreground font-display font-black text-[10px] flex items-center justify-center border border-background">
              {character.level}
            </span>
          </div>
        </EquippedFrame>

        <div className="mt-2 flex items-center justify-center gap-1.5 text-cyan-300">
          <Zap className="w-3.5 h-3.5" />
          <span className="font-display font-bold text-xs tracking-wide">POWER {power}</span>
        </div>
      </motion.div>
    </Link>
  );
}
