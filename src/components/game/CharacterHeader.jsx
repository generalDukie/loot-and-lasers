import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { RACES, CLASSES, getActiveBuffs, XP_COLOR } from "@/lib/gameData";
import { getActiveFuelMounts } from "@/lib/fuelMounts";
import { spring } from "@/lib/goofyMotion";
import CharacterAvatar from "@/components/game/CharacterAvatar";
import EquippedFrame from "@/components/game/EquippedFrame";
import ActiveEffectsPanel from "@/components/game/ActiveEffectsPanel";
import { Users, Save } from "lucide-react";
import { profileDisplayName, normalizeLegacyDisplay, LEGACY_DISPLAY_FAMILY } from "@/lib/legacyName";

const paneClass = "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl";

/** Scale content down to fit a container without scrolling (keeps layout box in sync). */
function useFitScale() {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return undefined;

    const update = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const bw = content.offsetWidth;
      const bh = content.offsetHeight;
      if (bw <= 0 || bh <= 0 || cw <= 0 || ch <= 0) return;
      const next = Math.min(1, cw / bw, ch / bh);
      const s = next > 0.995 ? 1 : Math.max(0.5, next);
      setScale(s);
      setBox({ w: Math.ceil(bw * s), h: Math.ceil(bh * s) });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  return { containerRef, contentRef, scale, box };
}

export default function CharacterHeader({ character, guild, equippedItems, onUpdate, onEquip, onLock }) {
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const { containerRef, contentRef, scale, box } = useFitScale();
  const race = RACES[character.race];
  const cls = CLASSES[character.class];
  const expToNext = character.experience_to_next_level || 0;
  const expPct = expToNext > 0
    ? Math.min(100, ((character.experience || 0) / expToNext) * 100)
    : 0;

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
      <div className="flex-1 min-h-0 flex gap-2 items-stretch overflow-hidden">
        {/* Lore — slim side rail */}
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring }}
          className={`w-[7.5rem] sm:w-[8.75rem] min-w-0 min-h-0 shrink-0 ${paneClass} p-2.5 overflow-y-auto flex flex-col`}
        >
          <h2 className="font-display font-semibold text-[10px] tracking-wide text-muted-foreground mb-1.5 shrink-0">
            LORE
          </h2>
          <div className="flex-1 min-h-0 space-y-2 text-[9px] leading-snug text-muted-foreground">
            <div>
              <p className="text-[8px] font-display font-bold tracking-wide text-primary mb-0.5">
                {race?.emoji} {race?.name}
              </p>
              <p>{race?.lore}</p>
            </div>
            <div className="border-t border-border/30 pt-1.5">
              <p className="text-[8px] font-display font-bold tracking-wide text-accent mb-0.5">
                {cls?.emoji} {cls?.name}
              </p>
              <p>{cls?.description}</p>
            </div>
            {cls?.special && (
              <div className="border-t border-border/30 pt-1.5">
                <p className="text-[8px] font-display font-bold tracking-wide text-primary mb-0.5">
                  {cls.special.name}
                </p>
                <p>{cls.special.effect}</p>
              </div>
            )}
          </div>
        </motion.aside>

        {/* Portrait + gear — hero center */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.04 }}
          className={`flex-1 min-w-0 min-h-0 ${paneClass} p-2.5 sm:p-3 flex gap-2.5 overflow-hidden`}
        >
          <div className="flex-1 min-w-0 min-h-0 flex flex-col items-center overflow-hidden">
            {/* Loadout scales to available height — no scroll */}
            <div
              ref={containerRef}
              className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden"
            >
              <div
                className="relative shrink-0"
                style={box.w ? { width: box.w, height: box.h } : undefined}
              >
                <div
                  ref={contentRef}
                  className="absolute top-0 left-0"
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                >
                  <EquippedFrame
                    equippedItems={equippedItems}
                    size={56}
                    portraitSize={148}
                    showcase
                    interactive
                    showHoverStats
                    characterClass={character.class}
                    onEquip={onEquip}
                    onLock={onLock}
                  >
                    <div className="relative">
                      <div
                        className="rounded-2xl overflow-hidden border border-primary/40 bg-muted/15"
                        style={{ boxShadow: "0 0 24px hsl(190 90% 50% / 0.2)" }}
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
                          size={148}
                        />
                      </div>
                      <span className="absolute -bottom-1.5 -right-1.5 min-w-[26px] h-[26px] px-1 rounded-full bg-primary text-primary-foreground font-display font-black text-[11px] flex items-center justify-center border-2 border-background shadow-md tabular-nums">
                        {character.level}
                      </span>
                    </div>
                  </EquippedFrame>
                </div>
              </div>
            </div>

            <div className="shrink-0 w-full max-w-[20rem] text-center min-w-0 pt-1.5">
              <h1 className="font-display font-bold text-base sm:text-lg tracking-wide leading-tight truncate">
                {profileDisplayName(character)}
              </h1>
              {showOperative && (
                <p className="text-[9px] text-muted-foreground/70 truncate">Operative {character.name}</p>
              )}
              {character.active_title && (
                <p className="text-[9px] font-display font-semibold text-amber-400/90 truncate">
                  {character.active_title}
                </p>
              )}
              {guild ? (
                <p className="inline-flex items-center justify-center gap-0.5 text-[9px] text-accent mt-0.5 max-w-full">
                  <Users className="w-3 h-3 shrink-0" />
                  <span className="font-display font-semibold truncate">[{guild.tag}] {guild.name}</span>
                </p>
              ) : (
                <p className="text-[9px] text-muted-foreground/50 mt-0.5">No guild</p>
              )}
            </div>

            <div className="shrink-0 w-full max-w-[18rem] mt-1">
              <div className="flex items-center justify-between text-[8px] text-muted-foreground mb-0.5">
                <span className="font-display font-semibold tracking-wide" style={{ color: XP_COLOR }}>XP</span>
                <span className="tabular-nums">
                  {(character.experience || 0).toLocaleString()} / {(character.experience_to_next_level || 0).toLocaleString()}
                </span>
              </div>
              <div className="h-1 rounded-full bg-muted/50 overflow-hidden border border-border/30">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${expPct}%` }}
                  transition={{ duration: 0.7 }}
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${XP_COLOR}, #38BDF8)` }}
                />
              </div>
            </div>
          </div>

          <div className="w-[6.5rem] sm:w-[7.25rem] shrink-0 min-h-0 self-stretch border-l border-border/30 pl-2 overflow-y-auto">
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

      <div className={`shrink-0 flex items-center gap-2 px-3 py-1.5 ${paneClass}`}>
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
