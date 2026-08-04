import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/gameClient";
import { RACES } from "@/lib/gameData";
import { useMyCharacter } from "@/hooks/useMyCharacter";
import { useToast } from "@/components/ui/use-toast";
import { blockPlayer, reportPlayer } from "@/lib/socialEngine";
import PublicProfileSheet from "@/components/social/PublicProfileSheet";
import { Trophy, Crown, Swords, AlertTriangle } from "lucide-react";
import PageStage from "@/components/game/PageStage";
import { newChallengeIdempotencyKey } from "@/lib/arenaChallenge";

const MEDAL = ["#FFD700", "#C0C0C0", "#CD7F32"];
const PODIUM_HEIGHT = ["h-24", "h-36", "h-20"];

function challengeDisabledReason(me, target, preview) {
  if (!me?.id || !target?.id) return "unavailable";
  if (target.id === me.id) return "self";
  if (me.created_by_id && target.created_by_id && me.created_by_id === target.created_by_id) {
    return "same_account";
  }
  if (preview && preview.challengeAllowed === false) return preview.reasonCode || "ineligible";
  return null;
}

export default function LeaderboardPage() {
  const [chars, setChars] = useState(null);
  const [profile, setProfile] = useState(null);
  const [previewCache, setPreviewCache] = useState({});
  const [challengingId, setChallengingId] = useState(null);
  const { character: me } = useMyCharacter();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      api.functions.invoke("GetArenaLeaderboard", { limit: 100, offset: 0 }),
      api.entities.GuildMember.list(),
      api.entities.Guild.list(),
    ])
      .then(([board, members, guilds]) => {
        const gTag = {};
        guilds.forEach((g) => (gTag[g.id] = g.tag || g.name || ""));
        const cToGuild = {};
        members.forEach((m) => {
          if (m.character_id) cToGuild[m.character_id] = gTag[m.guild_id] || "";
        });
        const list = Array.isArray(board?.rankings) ? board.rankings : [];
        const ranked = list.map((c) => ({
          ...c,
          id: c.id || c.character_id,
          _score: c.arena_rating || 1000,
          _guild: cToGuild[c.id || c.character_id] || "",
        }));
        setChars(ranked);
      })
      .catch(() => setChars([]));
  }, []);

  const loadPreview = useCallback(
    async (targetId) => {
      if (!me?.id || !targetId || previewCache[targetId]) return previewCache[targetId];
      try {
        const preview = await api.arena.previewChallenge({
          challengerCharacterId: me.id,
          opponentCharacterId: targetId,
          challengeType: "leaderboard_direct",
        });
        setPreviewCache((p) => ({ ...p, [targetId]: preview }));
        return preview;
      } catch {
        return null;
      }
    },
    [me?.id, previewCache]
  );

  async function startDirectChallenge(target) {
    if (!me?.id || !target?.id || challengingId) return;
    setChallengingId(target.id);
    try {
      const preview =
        previewCache[target.id] ||
        (await api.arena.previewChallenge({
          challengerCharacterId: me.id,
          opponentCharacterId: target.id,
          challengeType: "leaderboard_direct",
        }));
      setPreviewCache((p) => ({ ...p, [target.id]: preview }));

      if (!preview?.challengeAllowed) {
        toast({
          title: "Challenge unavailable",
          description: preview?.error || "This opponent cannot be challenged.",
          variant: "destructive",
        });
        return;
      }

      if (preview.warningCode === "OPPONENT_TOO_LOW_FOR_RATING_GAIN") {
        const ok = window.confirm(
          `This opponent is far below your rating (${preview.challengerRating} vs ${preview.opponentRating}).\n\nVictory awards no ranking points. You still risk ${Math.abs(preview.estimatedLossChange)} rating on a loss.\n\nContinue?`
        );
        if (!ok) return;
      } else if (preview.warningCode === "ARENA_REPEAT_OPPONENT_NO_RATING") {
        const ok = window.confirm(
          "You have already earned rating against this account today. Further wins award no ranking points. Continue?"
        );
        if (!ok) return;
      } else if (preview.warningCode === "ARENA_REPEAT_OPPONENT_REDUCED_REWARD") {
        toast({
          title: "Reduced rating reward",
          description: `Win ≈ +${preview.estimatedWinChange} · Loss ≈ ${preview.estimatedLossChange}`,
        });
      }

      const created = await api.arena.createChallenge({
        challengerCharacterId: me.id,
        opponentCharacterId: target.id,
        idempotencyKey: newChallengeIdempotencyKey(),
        challengeType: "leaderboard_direct",
      });

      setProfile(null);
      navigate("/arena", {
        state: {
          directChallenge: {
            challengeId: created.challengeId,
            battleId: created.battleId,
            defenseSnapshot: created.defenseSnapshot,
            preview: created.preview || preview,
            policyVersion: created.policyVersion,
          },
        },
      });
    } catch (e) {
      toast({
        title: "Could not start challenge",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setChallengingId(null);
    }
  }

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
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 16 }}
        className="text-center"
      >
        <h1 className="font-display font-bold text-2xl tracking-wider flex items-center justify-center gap-2">
          <Crown className="w-6 h-6 text-yellow-400 glow-orange" /> Galactic Rankings
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Ranked by arena rating · Challenge any eligible rival
        </p>
      </motion.div>

      <div className="flex items-end justify-center gap-3 sm:gap-6">
        {podiumOrder.map((c, i) => {
          const rank = c === top3[0] ? 0 : c === top3[1] ? 1 : 2;
          const emoji = RACES[c.race]?.emoji || "🛸";
          return (
            <motion.button
              key={c.id}
              type="button"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i, type: "spring", stiffness: 300, damping: 18 }}
              onClick={() => {
                setProfile(c);
                void loadPreview(c.id);
              }}
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
              <div
                className="text-xs font-display font-bold truncate max-w-full flex items-center gap-1"
                style={{ color: MEDAL[rank] }}
              >
                {c.name}
                {c._guild && <span className="text-[9px] text-accent/80">[{c._guild}]</span>}
              </div>
              <div className="text-[10px] text-muted-foreground mb-2">
                {c.arena_rating || 1000} · {c.arena_wins || 0}W
              </div>
              <div
                className={`w-full ${PODIUM_HEIGHT[i]} rounded-t-xl flex items-start justify-center pt-2`}
                style={{
                  background: `linear-gradient(180deg, ${MEDAL[rank]}, ${MEDAL[rank]}33)`,
                  boxShadow: `0 0 16px ${MEDAL[rank]}66`,
                }}
              >
                <span className="font-display font-black text-xl text-black/70">
                  {rank === 0 ? "1" : rank === 1 ? "2" : "3"}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="space-y-2 w-full">
        {rest.map((c, i) => {
          const rank = i + 4;
          const emoji = RACES[c.race]?.emoji || "🛸";
          const disabledReason = challengeDisabledReason(me, c, previewCache[c.id]);
          const preview = previewCache[c.id];
          const canChallenge = !disabledReason && (!preview || preview.challengeAllowed);
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.03 * i }}
              className="flex items-center gap-2 w-full p-3 rounded-xl bg-card/60 border border-border/40 backdrop-blur-sm"
            >
              <button
                type="button"
                onClick={() => {
                  setProfile(c);
                  void loadPreview(c.id);
                }}
                className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
              >
                <span className="font-display font-bold text-sm w-6 text-muted-foreground">{rank}</span>
                <span className="text-xl">{emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm truncate flex items-center gap-1.5">
                    {c.name}
                    {c._guild && (
                      <span className="text-[9px] font-bold text-accent/80 border border-accent/30 rounded px-1 py-px">
                        [{c._guild}]
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {c.race} · {c.class}
                    {preview?.warningCode === "OPPONENT_TOO_LOW_FOR_RATING_GAIN" && (
                      <span className="text-amber-400 ml-1 inline-flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" /> no rating on win
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-xs font-display font-bold text-primary flex items-center gap-1">
                  <Trophy className="w-3 h-3" />
                  {c.arena_rating || 1000}
                </span>
                <span className="text-xs font-display font-bold text-accent flex items-center gap-1">
                  <Swords className="w-3 h-3" />
                  {c.arena_wins || 0}
                </span>
              </button>
              {me && c.id !== me.id && (
                <button
                  type="button"
                  disabled={!canChallenge || challengingId === c.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void startDirectChallenge(c);
                  }}
                  onMouseEnter={() => void loadPreview(c.id)}
                  className="shrink-0 text-[10px] font-display font-semibold px-2.5 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    disabledReason === "same_account"
                      ? "Same account"
                      : disabledReason === "self"
                        ? "Your character"
                        : preview && !preview.challengeAllowed
                          ? preview.error || "Unavailable"
                          : preview
                            ? `Win +${preview.estimatedWinChange} / Loss ${preview.estimatedLossChange}`
                            : "Challenge"
                  }
                >
                  {challengingId === c.id ? "…" : "Challenge"}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {profile && (
        <PublicProfileSheet
          target={profile}
          myChar={me}
          challengePreview={previewCache[profile.id]}
          challengeBusy={challengingId === profile.id}
          onChallenge={() => startDirectChallenge(profile)}
          onClose={() => setProfile(null)}
          onMessage={(t) => {
            setProfile(null);
            navigate(`/messages?to=${t.id}`);
          }}
          onBlock={async (t) => {
            await blockPlayer(me, t);
            toast({ title: "Player blocked" });
            setProfile(null);
          }}
          onReport={async (t) => {
            await reportPlayer(me?.id, t, "Inappropriate profile", "profile");
            toast({ title: "Report submitted" });
            setProfile(null);
          }}
        />
      )}
    </PageStage>
  );
}
