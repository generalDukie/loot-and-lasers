import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import HubCharacterChip from "@/components/game/HubCharacterChip";
import CurrencyStack from "@/components/game/CurrencyStack";
import CharacterAvatar from "@/components/game/CharacterAvatar";
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

// Character portrait + currencies. Hover (desktop) or tap (touch) expands page nav
// with a loadout panel beside it — same avatar art as the banner chip.
export default function CharacterNavMenu({ character, large = false, xpPct: xpPctProp }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
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

  // Pin under the chip in viewport space so GameCanvas overflow:hidden can't clip it.
  useLayoutEffect(() => {
    if (!open || !rootRef.current) return undefined;
    const place = () => {
      const r = rootRef.current.getBoundingClientRect();
      const pad = 8;
      let left = r.left;
      const approxW = 420;
      if (left + approxW > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - pad - approxW);
      }
      setMenuPos({ top: r.bottom + 4, left: Math.max(pad, left) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

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
  const ap = character?.appearance || {};

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
            className="fixed z-[80] flex flex-col sm:flex-row items-stretch sm:items-start gap-2"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {/* Vertical page nav */}
            <div className="w-[13.5rem] shrink-0 rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl painted-panel p-1.5">
              {NAV_GROUPS.map((g, gi) => (
                <React.Fragment key={g.name}>
                  {gi > 0 && <div className="h-px bg-border/40 my-0.5 mx-1" />}
                  <span className="block text-[7px] font-display font-bold tracking-widest text-muted-foreground/50 px-2 mb-0.5">
                    {g.name.toUpperCase()}
                  </span>
                  {g.items.map(({ to, label, icon: Icon, color }) => (
                    <NavLink
                      key={to}
                      to={to}
                      title={label}
                      onClick={close}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all ${
                          isActive ? "bg-primary/15 border-glow-cyan" : "hover:bg-muted/40"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? "glow-cyan" : ""}`} style={{ color }} />
                          <span className="font-display font-semibold text-xs tracking-wide whitespace-nowrap">{label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </React.Fragment>
              ))}
            </div>

            {/* Loadout extension — same avatar as the banner chip */}
            <Link
              to="/character"
              title="View loadout & inventory"
              onClick={close}
              className="w-[10.5rem] shrink-0 rounded-xl border border-border/70 bg-background/95 backdrop-blur-xl shadow-2xl painted-panel overflow-hidden hover:border-primary/45 transition-colors block"
            >
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-border/50 bg-muted/20">
                <span className="text-[8px] font-display font-bold tracking-[0.18em] text-muted-foreground">
                  LOADOUT
                </span>
                <span className="text-[8px] font-display font-semibold text-muted-foreground/80">
                  {filled}/8
                </span>
              </div>

              <div className="px-2 pt-2 pb-1.5">
                <EquippedFrame equippedItems={equippedItems} size={40} portraitSize={36}>
                  <div
                    className="rounded-lg overflow-hidden border border-cyan-400/40"
                    style={{ boxShadow: "0 0 8px hsl(190 90% 50% / 0.25)" }}
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
                      size={30}
                    />
                  </div>
                </EquippedFrame>
              </div>

              <div className="mx-2 mb-2 rounded-lg border border-border/50 bg-card/70 px-2 py-1.5">
                <div className="mb-1.5">
                  <span className="text-[7px] font-display font-bold tracking-[0.16em] text-muted-foreground/70">
                    STATS
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-0.5">
                  {PRIMARY_STATS.map((key) => (
                    <div
                      key={key}
                      className="rounded-md bg-muted/30 border border-border/40 px-0.5 py-0.5 text-center"
                      title={key}
                    >
                      <div className="text-[9px] leading-none">{STAT_ICONS[key]}</div>
                      <div className="text-[6px] font-display font-bold tracking-wide text-muted-foreground mt-0.5">
                        {STAT_SHORT[key]}
                      </div>
                      <div className="text-[9px] font-display font-bold text-foreground leading-tight">
                        {totals[key] || 0}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-0.5 text-center">
                  <div className="rounded-md bg-muted/25 border border-border/35 px-0.5 py-0.5">
                    <p className="text-[6px] font-display tracking-wide text-muted-foreground">DMG</p>
                    <p className="text-[9px] font-display font-bold text-foreground">{derived.damage ?? 0}</p>
                  </div>
                  <div className="rounded-md bg-muted/25 border border-border/35 px-0.5 py-0.5">
                    <p className="text-[6px] font-display tracking-wide text-muted-foreground">HP</p>
                    <p className="text-[9px] font-display font-bold text-foreground">{derived.health ?? 0}</p>
                  </div>
                  <div className="rounded-md bg-muted/25 border border-border/35 px-0.5 py-0.5">
                    <p className="text-[6px] font-display tracking-wide text-muted-foreground">ARM</p>
                    <p className="text-[9px] font-display font-bold text-foreground">
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
