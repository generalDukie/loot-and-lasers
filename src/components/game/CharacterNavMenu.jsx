import React, { useState, useRef, useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { UserRound } from "lucide-react";
import HubCharacterChip from "@/components/game/HubCharacterChip";
import CurrencyStack from "@/components/game/CurrencyStack";
import EquippedFrame from "@/components/game/EquippedFrame";
import { useEquippedItems } from "@/hooks/useEquippedItems";
import { PRIMARY_STATS, computePermanentTotalStats, computeDerivedStats } from "@/lib/statEngine";
import { STAT_ICONS } from "@/lib/gameData";
import { NAV_GROUPS } from "@/lib/navGroups";

const STAT_SHORT = {
  strength: "STR",
  agility: "AGI",
  intellect: "INT",
  vitality: "VIT",
  luck: "LCK",
};

/** True when the device can reliably hover (mouse/trackpad). */
function useDesktopHover() {
  const [desktopHover, setDesktopHover] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setDesktopHover(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktopHover;
}

// Character portrait + currencies. Hover (desktop) or tap (touch) expands page nav + loadout.
export default function CharacterNavMenu({ character, large = false, xpPct: xpPctProp }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const rootRef = useRef(null);
  const desktopHover = useDesktopHover();
  const equippedItems = useEquippedItems(character?.id);
  const xpPct = xpPctProp ?? (character?.experience_to_next_level > 0
    ? Math.min(100, ((character.experience || 0) / character.experience_to_next_level) * 100)
    : 0);

  const enter = () => {
    if (!desktopHover) return;
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const leave = () => {
    if (!desktopHover) return;
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };
  const close = () => {
    clearTimeout(closeTimer.current);
    setOpen(false);
  };
  const toggle = () => {
    clearTimeout(closeTimer.current);
    setOpen((v) => !v);
  };

  // Touch / coarse pointer: dismiss on outside tap or Escape.
  useEffect(() => {
    if (!open || desktopHover) return undefined;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, desktopHover]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const totals = character ? computePermanentTotalStats(character, equippedItems) : {};
  const derived = character ? computeDerivedStats(totals, character) : {};
  const filled = equippedItems.length;

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <div className="flex items-stretch gap-2">
        <HubCharacterChip
          character={character}
          xpPct={xpPct}
          large={large}
          asMenuTrigger={!desktopHover}
          menuOpen={open}
          onMenuToggle={toggle}
        />
        <CurrencyStack character={character} large={large} />
      </div>

      <AnimatePresence>
        {open && character && (
          <motion.div
            role="menu"
            aria-label="Page navigation"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-1 left-0 z-50 flex flex-col sm:flex-row items-stretch sm:items-start gap-2 w-[min(calc(100vw-1rem),24rem)] sm:w-auto max-h-[min(70vh,34rem)] overflow-y-auto overscroll-contain"
          >
            <div className="w-full sm:w-52 shrink-0 rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl painted-panel p-2">
              {NAV_GROUPS.map((g, gi) => (
                <React.Fragment key={g.name}>
                  {gi > 0 && <div className="h-px bg-border/40 my-1 mx-1" />}
                  <span className="block text-[8px] font-display font-bold tracking-widest text-muted-foreground/50 px-2 mb-0.5">
                    {g.name.toUpperCase()}
                  </span>
                  {g.items.map(({ to, label, icon: Icon, color }) => (
                    <NavLink
                      key={to}
                      to={to}
                      title={label}
                      onClick={close}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-xl px-2 py-2 transition-all ${
                          isActive ? "bg-primary/15 border-glow-cyan" : "hover:bg-muted/40"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={`w-5 h-5 shrink-0 ${isActive ? "glow-cyan" : ""}`} style={{ color }} />
                          <span className="font-display font-semibold text-sm tracking-wide whitespace-nowrap">{label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </React.Fragment>
              ))}
            </div>

            <Link
              to="/character"
              title="View loadout & inventory"
              onClick={close}
              className="w-full sm:w-[11.5rem] shrink-0 rounded-xl border border-border/70 bg-background/95 backdrop-blur-xl shadow-2xl painted-panel overflow-hidden hover:border-primary/45 transition-colors block"
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50 bg-muted/20">
                <span className="text-[9px] font-display font-bold tracking-[0.18em] text-muted-foreground">
                  LOADOUT
                </span>
                <span className="text-[9px] font-display font-semibold text-muted-foreground/80">
                  {filled}/8
                </span>
              </div>

              <div className="px-2.5 pt-2.5 pb-2">
                <EquippedFrame equippedItems={equippedItems} size={45}>
                  <div className="w-[34px] h-[34px] rounded-lg border border-cyan-400/40 bg-cyan-500/10 flex items-center justify-center">
                    <UserRound className="w-4 h-4 text-cyan-300" />
                  </div>
                </EquippedFrame>
              </div>

              <div className="mx-2.5 mb-2.5 rounded-lg border border-border/50 bg-card/70 px-2.5 py-2">
                <div className="mb-2">
                  <span className="text-[8px] font-display font-bold tracking-[0.16em] text-muted-foreground/70">
                    STATS
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {PRIMARY_STATS.map((key) => (
                    <div
                      key={key}
                      className="rounded-md bg-muted/30 border border-border/40 px-0.5 py-1 text-center"
                      title={key}
                    >
                      <div className="text-[10px] leading-none">{STAT_ICONS[key]}</div>
                      <div className="text-[7px] font-display font-bold tracking-wide text-muted-foreground mt-0.5">
                        {STAT_SHORT[key]}
                      </div>
                      <div className="text-[10px] font-display font-bold text-foreground leading-tight">
                        {totals[key] || 0}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <div className="rounded-md bg-muted/25 border border-border/35 px-1 py-1">
                    <p className="text-[7px] font-display tracking-wide text-muted-foreground">DMG</p>
                    <p className="text-[10px] font-display font-bold text-foreground">{derived.damage ?? 0}</p>
                  </div>
                  <div className="rounded-md bg-muted/25 border border-border/35 px-1 py-1">
                    <p className="text-[7px] font-display tracking-wide text-muted-foreground">HP</p>
                    <p className="text-[10px] font-display font-bold text-foreground">{derived.health ?? 0}</p>
                  </div>
                  <div className="rounded-md bg-muted/25 border border-border/35 px-1 py-1">
                    <p className="text-[7px] font-display tracking-wide text-muted-foreground">ARM</p>
                    <p className="text-[10px] font-display font-bold text-foreground">
                      {typeof derived.armor === "number" ? `${derived.armor.toFixed(1)}%` : (derived.armor ?? 0)}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
