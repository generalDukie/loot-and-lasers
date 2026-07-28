import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { Users, Plus, LogOut, Loader2, Check, LogIn } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { getMyCharacters, getMyCharacter, setActiveCharacter } from "@/lib/socialEngine";
import CharacterAvatar from "@/components/game/CharacterAvatar";
import { fullName } from "@/lib/legacyName";
import { popIn, staggerParent, staggerChild, btnPress } from "@/lib/juicyMotion";
import SiteTitle from "@/components/admin/SiteTitle";
import GameCanvas from "@/components/game/GameCanvas";

const MAX_SLOTS = 3;

// Full-screen operative picker — the login landing page. Lets the player
// choose which character to load before entering the game, instead of
// auto-loading whichever character happened to be pinned last.
export default function CharacterSelectPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chars, setChars] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [switching, setSwitching] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [all, current] = await Promise.all([
          getMyCharacters(),
          getMyCharacter({ force: true }),
        ]);
        if (!active) return;
        setChars(all || []);
        setActiveId(current?.id || null);
        setSelectedId(current?.id || (all?.[0]?.id ?? null));
        if (!all || all.length === 0) {
          navigate("/create-character", { replace: true });
        }
      } catch {
        if (active) setChars([]);
      }
    })();
    return () => { active = false; };
  }, [navigate]);

  const purchased = user?.purchased_slots || 0;
  const totalSlots = Math.min(MAX_SLOTS, 1 + purchased);
  const canCreate = (chars?.length || 0) < totalSlots;

  async function handleEnter() {
    if (!selectedId || switching) return;
    setSwitching(selectedId);
    try {
      await setActiveCharacter(selectedId);
      // Hard reload so AuthContext re-reads the freshly pinned character.
      window.location.href = "/";
    } catch {
      setSwitching(null);
    }
  }

  if (chars === null) {
    return (
      <GameCanvas>
        <div className="h-full w-full stars-bg flex items-center justify-center">
          <div className="text-center">
            <SiteTitle as="h1" className="font-display font-bold text-3xl glow-cyan tracking-widest mb-4" />
            <Loader2 className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto" />
          </div>
        </div>
      </GameCanvas>
    );
  }

  return (
    <GameCanvas>
      <div className="h-full w-full stars-bg flex items-center justify-center p-4 sm:p-6 lg:p-10">
      <motion.div
        {...popIn}
        className="w-full max-w-5xl"
      >
        <div className="text-center mb-8">
          <h1 className="font-display font-bold text-2xl md:text-3xl glow-cyan tracking-wider">SELECT YOUR OPERATIVE</h1>
          <p className="text-muted-foreground text-sm mt-2 flex items-center justify-center gap-1.5">
            <Users className="w-4 h-4" /> Welcome back, {user?.full_name || user?.email || "commander"}
          </p>
        </div>

        <motion.div
          variants={staggerParent}
          initial="initial"
          animate="animate"
          className="space-y-3"
        >
          {chars.map((c) => {
            const isActive = c.id === activeId;
            const isSelected = c.id === selectedId;
            return (
              <motion.button
                key={c.id}
                variants={staggerChild}
                {...btnPress}
                onClick={() => setSelectedId(c.id)}
                disabled={!!switching}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                  isSelected
                    ? "border-primary bg-primary/5 border-glow-cyan"
                    : "border-border/50 bg-card/50 hover:border-primary/40 hover:bg-card"
                }`}
              >
                <div className="shrink-0">
                  <CharacterAvatar
                    race={c.race}
                    skinColor={c.appearance?.skin_color}
                    eyeStyle={c.appearance?.eye_style}
                    ears={c.appearance?.ears}
                    mouth={c.appearance?.mouth}
                    nose={c.appearance?.nose}
                    eyebrows={c.appearance?.eyebrows}
                    marking={c.appearance?.marking}
                    size={64}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-bold text-base tracking-wide truncate">{fullName(c)}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Level {c.level} · {c.race} {c.class}</p>
                </div>
                {isActive ? (
                  <span className="flex items-center gap-1 text-[11px] font-display font-bold text-primary px-2.5 py-1 rounded-lg bg-primary/10">
                    <Check className="w-3.5 h-3.5" /> Active
                  </span>
                ) : null}
              </motion.button>
            );
          })}
        </motion.div>

        <div className="flex items-center justify-between gap-3 mt-6">
          <button
            onClick={() => api.auth.logout(window.location.href)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
          <div className="flex items-center gap-3">
            {canCreate && (
              <motion.button
                {...btnPress}
                onClick={() => navigate("/create-character")}
                className="flex items-center gap-2 painted-btn painted-btn-accent px-4 py-2.5 text-xs"
              >
                <Plus className="w-4 h-4" /> New
              </motion.button>
            )}
            <motion.button
              {...btnPress}
              onClick={handleEnter}
              disabled={!selectedId || !!switching}
              className="flex items-center gap-2 painted-btn px-6 py-2.5 text-xs disabled:opacity-50"
            >
              {switching ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              Enter Game
            </motion.button>
          </div>
        </div>
      </motion.div>
      </div>
    </GameCanvas>
  );
}