--[[
  Phase 15 — Secure shop service (Nakama Lua).

  Public RPCs: shop_get, shop_buy, shop_sell, shop_refresh

  Soft currency only (stardust). No premium store / Nova restock in this phase.
  Character-level shop offers. Free cooldown refresh only.

  Flow:
    buy  → debit wallet → grant persisted offer instance → mark purchased
    sell → reject equipped → remove inventory → credit wallet
    refresh → cooldown check → regenerate offers (no charge)
]]

local nk = require("nakama")
local auth = require("lib.auth")
local responses = require("lib.responses")
local validation = require("lib.validation")
local storage = require("lib.storage")
local time = require("lib.time")
local logging = require("lib.logging")
local transactions = require("lib.transactions")
local ids = require("lib.ids")
local remote_config = require("config")
local wallet = require("wallet")
local inventory = require("inventory")
local equipment = require("equipment")
local item_definitions = require("data.item_definitions")
local reward_formulas = require("data.mission_reward_formulas")

local SHOP_COLLECTION = "shops"
local TX_COLLECTION = "shop_transactions"
local SHOP_VERSION = 1
local DEFAULT_SHOP_ID = "general"
local ALLOWED_SHOPS = { general = true }

local RARITY_BUY_MARKUP = {
  common = 2.0,
  uncommon = 2.5,
  rare = 3.5,
  epic = 5.0,
  legendary = 7.0,
}

local RARITY_SALE_MULT = {
  common = 0.7,
  uncommon = 0.85,
  rare = 1.0,
  epic = 1.2,
  legendary = 1.75,
}

local RARITY_WEIGHTS = {
  common = 70,
  uncommon = 25,
  rare = 5,
}

local STATUS = {
  pending = "pending",
  debiting = "debiting",
  granting = "granting",
  updating_shop = "updating_shop",
  completed = "completed",
  failed = "failed",
  compensation_required = "compensation_required",
}

local function now_unix()
  return time.unix()
end

local function iso_now()
  return time.iso_utc()
end

local function empty_array()
  return validation.empty_array()
end

--- Feature flags default ON when missing (do not lock out shops accidentally).
local function feature_on(flag_id, context)
  local flag = remote_config.get_feature_flag(flag_id, context)
  if flag == nil then
    return true
  end
  return flag.enabled == true
end

local function cfg_int(key, default)
  local v = remote_config.get_config_value("shops", key)
  local n = tonumber(v)
  if n == nil or n ~= math.floor(n) then
    return default
  end
  return n
end

local function shop_storage_key(character_id, shop_id)
  return tostring(character_id) .. ":" .. tostring(shop_id)
end

local function read_shop(user_id, character_id, shop_id)
  local key = shop_storage_key(character_id, shop_id)
  local value, version, found = storage.read_one(user_id, SHOP_COLLECTION, key)
  if not found then
    return nil, nil
  end
  return value, version
end

local function write_shop(user_id, character_id, shop_id, doc, version)
  local key = shop_storage_key(character_id, shop_id)
  return storage.write_one(user_id, SHOP_COLLECTION, key, doc, version, 1, 0)
end

local function read_tx(user_id, transaction_id)
  local value, version, found = storage.read_one(user_id, TX_COLLECTION, transaction_id)
  if not found then
    return nil, nil
  end
  return value, version
end

local function write_tx(user_id, transaction_id, record, version)
  return storage.write_one(user_id, TX_COLLECTION, transaction_id, record, version, 1, 0)
end

local function hash_seed(s)
  local h = 2166136261
  for i = 1, #s do
    h = (h * 16777619 + string.byte(s, i)) % 4294967296
  end
  return h
end

local function make_rng(seed_str)
  local state = hash_seed(seed_str)
  return function(n)
    state = (state * 1664525 + 1013904223) % 4294967296
    if type(n) ~= "number" or n <= 0 then
      return 0
    end
    return state % math.floor(n)
  end
end

local function pick_rarity(rng)
  local total = 0
  local keys = { "common", "uncommon", "rare" }
  for i = 1, #keys do
    total = total + (RARITY_WEIGHTS[keys[i]] or 0)
  end
  local pick = rng(total)
  local cursor = 0
  for i = 1, #keys do
    cursor = cursor + RARITY_WEIGHTS[keys[i]]
    if pick < cursor then
      return keys[i]
    end
  end
  return "common"
end

local function compute_buy_price(level, rarity)
  local spf = reward_formulas.stardust_per_fuel(level)
  local markup = RARITY_BUY_MARKUP[rarity] or 3.5
  local mult = cfg_int("buy_price_multiplier_percent", 100) / 100.0
  return math.max(1, math.floor(spf * 2.0 * markup * mult + 0.5))
end

local function compute_sell_value(metadata, item_id)
  local rarity = "common"
  local item_level = 1
  local itype = "armor"
  if type(metadata) == "table" then
    if type(metadata.rarity) == "string" then
      rarity = metadata.rarity
    end
    item_level = tonumber(metadata.level_requirement) or tonumber(metadata.item_level) or 1
    if type(metadata.type) == "string" then
      itype = metadata.type
    end
  end
  local def = item_definitions.get(item_id)
  if def ~= nil and type(def.type) == "string" then
    itype = def.type
  end
  local spf = reward_formulas.stardust_per_fuel(item_level)
  local sale_mult = RARITY_SALE_MULT[rarity] or 0.7
  local type_mult = 1.0
  if itype == "weapon" or itype == "ship_module" then
    type_mult = 1.2
  end
  local ratio = cfg_int("sell_value_ratio", 100) / 100.0
  return math.max(1, math.floor(spf * 2.0 * sale_mult * type_mult * ratio + 0.5))
end

local function catalog_item_ids()
  local out = empty_array()
  for id, def in pairs(item_definitions.DEFINITIONS) do
    if type(def) == "table" and def.enabled == true then
      table.insert(out, id)
    end
  end
  table.sort(out)
  return out
end

local function generate_offers(character_id, shop_id, revision, level)
  local offer_count = cfg_int("offer_count", 4)
  local catalog = catalog_item_ids()
  if #catalog < 1 then
    return nil, "No item definitions available for shop"
  end
  local seed = table.concat({
    "shop", shop_id, character_id, tostring(revision), tostring(level),
  }, ":")
  local rng = make_rng(seed)
  local offers = empty_array()
  for i = 1, offer_count do
    local item_id = catalog[rng(#catalog) + 1]
    local def = item_definitions.get(item_id)
    local rarity = pick_rarity(rng)
    if def.allowed_rarities ~= nil and def.allowed_rarities[rarity] ~= true then
      rarity = "common"
    end
    local item_level = math.max(1, math.min(level, 5))
    local price_amount = compute_buy_price(level, rarity)
    local instance_id = "shop-" .. ids.uuid()
    local offer_id = string.format("%s-%d-%d", shop_id, revision, i)
    table.insert(offers, {
      offer_id = offer_id,
      item_id = item_id,
      quantity = 1,
      stock = 1,
      purchased = false,
      price = {
        currency_id = "stardust",
        amount = price_amount,
      },
      item_instance_preview = {
        instance_id = instance_id,
        item_id = item_id,
        quantity = 1,
        rarity = rarity,
        item_level = item_level,
        metadata = {
          type = def.type,
          rarity = rarity,
          name = def.display_name,
          level_requirement = item_level,
          stats = {},
          shop_offer_id = offer_id,
        },
      },
      metadata = {
        offer_kind = "gear",
      },
    })
  end
  return offers, nil
end

local function public_shop(doc)
  local offers = empty_array()
  if type(doc.offers) == "table" then
    for i = 1, #doc.offers do
      local o = doc.offers[i]
      local price_amt = 0
      if type(o.price) == "table" then
        price_amt = tonumber(o.price.amount) or 0
      end
      local preview = o.item_instance_preview or {}
      local meta = preview.metadata or {}
      table.insert(offers, {
        offer_id = o.offer_id,
        item_id = o.item_id,
        quantity = o.quantity,
        stock = o.stock,
        purchased = o.purchased == true,
        price = o.price,
        item_instance_preview = preview,
        metadata = o.metadata or {},
        _slotId = o.offer_id,
        _cost = price_amt,
        cost = price_amt,
        nova_cost = 0,
        type = meta.type or "",
        rarity = preview.rarity or "",
        name = meta.name or o.item_id,
        level_requirement = preview.item_level or 1,
      })
    end
  end
  local refresh_at = tonumber(doc.refresh_available_at_unix) or 0
  local remaining = math.max(0, refresh_at - now_unix())
  local purchased_map = {}
  for i = 1, #offers do
    if offers[i].purchased then
      purchased_map[offers[i].offer_id] = true
    end
  end
  return {
    shop_version = doc.shop_version or SHOP_VERSION,
    shop_id = doc.shop_id,
    owner_character_id = doc.owner_character_id,
    revision = doc.revision,
    generated_at = doc.generated_at or "",
    refresh_available_at = doc.refresh_available_at or "",
    refresh_seconds_remaining = remaining,
    expires_at = doc.expires_at or "",
    offers = offers,
    shop_stock = offers,
    gear_stock = offers,
    cons_stock = empty_array(),
    purchased = purchased_map,
    yanked = {},
    hot_deal = {},
    free_refresh = remaining <= 0,
  }
end

local function ensure_shop_doc(user_id, character_id, shop_id, level, force_new)
  local doc, version = read_shop(user_id, character_id, shop_id)
  if doc ~= nil and force_new ~= true then
    return doc, version, false, nil
  end
  local revision = 1
  if doc ~= nil and tonumber(doc.revision) ~= nil then
    revision = math.floor(tonumber(doc.revision)) + 1
  end
  local offers, oerr = generate_offers(character_id, shop_id, revision, level)
  if oerr ~= nil then
    return nil, nil, false, oerr
  end
  local now = now_unix()
  local new_doc = {
    shop_version = SHOP_VERSION,
    shop_id = shop_id,
    owner_character_id = character_id,
    revision = revision,
    generated_at = iso_now(),
    refresh_available_at = iso_now(),
    refresh_available_at_unix = now,
    expires_at = "",
    offers = offers,
    updated_at = iso_now(),
  }
  local _, werr = write_shop(user_id, character_id, shop_id, new_doc, version)
  if werr ~= nil then
    local again = read_shop(user_id, character_id, shop_id)
    if again ~= nil then
      return again, nil, false, nil
    end
    return nil, nil, false, tostring(werr)
  end
  return new_doc, nil, true, nil
end

local function find_offer(doc, offer_id)
  if type(doc.offers) ~= "table" then
    return nil, nil
  end
  for i = 1, #doc.offers do
    if doc.offers[i].offer_id == offer_id then
      return doc.offers[i], i
    end
  end
  return nil, nil
end

local function rpc_shop_get(context, payload)
  if not feature_on("shops_enabled", context) then
    return responses.fail("Shops are disabled", responses.CODES.FORBIDDEN)
  end
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  local body = validation.decode_payload(payload) or {}
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return responses.fail(forbid, responses.CODES.INVALID_PAYLOAD)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true,
    shop_id = true,
    level = true,
  })
  if unknown ~= nil then
    return responses.fail(unknown, responses.CODES.INVALID_PAYLOAD)
  end

  local character_id, cerr = auth.resolve_character_id(user_id, body.character_id, false)
  if cerr ~= nil then
    return responses.fail_status(cerr, 403)
  end
  local shop_id = body.shop_id
  if shop_id == nil or shop_id == "" then
    shop_id = DEFAULT_SHOP_ID
  end
  if ALLOWED_SHOPS[shop_id] ~= true then
    return responses.fail("Unknown shop_id", responses.CODES.NOT_FOUND)
  end
  local level = tonumber(body.level) or 1
  if level < 1 then
    level = 1
  end
  level = math.floor(level)

  local doc, _, _, err = ensure_shop_doc(user_id, character_id, shop_id, level, false)
  if err ~= nil then
    return responses.fail(err, responses.CODES.UNPROCESSABLE)
  end
  local pub = public_shop(doc)
  return responses.ok({
    shop = pub,
    shop_meta = pub,
  })
end

local function rpc_shop_buy(context, payload)
  if not feature_on("shops_enabled", context) or not feature_on("shop_buy_enabled", context) then
    return responses.fail("Shop purchases are disabled", responses.CODES.FORBIDDEN)
  end
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return responses.fail(forbid, responses.CODES.INVALID_PAYLOAD)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true,
    shop_id = true,
    offer_id = true,
    request_id = true,
    expected_revision = true,
  })
  if unknown ~= nil then
    return responses.fail(unknown, responses.CODES.INVALID_PAYLOAD)
  end
  if body.price ~= nil or body.amount ~= nil or body.item_id ~= nil or body.currency_id ~= nil
      or body.rarity ~= nil or body.seed ~= nil then
    return responses.fail("Client cannot supply price or item outcome fields", responses.CODES.INVALID_PAYLOAD)
  end
  if type(body.offer_id) ~= "string" or body.offer_id == "" then
    return responses.fail("offer_id is required", responses.CODES.INVALID_PAYLOAD)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return responses.fail(tid_err, responses.CODES.INVALID_PAYLOAD)
  end

  local character_id, cerr = auth.resolve_character_id(user_id, body.character_id, false)
  if cerr ~= nil then
    return responses.fail_status(cerr, 403)
  end
  local shop_id = body.shop_id
  if shop_id == nil or shop_id == "" then
    shop_id = DEFAULT_SHOP_ID
  end
  if ALLOWED_SHOPS[shop_id] ~= true then
    return responses.fail("Unknown shop_id", responses.CODES.NOT_FOUND)
  end

  local existing = read_tx(user_id, body.request_id)
  if existing ~= nil then
    if existing.type ~= "buy"
      or existing.shop_id ~= shop_id
      or existing.offer_id ~= body.offer_id
      or existing.character_id ~= character_id
    then
      return responses.fail("Conflicting reuse of request_id", responses.CODES.CONFLICT)
    end
    return responses.ok(existing.receipt or { replay = true, status = existing.status })
  end

  local doc, version = read_shop(user_id, character_id, shop_id)
  if doc == nil then
    return responses.fail("Shop not found — call shop_get first", responses.CODES.NOT_FOUND)
  end
  if body.expected_revision ~= nil then
    local er = tonumber(body.expected_revision)
    if er ~= nil and er ~= tonumber(doc.revision) then
      return responses.fail("Shop revision mismatch", responses.CODES.CONFLICT)
    end
  end

  local offer = find_offer(doc, body.offer_id)
  if offer == nil then
    return responses.fail("Unknown offer_id", responses.CODES.NOT_FOUND)
  end
  if offer.purchased == true or (tonumber(offer.stock) or 0) < 1 then
    return responses.fail("Offer is not available", responses.CODES.CONFLICT)
  end
  if type(offer.price) ~= "table" or offer.price.currency_id ~= "stardust" then
    return responses.fail("Invalid offer price", responses.CODES.UNPROCESSABLE)
  end
  local amount = tonumber(offer.price.amount)
  if amount == nil or amount < 1 or amount ~= math.floor(amount) then
    return responses.fail("Invalid offer price amount", responses.CODES.UNPROCESSABLE)
  end
  local preview = offer.item_instance_preview
  if type(preview) ~= "table" or type(preview.instance_id) ~= "string" or preview.instance_id == "" then
    return responses.fail("Offer missing persisted item instance", responses.CODES.UNPROCESSABLE)
  end

  local bag_cap = inventory.BAG_CAP_DEFAULT or 10
  local inv_value, _, inv_found = storage.read_one(user_id, inventory.INV_COLLECTION, character_id)
  local slot_count = 0
  if inv_found and type(inv_value) == "table" and type(inv_value.slots) == "table" then
    slot_count = #inv_value.slots
  end
  if slot_count >= bag_cap then
    return responses.fail("Inventory full", responses.CODES.CONFLICT)
  end

  local tx = {
    shop_transaction_version = 1,
    transaction_id = body.request_id,
    request_id = body.request_id,
    type = "buy",
    status = STATUS.pending,
    user_id = user_id,
    character_id = character_id,
    shop_id = shop_id,
    shop_revision = doc.revision,
    offer_id = body.offer_id,
    item_instance_id = preview.instance_id,
    currency_id = "stardust",
    amount = amount,
    created_at = iso_now(),
    updated_at = iso_now(),
    receipt = {},
  }
  write_tx(user_id, body.request_id, tx, nil)

  tx.status = STATUS.debiting
  tx.updated_at = iso_now()
  write_tx(user_id, body.request_id, tx, nil)

  local debit_tid = "sbd:" .. body.request_id
  if #debit_tid > 64 then
    debit_tid = body.request_id
  end
  local _, derr = wallet.debit_currency(
    user_id, "stardust", amount, debit_tid, "shop_buy", "shop:" .. shop_id
  )
  if derr ~= nil then
    tx.status = STATUS.failed
    tx.updated_at = iso_now()
    write_tx(user_id, body.request_id, tx, nil)
    return responses.fail(tostring(derr), responses.CODES.CONFLICT)
  end

  tx.status = STATUS.granting
  tx.updated_at = iso_now()
  write_tx(user_id, body.request_id, tx, nil)

  local grant, gerr = inventory.grant_item_instance(user_id, character_id, {
    instance_id = preview.instance_id,
    item_id = preview.item_id or offer.item_id,
    quantity = preview.quantity or 1,
    metadata = preview.metadata or {},
  })
  if gerr ~= nil then
    local credit_tid = "sbr:" .. body.request_id
    wallet.credit_currency(user_id, "stardust", amount, credit_tid, "shop_buy_refund", "shop:" .. shop_id)
    tx.status = STATUS.compensation_required
    if string.find(tostring(gerr), "Inventory full", 1, true) then
      tx.status = STATUS.failed
    end
    tx.updated_at = iso_now()
    write_tx(user_id, body.request_id, tx, nil)
    return responses.fail(tostring(gerr), responses.CODES.CONFLICT)
  end

  tx.status = STATUS.updating_shop
  offer.purchased = true
  offer.stock = 0
  doc.updated_at = iso_now()
  write_shop(user_id, character_id, shop_id, doc, version)

  local pub = public_shop(doc)
  local receipt = {
    replay = false,
    status = STATUS.completed,
    shop = pub,
    shop_meta = pub,
    offer_id = body.offer_id,
    item_instance_id = preview.instance_id,
    item_id = offer.item_id,
    currency_id = "stardust",
    amount = amount,
    already_present = grant and grant.already_present == true,
  }
  tx.status = STATUS.completed
  tx.receipt = receipt
  tx.updated_at = iso_now()
  write_tx(user_id, body.request_id, tx, nil)

  logging.info("shops", "shop_buy", {
    user_id = user_id,
    request_id = body.request_id,
    offer_id = body.offer_id,
    amount = amount,
  })
  return responses.ok(receipt)
end

local function rpc_shop_sell(context, payload)
  if not feature_on("shops_enabled", context) or not feature_on("shop_sell_enabled", context) then
    return responses.fail("Shop selling is disabled", responses.CODES.FORBIDDEN)
  end
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return responses.fail(forbid, responses.CODES.INVALID_PAYLOAD)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true,
    item_instance_id = true,
    quantity = true,
    request_id = true,
  })
  if unknown ~= nil then
    return responses.fail(unknown, responses.CODES.INVALID_PAYLOAD)
  end
  if body.sale_price ~= nil or body.amount ~= nil or body.price ~= nil or body.currency_id ~= nil then
    return responses.fail("Client cannot supply sale value", responses.CODES.INVALID_PAYLOAD)
  end
  if type(body.item_instance_id) ~= "string" or body.item_instance_id == "" then
    return responses.fail("item_instance_id is required", responses.CODES.INVALID_PAYLOAD)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return responses.fail(tid_err, responses.CODES.INVALID_PAYLOAD)
  end
  local quantity = tonumber(body.quantity) or 1
  if quantity ~= math.floor(quantity) or quantity < 1 then
    return responses.fail("quantity must be a positive integer", responses.CODES.INVALID_PAYLOAD)
  end

  local character_id, cerr = auth.resolve_character_id(user_id, body.character_id, false)
  if cerr ~= nil then
    return responses.fail_status(cerr, 403)
  end

  local existing = read_tx(user_id, body.request_id)
  if existing ~= nil then
    if existing.type ~= "sell"
      or existing.item_instance_id ~= body.item_instance_id
      or existing.character_id ~= character_id
    then
      return responses.fail("Conflicting reuse of request_id", responses.CODES.CONFLICT)
    end
    return responses.ok(existing.receipt or { replay = true, status = existing.status })
  end

  if equipment.is_instance_equipped(user_id, character_id, body.item_instance_id) then
    return responses.fail("Cannot sell equipped items", responses.CODES.CONFLICT)
  end

  local inv_value, _, inv_found = storage.read_one(user_id, inventory.INV_COLLECTION, character_id)
  if not inv_found or type(inv_value) ~= "table" or type(inv_value.slots) ~= "table" then
    return responses.fail("Item instance not found", responses.CODES.NOT_FOUND)
  end
  local found = nil
  for i = 1, #inv_value.slots do
    if inv_value.slots[i].instance_id == body.item_instance_id then
      found = inv_value.slots[i]
      break
    end
  end
  if found == nil then
    return responses.fail("Item instance not found", responses.CODES.NOT_FOUND)
  end
  local meta = found.metadata or {}
  if meta.locked == true then
    return responses.fail("Item is locked and cannot be sold", responses.CODES.FORBIDDEN)
  end
  local sale_amount = compute_sell_value(meta, found.item_id)

  local tx = {
    shop_transaction_version = 1,
    transaction_id = body.request_id,
    request_id = body.request_id,
    type = "sell",
    status = STATUS.pending,
    user_id = user_id,
    character_id = character_id,
    shop_id = "",
    shop_revision = 0,
    offer_id = "",
    item_instance_id = body.item_instance_id,
    currency_id = "stardust",
    amount = sale_amount,
    created_at = iso_now(),
    updated_at = iso_now(),
    receipt = {},
  }
  write_tx(user_id, body.request_id, tx, nil)

  local removed, rerr = inventory.remove_item_instance(user_id, character_id, body.item_instance_id, quantity)
  if rerr ~= nil then
    tx.status = STATUS.failed
    tx.updated_at = iso_now()
    write_tx(user_id, body.request_id, tx, nil)
    return responses.fail(tostring(rerr), responses.CODES.CONFLICT)
  end

  local credit_tid = "ssc:" .. body.request_id
  local _, cerr2 = wallet.credit_currency(
    user_id, "stardust", sale_amount, credit_tid, "shop_sell", "shop_sell"
  )
  if cerr2 ~= nil then
    tx.status = STATUS.compensation_required
    tx.updated_at = iso_now()
    write_tx(user_id, body.request_id, tx, nil)
    return responses.fail("Sale credit failed — compensation required", responses.CODES.INTERNAL_ERROR)
  end

  local receipt = {
    replay = false,
    status = STATUS.completed,
    item_instance_id = body.item_instance_id,
    item_id = found.item_id,
    quantity = quantity,
    currency_id = "stardust",
    amount = sale_amount,
    inventory = removed and removed.inventory or nil,
  }
  tx.status = STATUS.completed
  tx.receipt = receipt
  tx.updated_at = iso_now()
  write_tx(user_id, body.request_id, tx, nil)

  logging.info("shops", "shop_sell", {
    user_id = user_id,
    request_id = body.request_id,
    amount = sale_amount,
  })
  return responses.ok(receipt)
end

local function rpc_shop_refresh(context, payload)
  if not feature_on("shops_enabled", context) or not feature_on("shop_refresh_enabled", context) then
    return responses.fail("Shop refresh is disabled", responses.CODES.FORBIDDEN)
  end
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return responses.fail(forbid, responses.CODES.INVALID_PAYLOAD)
  end
  local unknown = validation.reject_unknown_keys(body, {
    character_id = true,
    shop_id = true,
    request_id = true,
    level = true,
  })
  if unknown ~= nil then
    return responses.fail(unknown, responses.CODES.INVALID_PAYLOAD)
  end
  if body.offers ~= nil or body.seed ~= nil or body.cost ~= nil or body.cooldown ~= nil then
    return responses.fail("Client cannot supply refresh outcomes", responses.CODES.INVALID_PAYLOAD)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return responses.fail(tid_err, responses.CODES.INVALID_PAYLOAD)
  end

  local character_id, cerr = auth.resolve_character_id(user_id, body.character_id, false)
  if cerr ~= nil then
    return responses.fail_status(cerr, 403)
  end
  local shop_id = body.shop_id
  if shop_id == nil or shop_id == "" then
    shop_id = DEFAULT_SHOP_ID
  end
  if ALLOWED_SHOPS[shop_id] ~= true then
    return responses.fail("Unknown shop_id", responses.CODES.NOT_FOUND)
  end
  local level = math.floor(tonumber(body.level) or 1)
  if level < 1 then
    level = 1
  end

  local existing = read_tx(user_id, body.request_id)
  if existing ~= nil then
    if existing.type ~= "refresh" or existing.shop_id ~= shop_id or existing.character_id ~= character_id then
      return responses.fail("Conflicting reuse of request_id", responses.CODES.CONFLICT)
    end
    return responses.ok(existing.receipt or { replay = true, status = existing.status })
  end

  local doc, version = read_shop(user_id, character_id, shop_id)
  if doc == nil then
    local created, _, _, err = ensure_shop_doc(user_id, character_id, shop_id, level, true)
    if err ~= nil or created == nil then
      return responses.fail(err or "Failed to create shop", responses.CODES.UNPROCESSABLE)
    end
    doc, version = read_shop(user_id, character_id, shop_id)
  end

  local refresh_at = tonumber(doc.refresh_available_at_unix) or 0
  if now_unix() < refresh_at then
    return responses.fail("Shop refresh not available yet", responses.CODES.CONFLICT)
  end

  local revision = math.floor(tonumber(doc.revision) or 1) + 1
  local offers, oerr = generate_offers(character_id, shop_id, revision, level)
  if oerr ~= nil then
    return responses.fail(oerr, responses.CODES.UNPROCESSABLE)
  end
  local cooldown = cfg_int("refresh_cooldown_seconds", 60)
  local now = now_unix()
  doc.revision = revision
  doc.offers = offers
  doc.generated_at = iso_now()
  doc.refresh_available_at_unix = now + cooldown
  doc.refresh_available_at = iso_now()
  doc.updated_at = iso_now()
  write_shop(user_id, character_id, shop_id, doc, version)

  local pub = public_shop(doc)
  local receipt = {
    replay = false,
    status = STATUS.completed,
    shop = pub,
    shop_meta = pub,
    refresh_cost = 0,
    currency_id = "stardust",
    amount = 0,
  }
  local tx = {
    shop_transaction_version = 1,
    transaction_id = body.request_id,
    request_id = body.request_id,
    type = "refresh",
    status = STATUS.completed,
    user_id = user_id,
    character_id = character_id,
    shop_id = shop_id,
    shop_revision = revision,
    offer_id = "",
    item_instance_id = "",
    currency_id = "stardust",
    amount = 0,
    created_at = iso_now(),
    updated_at = iso_now(),
    receipt = receipt,
  }
  write_tx(user_id, body.request_id, tx, nil)

  logging.info("shops", "shop_refresh", {
    user_id = user_id,
    request_id = body.request_id,
    revision = revision,
  })
  return responses.ok(receipt)
end

nk.register_rpc(rpc_shop_get, "shop_get")
nk.register_rpc(rpc_shop_buy, "shop_buy")
nk.register_rpc(rpc_shop_sell, "shop_sell")
nk.register_rpc(rpc_shop_refresh, "shop_refresh")

nk.logger_info("Phase 15 shops: shop_get/buy/sell/refresh registered (stardust only; free refresh)")

return {
  DEFAULT_SHOP_ID = DEFAULT_SHOP_ID,
  compute_buy_price = compute_buy_price,
  compute_sell_value = compute_sell_value,
}
