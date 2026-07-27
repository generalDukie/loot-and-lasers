import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { RACES, CLASSES } from "@/lib/gameData";
import { spring } from "@/lib/goofyMotion";
import CharacterAvatar from "@/components/game/CharacterAvatar";
import EquippedFrame from "@/components/game/EquippedFrame";
import { Star, Target, TrendingUp, Users, Save, BookOpen } from "lucide-react";
import { profileDisplayName, normalizeLegacyDisplay, LEGACY_DISPLAY_FAMILY } from "@/lib/legacyName";

export default function CharacterHeader({ character, guild, equippedItems }) {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring }}
      className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 relative overflow-hidden border-glow-cyan"
    >
      <div className="absolute -top-20 -left-10 w-64 h-64 rounded-full blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, hsl(190 90% 50% / 0.18), transparent 70%)" }} />
      <div className="absolute -bottom-24 -right-10 w-64 h-64 rounded-full blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, hsl(270 60% 55% / 0.18), transparent 70%)" }} />

      <div className="flex flex-col items-center gap-5 relative">
        <div className="shrink-0 mx-auto">
          <EquippedFrame equippedItems={equippedItems}>
            <motion.div className="relative" animate={{ y: [0, -6, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}>
              <div className="absolute inset-0 rounded-xl blur-xl" style={{ background: "radial-gradient(circle, hsl(270 60% 55% / 0.35), transparent 70%)" }} />
              <CharacterAvatar race={character.race} skinColor={character.appearance?.skin_color} eyeStyle={character.appearance?.eye_style} ears={character.appearance?.ears} mouth={character.appearance?.mouth} nose={character.appearance?.nose} eyebrows={character.appearance?.eyebrows} marking={character.appearance?.marking} cls={character.class} size={160} />
            </motion.div>
          </EquippedFrame>
        </div>

        <div className="flex flex-col sm:flex-row items-start gap-5 w-full">
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-bold text-xl glow-cyan tracking-wider">{profileDisplayName(character)}</h1>
            <span className="text-lg">{race?.emoji}</span>
            <span className="text-lg">{cls?.emoji}</span>
          </div>
          {normalizeLegacyDisplay(character.legacy_display) === LEGACY_DISPLAY_FAMILY && character.legacy_name && character.name && (
            <p className="text-xs text-muted-foreground/80 mt-0.5">Operative {character.name}</p>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">{race?.name} · {cls?.name}</p>
          {character.active_title && (
            <span className="inline-block mt-1 text-[11px] font-display font-semibold tracking-wide text-amber-300/90 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30">「{character.active_title}」</span>
          )}

          {/* Guild */}
          <div className="flex items-center gap-1.5 mt-1.5 text-xs">
            <Users className="w-3.5 h-3.5 text-accent" />
            {guild ? (
              <span className="text-accent font-display font-semibold">[{guild.tag}] {guild.name}</span>
            ) : (
              <span className="text-muted-foreground/60 italic">No guild — find one on the Guild page</span>
            )}
          </div>

          {/* Level */}
          <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-primary/10 border border-primary/30">
            <Star className="w-3.5 h-3.5 text-primary" />
            <span className="font-display font-bold text-sm text-primary">LEVEL {character.level}</span>
          </div>

          {/* XP */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Experience</span>
              <span>{character.experience} / {character.experience_to_next_level}</span>
            </div>
            <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${expPct}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-purple-500" />
            </div>
          </div>

          {/* Bio editor */}
          <div className="mt-4">
            <p className="text-[10px] font-display tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><BookOpen className="w-3 h-3" /> BIO (visible to others)</p>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 280))}
              placeholder="Share your legend... who are you, where have you been, what do you hunt?"
              rows={2}
              className="w-full text-xs bg-background/60 border border-border/50 rounded-lg p-2 resize-none focus:outline-none focus:border-primary/50"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[9px] text-muted-foreground/60">{bio.length}/280</span>
              <button
                onClick={saveBio}
                disabled={!bioDirty || saving}
                className="text-[10px] px-2.5 py-1 rounded-md painted-btn flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Save className="w-3 h-3" /> {saving ? "Saving..." : "Save Bio"}
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 mt-5">
        <div className="bg-muted/20 rounded-xl p-3 text-center border border-border/30">
          <span className="text-base block text-center text-accent mb-1">✨</span>
          <p className="font-display font-bold text-sm">{character.stardust?.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Stardust</p>
        </div>
        <div className="bg-muted/20 rounded-xl p-3 text-center border border-border/30">
          <Target className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="font-display font-bold text-sm">{character.missions_completed || 0}</p>
          <p className="text-[10px] text-muted-foreground">Missions</p>
        </div>
        <div className="bg-muted/20 rounded-xl p-3 text-center border border-border/30">
          <TrendingUp className="w-4 h-4 text-accent mx-auto mb-1" />
          <p className="font-display font-bold text-sm">Sector {character.highest_sector || 1}</p>
          <p className="text-[10px] text-muted-foreground">Highest</p>
        </div>
      </div>
    </motion.div>
  );
}