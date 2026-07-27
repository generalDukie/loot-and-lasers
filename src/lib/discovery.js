// ═══════════════════════════════════════════
// DISCOVERY — species/artifacts/relics found in battle
// ═══════════════════════════════════════════
import { ALIEN_SPECIES, ARTIFACTS, RELICS } from "@/lib/collectibles";
import { gearCatalogKey } from "@/lib/gameData";

// Map an enemy to a stable species id (enemies carry speciesId directly when generated).
export function speciesIdForEnemy(enemy) {
  if (enemy?.speciesId != null) return enemy.speciesId;
  let h = 0;
  for (const c of enemy?.name || "x") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % ALIEN_SPECIES.length) + 1;
}

// Rarity weights for discovery — legendary finds are incredibly rare (1 in 100).
const DISCOVERY_WEIGHTS = { common: 50, uncommon: 30, rare: 15, epic: 4, legendary: 1 };
function weightedPick(pool) {
  if (!pool.length) return null;
  const total = pool.reduce((s, e) => s + (DISCOVERY_WEIGHTS[e.rarity] || 1), 0);
  let roll = Math.random() * total;
  for (const e of pool) {
    roll -= (DISCOVERY_WEIGHTS[e.rarity] || 1);
    if (roll <= 0) return e;
  }
  return pool[pool.length - 1];
}

// Given the current character and battle context, return partial updates + a list
// of newly discovered collectibles. Species are discovered on any encounter;
// artifacts & relics only roll on a win.
const GEAR_TYPE_EMOJI = { weapon: "⚔️", armor: "🛡️", helmet: "⛑️", boots: "🥾", legs: "🦵", neck: "📿", accessory: "💍", ship_module: "🚀" };

// Given the current character and battle context, return partial updates + a list
// of newly discovered collectibles. Species are discovered on any encounter;
// artifacts & relics only roll on a win. Gear is discovered on any encounter —
// you see what the enemy is wearing whether you win or lose.
export function processDiscovery(character, { win, speciesId, gearItems }) {
  const updates = {};
  const found = [];

  // Each collectible is only ever discovered once. We build on a Set of the
  // existing ids so historical duplicates are cleaned up on the next write and
  // no id can be appended twice (even under stale state or concurrent calls).
  const speciesSet = new Set(character.discovered_species || []);
  if (speciesId && !speciesSet.has(speciesId)) {
    const sp = ALIEN_SPECIES.find((s) => s.id === speciesId);
    speciesSet.add(speciesId);
    updates.discovered_species = [...speciesSet];
    if (sp) found.push({ kind: "species", emoji: sp.emoji, name: sp.name });
  } else if (speciesSet.size !== (character.discovered_species || []).length) {
    updates.discovered_species = [...speciesSet];
  }

  if (win && gearItems && gearItems.length) {
    const gearSet = new Set(character.discovered_gear || []);
    const newItems = [];
    for (const g of gearItems) {
      const key = gearCatalogKey(g);
      if (key && !gearSet.has(key)) {
        gearSet.add(key);
        newItems.push(g);
      }
    }
    if (newItems.length) {
      updates.discovered_gear = [...gearSet];
      newItems.forEach((g) => found.push({ kind: "gear", emoji: GEAR_TYPE_EMOJI[g.type] || "📦", name: g.name }));
    } else if (gearSet.size !== (character.discovered_gear || []).length) {
      updates.discovered_gear = [...gearSet];
    }
  }

  if (win) {
    const relics = [...new Set(character.collected_relics || [])];
    if (Math.random() < 0.02 && relics.length < RELICS.length) {
      const remaining = RELICS.filter((r) => !relics.includes(r.id));
      const r = weightedPick(remaining);
      if (r) {
        relics.push(r.id);
        updates.collected_relics = relics;
        found.push({ kind: "relic", emoji: r.emoji, name: r.name });
      }
    } else if (relics.length !== (character.collected_relics || []).length) {
      updates.collected_relics = relics;
    }

    const arts = [...new Set(character.collected_artifacts || [])];
    if (Math.random() < 0.03 && arts.length < ARTIFACTS.length) {
      const remaining = ARTIFACTS.filter((a) => !arts.includes(a.id));
      const a = weightedPick(remaining);
      if (a) {
        arts.push(a.id);
        updates.collected_artifacts = arts;
        found.push({ kind: "artifact", emoji: a.emoji, name: a.name });
      }
    } else if (arts.length !== (character.collected_artifacts || []).length) {
      updates.collected_artifacts = arts;
    }
  }

  return { updates, found };
}