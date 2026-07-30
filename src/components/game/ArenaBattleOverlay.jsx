import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import confetti from "canvas-confetti";
import CharacterAvatar from "@/components/game/CharacterAvatar";
import { avatarPropsFor } from "@/lib/arenaEngine";
import { Swords, Zap, ChevronRight } from "lucide-react";
import { computePermanentTotalStats, computeDerivedStats } from "@/lib/statEngine";
import { CLASSES } from "@/lib/gameData";
import { resolveAbilityBanner } from "@/lib/classPassives";
import { ArenaBackdrop, ArenaFloor } from "@/components/game/ArenaBackdrop";
import ArenaWeaponVisual from "@/components/game/ArenaWeaponVisual";

const STAT_COLORS = { STR: "#F87171", AGI: "#4ADE80", INT: "#60A5FA", VIT: "#FBBF24", LUK: "#C084FC" };
const MOD_COLORS = { dmg: "#F87171", armor: "#FBBF24", tech: "#38BDF8", crit: "#C084FC", dodge: "#4ADE80" };
// DMG is driven by each class's primary stat (Technomancer/Cosmic Engineer → Intellect,
// Shadow Operative/Void Runner → Agility, Vanguard/Astral Warden → Strength), so the
// DMG readout is colored to match whichever stat it actually scales from.
const PRIMARY_STAT_COLOR = { strength: "#F87171", agility: "#4ADE80", intellect: "#60A5FA", vitality: "#FBBF24", luck: "#C084FC" };

function computeDisplayStats(entity) {
  const totalStats = computePermanentTotalStats(entity, []);
  const cls = CLASSES[entity.class] || CLASSES.Vanguard;
  const d = computeDerivedStats(totalStats, entity);
  return {
    totalStats,
    dmg: d.damage,
    armor: d.armor,
    techResist: d.techResist,
    crit: d.critChance,
    dodge: d.dodgeChance,
    primaryStat: d.primaryStat,
    classEmoji: cls.emoji,
  };
}

// Per-event pacing: quiet turns (regen/dodge) resolve fast, big hits (crit/ability/drone) linger.
function eventDuration(ev) {
  if (!ev) return 900;
  if (ev.type === "regen") return 560;
  if (ev.dodged) return 640;
  if (ev.type === "passive" || (ev.type === "miss" && ev.missKind === "phantom_signal")) return 1250;
  if (ev.type === "secondary" && ev.passive) return 1180;
  if (ev.crit || ev.type === "ability" || ev.type === "drone") return 1180;
  return 900;
}

// Counts consecutive non-dodged, non-regen hits by the same attacker ending at index i.
function comboAt(events, i) {
  if (i < 0) return 0;
  const ev = events[i];
  if (!ev || ev.dodged || ev.type === "regen" || !ev.attacker) return 0;
  let count = 0;
  let j = i;
  while (j >= 0) {
    const e = events[j];
    if (e && e.attacker === ev.attacker && !e.dodged && e.type !== "regen") count++;
    else break;
    j--;
  }
  return count;
}

function HpBar({ name, hp, max, color, align, emoji }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const low = pct > 0 && pct < 25;
  const barColor = low ? "#FB7185" : color;
  // Player (left): remaining HP hugs the center (right edge) — damage eats from the outer left.
  // Opponent (right): remaining HP hugs the center (left edge) — damage eats from the outer right.
  const fromOutside = align === "right" ? "justify-start" : "justify-end";
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className={`flex items-center gap-1.5 mb-1 ${align === "right" ? "justify-end" : ""}`}>
        {align !== "right" && <span className="text-base">{emoji}</span>}
        <p className="font-display font-bold text-sm sm:text-base truncate" style={{ color, textShadow: `0 0 8px ${color}66` }}>{name}</p>
        {align === "right" && <span className="text-base">{emoji}</span>}
      </div>
      <div className={`relative h-4 sm:h-5 rounded-full bg-black/50 border-2 overflow-hidden ${low ? "animate-pulse" : ""}`} style={{ borderColor: `${color}55`, boxShadow: `0 0 10px ${color}55, inset 0 1px 0 rgba(255,255,255,0.1)` }}>
        <div className={`absolute inset-0 flex ${fromOutside}`}>
          <motion.div className="relative h-full rounded-full overflow-hidden" style={{ background: `linear-gradient(180deg, ${barColor}, ${barColor}aa)` }} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }}>
            <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.35), transparent)" }} />
          </motion.div>
        </div>
        {[25, 50, 75].map((t) => (
          <div key={t} className="absolute top-0 bottom-0 w-px bg-black/20" style={{ left: `${t}%` }} />
        ))}
      </div>
      <div className={`flex items-center gap-1 mt-1 ${align === "right" ? "justify-end" : ""}`}>
        <span className="font-display font-black text-xs px-1.5 py-0.5 rounded-full" style={{ background: `${color}22`, color }}>{Math.max(0, Math.ceil(hp))}</span>
        <span className="text-[10px] text-muted-foreground font-bold">/ {max}</span>
      </div>
    </div>
  );
}

function Fighter({ entity, side, lunge, hurt, color, flip, floating, attackEvent, evIdx, big, weaponItem }) {
  const dir = side === "player" ? 1 : -1;
  const { totalStats, dmg, armor, techResist, crit, dodge, primaryStat, classEmoji } = computeDisplayStats(entity);
  const dmgColor = PRIMARY_STAT_COLOR[primaryStat] || MOD_COLORS.dmg;
  return (
    <div className="flex flex-col items-center" style={{ width: 248 }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-base">{classEmoji}</span>
        <p className="font-display font-bold text-sm truncate max-w-[160px]" style={{ color }}>{entity.name}</p>
      </div>
      <div className="relative" style={{ width: 228, height: 260 }}>
        <motion.div animate={{ x: lunge ? [0, dir * 56, 0] : 0 }} transition={{ duration: 0.55, times: [0, 0.4, 1], ease: "easeOut" }}>
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
          <div style={{ transform: flip ? "scaleX(-1)" : undefined }}>
            <CharacterAvatar {...avatarPropsFor(entity)} size={220} />
          </div>
        </motion.div>

        <ArenaWeaponVisual className={entity.class} attacking={lunge} attackEvent={attackEvent} evIdx={evIdx} side={side} weaponItem={weaponItem} />

        <AnimatePresence>
          {hurt && (
            <motion.div
              key={`h${evIdx}`}
              className="absolute inset-0 pointer-events-none rounded-full"
              style={{ boxShadow: big ? "inset 0 0 46px rgba(255,30,70,0.9)" : "inset 0 0 34px rgba(255,30,70,0.7)" }}
              initial={{ opacity: 0.95 }} animate={{ opacity: 0 }} transition={{ duration: 0.4 }}
            />
          )}
        </AnimatePresence>

        {/* Impact spark burst — golden star on crits/abilities, white flash on normal hits */}
        <AnimatePresence>
          {hurt && (
            <motion.div
              key={`sp${evIdx}`}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: 1.7, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}
            >
              <svg width="96" height="96" viewBox="0 0 100 100">
                <g fill="none" stroke={big ? "#FBBF24" : "#FFFFFF"} strokeWidth={big ? 4 : 3} strokeLinecap="round">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                    <line key={a} x1="50" y1="50" x2={50 + 38 * Math.cos(a * Math.PI / 180)} y2={50 + 38 * Math.sin(a * Math.PI / 180)} />
                  ))}
                </g>
                {big && <circle cx="50" cy="50" r="11" fill="#FBBF24" opacity="0.9" />}
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {floating && !floating.dodged && !floating.shieldHit && !floating.heal && (
          <motion.div
            key={`d${evIdx}`}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0, y: 0, scale: 0.6 }} animate={{ opacity: 1, y: -52, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}
          >
            <span className={`font-display font-black ${floating.crit ? "text-amber-300 text-3xl" : "text-red-400 text-xl"}`} style={{ textShadow: "0 0 8px currentColor" }}>
              {floating.crit && "CRIT "}-{floating.damage}
            </span>
          </motion.div>
        )}
        {floating && floating.shieldHit && (
          <motion.div
            key={`s${evIdx}`}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0, y: 0 }} animate={{ opacity: 1, y: -40 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
          >
            <span className="font-display font-bold text-cyan-300 text-lg" style={{ textShadow: "0 0 8px currentColor" }}>SHIELD</span>
          </motion.div>
        )}
        {floating && floating.heal && (
          <motion.div
            key={`he${evIdx}`}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0, y: 0, scale: 0.6 }} animate={{ opacity: 1, y: -44, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}
          >
            <span className="font-display font-bold text-green-300 text-xl" style={{ textShadow: "0 0 8px currentColor" }}>+{floating.heal}</span>
          </motion.div>
        )}
        {floating && floating.dodged && (
          <motion.div
            key={`dg${evIdx}`}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0, y: 0 }} animate={{ opacity: 1, y: -34 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
          >
            <span className="font-display font-bold text-cyan-300 text-lg" style={{ textShadow: "0 0 8px currentColor" }}>DODGE</span>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      <div className="mt-1 flex flex-col items-center gap-1">
        <div className="flex flex-col gap-0.5 text-sm font-display font-bold w-max whitespace-nowrap">
          {(() => {
            const lines = {
              strength: (
                <span key="str">
                  <span style={{ color: STAT_COLORS.STR }}>STR {totalStats.strength || 0}</span>
                  {primaryStat === "strength" && <span style={{ color: dmgColor }}> · DMG {dmg}</span>}
                  {primaryStat !== "strength" && (
                    <span style={{ color: MOD_COLORS.armor }}> · ARM {Number(armor).toFixed(1)}%</span>
                  )}
                  {primaryStat === "strength" && (
                    <span style={{ color: MOD_COLORS.armor }}> · ARM 0%</span>
                  )}
                </span>
              ),
              agility: (
                <span key="agi">
                  <span style={{ color: STAT_COLORS.AGI }}>AGI {totalStats.agility || 0}</span>
                  <span style={{ color: MOD_COLORS.dodge }}> · DODGE {Number(dodge).toFixed(1)}%</span>
                  {primaryStat === "agility" && <span style={{ color: dmgColor }}> · DMG {dmg}</span>}
                </span>
              ),
              intellect: (
                <span key="int">
                  <span style={{ color: STAT_COLORS.INT }}>INT {totalStats.intellect || 0}</span>
                  {primaryStat === "intellect" && <span style={{ color: dmgColor }}> · DMG {dmg}</span>}
                  {primaryStat !== "intellect" && (
                    <span style={{ color: MOD_COLORS.tech }}> · TECH {Number(techResist).toFixed(1)}%</span>
                  )}
                  {primaryStat === "intellect" && (
                    <span style={{ color: MOD_COLORS.tech }}> · TECH 0%</span>
                  )}
                </span>
              ),
              vitality: (
                <span key="vit">
                  <span style={{ color: STAT_COLORS.VIT }}>VIT {totalStats.vitality || 0}</span>
                  {primaryStat === "vitality" && <span style={{ color: dmgColor }}> · DMG {dmg}</span>}
                </span>
              ),
              luck: (
                <span key="luk">
                  <span style={{ color: STAT_COLORS.LUK }}>LUK {totalStats.luck || 0}</span>
                  <span style={{ color: MOD_COLORS.crit }}> · CRIT {Number(crit).toFixed(1)}%</span>
                </span>
              ),
            };
            // Agility-based damage classes (Shadow Operative) show their DMG
            // line first so the damage readout leads the stat block in combat.
            const order = primaryStat === "agility"
              ? ["agility", "strength", "intellect", "vitality", "luck"]
              : ["strength", "agility", "intellect", "vitality", "luck"];
            return order.map((k) => lines[k]);
          })()}
        </div>
      </div>
    </div>
  );
}

export default function ArenaBattleOverlay({ player, opponent, battle, onDone, playerItems, opponentItems, theme }) {
  const playerWeapon = playerItems?.find((i) => i.type === "weapon") || null;
  const opponentWeapon = opponentItems?.find((i) => i.type === "weapon") || null;
  const accent = theme?.color || null;
  const [phase, setPhase] = useState("intro");
  const [idx, setIdx] = useState(0);
  const [hp, setHp] = useState({ player: battle.playerMaxHp, opponent: battle.opponentMaxHp });
  const shake = useAnimationControls();
  const [flash, setFlash] = useState(false);
  const [abilityBanner, setAbilityBanner] = useState(null);

  useEffect(() => {
    if (phase !== "intro") return;
    const t = setTimeout(() => setPhase("fight"), 1500);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "fight") return;
    if (idx >= battle.events.length) { setPhase("outro"); return; }
    const ev = battle.events[idx];
    const dur = eventDuration(ev);
    // Class passive / ability callout (name + rolled variant when applicable).
    let bannerTimer;
    const banner = resolveAbilityBanner(ev, player, opponent);
    if (banner) {
      setAbilityBanner(banner);
      bannerTimer = setTimeout(() => setAbilityBanner(null), 1400);
    }
    const land = setTimeout(() => {
      if (ev && ev.heal) {
        const max = battle[`${ev.defender}MaxHp`];
        setHp((h) => ({ ...h, [ev.defender]: Math.min(max, h[ev.defender] + ev.heal) }));
      } else if (ev && !ev.dodged && ev.damage) {
        setHp((h) => ({ ...h, [ev.defender]: Math.max(0, h[ev.defender] - ev.damage) }));
        // Screen shake on heavy hits (crits, abilities, drone strikes)
        if (ev.crit || ev.type === "ability" || ev.type === "drone") {
          shake.start({ x: [0, -11, 9, -6, 4, 0], y: [0, 5, -3, 2, 0], transition: { duration: 0.42 } });
          setFlash(true);
          setTimeout(() => setFlash(false), 200);
        }
      }
    }, 420);
    // Clear the banner in the SAME batched update that advances the event, so a
    // player's ability banner can't linger (blue, attributed to "you") into the
    // opponent's following attack — the cleanup-only clear committed one frame
    // late with the stale banner still showing during the opponent's turn.
    const next = setTimeout(() => {
      setAbilityBanner(null);
      setIdx((i) => i + 1);
    }, dur);
    return () => { clearTimeout(land); clearTimeout(next); clearTimeout(bannerTimer); };
  }, [phase, idx, battle.events, shake, player, opponent]);

  useEffect(() => {
    if (phase !== "outro") return;
    if (battle.winner === "player" && !document.hidden) {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      const t = setTimeout(() => {
        if (!document.hidden) confetti({ particleCount: 60, spread: 110, origin: { y: 0.5 } });
      }, 500);
      return () => {
        clearTimeout(t);
        confetti.reset();
      };
    }
    return undefined;
  }, [phase, battle.winner]);

  const ev = phase === "fight" ? battle.events[idx] : null;
  const isQuiet = ev?.type === "regen";
  const attacker = ev?.attacker;
  const defender = ev?.defender;
  const isBigHit = !!(ev && !ev.dodged && ev.damage && (ev.crit || ev.type === "ability" || ev.type === "drone"));
  const combo = phase === "fight" ? comboAt(battle.events, idx) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#040214]">
      <ArenaBackdrop accent={accent} />
      {theme?.label && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <span
            className="px-3 py-1 rounded-full text-[10px] font-display font-bold tracking-[0.18em] uppercase border bg-background/50 backdrop-blur-sm"
            style={{ color: accent || "#67e8f9", borderColor: `${accent || "#67e8f9"}55` }}
          >
            {theme.label}
          </span>
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 px-4 pt-8 items-center relative z-30">
        <HpBar name={player.name} hp={hp.player} max={battle.playerMaxHp} color="#22D3EE" emoji={CLASSES[player.class]?.emoji} />
        <div className="text-center px-2">
          <Swords className="w-5 h-5 text-amber-300/80 mx-auto" />
        </div>
        <HpBar name={opponent.name} hp={hp.opponent} max={battle.opponentMaxHp} color="#FB7185" align="right" emoji={CLASSES[opponent.class]?.emoji} />
      </div>

      <motion.div animate={shake} className="flex-1 flex items-center justify-center gap-8 sm:gap-16 relative z-10">
        <ArenaFloor pulse={isBigHit} accent={accent} />
        <Fighter entity={player} side="player" lunge={attacker === "player" && !isQuiet} hurt={defender === "player" && !isQuiet} color="#22D3EE" flip={false} floating={ev && defender === "player" ? ev : null} attackEvent={ev && attacker === "player" ? ev : null} evIdx={idx} big={defender === "player" && isBigHit} weaponItem={playerWeapon} />
        <Fighter entity={opponent} side="opponent" lunge={attacker === "opponent" && !isQuiet} hurt={defender === "opponent" && !isQuiet} color="#FB7185" flip floating={ev && defender === "opponent" ? ev : null} attackEvent={ev && attacker === "opponent" ? ev : null} evIdx={idx} big={defender === "opponent" && isBigHit} weaponItem={opponentWeapon} />
        <AnimatePresence>
          {flash && (
            <motion.div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(255,255,255,0.22), transparent 70%)" }} initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
          )}
        </AnimatePresence>
        <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-cyan-400/30 rounded-tl-lg pointer-events-none" />
        <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-rose-400/30 rounded-tr-lg pointer-events-none" />
        <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-cyan-400/30 rounded-bl-lg pointer-events-none" />
        <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-rose-400/30 rounded-br-lg pointer-events-none" />
      </motion.div>

      {/* Combo callout — appears after 2+ consecutive hits by the same attacker */}
      <div className="h-10 flex items-center justify-center relative">
        <AnimatePresence>
          {combo >= 2 && attacker && (
            <motion.div
              key={combo}
              initial={{ scale: 0.4, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
              className={`absolute flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/50 font-display font-bold text-xs tracking-wide text-amber-300 ${attacker === "player" ? "left-6 sm:left-16" : "right-6 sm:right-16"}`}
            >
              <Zap className="w-3.5 h-3.5" /> COMBO ×{combo}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Skip — lifted from the bottom edge so PC taskbar hover doesn't steal clicks */}
      <div className="flex justify-center pb-10 sm:pb-12 -mt-2 relative z-40">
        <motion.button
          onClick={onDone}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          className="group flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 border-2 border-amber-300 font-display font-black text-sm tracking-wider text-black shadow-[0_0_18px_rgba(251,191,36,0.6)] hover:shadow-[0_0_26px_rgba(251,191,36,0.8)] transition-shadow"
        >
          <Zap className="w-4 h-4 group-hover:scale-110 transition-transform" />
          SKIP TO RESULTS
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </motion.button>
      </div>

      <AnimatePresence>
        {/* Class ability callout — per-class color, shows rolled variant when applicable */}
        {abilityBanner && (
          <motion.div
            key={`${abilityBanner.name}-${abilityBanner.detail || ""}-${idx}`}
            className={`absolute z-40 pointer-events-none flex flex-col items-center ${
              abilityBanner.side === "player"
                ? "left-4 sm:left-10 top-[38%]"
                : "right-4 sm:right-10 top-[38%]"
            }`}
            initial={{ opacity: 0, y: 16, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <motion.div
              className="rounded-xl px-4 py-2.5 border-2 backdrop-blur-md text-center max-w-[11rem] sm:max-w-[14rem]"
              style={{
                color: abilityBanner.color,
                borderColor: `${abilityBanner.color}99`,
                background: `linear-gradient(180deg, ${abilityBanner.color}22, ${abilityBanner.color}0a)`,
                boxShadow: `0 0 22px ${abilityBanner.color}55`,
              }}
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 0.55 }}
            >
              <div className="text-2xl leading-none mb-1">
                {CLASSES[abilityBanner.className]?.emoji || "✦"}
              </div>
              <p
                className="font-display font-black text-sm sm:text-base tracking-wide leading-tight"
                style={{
                  color: abilityBanner.color,
                  textShadow: `0 0 10px ${abilityBanner.color}`,
                }}
              >
                {abilityBanner.name}
              </p>
              {abilityBanner.detail && (
                <p
                  className="mt-1 text-[11px] sm:text-xs font-display font-semibold tracking-wider uppercase"
                  style={{ color: abilityBanner.color, opacity: 0.95 }}
                >
                  {abilityBanner.detail}
                </p>
              )}
              <p className="text-[9px] mt-1 tracking-wider uppercase opacity-70" style={{ color: abilityBanner.color }}>
                {abilityBanner.className}
              </p>
            </motion.div>
          </motion.div>
        )}

        {phase === "intro" && (
          <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 flex items-start justify-center pt-20 sm:pt-24 pointer-events-none">
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="text-center">
              <div className="flex items-center justify-center gap-3 mb-3">
                <span className="font-display font-bold text-sm text-cyan-300">{player.name}</span>
                <span className="font-display font-black text-amber-300 text-lg">VS</span>
                <span className="font-display font-bold text-sm text-rose-300">{opponent.name}</span>
              </div>
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: [0.4, 1.2, 1], opacity: [0, 1, 1] }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                <Swords className="w-12 h-12 text-amber-300 mx-auto mb-2" />
                <h2 className="font-display font-black text-3xl tracking-widest glow-cyan">FIGHT!</h2>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
        {phase === "outro" && (
          <motion.div key="outro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]">
            <motion.div initial={{ scale: 0.5, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 300 }} className="relative z-10 text-center px-4">
              <h2 className={`font-display font-black text-5xl tracking-widest ${battle.winner === "player" ? "text-amber-300 glow-orange" : "text-red-400"}`}>
                {battle.winner === "player" ? "VICTORY" : "DEFEAT"}
              </h2>
              <p className="text-sm text-muted-foreground mt-2">{battle.winner === "player" ? "Glory to the galaxy." : "You fall... but you'll rise again."}</p>
              <motion.button
                onClick={onDone}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.94 }}
                className={
                  battle.winner === "player"
                    ? "mt-6 inline-flex items-center gap-2 px-8 py-3 rounded-xl font-display font-black text-base tracking-wider text-black bg-gradient-to-r from-cyan-400 to-blue-500 border-2 border-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.5)] hover:shadow-[0_0_30px_rgba(34,211,238,0.75)] transition-shadow"
                    : "mt-6 inline-flex items-center gap-2 px-8 py-3 rounded-xl font-display font-black text-base tracking-wider text-white bg-gradient-to-r from-red-500 to-rose-600 border-2 border-red-300 shadow-[0_0_20px_rgba(239,68,68,0.55)] hover:shadow-[0_0_30px_rgba(239,68,68,0.8)] transition-shadow"
                }
              >
                <ChevronRight className="w-5 h-5" />
                {battle.winner === "player" ? "VIEW REWARDS" : "VIEW RESULTS"}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}