--[[
  Phase 13 — Authoritative item definition catalog (minimal sample).
  Used by loot pools for validation. Not a full game catalog migration.
]]

local M = {}

local RARITIES = {
  common = true,
  uncommon = true,
  rare = true,
  epic = true,
  legendary = true,
}

-- Development sample definitions only — verified item_ids used in tests.
M.DEFINITIONS = {
  laser_pistol = {
    item_id = "laser_pistol",
    display_name = "Laser Pistol",
    type = "weapon",
    enabled = true,
    allowed_rarities = { common = true, uncommon = true, rare = true },
  },
  plasma_rifle = {
    item_id = "plasma_rifle",
    display_name = "Plasma Rifle",
    type = "weapon",
    enabled = true,
    allowed_rarities = { common = true, uncommon = true, rare = true },
  },
  scrap_vest = {
    item_id = "scrap_vest",
    display_name = "Scrap Vest",
    type = "armor",
    enabled = true,
    allowed_rarities = { common = true, uncommon = true },
  },
}

function M.get(item_id)
  if type(item_id) ~= "string" or item_id == "" then
    return nil
  end
  return M.DEFINITIONS[item_id]
end

function M.is_rarity(rarity)
  return type(rarity) == "string" and RARITIES[rarity] == true
end

M.RARITIES = RARITIES

return M
