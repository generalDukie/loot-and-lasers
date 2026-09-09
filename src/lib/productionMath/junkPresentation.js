/**
 * Junk / trinket presentation overlay — 10 catalog names from the trinket pack.
 *
 * Keys MUST be visual ids (`trinket_01`). `name` and `flavor` are the
 * player-facing copy from the pack (do not invent). New junk only; existing
 * inventory is not remapped.
 *
 * Mirror the same 10 names in `loot&lasers/Scripts/JunkCatalog.gd`.
 */
import {
  JUNK_CATALOG_SIZE,
  JUNK_VISUAL_ID_INDEX_DIGITS,
  JUNK_VISUAL_ID_INDEX_ORIGIN,
  JUNK_VISUAL_ID_PREFIX,
  JUNK_VISUAL_ID_SEPARATOR,
} from "./constants.js";

const JUNK_ITEM_TYPE = "material";

export const JUNK_PRESENTATION = Object.freeze({
  trinket_01: Object.freeze({
    name: "Cracked Data Slate",
    flavor: "Battered tablet with a shattered unlit screen, missing upper corner, tarnished casing, and one taped edge.",
  }),
  trinket_02: Object.freeze({
    name: "Stripped Gear Cluster",
    flavor: "Three mismatched tarnished gears with missing teeth, uneven spoke slots, and a crooked axle.",
  }),
  trinket_03: Object.freeze({
    name: "Spent Power Cell",
    flavor: "Dented discarded battery with corroded terminals, faded warning stripes, scraped paint, and a crushed lower casing.",
  }),
  trinket_04: Object.freeze({
    name: "Tangled Cable Nest",
    flavor: "Loose tangled loops of faded insulated cable with frayed wire ends, mismatched broken connectors, and a taped splice.",
  }),
  trinket_05: Object.freeze({
    name: "Busted Service Bot",
    flavor: "Tiny discarded maintenance robot with a cracked dead face display, one missing wheel, a dangling repair arm, and a patched shell.",
  }),
  trinket_06: Object.freeze({
    name: "Crushed Ration Tin",
    flavor: "Flattened food tin with a peeled-back lid, dented rim, crushed sides, and a scraped, faded label.",
  }),
  trinket_07: Object.freeze({
    name: "Clouded Optic Lens",
    flavor: "Scratched and clouded glass in a bent metal rim, with a fractured mounting tab and rust around the lower bracket.",
  }),
  trinket_08: Object.freeze({
    name: "Snapped Antenna",
    flavor: "Kinked aerial on a cracked mounting base, with a snapped tip, rusty swivel joint, and loose exposed wiring.",
  }),
  trinket_09: Object.freeze({
    name: "Obsolete Credit Reader",
    flavor: "Chunky discarded payment terminal with a dead scratched display, missing buttons, a jammed card slot, and a cracked side casing.",
  }),
  trinket_10: Object.freeze({
    name: "Counterfeit Prize Idol",
    flavor: "Cheap gold-painted plastic prize figure with chipped coating, crude molded features, and a broken pedestal exposing dull plastic underneath.",
  }),
});

export function junkVisualId(index) {
  const i = Math.floor(Number(index));
  if (!Number.isInteger(i) || i < JUNK_VISUAL_ID_INDEX_ORIGIN) return "";
  if (i >= JUNK_VISUAL_ID_INDEX_ORIGIN + JUNK_CATALOG_SIZE) return "";
  const n = String(i).padStart(JUNK_VISUAL_ID_INDEX_DIGITS, "0");
  return [JUNK_VISUAL_ID_PREFIX, n].join(JUNK_VISUAL_ID_SEPARATOR);
}

export function isJunkVisualId(visualId) {
  const id = String(visualId || "").trim();
  return id.startsWith(JUNK_VISUAL_ID_PREFIX + JUNK_VISUAL_ID_SEPARATOR);
}

export function junkDisplayName(visualId) {
  const id = String(visualId || "").trim();
  if (!id) return "";
  return String(JUNK_PRESENTATION[id]?.name || "").trim() || id;
}

function buildJunkCatalog() {
  const rows = [];
  for (let i = 0; i < JUNK_CATALOG_SIZE; i += 1) {
    const id = junkVisualId(JUNK_VISUAL_ID_INDEX_ORIGIN + i);
    const overlay = JUNK_PRESENTATION[id];
    rows.push(Object.freeze({
      id,
      name: String(overlay?.name || "").trim() || id,
      flavor: String(overlay?.flavor || "").trim(),
    }));
  }
  return Object.freeze(rows);
}

export const JUNK_CATALOG = buildJunkCatalog();

export function pickJunkCatalogRow(rng) {
  if (typeof rng !== "function") {
    throw new Error("pickJunkCatalogRow requires injected RNG");
  }
  let u = Number(rng());
  if (!Number.isFinite(u) || u < 0) u = 0;
  if (u >= 1) u = 1 - Number.EPSILON;
  const index = Math.min(JUNK_CATALOG_SIZE - 1, Math.floor(u * JUNK_CATALOG_SIZE));
  return JUNK_CATALOG[index];
}

export function applyJunkPresentation(item, visualId) {
  if (!item || typeof item !== "object") return item;
  const type = String(item.type || "").trim().toLowerCase();
  if (type && type !== JUNK_ITEM_TYPE) return item;
  const id = String(visualId || item.visual_id || "").trim();
  const overlay = id ? JUNK_PRESENTATION[id] : null;
  if (!overlay) return item;
  const next = {
    ...item,
    name: overlay.name,
    base_name: overlay.name,
    visual_id: id,
  };
  if (overlay.flavor) next.flavor_text = overlay.flavor;
  return next;
}
