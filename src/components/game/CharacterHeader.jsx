import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { RACES, CLASSES, getActiveBuffs } from "@/lib/gameData";
import { getActiveFuelMounts } from "@/lib/fuelMounts";
import { spring } from "@/lib/goofyMotion";
import CharacterAvatar from "@/components/game/CharacterAvatar";
import EquippedFrame from "@/components/game/EquippedFrame";
import ActiveEffectsPanel from "@/components/game/ActiveEffectsPanel";
import { Users, Save } from "lucide-react";
import { profileDisplayName, normalizeLegacyDisplay, LEGACY_DISPLAY_FAMILY } from "@/lib/legacyName";

const paneClass = "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl";

export default function CharacterHeader({ character, guild, equippedItems, onUpdate }) {
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const race = RACES[character.race];
  const cls = CLASSES[character.class];
  const expPct = Math.min(100, (character.experience / character.experience_to_next_level) * 100);

  useEffect(() => { setBio(character.bio || ""); }, [character.id, character.bio]);

  async function saveBio() {
    setSaving(true);
    await api.entities.Character.update(character.id, { bio });
    setSaving(false);
  }

  const bioDirty = bio !== (character.bio || "");
  const showOperative =
    normalizeLegacyDisplay(character.legacy_display) === LEGACY_DISPLAY_FAMILY
    && character.legacy_name
    && character.name;
  const hasActiveEffects =
    getActiveBuffs(character).length > 0 || getActiveFuelMounts(character).length > 0;

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="flex-1 min-h-0 flex gap-2 items-stretch">
        {/* Lore — left pane */}
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring }}
          className={`w-[34%] max-w-[15rem] min-w-0 min-h-0 shrink-0 ${paneClass} p-3 overflow-y-auto flex flex-col`}
        >
          <h2 className="font-display font-semibold text-xs tracking-wide text-muted-foreground mb-2 shrink-0">
            LORE
          </h2>
          <div className="space-y-2.5 text-[10px] leading-relaxed text-muted-foreground">
            <div>
              <p className="text-[9px] font-display font-bold tracking-wide text-primary mb-0.5">
                {race?.emoji} {race?.name}
              </p>
              <p>{race?.lore}</p>
            </div>
            <div className="border-t border-border/30 pt-2">
              <p className="text-[9px] font-display font-bold tracking-wide text-accent mb-0.5">
                {cls?.emoji} {cls?.name}
              </p>
              <p>{cls?.description}</p>
            </div>
            {cls?.special && (
              <div className="border-t border-border/30 pt-2">
                <p className="text-[9px] font-display font-bold tracking-wide text-primary mb-0.5">
                  {cls.special.name}
                </p>
                <p>{cls.special.effect}</p>
              </div>
            )}
          </div>
        </motion.aside>

        {/* Portrait + identity — center pane */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.04 }}
          className={`flex-1 min-w-0 min-h-0 ${paneClass} p-3 flex gap-3 overflow-hidden`}
        >
          <div className="flex-1 min-w-0 min-h-0 flex flex-col items-center justify-center gap-2 overflow-y-auto">
            <EquippedFrame equippedItems={equippedItems} size={32}>
              <div className="relative">
                <div
                  className="rounded-xl overflow-hidden border border-primary/35 bg-muted/15"
                  style={{ boxShadow: "0 0 14px hsl(190 90% 50% / 0.18)" }}
                >
                  <CharacterAvatar
                    race={character.race}
                    skinColor={character.appearance?.skin_color}
                    eyeStyle={character.appearance?.eye_style}
                    ears={character.appearance?.ears}
                    mouth={character.appearance?.mouth}
                    nose={character.appearance?.nose}
                    eyebrows={character.appearance?.eyebrows}
                    marking={character.appearance?.marking}
                    cls={character.class}
                    size={128}
                  />
                </div>
                <span className="absolute -bottom-1.5 -right-1.5 min-w-[26px] h-[26px] px-1 rounded-full bg-primary text-primary-foreground font-display font-black text-[11px] flex items-center justify-center border-2 border-background shadow-md tabular-nums">
                  {character.level}
                </span>
              </div>
            </EquippedFrame>

            <div className="w-full max-w-[18rem] text-center min-w-0">
              <h1 className="font-display font-bold text-lg tracking-wide leading-tight truncate">
                {profileDisplayName(character)}
              </h1>
              {showOperative && (
                <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">Operative {character.name}</p>
              )}
              {character.active_title && (
                <p className="text-[10px] font-display font-semibold text-amber-400/90 truncate mt-0.5">
                  {character.active_title}
                </p>
              )}
              {guild ? (
                <p className="inline-flex items-center justify-center gap-0.5 text-[10px] text-accent mt-1.5 max-w-full">
                  <Users className="w-3 h-3 shrink-0" />
                  <span className="font-display font-semibold truncate">[{guild.tag}] {guild.name}</span>
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground/50 mt-1.5">No guild</p>
              )}
            </div>

            <div className="w-full max-w-[18rem]">
              <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-1">
                <span className="font-display font-semibold tracking-wide">Experience</span>
                <span className="tabular-nums">
                  {(character.experience || 0).toLocaleString()} / {(character.experience_to_next_level || 0).toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden border border-border/30">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${expPct}%` }}
                  transition={{ duration: 0.7 }}
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                />
              </div>
            </div>
          </div>

          {/* Stims + fuel — right side of same pane */}
          <div className="w-[7.5rem] sm:w-[8.5rem] shrink-0 min-h-0 self-stretch border-l border-border/30 pl-2.5">
            {hasActiveEffects ? (
              <ActiveEffectsPanel character={character} onUpdate={onUpdate} embedded="side" />
            ) : (
              <div className="h-full flex flex-col">
                <p className="text-[8px] font-display font-bold tracking-wide text-muted-foreground flex items-center gap-0.5 mb-1">
                  EFFECTS
                </p>
                <p className="text-[9px] text-muted-foreground/50 italic leading-snug">No active stims or fuel.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Bio — full width below */}
      <div className={`shrink-0 flex items-center gap-2 px-3 py-2 ${paneClass}`}>
        <input
          type="text"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 280))}
          placeholder="Bio — visible to others…"
          className="flex-1 min-w-0 text-[11px] bg-background/50 border border-border/40 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary/40 transition-colors"
        />
        <span className="text-[8px] text-muted-foreground/45 tabular-nums shrink-0 w-7 text-right">{bio.length}</span>
        <button
          type="button"
          onClick={saveBio}
          disabled={!bioDirty || saving}
          className="text-[10px] px-2.5 py-1.5 rounded-lg border border-border/50 bg-background/50 hover:bg-muted/30 hover:border-primary/30 flex items-center gap-1 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-3 h-3" />
          Save
        </button>
      </div>
    </div>
  );
}
