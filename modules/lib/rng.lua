--[[
  Shared deterministic LCG RNG (gameplay — not cryptographic).
  Same seed string always yields the same sequence.
]]

local M = {}

local function hash_string(s)
  local h = 2166136261
  s = tostring(s or "")
  for i = 1, #s do
    h = (h * 16777619 + string.byte(s, i)) % 4294967296
  end
  return h
end

--- Returns rng(n) -> integer in [0, n) and rng_unit() -> float in [0, 1).
function M.make(seed_str)
  local state = hash_string(seed_str)
  local function next_state()
    state = (state * 1664525 + 1013904223) % 4294967296
    return state
  end
  local function rng(n)
    local s = next_state()
    if type(n) ~= "number" or n <= 0 then
      return 0
    end
    return s % math.floor(n)
  end
  local function rng_unit()
    local s = next_state()
    return s / 4294967296
  end
  return {
    next = rng,
    unit = rng_unit,
    between = function(lo, hi)
      return lo + (hi - lo) * rng_unit()
    end,
  }
end

M.hash_string = hash_string

return M
