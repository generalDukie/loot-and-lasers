import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/gameClient";
import { RACES } from "@/lib/gameData";
import { useMyCharacter } from "@/hooks/useMyCharacter";
import { useToast } from "@/components/ui/use-toast";
import { blockPlayer, reportPlayer } from "@/lib/socialEngine";
import PublicProfileSheet from "@/components/social/PublicProfileSheet";
import { Trophy, Crown, Swords } from "lucide-react";
import PageStage from "@/components/game/PageStage";

const MEDAL = ["#FFD700", "#C0C0C0", "#CD7F32"];
const PODIUM_HEIGHT = ["h-24", "h-36", "h-20"];

export default function LeaderboardPage() {
  const [chars, setChars] = useState(null);
  const [profile, setProfile] = useState(null);
  const { character: me } = useMyCharacter();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      api.entities.Character.list("-created_date", 100),
      api.entities.GuildMember.list(),
      api.entities.Guild.list(),
    ])
      .then(([list, members, guilds]) => {
        const gTag = {};
        guilds.forEach((g) => (gTag[g.id] = g.tag || g.name || ""));
        const cToGuild = {};
        members.forEach((m) => {
          if (m.character_id) cToGuild[m.character_id] = gTag[m.guild_id] || "";
        });
        const ranked = list
          .map((c) => ({
            ...c,
            _score: (c.level || 1) + (c.arena_wins || 0),
            _guild: cToGuild[c.id] || "",
          }))
          .sort((a, b) => b._score - a._score || (b.level || 1) - (a.level || 1));
        setChars(ranked);
      })
      .catch(() => setChars([]));
  }, []);

  if (chars === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (chars.length === 0) {
    return <div className="text-center py-20 text-muted-foreground">No commanders ranked yet.</div>;
  }

  const top3 = chars.slice(0, 3);
  const rest = chars.slice(3);
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);

  return (
    <PageStage className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 16 }}
        className="text-center"
      >
        <h1 className="font-display font-bold text-2xl tracking-wider flex items-center justify-center gap-2">
          <Crown className="w-6 h-6 text-yellow-400 glow-orange" /> Galactic Rankings
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Top commanders by level + arena wins</p>
      </motion.div>

      {/* Podium */}
      <div className="flex items-end justify-center gap-3 sm:gap-6">
        {podiumOrder.map((c, i) => {
          const rank = c === top3[0] ? 0 : c === top3[1] ? 1 : 2;
          const emoji = RACES[c.race]?.emoji || "🛸";
          return (
            <motion.button
              key={c.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i, type: "spring", stiffness: 300, damping: 18 }}
              onClick={() => setProfile(c)}
              className="flex flex-col items-center w-24 sm:w-28 cursor-pointer"
            >
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
                className="text-3xl mb-1"
                style={{ filter: `drop-shadow(0 0 8px ${MEDAL[rank]})` }}
              >
                {emoji}
              </motion.div>
              <div className="text-xs font-display font-bold truncate max-w-full flex items-center gap-1" style={{ color: MEDAL[rank] }}>
                {c.name}
                {c._guild && <span className="text-[9px] text-accent/80">[{c._guild}]</span>}
              </div>
              <div className="text-[10px] text-muted-foreground mb-2">Lv.{c.level} · {c.arena_wins || 0}W</div>
              <div
                className={`w-full ${PODIUM_HEIGHT[i]} rounded-t-xl flex items-start justify-center pt-2`}
                style={{ background: `linear-gradient(180deg, ${MEDAL[rank]}, ${MEDAL[rank]}33)`, boxShadow: `0 0 16px ${MEDAL[rank]}66` }}
              >
                <span className="font-display font-black text-xl text-black/70">{rank === 0 ? "1" : rank === 1 ? "2" : "3"}</span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Remaining ranks */}
      <div className="space-y-2 w-full">
        {rest.map((c, i) => {
          const rank = i + 4;
          const emoji = RACES[c.race]?.emoji || "🛸";
          return (
            <motion.button
              key={c.id}
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.03 * i }}
              whileHover={{ x: 4 }}
              onClick={() => setProfile(c)}
              className="flex items-center gap-3 w-full p-3 rounded-xl bg-card/60 border border-border/40 backdrop-blur-sm cursor-pointer"
            >
              <span className="font-display font-bold text-sm w-6 text-muted-foreground">{rank}</span>
              <span className="text-xl">{emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold text-sm truncate flex items-center gap-1.5">
                  {c.name}
                  {c._guild && <span className="text-[9px] font-bold text-accent/80 border border-accent/30 rounded px-1 py-px">[{c._guild}]</span>}
                </p>
                <p className="text-[10px] text-muted-foreground">{c.race} · {c.class}</p>
              </div>
              <span className="text-xs font-display font-bold text-primary flex items-center gap-1"><Trophy className="w-3 h-3" />{c.level}</span>
              <span className="text-xs font-display font-bold text-accent flex items-center gap-1"><Swords className="w-3 h-3" />{c.arena_wins || 0}</span>
            </motion.button>
          );
        })}
      </div>

      {profile && (
        <PublicProfileSheet
          target={profile}
          myChar={me}
          onClose={() => setProfile(null)}
          onMessage={(t) => { setProfile(null); navigate(`/messages?to=${t.id}`); }}
          onBlock={async (t) => { await blockPlayer(me, t); toast({ title: "Player blocked" }); setProfile(null); }}
          onReport={async (t) => { await reportPlayer(me?.id, t, "Inappropriate profile", "profile"); toast({ title: "Report submitted" }); setProfile(null); }}
        />
      )}
    </PageStage>
  );
}