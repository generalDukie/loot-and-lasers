--[[
  Phase 14 — Mission reward formula helpers (server-side).
  Simplified SPF interpolation aligned with StardustEconomy anchors.
  Full log-PCHIP parity is future work; amounts are snapshotted at mission generation.
]]

local M = {}

local MISSION_MIN_FUEL = 0.25

-- Anchors: { level, stardust_per_fuel } — same points as StardustEconomy.STARDUST_PER_FUEL_ANCHORS
local SPF_ANCHORS = {
  { 1, 50 },
  { 10, 80 },
  { 25, 250 },
  { 50, 600 },
  { 75, 1200 },
  { 100, 2250 },
  { 150, 6000 },
  { 200, 15000 },
  { 250, 35000 },
  { 300, 75000 },
}

--- Linear interpolation between anchors (safe approximation of client PCHIP for Phase 14).
function M.stardust_per_fuel(level)
  local lv = tonumber(level) or 1
  if lv < 1 then
    lv = 1
  end
  lv = math.floor(lv)
  if lv <= SPF_ANCHORS[1][1] then
    return SPF_ANCHORS[1][2]
  end
  local last = SPF_ANCHORS[#SPF_ANCHORS]
  if lv >= last[1] then
    return last[2]
  end
  for i = 1, #SPF_ANCHORS - 1 do
    local a = SPF_ANCHORS[i]
    local b = SPF_ANCHORS[i + 1]
    if lv >= a[1] and lv <= b[1] then
      local t = (lv - a[1]) / (b[1] - a[1])
      return math.floor(a[2] + (b[2] - a[2]) * t + 0.5)
    end
  end
  return SPF_ANCHORS[1][2]
end

function M.fuel_from_duration(duration_seconds)
  local d = tonumber(duration_seconds) or 0
  if d < 0 then
    d = 0
  end
  local fuel = math.floor((d / 60.0) * 100 + 0.5) / 100
  if fuel < MISSION_MIN_FUEL then
    fuel = MISSION_MIN_FUEL
  end
  return fuel
end

--- Stardust = ROUND(SPF(level) * fuel). Efficiency does not apply (matches live Node rule).
function M.compute_stardust(level, fuel_cost)
  local fuel = tonumber(fuel_cost) or 0
  if fuel <= 0 then
    return 0
  end
  return math.floor(M.stardust_per_fuel(level) * fuel + 0.5)
end

--- XP preview amount only — not granted until ProgressionService exists.
function M.compute_xp(level, fuel_cost, efficiency)
  local fuel = tonumber(fuel_cost) or 0
  local eff = tonumber(efficiency) or 1
  if fuel <= 0 then
    return 0
  end
  -- Approximate: SPF scale * 0.5 * fuel * efficiency (display-aligned; not authoritative grant)
  local base = math.max(1, math.floor(M.stardust_per_fuel(level) * 0.5 * fuel * eff + 0.5))
  return base
end

M.MISSION_MIN_FUEL = MISSION_MIN_FUEL
M.REWARD_FORMULA_VERSION = 1
M.DEFAULT_LOOT_TABLE_ID = "phase14_mission_basic"
M.LOOT_CHANCE = 1.0 -- Phase 14: always roll sample loot (pool is common/uncommon only)

return M
