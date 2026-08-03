--[[
  Phase 13 — Server-side loot tables and item pools (development sample).
  Client cannot upload or modify these tables.
  No premium currency. No unrestricted high-tier entries in sample pools.
]]

local M = {}

M.ITEM_POOLS = {
  phase13_basic_weapons = {
    item_pool_id = "phase13_basic_weapons",
    enabled = true,
    item_ids = { "laser_pistol", "plasma_rifle" },
    allowed_slots = { "weapon" },
    minimum_level = 1,
    maximum_level = 5,
  },
  phase13_basic_armor = {
    item_pool_id = "phase13_basic_armor",
    enabled = true,
    item_ids = { "scrap_vest" },
    allowed_slots = { "armor" },
    minimum_level = 1,
    maximum_level = 5,
  },
}

M.LOOT_TABLES = {
  phase13_basic_test = {
    loot_table_version = 1,
    loot_table_id = "phase13_basic_test",
    enabled = true,
    rolls = 1,
    entries = {
      {
        entry_id = "basic_weapon_pool",
        weight = 70,
        type = "item_pool",
        item_pool_id = "phase13_basic_weapons",
        quantity_min = 1,
        quantity_max = 1,
        rarity_weights = {
          common = 70,
          uncommon = 25,
          rare = 5,
        },
      },
      {
        entry_id = "basic_armor_pool",
        weight = 30,
        type = "item_pool",
        item_pool_id = "phase13_basic_armor",
        quantity_min = 1,
        quantity_max = 1,
        rarity_weights = {
          common = 80,
          uncommon = 20,
        },
      },
    },
  },
  -- Phase 14 mission claim sample (common/uncommon only).
  phase14_mission_basic = {
    loot_table_version = 1,
    loot_table_id = "phase14_mission_basic",
    enabled = true,
    rolls = 1,
    entries = {
      {
        entry_id = "mission_weapon_pool",
        weight = 60,
        type = "item_pool",
        item_pool_id = "phase13_basic_weapons",
        quantity_min = 1,
        quantity_max = 1,
        rarity_weights = {
          common = 80,
          uncommon = 20,
        },
      },
      {
        entry_id = "mission_armor_pool",
        weight = 40,
        type = "item_pool",
        item_pool_id = "phase13_basic_armor",
        quantity_min = 1,
        quantity_max = 1,
        rarity_weights = {
          common = 85,
          uncommon = 15,
        },
      },
    },
  },
}

-- Dev allowlist: only these table IDs may be requested by dev_loot_test.
M.DEV_TEST_TABLE_IDS = {
  phase13_basic_test = true,
}

function M.get_table(loot_table_id)
  if type(loot_table_id) ~= "string" then
    return nil
  end
  return M.LOOT_TABLES[loot_table_id]
end

function M.get_pool(item_pool_id)
  if type(item_pool_id) ~= "string" then
    return nil
  end
  return M.ITEM_POOLS[item_pool_id]
end

return M
