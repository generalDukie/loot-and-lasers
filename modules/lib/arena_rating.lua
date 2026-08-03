--[[
  Arena rating math — Elo + lower-ranked gain penalty + repeat-opponent scaling.
  Ported from server/src/arena/rating.js + ArenaRules Elo constants.
  Positive gain penalties only; losses keep full Elo risk.
]]

local M = {}

M.POLICY_VERSION = 1

function M.elo_expected(player_rating, opponent_rating, divisor)
  local a = tonumber(player_rating) or 1000
  local b = tonumber(opponent_rating) or 1000
  local d = tonumber(divisor) or 400
  if d <= 0 then
    d = 400
  end
  return 1 / (1 + (10 ^ ((b - a) / d)))
end

--- Gap below = challenger - opponent when challenger is higher.
--- Returns multiplier (0..1) and band id. Applies to positive gains only.
function M.gap_multiplier_for_win(challenger_rating, opponent_rating, bands)
  local gap = (tonumber(challenger_rating) or 1000) - (tonumber(opponent_rating) or 1000)
  if gap <= 0 then
    return 1, "underdog_or_equal", false
  end
  local full = tonumber(bands.full_gain_difference) or 100
  local reduced = tonumber(bands.reduced_gain_start) or 250
  local severe = tonumber(bands.severe_reduction_start) or 400
  local zero_cut = tonumber(bands.zero_gain_cutoff) or 400
  local med_mult = tonumber(bands.medium_multiplier) or 0.5
  local low_mult = tonumber(bands.low_multiplier) or 0.2

  if gap <= full then
    return 1, "full", false
  end
  if gap <= reduced then
    return med_mult, "medium", false
  end
  if gap <= severe and gap <= zero_cut then
    return low_mult, "low", false
  end
  if gap > zero_cut then
    return 0, "zero", true
  end
  return low_mult, "low", false
end

function M.repeat_win_multiplier(prior_ranked_wins, policy)
  local n = math.max(0, math.floor(tonumber(prior_ranked_wins) or 0))
  local match_index = n + 1
  local full_n = math.floor(tonumber(policy.full_reward_matches) or 1)
  local reduced_n = math.floor(tonumber(policy.reduced_reward_matches) or 1)
  local zero_after = math.floor(tonumber(policy.no_gain_after_repeat_count) or 2)
  local red_mult = tonumber(policy.repeated_opponent_gain_multiplier) or 0.4

  if match_index <= full_n then
    return 1, "full", false, match_index
  end
  local reduced_end = full_n + reduced_n
  if match_index <= reduced_end and match_index <= zero_after then
    return red_mult, "reduced", false, match_index
  end
  if match_index > zero_after then
    return 0, "zero", true, match_index
  end
  return red_mult, "reduced", false, match_index
end

--- Integer-safe: trunc toward zero; hard zero stays 0; tiny positive win → min_gain; tiny loss → -1.
function M.compute_rating_delta(opts)
  local cr = tonumber(opts.challenger_rating) or 1000
  local orating = tonumber(opts.opponent_rating) or 1000
  local won = opts.won == true
  local k = tonumber(opts.k_factor) or 28
  local divisor = tonumber(opts.rating_divisor) or 400
  local max_gain = tonumber(opts.maximum_gain) or 32
  local max_loss = tonumber(opts.maximum_loss) or 32
  local min_nonzero = tonumber(opts.minimum_nonzero_gain) or 1
  local bands = opts.gap_bands or {}
  local repeat_policy = opts.repeat_policy or {}
  local prior_wins = opts.prior_ranked_wins or 0

  local expected = M.elo_expected(cr, orating, divisor)
  local actual = won and 1 or 0
  local base_change = k * (actual - expected)

  local gap_mult, gap_band, gap_zero = M.gap_multiplier_for_win(cr, orating, bands)
  local rep_mult, rep_band, rep_zero, match_index = 1, "n/a", false, prior_wins
  if won then
    rep_mult, rep_band, rep_zero, match_index = M.repeat_win_multiplier(prior_wins, repeat_policy)
  end

  local change = base_change
  local zero_reason = nil

  if won then
    change = change * gap_mult * rep_mult
    if gap_zero or rep_zero then
      change = 0
      if gap_zero then
        zero_reason = "OPPONENT_TOO_LOW_FOR_RATING_GAIN"
      else
        zero_reason = "REPEAT_OPPONENT_NO_RATING"
      end
    elseif change > 0 and change < min_nonzero then
      change = min_nonzero
    end
    if change > max_gain then
      change = max_gain
    end
  else
    if change < -max_loss then
      change = -max_loss
    end
  end

  local rating_delta = change >= 0 and math.floor(change) or math.ceil(change)
  -- trunc toward zero
  if change >= 0 then
    rating_delta = math.floor(change)
  else
    rating_delta = math.ceil(change)
  end

  if won and (gap_zero or rep_zero) then
    rating_delta = 0
  elseif won and rating_delta == 0 and change > 0 and not gap_zero and not rep_zero then
    rating_delta = min_nonzero
  elseif not won and rating_delta == 0 and change < 0 then
    rating_delta = -1
  end

  return {
    rating_delta = rating_delta,
    expected_score = expected,
    base_change = change >= 0 and math.floor(base_change) or math.ceil(base_change),
    gap_multiplier = gap_mult,
    gap_band = gap_band,
    repeat_multiplier = rep_mult,
    repeat_band = rep_band,
    repeat_match_index = match_index,
    zero_reward_reason = zero_reason,
    rating_gap = cr - orating,
    policy_version = M.POLICY_VERSION,
  }
end

function M.clamp_rating(rating, minimum, maximum)
  local r = math.floor(tonumber(rating) or 1000)
  local lo = math.floor(tonumber(minimum) or 0)
  local hi = math.floor(tonumber(maximum) or 3000)
  if r < lo then
    return lo
  end
  if r > hi then
    return hi
  end
  return r
end

--- Derive tier_id from ordered thresholds { { id=, min_rating= }, ... } highest match wins.
function M.tier_for_rating(rating, thresholds)
  local r = tonumber(rating) or 1000
  local best_id = "unranked"
  local best_min = -1
  if type(thresholds) ~= "table" then
    return best_id
  end
  for i = 1, #thresholds do
    local t = thresholds[i]
    if type(t) == "table" and type(t.id) == "string" then
      local mn = tonumber(t.min_rating) or 0
      if r >= mn and mn >= best_min then
        best_min = mn
        best_id = t.id
      end
    end
  end
  return best_id
end

return M
