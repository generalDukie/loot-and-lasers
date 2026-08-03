--[[
  Combat formulas — ported from src/lib/statEngine.js (authoritative numeric SoT).
  Used by modules/combat.lua. No class passives / stims in Phase 17.
]]

local M = {}

M.CRIT_CAP = 30
M.DODGE_CAP = 25
M.ARMOR_CAP = 30
M.TECH_RESIST_CAP = 30
M.CRIT_MULT = 1.5
M.DAMAGE_BASE = 15
M.DAMAGE_COEFF = 0.0032
M.DAMAGE_EXP = 1.727
M.AGI_VARIANCE_MIN = 0.80
M.AGI_VARIANCE_MAX = 1.05
M.UNIVERSAL_VARIANCE_MIN = 0.90
M.UNIVERSAL_VARIANCE_MAX = 1.10

M.ATTR_KEYS = { "strength", "agility", "intellect", "vitality", "luck" }

M.CLASS_BASE_STATS = {
  Vanguard = { strength = 15, agility = 8, intellect = 6, vitality = 14, luck = 7 },
  ["Astral Warden"] = { strength = 15, agility = 8, intellect = 6, vitality = 14, luck = 7 },
  ["Shadow Operative"] = { strength = 7, agility = 15, intellect = 7, vitality = 11, luck = 10 },
  ["Void Runner"] = { strength = 7, agility = 15, intellect = 7, vitality = 11, luck = 10 },
  Technomancer = { strength = 6, agility = 8, intellect = 15, vitality = 13, luck = 8 },
  ["Cosmic Engineer"] = { strength = 6, agility = 8, intellect = 15, vitality = 13, luck = 8 },
}

M.CLASS_PRIMARY = {
  Vanguard = "strength",
  ["Astral Warden"] = "strength",
  ["Shadow Operative"] = "agility",
  ["Void Runner"] = "agility",
  Technomancer = "intellect",
  ["Cosmic Engineer"] = "intellect",
}

function M.is_known_class(class_name)
  return type(class_name) == "string" and M.CLASS_BASE_STATS[class_name] ~= nil
end

function M.get_damage_archetype(class_name)
  local primary = M.CLASS_PRIMARY[class_name] or "strength"
  if primary == "agility" then
    return "agi"
  end
  if primary == "intellect" then
    return "int"
  end
  return "str"
end

function M.get_damage_type(class_name)
  local arch = M.get_damage_archetype(class_name)
  if arch == "int" then
    return "tech"
  end
  if arch == "agi" then
    return "agility"
  end
  return "strength"
end

function M.soft_cap_percent(level, total_attr, max_percent)
  local L = math.max(1, tonumber(level) or 1)
  local attr = math.max(0, tonumber(total_attr) or 0)
  local for_max = 700 * ((L / 100) ^ 0.95)
  local from_attr = 0
  if for_max > 0 then
    from_attr = max_percent * math.min(1, (attr / for_max) ^ 1.20)
  end
  local pre100 = max_percent * math.min(1, (L / 100) ^ 0.65)
  return math.min(from_attr, pre100, max_percent)
end

function M.get_max_hp(total_vitality)
  local v = math.max(0, tonumber(total_vitality) or 0)
  return math.floor(50 + 2.5 * v + 0.008 * (v ^ 2) + 0.5)
end

function M.get_crit_chance(level, total_luck)
  return M.soft_cap_percent(level, total_luck, M.CRIT_CAP) / 100.0
end

function M.get_dodge_chance(level, total_agility)
  return M.soft_cap_percent(level, total_agility, M.DODGE_CAP) / 100.0
end

function M.get_armor_percent(class_name, level, total_strength)
  if M.get_damage_archetype(class_name) == "str" then
    return 0
  end
  return M.soft_cap_percent(level, total_strength, M.ARMOR_CAP)
end

function M.get_tech_resist_percent(class_name, level, total_intellect)
  if M.get_damage_archetype(class_name) == "int" then
    return 0
  end
  return M.soft_cap_percent(level, total_intellect, M.TECH_RESIST_CAP)
end

function M.get_base_damage(primary_attribute)
  local p = math.max(0, tonumber(primary_attribute) or 0)
  return M.DAMAGE_BASE + M.DAMAGE_COEFF * (p ^ M.DAMAGE_EXP)
end

function M.roll_basic_attack_damage(archetype, primary_value, rng)
  local base = M.get_base_damage(primary_value)
  local uni = rng.between(M.UNIVERSAL_VARIANCE_MIN, M.UNIVERSAL_VARIANCE_MAX)
  if archetype == "agi" then
    local agi = rng.between(M.AGI_VARIANCE_MIN, M.AGI_VARIANCE_MAX)
    return base * agi * uni
  end
  return base * uni
end

function M.mitigation_for_damage_type(damage_type, armor_percent, tech_resist_percent)
  if damage_type == "strength" then
    return math.max(0, (tonumber(armor_percent) or 0) / 100.0)
  end
  if damage_type == "tech" then
    return math.max(0, (tonumber(tech_resist_percent) or 0) / 100.0)
  end
  return 0
end

function M.empty_stats()
  return { strength = 0, agility = 0, intellect = 0, vitality = 0, luck = 0 }
end

function M.class_base(class_name)
  local base = M.CLASS_BASE_STATS[class_name] or M.CLASS_BASE_STATS.Vanguard
  return {
    strength = base.strength,
    agility = base.agility,
    intellect = base.intellect,
    vitality = base.vitality,
    luck = base.luck,
  }
end

function M.add_stats(a, b)
  local out = M.empty_stats()
  for i = 1, #M.ATTR_KEYS do
    local k = M.ATTR_KEYS[i]
    out[k] = (tonumber(a[k]) or 0) + (tonumber(b[k]) or 0)
  end
  return out
end

function M.sum_equipment_stats(equipped_pieces)
  local total = M.empty_stats()
  if type(equipped_pieces) ~= "table" then
    return total
  end
  for i = 1, #equipped_pieces do
    local piece = equipped_pieces[i]
    if type(piece) == "table" then
      local meta = piece.metadata
      if type(meta) ~= "table" then
        meta = {}
      end
      local stats = meta.stats
      if type(stats) ~= "table" then
        stats = piece.stats
      end
      if type(stats) == "table" then
        total = M.add_stats(total, stats)
      end
    end
  end
  return total
end

function M.build_totals(class_name, equipped_pieces)
  local base = M.class_base(class_name)
  local gear = M.sum_equipment_stats(equipped_pieces)
  return M.add_stats(base, gear)
end

function M.primary_value(class_name, totals)
  local key = M.CLASS_PRIMARY[class_name] or "strength"
  return tonumber(totals[key]) or 0
end

return M
