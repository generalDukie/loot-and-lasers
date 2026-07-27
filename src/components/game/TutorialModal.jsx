import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Rocket, Compass, Swords, Sparkles, ChevronRight } from "lucide-react";

const TIPS = [
  { icon: Compass, color: "#22D3EE", title: "Explore the Station", body: "Your hub is the map — tap any glowing module to travel. Crew Lounge for quests, Crew Quarters for your character, Ship Dock for upgrades." },
  { icon: Rocket, color: "#FF9E4F", title: "Run Missions", body: "Visit the Crew Lounge, launch a quest using fuel, then claim it when the timer ends for XP, stardust, and loot." },
  { icon: Sparkles, color: "#C084FC", title: "Gear Up & Allocate", body: "Equip loot on your Character page and spend stat points each level to shape your build and raise combat power." },
  { icon: Swords, color: "#FF4D6D", title: "Test Your Might", body: "Jump into the Arena for automated PvP, or brave the Galaxy Dungeon for riskier rewards." },
];

// Short one-time tutorial shown on first login after character creation.
export default function TutorialModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-background/85 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 340, damping: 26 }}
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border/60 painted-panel canvas-grain"
          >
            <div className="flex items-center justify-between p-4 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Rocket className="w-5 h-5 text-primary" />
                <h2 className="font-display font-bold text-lg tracking-wide glow-cyan">Welcome, Operative</h2>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-sm text-foreground/80 leading-relaxed">
                Your space station drifts through the cosmos. Here's the fast version of how to get going:
              </p>
              {TIPS.map((t) => {
                const Icon = t.icon;
                return (
                  <div key={t.title} className="flex items-start gap-3 p-3 rounded-xl bg-card/50 border border-border/40">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${t.color}1a`, boxShadow: `0 0 10px ${t.color}33` }}>
                      <Icon className="w-4.5 h-4.5" style={{ color: t.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display font-semibold text-sm" style={{ color: t.color }}>{t.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{t.body}</p>
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground italic text-center pt-1">
                Need the full manual? It lives in <b>Settings → Codex</b>.
              </p>
            </div>

            <div className="p-4 pt-0">
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="w-full painted-btn px-4 py-3 text-sm flex items-center justify-center gap-2"
              >
                Start Playing <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}