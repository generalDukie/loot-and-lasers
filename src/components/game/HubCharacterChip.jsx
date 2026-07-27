import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FlaskConical, Rocket } from "lucide-react";
import CharacterAvatar from "@/components/game/CharacterAvatar";
import { fullName } from "@/lib/legacyName";
import { getActiveBuffs } from "@/lib/gameData";
import { getActiveFuelMounts } from "@/lib/fuelMounts";

// Ticks every second so countdown labels stay live.
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// Compact remaining-time label for the soonest-expiring effect.
function remainingLabel(expiresAt, now) {
  const ms = Math.max(0, new Date(expiresAt).getTime() - now);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Compact character identity chip — portrait + level badge + name + XP bar.
// Supports a `large` variant for the hub hero corner.
export default function HubCharacterChip({ character, xpPct, large = false }) {
  const now = useNow();
  if (!character) return null;
  const ap = character.appearance || {};
  const size = large ? 80 : 40;
  const pad = large ? "pl-2 pr-3.5 py-2" : "pl-1.5 pr-2.5 py-1.5";
  const nameCls = large ? "text-sm" : "text-[11px]";
  const nameMax = large ? "max-w-[150px]" : "max-w-[96px]";
  const barH = large ? "h-2.5" : "h-1.5";
  const xpCls = large ? "text-[10px]" : "text-[8px]";
  const badgeCls = large
    ? "min-w-[24px] h-[24px] px-1 text-[11px]"
    : "min-w-[16px] h-[16px] px-1 text-[9px]";

  return (
    <Link to="/character" className="block group focus:outline-none">
      <motion.div
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
        className={`flex items-center gap-${large ? 3 : 2} rounded-xl bg-background/90 border border-border/60 ${pad} shadow-lg group-hover:border-primary/50 transition-colors`}
      >
        {/* Portrait + level badge */}
        <div className="relative shrink-0">
          <div
            className="rounded-lg overflow-hidden border border-primary/40"
            style={{ boxShadow: "0 0 10px hsl(190 90% 50% / 0.3)" }}
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
              size={size}
            />
          </div>
          <span className={`absolute -bottom-1 -right-1 ${badgeCls} rounded-full bg-primary text-primary-foreground font-display font-black flex items-center justify-center border border-background`}>
            {character.level}
          </span>
        </div>

        {/* Name + XP bar */}
        <div className={large ? "min-w-[150px]" : "min-w-[86px]"}>
          <p className={`${nameCls} font-display font-bold text-foreground truncate ${nameMax} leading-tight`}>
            {fullName(character)}
          </p>
          <div className={`mt-1 ${barH} rounded-full bg-muted/50 overflow-hidden border border-border/30`}>
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
              initial={{ width: 0 }}
              animate={{ width: `${xpPct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <p className={`${xpCls} text-muted-foreground mt-0.5 tabular-nums`}>
            {(character.experience || 0).toLocaleString()} / {(character.experience_to_next_level || 0).toLocaleString()} XP
          </p>
          {(() => {
            const buffs = getActiveBuffs(character);
            const mounts = getActiveFuelMounts(character);
            if (!buffs.length && !mounts.length) return null;
            const buffExpiry = buffs.length ? Math.min(...buffs.map((b) => new Date(b.expires_at).getTime())) : null;
            const mountExpiry = mounts.length ? Math.min(...mounts.map((m) => new Date(m.expires_at).getTime())) : null;
            return (
              <div className="flex items-center gap-1.5 mt-0.5">
                {buffs.length > 0 && (
                  <span className="flex items-center gap-0.5 text-accent" title={`${buffs.length} active stim${buffs.length > 1 ? "s" : ""}`}>
                    <FlaskConical className={large ? "w-3 h-3" : "w-2.5 h-2.5"} />
                    <span className={`tabular-nums font-bold ${large ? "text-[9px]" : "text-[8px]"}`}>{remainingLabel(buffExpiry, now)}</span>
                    {buffs.length > 1 && (
                      <span className={`tabular-nums font-bold leading-none rounded-full px-1 bg-accent/20 ${large ? "text-[8px]" : "text-[7px]"}`}>×{buffs.length}</span>
                    )}
                  </span>
                )}
                {mounts.length > 0 && (
                  <span className="flex items-center gap-0.5 text-amber-400" title={`${mounts.length} active fuel mount${mounts.length > 1 ? "s" : ""}`}>
                    <Rocket className={large ? "w-3 h-3" : "w-2.5 h-2.5"} />
                    <span className={`tabular-nums font-bold ${large ? "text-[9px]" : "text-[8px]"}`}>{remainingLabel(mountExpiry, now)}</span>
                    {mounts.length > 1 && (
                      <span className={`tabular-nums font-bold leading-none rounded-full px-1 bg-amber-400/20 text-amber-300 ${large ? "text-[8px]" : "text-[7px]"}`}>×{mounts.length}</span>
                    )}
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      </motion.div>
    </Link>
  );
}