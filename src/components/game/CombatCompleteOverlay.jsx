import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { RARITY_COLORS, STAT_ICONS, gearTypeLabel } from "@/lib/gameData";
import GearVisual from "@/components/game/GearVisual";
import confetti from "canvas-confetti";
import { Star, Zap, TrendingUp, Package, Sparkles, Trophy, Gift, FlaskConical, ArrowRight, Swords, Skull } from "lucide-react";

function RewardCard({ icon, accent, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/60 p-3 flex items-start gap-3"
      style={accent ? { borderColor: accent + "55", boxShadow: `0 0 14px ${accent}22` } : undefined}
    >
      <div className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: (accent || "#9CA3AF") + "1f", color: accent || "#9CA3AF" }}>{icon}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </motion.div>
  );
}

// Post-combat rewards sheet for Arena + Galaxy Dungeon — same feel as mission complete.
export default function CombatCompleteOverlay({ summary, onClose }) {
  const won = !!summary?.won;

  useEffect(() => {
    if (!won || document.hidden) return undefined;
    confetti({ particleCount: 90, spread: 75, origin: { y: 0.35 } });
    const t = setTimeout(() => {
      if (!document.hidden) confetti({ particleCount: 60, spread: 110, origin: { y: 0.3 } });
    }, 350);
    return () => {
      clearTimeout(t);
      confetti.reset();
    };
  }, [won]);

  if (!summary) return null;

  const {
    mode = "arena",
    title,
    subtitle,
    xp,
    stardust,
    leveledUp,
    newLevel,
    prevLevel,
    statPoints,
    ratingDelta,
    gearItem,
    shipMod,
    consumableItem,
    discoveries,
    note,
  } = summary;

  const heading = mode === "dungeon"
    ? (won ? "DUNGEON CLEAR" : "YOU FELL")
    : (won ? "ARENA VICTORY" : "ARENA DEFEAT");

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-border/60 painted-panel painted-frame canvas-grain p-5"
      >
        <div className="text-center mb-4">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.05, type: "spring", stiffness: 300 }}>
            {won
              ? <Trophy className="w-10 h-10 mx-auto text-amber-400 drop-shadow-[0_0_10px_rgba(245,200,0,0.5)]" />
              : <Skull className="w-10 h-10 mx-auto text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.45)]" />}
          </motion.div>
          <h2 className={`font-display font-bold text-lg tracking-widest mt-1 ${won ? "text-amber-300 glow-orange" : "text-rose-300"}`}>
            {heading}
          </h2>
          {title && <p className="text-sm font-semibold text-foreground mt-1">{title}</p>}
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>

        <div className="space-y-2">
          {(xp?.total > 0 || (xp?.total === 0 && note)) && (
            <RewardCard icon={<Zap className="w-5 h-5" />} accent="#00E5FF">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-display font-semibold text-cyan-300">EXPERIENCE</span>
                <span className="font-display font-bold text-cyan-400 text-lg">+{xp?.total || 0}</span>
              </div>
              {xp?.base != null && xp.base !== xp.total && (
                <p className="text-[10px] text-muted-foreground mt-1">base {xp.base}{xp.collectionPct > 0 ? ` · +${xp.collectionPct}% collection` : ""}</p>
              )}
            </RewardCard>
          )}

          {(stardust?.total > 0 || (stardust?.total === 0 && note)) && (
            <RewardCard icon={<Star className="w-5 h-5" />} accent="#A855F7">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-display font-semibold text-purple-300">STARDUST</span>
                <span className="font-display font-bold text-purple-400 text-lg">+{stardust?.total || 0}</span>
              </div>
            </RewardCard>
          )}

          {typeof ratingDelta === "number" && (
            <RewardCard icon={<Swords className="w-5 h-5" />} accent={ratingDelta >= 0 ? "#FBBF24" : "#FB7185"}>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-display font-semibold" style={{ color: ratingDelta >= 0 ? "#FBBF24" : "#FB7185" }}>ARENA RATING</span>
                <span className="font-display font-bold text-lg" style={{ color: ratingDelta >= 0 ? "#FBBF24" : "#FB7185" }}>
                  {ratingDelta >= 0 ? "+" : ""}{ratingDelta}
                </span>
              </div>
            </RewardCard>
          )}

          {leveledUp && (
            <RewardCard icon={<TrendingUp className="w-5 h-5" />} accent="#22C55E">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-display font-semibold text-green-300">LEVEL UP</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Keep earning Stardust to buy attributes</p>
                </div>
                <span className="font-display font-bold text-green-400 text-lg flex items-center gap-1">
                  {prevLevel || (newLevel - 1)} <ArrowRight className="w-4 h-4" /> {newLevel}
                </span>
              </div>
            </RewardCard>
          )}

          {gearItem && (
            <RewardCard icon={<Package className="w-5 h-5" />} accent={RARITY_COLORS[gearItem.rarity]}>
              <div className="flex items-center gap-2">
                <GearVisual type={gearItem.type} rarity={gearItem.rarity} name={gearItem.name} baseName={gearItem.base_name} level_requirement={gearItem.level_requirement} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight" style={{ color: RARITY_COLORS[gearItem.rarity] }}>{gearItem.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{gearItem.rarity} {gearTypeLabel(gearItem.type)}</p>
                  {gearItem.stats && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {Object.entries(gearItem.stats).filter(([, v]) => v > 0).slice(0, 5).map(([s, v]) => (
                        <span key={s} className="text-[10px] text-muted-foreground">{STAT_ICONS[s]}{v}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </RewardCard>
          )}

          {shipMod && (
            <RewardCard icon={<Gift className="w-5 h-5" />} accent="#F59E0B">
              <p className="text-sm font-semibold text-amber-300">🔧 {shipMod} unlocked</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Permanent ship modification</p>
            </RewardCard>
          )}

          {consumableItem && (
            <RewardCard icon={<FlaskConical className="w-5 h-5" />} accent={RARITY_COLORS[consumableItem.rarity]}>
              <p className="text-sm font-semibold" style={{ color: RARITY_COLORS[consumableItem.rarity] }}>{consumableItem.name}</p>
              {consumableItem.flavor_text && <p className="text-[10px] text-muted-foreground">{consumableItem.flavor_text}</p>}
            </RewardCard>
          )}

          {discoveries && discoveries.length > 0 && (
            <RewardCard icon={<Sparkles className="w-5 h-5" />} accent="#22C55E">
              <div className="flex flex-wrap gap-2">
                {discoveries.map((d, i) => (
                  <span key={i} className="text-xs flex items-center gap-1 text-green-300"><span>{d.emoji}</span>{d.name}</span>
                ))}
              </div>
            </RewardCard>
          )}

          {note && (
            <p className="text-[10px] text-center text-muted-foreground pt-1">{note}</p>
          )}
        </div>

        <button onClick={onClose} className="w-full mt-4 painted-btn py-2.5 text-sm">Continue</button>
      </motion.div>
    </div>
  );
}
