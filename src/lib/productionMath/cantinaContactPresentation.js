/**
 * Cantina mission-contact presentation — 10 portrait names from the cantina pack.
 *
 * Keys MUST be visual ids (`cantina_contact_01`). `name` is the player-facing
 * title from the pack (do not invent). Company affiliation is cosmetic only and
 * does not affect mission rewards. Existing emoji-only boards are overlaid on
 * read so cantina faces update without rerolling mission rewards.
 *
 * Mirror the same 10 names in `loot&lasers/Scripts/CantinaCatalog.gd`.
 */
import {
  CANTINA_CONTACT_CATALOG_SIZE,
  CANTINA_CONTACT_INDEX_DIGITS,
  CANTINA_CONTACT_INDEX_ORIGIN,
  CANTINA_CONTACT_VISUAL_ID_PREFIX,
  CANTINA_CONTACT_VISUAL_ID_SEPARATOR,
  COMPANY_ID_BJS,
  COMPANY_ID_CNC,
  COMPANY_ID_DTD,
  COMPANY_ID_GORP,
} from "./constants.js";

export const CANTINA_CONTACT_PRESENTATION = Object.freeze({
  cantina_contact_01: Object.freeze({
    name: "Lady Vessara",
    visual_company_id: COMPANY_ID_CNC,
  }),
  cantina_contact_02: Object.freeze({
    name: "Mara Voss",
    visual_company_id: COMPANY_ID_BJS,
  }),
  cantina_contact_03: Object.freeze({
    name: "Pikk Patch",
    visual_company_id: COMPANY_ID_DTD,
  }),
  cantina_contact_04: Object.freeze({
    name: "Administrator Vale",
    visual_company_id: COMPANY_ID_GORP,
  }),
  cantina_contact_05: Object.freeze({
    name: "Rill Eightfold",
    visual_company_id: "",
  }),
  cantina_contact_06: Object.freeze({
    name: "Shard-of-Dawn",
    visual_company_id: "",
  }),
  cantina_contact_07: Object.freeze({
    name: "Nima Duskwing",
    visual_company_id: "",
  }),
  cantina_contact_08: Object.freeze({
    name: "Ollo Drift",
    visual_company_id: "",
  }),
  cantina_contact_09: Object.freeze({
    name: "Morrow Cap",
    visual_company_id: "",
  }),
  cantina_contact_10: Object.freeze({
    name: "Ssar Keel",
    visual_company_id: "",
  }),
});

export function cantinaContactVisualId(index) {
  const i = Math.floor(Number(index));
  if (!Number.isInteger(i) || i < CANTINA_CONTACT_INDEX_ORIGIN) return "";
  if (i >= CANTINA_CONTACT_INDEX_ORIGIN + CANTINA_CONTACT_CATALOG_SIZE) return "";
  const n = String(i).padStart(CANTINA_CONTACT_INDEX_DIGITS, "0");
  return [CANTINA_CONTACT_VISUAL_ID_PREFIX, n].join(CANTINA_CONTACT_VISUAL_ID_SEPARATOR);
}

export function isCantinaContactVisualId(visualId) {
  const id = String(visualId || "").trim();
  return id.startsWith(
    CANTINA_CONTACT_VISUAL_ID_PREFIX + CANTINA_CONTACT_VISUAL_ID_SEPARATOR,
  );
}

export function cantinaContactDisplayName(visualId) {
  const id = String(visualId || "").trim();
  if (!id) return "";
  return String(CANTINA_CONTACT_PRESENTATION[id]?.name || "").trim() || id;
}

function buildCantinaContactCatalog() {
  const rows = [];
  for (let i = 0; i < CANTINA_CONTACT_CATALOG_SIZE; i += 1) {
    const id = cantinaContactVisualId(CANTINA_CONTACT_INDEX_ORIGIN + i);
    const overlay = CANTINA_CONTACT_PRESENTATION[id];
    rows.push(Object.freeze({
      id,
      name: String(overlay?.name || "").trim() || id,
      visual_company_id: String(overlay?.visual_company_id || "").trim(),
    }));
  }
  return Object.freeze(rows);
}

export const CANTINA_CONTACT_CATALOG = buildCantinaContactCatalog();

export function missionPatronFromContact(row) {
  if (!row || typeof row !== "object") return null;
  const id = String(row.id || "").trim();
  const name = String(row.name || "").trim();
  if (!id || !name) return null;
  return Object.freeze({
    name,
    visual_id: id,
    visual_company_id: String(row.visual_company_id || "").trim(),
  });
}

export function cantinaPatronFromVisualId(visualId) {
  const id = String(visualId || "").trim();
  const overlay = id ? CANTINA_CONTACT_PRESENTATION[id] : null;
  if (!overlay) return null;
  return missionPatronFromContact({
    id,
    name: overlay.name,
    visual_company_id: overlay.visual_company_id,
  });
}

export function overlayCantinaBoardOffers(offers) {
  if (!Array.isArray(offers)) return [];
  const used = new Set();
  let cursor = 0;
  const takeNextUnused = () => {
    while (cursor < CANTINA_CONTACT_CATALOG_SIZE) {
      const row = CANTINA_CONTACT_CATALOG[cursor];
      cursor += 1;
      if (!used.has(row.id)) {
        used.add(row.id);
        return missionPatronFromContact(row);
      }
    }
    return missionPatronFromContact(CANTINA_CONTACT_CATALOG[0]);
  };
  return offers.map((offer) => {
    const current = cantinaPatronFromVisualId(offer?.patron?.visual_id);
    let patron = current;
    if (!patron || used.has(patron.visual_id)) {
      patron = takeNextUnused();
    } else {
      used.add(patron.visual_id);
    }
    return { ...offer, patron };
  });
}

export function cantinaBoardPatronsNeedOverlay(offers) {
  if (!Array.isArray(offers) || offers.length === 0) return true;
  const seen = new Set();
  for (const offer of offers) {
    const id = String(offer?.patron?.visual_id || "").trim();
    if (!CANTINA_CONTACT_PRESENTATION[id] || seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

export const MISSION_CONTACT_PATRONS = Object.freeze(
  CANTINA_CONTACT_CATALOG.map((row) => missionPatronFromContact(row)).filter(Boolean),
);
