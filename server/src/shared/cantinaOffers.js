/**
 * Server-authoritative Cantina mission offers.
 *
 * A player receives a new 3-offer set only when they are READY_FOR_NEW_OFFERS
 * (no active mission, no unclaimed completion, no valid available set).
 * Accepting a mission locks the current set; claiming/failing retires it.
 */
import { nanoid } from "nanoid";
import {
  generateDailyMissions,
  generateLowFuelBoard,
} from "../../../src/lib/gameData.js";
import { getEffectiveFuelCost } from "./economyFormulas.js";

export const CANTINA_STATES = {
  AVAILABLE_OFFERS: "AVAILABLE_OFFERS",
  ACTIVE_MISSION: "ACTIVE_MISSION",
  COMPLETED_UNCLAIMED: "COMPLETED_UNCLAIMED",
  READY_FOR_NEW_OFFERS: "READY_FOR_NEW_OFFERS",
};

const EXPLORE_SCENE_COUNT = 6;

function asFuel(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function exploreImageId(scene) {
  const idx = ((Number(scene) % EXPLORE_SCENE_COUNT) + EXPLORE_SCENE_COUNT) % EXPLORE_SCENE_COUNT;
  return `mission_explore_${String(idx + 1).padStart(2, "0")}`;
}

export function sanitizeCantinaOffer(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const exploreRaw = Number(raw.explore_scene);
  const exploreScene = Number.isFinite(exploreRaw)
    ? ((Math.floor(exploreRaw) % EXPLORE_SCENE_COUNT) + EXPLORE_SCENE_COUNT) % EXPLORE_SCENE_COUNT
    : index % EXPLORE_SCENE_COUNT;
  const duration = Math.floor(Number(raw.duration_seconds));
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const name = String(raw.name || "").trim();
  if (!name) return null;
  return {
    id: String(raw.id || "").trim() || nanoid(),
    name,
    description: String(raw.description || ""),
    location: String(raw.location || ""),
    sector: Number(raw.sector) || 1,
    level_requirement: Number(raw.level_requirement) || 1,
    duration_seconds: duration,
    fuel_cost: typeof raw.fuel_cost === "number" ? raw.fuel_cost : undefined,
    stardust_efficiency: raw.stardust_efficiency,
    xp_efficiency: raw.xp_efficiency,
    _lowFuel: !!raw._lowFuel,
    explore_scene: exploreScene,
    image_id: String(raw.image_id || exploreImageId(exploreScene)),
    patron: raw.patron && typeof raw.patron === "object" ? raw.patron : null,
    rewards: raw.rewards && typeof raw.rewards === "object" ? raw.rewards : {},
  };
}

export function normalizeCantinaOffers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, i) => sanitizeCantinaOffer(row, i)).filter(Boolean);
}

export function hasValidCantinaOffers(character) {
  const offers = normalizeCantinaOffers(character?.cantina_offers);
  if (!offers.length) return false;
  return offers.every((o) => o.id && o.name && o.duration_seconds > 0 && Number.isInteger(o.explore_scene));
}

export function canAffordAnyCantinaOffer(character, offers) {
  const fuel = asFuel(character?.fuel);
  return (offers || []).some((offer) => getEffectiveFuelCost(character, offer) <= fuel + 1e-9);
}

export function generateCantinaOfferSet(character) {
  const normal = normalizeCantinaOffers(generateDailyMissions(character || {}) || []);
  let picked = normal;
  if (!canAffordAnyCantinaOffer(character, normal)) {
    const low = normalizeCantinaOffers(
      generateLowFuelBoard(character || {}, character?.fuel, 3) || []
    );
    if (low.length) picked = low;
  }
  return picked.slice(0, 3).map((offer) => ({ ...offer, id: offer.id || nanoid() }));
}

export function stampCantinaOffers(_character, offers, generatedAt = new Date().toISOString()) {
  return {
    cantina_offers: normalizeCantinaOffers(offers),
    cantina_offers_status: "available",
    cantina_offers_generated_at: generatedAt,
  };
}

export function lockCantinaOffersPatch() {
  return { cantina_offers_status: "locked_active" };
}

export function resolveCantinaState(character, mission = null) {
  const activeId = String(character?.active_mission_id || "").trim();
  if (activeId) {
    if (mission && String(mission.status || "") === "completed") {
      return CANTINA_STATES.COMPLETED_UNCLAIMED;
    }
    return CANTINA_STATES.ACTIVE_MISSION;
  }
  const status = String(character?.cantina_offers_status || "").trim();
  if (status === "locked_active") {
    return CANTINA_STATES.READY_FOR_NEW_OFFERS;
  }
  if (hasValidCantinaOffers(character) && (status === "available" || !status)) {
    return CANTINA_STATES.AVAILABLE_OFFERS;
  }
  return CANTINA_STATES.READY_FOR_NEW_OFFERS;
}

export function resolveLaunchableCantinaOffer(character, offerId) {
  const id = String(offerId || "").trim();
  if (!id) {
    const err = new Error("Missing offer_id");
    err.status = 400;
    throw err;
  }
  const status = String(character?.cantina_offers_status || "").trim();
  const offers = normalizeCantinaOffers(character?.cantina_offers);
  if ((status && status !== "available") || !offers.length) {
    const err = new Error("No mission offers available");
    err.status = 409;
    throw err;
  }
  const persisted = offers.find((o) => o.id === id);
  if (!persisted) {
    const err = new Error("Unknown mission offer");
    err.status = 400;
    throw err;
  }
  return persisted;
}

export function publicCantinaPayload(character, state, offers, extra = {}) {
  const showOffers = state === CANTINA_STATES.AVAILABLE_OFFERS;
  return {
    success: true,
    state,
    offers: showOffers ? normalizeCantinaOffers(offers || character?.cantina_offers) : [],
    active_mission_id: String(character?.active_mission_id || ""),
    cantina_offers_status: character?.cantina_offers_status || "",
    ...extra,
  };
}
