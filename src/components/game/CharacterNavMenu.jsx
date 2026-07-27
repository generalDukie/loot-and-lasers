import React, { useState, useRef } from "react";
import { NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import HubCharacterChip from "@/components/game/HubCharacterChip";
import CurrencyStack from "@/components/game/CurrencyStack";
import ActivityCountdownChip from "@/components/game/ActivityCountdownChip";
import { NAV_GROUPS } from "@/lib/navGroups";

// Character portrait + currencies. Hovering the portrait expands the "Explore"
// nav (grouped categories) directly below it.
export default function CharacterNavMenu({ character, large = false, xpPct: xpPctProp }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const xpPct = xpPctProp ?? (character?.experience_to_next_level > 0
    ? Math.min(100, ((character.experience || 0) / character.experience_to_next_level) * 100)
    : 0);
  const enter = () => { clearTimeout(closeTimer.current); setOpen(true); };
  const leave = () => { closeTimer.current = setTimeout(() => setOpen(false), 150); };

  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <div className="flex items-stretch gap-2">
        <HubCharacterChip character={character} xpPct={xpPct} large={large} />
        <CurrencyStack character={character} large={large} />
        <ActivityCountdownChip character={character} large={large} />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-1 left-0 z-50 w-52 rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl painted-panel p-2"
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}