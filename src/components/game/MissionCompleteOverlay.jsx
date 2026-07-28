import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { RARITY_COLORS, STAT_ICONS, gearTypeLabel, FUEL_COLOR, STARDUST_COLOR, XP_COLOR } from "@/lib/gameData";
import GearVisual from "@/components/game/GearVisual";
import GameplayOverlayPortal from "@/components/game/GameplayOverlayPortal";
import confetti from "canvas-confetti";
import { Star, Zap, Fuel, TrendingUp, Package, Sparkles, MapPin, Clock, Trophy, Gift, FlaskConical, ArrowRight } from "lucide-react";

// Shared chrome for level-up / empty panes (not rarity-coded).
const SUMMARY_ACCENT = "#FBBF24";
const EMPTY_GEAR_ACCENT = "#6B7280";

function fmtDuration(s) {
  if (!s) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const pct = (v) => Math.round(v * 100);

function rarityAccent(rarity) {
  return RARITY_COLORS[rarity] || EMPTY_GEAR_ACCENT;
}

function RewardCard({ icon, accent = SUMMARY_ACCENT, muted = false, children }) {
  const a = muted ? EMPTY_GEAR_ACCENT : accent;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border bg-card/60 p-3 flex items-start gap-3 ${muted ? "opacity-55" : ""}`}
      style={{ borderColor: a + (muted ? "40" : "55"), boxShadow: muted ? undefined : `0 0 14px ${a}18` }}
    >
      <div
        className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: a + "1f", color: a }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </motion.div>
  );
}

export default function MissionCompleteOverlay({ summary, onClose }) {
  useEffect(() => {
    if (document.hidden) return undefined;
    confetti({ particleCount: 90, spread: 75, origin: { y: 0.35 } });
    const t = setTimeout(() => {
      if (!document.hidden) confetti({ particleCount: 60, spread: 110, origin: { y: 0.3 } });
    }, 350);
    return () => {
      clearTimeout(t);
      confetti.reset();
    };
  }, []);

  if (!summary) return null;
  const { mission, leveledUp, newLevel, gearItem, collectible, consumableItem, discoveries, fuelSpent } = summary;
  const m = mission || {};
  const xp = summary.xp || { base: 0, total: 0, shipMult: 0, collectionPct: 0 };
  const stardust = summary.stardust || { base: 0, total: 0, shipMult: 0, nexus: false };

  const xpChips = [];
  if ((xp.shipMult || 0) > 0) xpChips.push(`+${pct(xp.shipMult)}% ship`);
  if ((xp.collectionPct || 0) > 0) xpChips.push(`+${xp.collectionPct}% collection`);

  const sdChips = [];
  if (stardust.nexus) sdChips.push("+5% nexus");
  if ((stardust.shipMult || 0) > 0) sdChips.push(`+${pct(stardust.shipMult)}% ship`);

  const gearAccent = gearItem ? rarityAccent(gearItem.rarity) : EMPTY_GEAR_ACCENT;
  const collectibleAccent = collectible ? rarityAccent(collectible.rarity) : SUMMARY_ACCENT;
  const consumableAccent = consumableItem ? rarityAccent(consumableItem.rarity) : SUMMARY_ACCENT;

  return (
    <GameplayOverlayPortal className="z-[80] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[88%] overflow-y-auto rounded-2xl border border-border/60 painted-panel painted-frame canvas-grain p-5"
      >
        <div className="text-center mb-4">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.05, type: "spring", stiffness: 300 }}>
            <Trophy className="w-10 h-10 mx-auto text-amber-400 drop-shadow-[0_0_10px_rgba(245,200,0,0.5)]" />
          </motion.div>
          <h2 className="font-display font-bold text-lg tracking-widest text-amber-300 glow-orange mt-1">MISSION COMPLETE</h2>
          <p className="text-sm font-semibold text-foreground mt-1">{m.name}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 mb-4 text-[10px]">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground"><MapPin className="w-3 h-3" />{m.location}</span>
          {m.sector && <span className="px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">Sector {m.sector}</span>}
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground"><Clock className="w-3 h-3" />{fmtDuration(m.duration_seconds)}</span>
        </div>

        <div className="space-y-2">
          <RewardCard icon={<Zap className="w-5 h-5" />} accent={XP_COLOR}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-display font-semibold" style={{ color: XP_COLOR }}>EXPERIENCE</span>
              <span className="font-display font-bold text-lg" style={{ color: XP_COLOR }}>+{xp.total || 0}</span>
            </div>
            {xpChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mt-1">
                <span className="text-[10px] text-muted-foreground">base {xp.base}</span>
                {xpChips.map((c) => (
                  <span
                    key={c}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${XP_COLOR}1a`, color: XP_COLOR }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </RewardCard>

          <RewardCard icon={<Star className="w-5 h-5" />} accent={STARDUST_COLOR}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-display font-semibold" style={{ color: STARDUST_COLOR }}>STARDUST</span>
              <span className="font-display font-bold text-lg" style={{ color: STARDUST_COLOR }}>+{stardust.total || 0}</span>
            </div>
            {sdChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mt-1">
                <span className="text-[10px] text-muted-foreground">base {stardust.base}</span>
                {sdChips.map((c) => (
                  <span
                    key={c}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${STARDUST_COLOR}1a`, color: STARDUST_COLOR }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </RewardCard>

          {leveledUp && (
            <RewardCard icon={<TrendingUp className="w-5 h-5" />}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-display font-semibold text-amber-200">LEVEL UP</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Keep earning Stardust to buy attributes</p>
                </div>
                <span className="font-display font-bold text-amber-300 text-lg flex items-center gap-1">
                  {newLevel - 1} <ArrowRight className="w-4 h-4" /> {newLevel}
                </span>
              </div>
            </RewardCard>
          )}

          {gearItem ? (
            <RewardCard icon={<Package className="w-5 h-5" />} accent={gearAccent}>
              <div className="flex items-center gap-2">
                <GearVisual type={gearItem.type} rarity={gearItem.rarity} name={gearItem.name} baseName={gearItem.base_name} level_requirement={gearItem.level_requirement} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight" style={{ color: gearAccent }}>{gearItem.name}</p>
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
              {gearItem.flavor_text && <p className="text-[10px] italic text-muted-foreground/70 mt-1.5">"{gearItem.flavor_text}"</p>}
            </RewardCard>
          ) : (
            <RewardCard icon={<Package className="w-5 h-5" />} muted>
              <span className="text-xs text-muted-foreground">No gear recovered this run.</span>
            </RewardCard>
          )}

          {collectible && (
            <RewardCard icon={<Gift className="w-5 h-5" />} accent={collectibleAccent}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{collectible.emoji}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: collectibleAccent }}>{collectible.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{collectible.rarity || "common"} find</p>
                </div>
              </div>
            </RewardCard>
          )}

          {consumableItem && (
            <RewardCard icon={<FlaskConical className="w-5 h-5" />} accent={consumableAccent}>
              <p className="text-sm font-semibold" style={{ color: consumableAccent }}>{consumableItem.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{consumableItem.rarity} stim</p>
              {consumableItem.flavor_text && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{consumableItem.flavor_text}</p>
              )}
            </RewardCard>
          )}

          {discoveries && discoveries.length > 0 && (
            <RewardCard icon={<Sparkles className="w-5 h-5" />}>
              <div className="flex flex-wrap gap-2">
                {discoveries.map((d, i) => (
                  <span key={i} className="text-xs flex items-center gap-1 text-amber-200/90"><span>{d.emoji}</span>{d.name}</span>
                ))}
              </div>
            </RewardCard>
          )}

          <div className="flex items-center justify-center gap-1 text-[10px] pt-1" style={{ color: FUEL_COLOR }}>
            <Fuel className="w-3 h-3" /> {fuelSpent} fuel spent
          </div>
        </div>

        <button onClick={onClose} className="w-full mt-4 painted-btn py-2.5 text-sm">Continue</button>
      </motion.div>
    </GameplayOverlayPortal>
  );
}
