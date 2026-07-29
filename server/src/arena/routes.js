/**
 * Arena direct-challenge HTTP routes.
 * POST /api/arena/challenges
 * POST /api/arena/challenges/preview
 * POST /api/arena/challenges/:id/complete
 * GET  /api/arena/challenges/:id
 */

import { requireAuth } from "../auth.js";
import { withTransactionAsync } from "../db.js";
import { isAdmin } from "../entityAccess.js";
import { ArenaError, ArenaErrors } from "./errors.js";
import {
  completeDirectChallenge,
  createDirectChallenge,
  getChallengeForUser,
  previewDirectChallenge,
} from "./service.js";
import { listRecentAudit } from "./store.js";
import {
  ensureBotPoolForPlayer,
  listBotsNearRating,
  botToPublicOpponent,
  processIncomingBotRaids,
} from "./bots.js";
import { entities } from "../entities.js";

function handleErr(res, err) {
  if (err instanceof ArenaError) {
    return res.status(err.status || 400).json({
      error: err.message,
      code: err.code,
      details: err.details || undefined,
    });
  }
  console.error("[arena]", err);
  return res.status(500).json({ error: "Internal error", code: "ARENA_INTERNAL" });
}

export function createArenaRouter(express) {
  const router = express.Router();

  router.post("/challenges/preview", requireAuth, (req, res) => {
    try {
      const body = previewDirectChallenge(req.user, req.body || {});
      res.json(body);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post("/challenges", requireAuth, async (req, res) => {
    try {
      const result = await withTransactionAsync(() =>
        createDirectChallenge(req.user, req.body || {})
      );
      res.status(result.replayed ? 200 : 201).json({
        challengeId: result.challenge.challengeId,
        battleId: result.challenge.battleId,
        status: result.challenge.status,
        challengeType: result.challenge.challengeType,
        challengerRatingAtStart: result.challenge.challengerRatingAtStart,
        opponentRatingAtStart: result.challenge.opponentRatingAtStart,
        winRatingEstimate: result.challenge.winRatingEstimate,
        lossRatingEstimate: result.challenge.lossRatingEstimate,
        ratingRewardEligible: (result.preview?.estimatedWinChange || 0) > 0,
        warningCode: result.preview?.warningCode || null,
        expiresAt: result.challenge.expiresAt,
        correlationId: result.challenge.correlationId,
        policyVersion: result.challenge.policyVersion,
        defenseSnapshot: result.defenseSnapshot || result.challenge.defenseSnapshot,
        preview: result.preview,
        replayed: result.replayed,
      });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get("/challenges/:id", requireAuth, (req, res) => {
    try {
      const challenge = getChallengeForUser(req.user, req.params.id);
      res.json({ challenge });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post("/challenges/:id/complete", requireAuth, async (req, res) => {
    try {
      const result = await withTransactionAsync(() =>
        completeDirectChallenge(req.user, {
          ...(req.body || {}),
          challengeId: req.params.id,
        })
      );
      res.json({
        challengeId: result.challenge.challengeId,
        replayed: result.replayed,
        won: result.result?.won ?? result.challenge.won,
        ratingDelta: result.ratingDelta,
        result: result.result,
        patch: result.patch,
        character: result.character,
        rewards: result.rewards,
      });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get("/admin/audit", requireAuth, (req, res) => {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ error: "Admin only", code: ArenaErrors.ARENA_CHALLENGE_NOT_ALLOWED });
    }
    const limit = Math.min(200, Number(req.query.limit) || 50);
    res.json({ audit: listRecentAudit(limit) });
  });

  /** Ladder bots near the caller's active character rating (for matchmaking). */
  router.get("/bots", requireAuth, (req, res) => {
    try {
      const characterId = req.query.characterId || req.user.active_character_id;
      const ch = characterId ? entities.Character.get(characterId) : null;
      if (!ch || ch.created_by_id !== req.user.id) {
        return res.status(403).json({ error: "Not your character" });
      }
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 8));
      ensureBotPoolForPlayer(ch);
      const bots = listBotsNearRating(ch.arena_rating || 1000, { limit }).map(botToPublicOpponent);
      res.json({ bots });
    } catch (err) {
      handleErr(res, err);
    }
  });

  /**
   * Simulate incoming bot raids against the player.
   * Settles player + bot ratings; writes defense match history + notifications.
   */
  router.post("/bots/raids", requireAuth, async (req, res) => {
    try {
      const result = await withTransactionAsync(() => {
        const characterId =
          req.body?.characterId || req.user.active_character_id;
        const ch = characterId ? entities.Character.get(characterId) : null;
        if (!ch || ch.created_by_id !== req.user.id) {
          const err = new Error("Not your character");
          err.status = 403;
          throw err;
        }
        return processIncomingBotRaids(ch, {
          maxRaids: Math.min(3, Math.max(1, Number(req.body?.max) || 2)),
          force: !!req.body?.force && isAdmin(req.user),
        });
      });
      res.json(result);
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      handleErr(res, err);
    }
  });

  return router;
}
