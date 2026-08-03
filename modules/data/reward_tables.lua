--[[
  Phase 12 — Development-only fixed reward tables.
  Consumed by modules/rewards.lua. Never trust client-defined bundles.
  No premium currency entries.
]]

local M = {}

-- Fixed allowlisted test rewards. Keys are test_reward_id values.
M.DEV_TEST_REWARDS = {
  stardust_10 = {
    reward_version = 1,
    source_type = "dev_test",
    source_id = "stardust_10",
    reason = "Phase 12 development reward test",
    rewards = {
      { type = "currency", currency_id = "stardust", amount = 10 },
    },
    metadata = { allowlist = true },
  },
  stardust_1 = {
    reward_version = 1,
    source_type = "dev_test",
    source_id = "stardust_1",
    reason = "Phase 12 development reward test",
    rewards = {
      { type = "currency", currency_id = "stardust", amount = 1 },
    },
    metadata = { allowlist = true },
  },
}

-- Future server reward tables (empty until gameplay phases wire them).
M.TABLES = {}

function M.get_dev_test(test_reward_id)
  if type(test_reward_id) ~= "string" or test_reward_id == "" then
    return nil
  end
  return M.DEV_TEST_REWARDS[test_reward_id]
end

return M
