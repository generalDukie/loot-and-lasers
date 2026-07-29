import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";
import { useMyCharacter } from "@/hooks/useMyCharacter";
import { primeMyCharacterCache } from "@/lib/socialEngine";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  formatAchievementProgress,
} from "@/lib/achievements";
import { toastNewAchievements } from "@/lib/achievementToasts";
import { Trophy, Lock, Check, Sparkles } from "lucide-react";

function AchievementIcon({ icon, unlocked }) {
  if (!unlocked) {
    return <Lock className="w-4 h-4 text-muted-foreground" aria-hidden />;
  }
  return (
    <span className="achievement-emoji text-2xl leading-none select-none" role="img" aria-hidden>
      {icon}
    </span>
  );
}

export default function AchievementsPage() {
  const { character: liveCharacter, setCharacter } = useMyCharacter();
  const [character, setLocalCharacter] = useState(null);
  const [syncing, setSyncing] = useState(true);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.functions.invoke("SyncAchievements", {});
        const ch = res?.character ?? res?.data?.character;
        if (ch) {
          setLocalCharacter(ch);
          setCharacter(ch);
          primeMyCharacterCache(ch, { emit: false });
          toastNewAchievements(res, toast);
        } else if (liveCharacter) {
          setLocalCharacter(liveCharacter);
        }
      } catch (e) {
        toast({ title: "Couldn't sync achievements", description: e?.message, variant: "destructive" });
        if (liveCharacter) setLocalCharacter(liveCharacter);
      } finally {
        setSyncing(false);
      }
    })();
  }, []);

  const displayCharacter = character || liveCharacter;
  const unlockedSet = new Set(displayCharacter?.unlocked_achievements || []);
  const titles = displayCharacter?.unlocked_titles || [];
  const activeTitle = displayCharacter?.active_title || "";
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id)).length;

  async function equipTitle(title) {
    setBusy(true);
    try {
      const res = await api.functions.invoke("SyncAchievements", { title });
      const ch = res?.character ?? res?.data?.character;
      if (ch) {
        setLocalCharacter(ch);
        setCharacter(ch);
        primeMyCharacterCache(ch, { emit: false });
      }
    } catch (e) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (syncing && !displayCharacter) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-amber-400" />
        <h1 className="font-display font-bold text-xl tracking-wider">Achievements</h1>
      </div>

      <div className="painted-panel canvas-grain rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-display tracking-wide text-muted-foreground">PROGRESS</span>
          <span className="font-display font-bold text-sm text-amber-300">{unlockedCount} / {ACHIEVEMENTS.length}</span>
        </div>
        <div className="h-2.5 bg-muted/50 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(unlockedCount / ACHIEVEMENTS.length) * 100}%` }}
            transition={{ duration: 0.8 }}
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300"
          />
        </div>
      </div>

      <div className="painted-panel canvas-grain rounded-2xl p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h2 className="font-display font-semibold text-sm tracking-wide">Titles</h2>
          {activeTitle && <span className="text-[10px] text-muted-foreground ml-1">equipped: <span className="text-amber-300 font-display">「{activeTitle}」</span></span>}
        </div>
        {titles.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No titles unlocked yet — earn achievements to collect them.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => equipTitle("")}
              disabled={busy}
              className={`text-[11px] px-2.5 py-1 rounded-full border font-display font-medium transition-colors ${activeTitle === "" ? "bg-muted/40 border-border/60 text-foreground" : "border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
            >
              None
            </button>
            {titles.map((t) => (
              <button
                key={t}
                onClick={() => equipTitle(t)}
                disabled={busy}
                className={`text-[11px] px-2.5 py-1 rounded-full border font-display font-medium transition-colors ${activeTitle === t ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
              >
                「{t}」
              </button>
            ))}
          </div>
        )}
      </div>

      {ACHIEVEMENT_CATEGORIES.map((cat) => {
        const items = ACHIEVEMENTS.filter((a) => a.category === cat);
        return (
          <div key={cat}>
            <h3 className="text-xs font-display font-semibold text-muted-foreground tracking-wide mb-2">{cat.toUpperCase()}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((a) => {
                const done = unlockedSet.has(a.id);
                const progressLabel = !done ? formatAchievementProgress(a, displayCharacter) : null;
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`relative rounded-xl p-3 border flex items-center gap-3 transition-colors ${done ? "bg-amber-500/5 border-amber-500/30" : "bg-card/40 border-border/30"}`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${done ? "bg-amber-500/15 ring-1 ring-amber-500/25" : "bg-muted/30"}`}>
                      <AchievementIcon icon={a.icon} unlocked={done} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-display font-semibold truncate ${done ? "text-foreground" : "text-muted-foreground"}`}>{a.name}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">{a.desc}</p>
                      {progressLabel && (
                        <p className="text-[10px] text-primary/80 mt-0.5 font-mono">{progressLabel}</p>
                      )}
                      <p className="text-[10px] text-amber-300/80 mt-0.5">📜 Title: 「{a.title}」</p>
                    </div>
                    {done && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
