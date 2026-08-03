--[[
  Phase 19 — Social foundation (Nakama Lua).

  Account-level friendships via native Nakama friends API.
  Public RPCs: social_get_state, friend_request_send/accept/decline,
  friend_remove, user_block, user_unblock, block_list_get

  Display identity may include selected character from profile storage.
]]

local nk = require("nakama")
local auth = require("lib.auth")
local responses = require("lib.responses")
local validation = require("lib.validation")
local storage = require("lib.storage")
local time = require("lib.time")
local logging = require("lib.logging")
local transactions = require("lib.transactions")
local remote_config = require("config")

local RATE_COLLECTION = "social_rate_limits"
local TX_COLLECTION = "social_transactions"

-- Nakama friend states
local STATE_FRIEND = 0
local STATE_OUTGOING = 1
local STATE_INCOMING = 2
local STATE_BLOCKED = 3

local function feature_on(flag_id, context)
  local flag = remote_config.get_feature_flag(flag_id, context)
  if flag == nil then
    return true
  end
  return flag.enabled == true
end

local function cfg_int(key, default)
  local v = remote_config.get_config_value("social", key)
  local n = tonumber(v)
  if n == nil then
    return default
  end
  return math.floor(n)
end

local function decode_payload(payload)
  if payload == nil or payload == "" then
    return {}
  end
  local ok, decoded = pcall(nk.json_decode, payload)
  if not ok or type(decoded) ~= "table" then
    return nil
  end
  return decoded
end

local function encode_fail(message, status)
  return responses.fail_status(message, status or 400)
end

local function iso_now()
  return time.iso_utc()
end

local function username_of(user_id)
  local accounts = nk.users_get_id({ user_id })
  if accounts == nil or #accounts == 0 then
    return nil
  end
  return accounts[1].username or ""
end

local function user_exists(user_id)
  if type(user_id) ~= "string" or user_id == "" then
    return false
  end
  local accounts = nk.users_get_id({ user_id })
  return accounts ~= nil and #accounts > 0
end

local function public_user(u)
  if type(u) ~= "table" then
    return nil
  end
  return {
    user_id = u.id or u.user_id or "",
    username = u.username or "",
    display_name = u.display_name or u.username or "",
    avatar_url = u.avatar_url or "",
  }
end

local function state_label(state)
  if state == STATE_FRIEND then
    return "friends"
  end
  if state == STATE_OUTGOING then
    return "outgoing_request"
  end
  if state == STATE_INCOMING then
    return "incoming_request"
  end
  if state == STATE_BLOCKED then
    return "blocked"
  end
  return "none"
end

local function list_friends_by_state(user_id, state, limit)
  local friends, cursor, err = nk.friends_list(user_id, limit or 100, state, "")
  if err ~= nil then
    return nil, err
  end
  local out = validation.empty_array()
  if friends == nil then
    return out, nil
  end
  for i = 1, #friends do
    local f = friends[i]
    local pu = public_user(f.user)
    if pu ~= nil then
      pu.relationship = state_label(tonumber(f.state) or state)
      pu.state = tonumber(f.state) or state
      table.insert(out, pu)
    end
  end
  return out, nil
end

local function find_relationship(user_id, target_id)
  -- Scan common states
  for _, st in ipairs({ STATE_FRIEND, STATE_OUTGOING, STATE_INCOMING, STATE_BLOCKED }) do
    local list = list_friends_by_state(user_id, st, 100)
    if list then
      for i = 1, #list do
        if list[i].user_id == target_id then
          return list[i].relationship, list[i]
        end
      end
    end
  end
  return "none", nil
end

local function is_blocked_either_way(a, b)
  local ra = find_relationship(a, b)
  local rb = find_relationship(b, a)
  return ra == "blocked" or rb == "blocked"
end

local function read_rate(user_id)
  local value, version, found = storage.read_one(user_id, RATE_COLLECTION, "friend_requests")
  if not found then
    return { day = "", count = 0, last_at = 0 }, nil
  end
  return value, version
end

local function write_rate(user_id, doc, version)
  return storage.write_one(user_id, RATE_COLLECTION, "friend_requests", doc, version, 1, 0)
end

local function check_friend_request_limits(user_id)
  local day = string.sub(iso_now(), 1, 10)
  local doc, version = read_rate(user_id)
  if doc.day ~= day then
    doc.day = day
    doc.count = 0
  end
  local cooldown = cfg_int("friend_request_cooldown_seconds", 5)
  local now = time.unix()
  if (tonumber(doc.last_at) or 0) + cooldown > now then
    return false, "Friend request cooldown active", 429
  end
  local daily = cfg_int("friend_request_daily_limit", 50)
  if (tonumber(doc.count) or 0) >= daily then
    return false, "Daily friend request limit reached", 429
  end
  return true, doc, version
end

local function bump_friend_request_rate(user_id, doc, version)
  local day = string.sub(iso_now(), 1, 10)
  if doc.day ~= day then
    doc.day = day
    doc.count = 0
  end
  doc.count = (tonumber(doc.count) or 0) + 1
  doc.last_at = time.unix()
  write_rate(user_id, doc, version)
end

local function selected_character_summary(user_id)
  local profile = auth.read_profile(user_id)
  if profile == nil then
    return { character_id = "", character_name = "", display_name = "" }
  end
  return {
    character_id = profile.selected_character_id or "",
    character_name = "",
    display_name = profile.display_name or "",
  }
end

local function build_social_state(user_id)
  local friends = list_friends_by_state(user_id, STATE_FRIEND, cfg_int("maximum_friends", 200))
  local outgoing = list_friends_by_state(user_id, STATE_OUTGOING, cfg_int("maximum_pending_outgoing_requests", 50))
  local incoming = list_friends_by_state(user_id, STATE_INCOMING, cfg_int("maximum_pending_incoming_requests", 50))
  local blocked = list_friends_by_state(user_id, STATE_BLOCKED, 100)
  local self_profile = selected_character_summary(user_id)
  return {
    ownership = "account",
    self = {
      user_id = user_id,
      display_name = self_profile.display_name,
      selected_character_id = self_profile.character_id,
    },
    friends = friends or validation.empty_array(),
    outgoing_requests = outgoing or validation.empty_array(),
    incoming_requests = incoming or validation.empty_array(),
    blocks = blocked or validation.empty_array(),
    limits = {
      maximum_friends = cfg_int("maximum_friends", 200),
      maximum_pending_outgoing = cfg_int("maximum_pending_outgoing_requests", 50),
      maximum_pending_incoming = cfg_int("maximum_pending_incoming_requests", 50),
    },
  }
end

---------------------------------------------------------------------------
-- RPCs
---------------------------------------------------------------------------

local function rpc_social_get_state(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("friends_enabled", context) then
    return encode_fail("Friends are disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {})
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  return responses.ok(build_social_state(user_id))
end

local function rpc_friend_request_send(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("friends_enabled", context) then
    return encode_fail("Friends are disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    target_user_id = true, request_id = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end
  local target, terr = validation.require_string(body.target_user_id, "target_user_id", 64)
  if terr ~= nil then
    return encode_fail(terr, 400)
  end
  if target == user_id then
    return encode_fail("Cannot friend yourself", 400)
  end
  if not user_exists(target) then
    return encode_fail("Target user not found", 404)
  end

  local existing_tx, _ = storage.read_one(user_id, TX_COLLECTION, body.request_id)
  if existing_tx ~= nil and existing_tx.type == "friend_request_send" then
    if existing_tx.target_user_id ~= target then
      return encode_fail("Conflicting reuse of request_id", 409)
    end
    if type(existing_tx.result) == "table" then
      return responses.ok(existing_tx.result)
    end
  end

  local rel = find_relationship(user_id, target)
  if rel == "friends" then
    return encode_fail("Already friends", 409)
  end
  if rel == "outgoing_request" then
    return encode_fail("Friend request already sent", 409)
  end
  if rel == "incoming_request" then
    return encode_fail("Incoming request already pending — accept instead", 409)
  end
  if is_blocked_either_way(user_id, target) then
    return encode_fail("Cannot send friend request while blocked", 403)
  end

  local ok_lim, doc_or_err, ver = check_friend_request_limits(user_id)
  if not ok_lim then
    return encode_fail(doc_or_err, ver)
  end

  local friends = list_friends_by_state(user_id, STATE_FRIEND, 200)
  if friends and #friends >= cfg_int("maximum_friends", 200) then
    return encode_fail("Friend list is full", 429)
  end
  local outgoing = list_friends_by_state(user_id, STATE_OUTGOING, 100)
  if outgoing and #outgoing >= cfg_int("maximum_pending_outgoing_requests", 50) then
    return encode_fail("Too many outgoing friend requests", 429)
  end

  local username = username_of(user_id) or ""
  local err = nk.friends_add(user_id, username, { target }, nil)
  if err ~= nil then
    logging.error("social", "friend_request_send", { error = tostring(err) })
    return encode_fail("Failed to send friend request", 500)
  end
  bump_friend_request_rate(user_id, doc_or_err, ver)

  local result = {
    relationship = "outgoing_request",
    target_user_id = target,
    state = build_social_state(user_id),
  }
  storage.write_one(user_id, TX_COLLECTION, body.request_id, {
    type = "friend_request_send",
    target_user_id = target,
    result = result,
    status = "completed",
    created_at = iso_now(),
  }, nil, 1, 0)

  logging.info("social", "friend_request_send", { user_id = user_id, target = target, ok = true })
  return responses.ok(result)
end

local function rpc_friend_request_accept(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("friends_enabled", context) then
    return encode_fail("Friends are disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    target_user_id = true, request_id = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end
  local target, terr = validation.require_string(body.target_user_id, "target_user_id", 64)
  if terr ~= nil then
    return encode_fail(terr, 400)
  end

  local existing_tx = storage.read_one(user_id, TX_COLLECTION, body.request_id)
  if existing_tx ~= nil and existing_tx.type == "friend_request_accept" then
    if existing_tx.target_user_id ~= target then
      return encode_fail("Conflicting reuse of request_id", 409)
    end
    if type(existing_tx.result) == "table" then
      return responses.ok(existing_tx.result)
    end
  end

  local rel = find_relationship(user_id, target)
  if rel == "friends" then
    local result = { relationship = "friends", target_user_id = target, state = build_social_state(user_id), replay = true }
    return responses.ok(result)
  end
  if rel ~= "incoming_request" then
    return encode_fail("No incoming friend request from this user", 404)
  end
  if is_blocked_either_way(user_id, target) then
    return encode_fail("Cannot accept while blocked", 403)
  end

  local username = username_of(user_id) or ""
  -- Adding back confirms the friendship in Nakama.
  local err = nk.friends_add(user_id, username, { target }, nil)
  if err ~= nil then
    return encode_fail("Failed to accept friend request", 500)
  end

  local result = {
    relationship = "friends",
    target_user_id = target,
    state = build_social_state(user_id),
  }
  storage.write_one(user_id, TX_COLLECTION, body.request_id, {
    type = "friend_request_accept",
    target_user_id = target,
    result = result,
    status = "completed",
    created_at = iso_now(),
  }, nil, 1, 0)
  return responses.ok(result)
end

local function rpc_friend_request_decline(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("friends_enabled", context) then
    return encode_fail("Friends are disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    target_user_id = true, request_id = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end
  local target, terr = validation.require_string(body.target_user_id, "target_user_id", 64)
  if terr ~= nil then
    return encode_fail(terr, 400)
  end

  local existing_tx = storage.read_one(user_id, TX_COLLECTION, body.request_id)
  if existing_tx ~= nil and existing_tx.type == "friend_request_decline" then
    if existing_tx.target_user_id ~= target then
      return encode_fail("Conflicting reuse of request_id", 409)
    end
    if type(existing_tx.result) == "table" then
      return responses.ok(existing_tx.result)
    end
  end

  local rel = find_relationship(user_id, target)
  if rel ~= "incoming_request" and rel ~= "none" then
    if rel == "friends" then
      return encode_fail("Already friends — use friend_remove", 409)
    end
  end

  local username = username_of(user_id) or ""
  -- Delete removes pending invite.
  nk.friends_delete(user_id, username, { target }, nil)

  local result = {
    relationship = "none",
    target_user_id = target,
    state = build_social_state(user_id),
  }
  storage.write_one(user_id, TX_COLLECTION, body.request_id, {
    type = "friend_request_decline",
    target_user_id = target,
    result = result,
    status = "completed",
    created_at = iso_now(),
  }, nil, 1, 0)
  return responses.ok(result)
end

local function rpc_friend_remove(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("friends_enabled", context) then
    return encode_fail("Friends are disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    target_user_id = true, request_id = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end
  local target, terr = validation.require_string(body.target_user_id, "target_user_id", 64)
  if terr ~= nil then
    return encode_fail(terr, 400)
  end

  local existing_tx = storage.read_one(user_id, TX_COLLECTION, body.request_id)
  if existing_tx ~= nil and existing_tx.type == "friend_remove" then
    if existing_tx.target_user_id ~= target then
      return encode_fail("Conflicting reuse of request_id", 409)
    end
    if type(existing_tx.result) == "table" then
      return responses.ok(existing_tx.result)
    end
  end

  local username = username_of(user_id) or ""
  nk.friends_delete(user_id, username, { target }, nil)

  local result = {
    relationship = find_relationship(user_id, target),
    target_user_id = target,
    state = build_social_state(user_id),
  }
  storage.write_one(user_id, TX_COLLECTION, body.request_id, {
    type = "friend_remove",
    target_user_id = target,
    result = result,
    status = "completed",
    created_at = iso_now(),
  }, nil, 1, 0)
  return responses.ok(result)
end

local function rpc_user_block(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("user_blocking_enabled", context) then
    return encode_fail("Blocking is disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    target_user_id = true, request_id = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end
  local target, terr = validation.require_string(body.target_user_id, "target_user_id", 64)
  if terr ~= nil then
    return encode_fail(terr, 400)
  end
  if target == user_id then
    return encode_fail("Cannot block yourself", 400)
  end
  if not user_exists(target) then
    return encode_fail("Target user not found", 404)
  end

  local existing_tx = storage.read_one(user_id, TX_COLLECTION, body.request_id)
  if existing_tx ~= nil and existing_tx.type == "user_block" then
    if existing_tx.target_user_id ~= target then
      return encode_fail("Conflicting reuse of request_id", 409)
    end
    if type(existing_tx.result) == "table" then
      return responses.ok(existing_tx.result)
    end
  end

  local username = username_of(user_id) or ""
  -- Block replaces friendship / pending invites in Nakama.
  local err = nk.friends_block(user_id, username, { target }, nil)
  if err ~= nil then
    return encode_fail("Failed to block user", 500)
  end

  local result = {
    relationship = "blocked",
    target_user_id = target,
    state = build_social_state(user_id),
  }
  storage.write_one(user_id, TX_COLLECTION, body.request_id, {
    type = "user_block",
    target_user_id = target,
    result = result,
    status = "completed",
    created_at = iso_now(),
  }, nil, 1, 0)
  return responses.ok(result)
end

local function rpc_user_unblock(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("user_blocking_enabled", context) then
    return encode_fail("Blocking is disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {
    target_user_id = true, request_id = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end
  local target, terr = validation.require_string(body.target_user_id, "target_user_id", 64)
  if terr ~= nil then
    return encode_fail(terr, 400)
  end

  local existing_tx = storage.read_one(user_id, TX_COLLECTION, body.request_id)
  if existing_tx ~= nil and existing_tx.type == "user_unblock" then
    if existing_tx.target_user_id ~= target then
      return encode_fail("Conflicting reuse of request_id", 409)
    end
    if type(existing_tx.result) == "table" then
      return responses.ok(existing_tx.result)
    end
  end

  local username = username_of(user_id) or ""
  -- Unblock = delete block relationship; does NOT restore friendship.
  nk.friends_delete(user_id, username, { target }, nil)

  local result = {
    relationship = "none",
    target_user_id = target,
    friendship_restored = false,
    state = build_social_state(user_id),
  }
  storage.write_one(user_id, TX_COLLECTION, body.request_id, {
    type = "user_unblock",
    target_user_id = target,
    result = result,
    status = "completed",
    created_at = iso_now(),
  }, nil, 1, 0)
  return responses.ok(result)
end

local function rpc_block_list_get(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("user_blocking_enabled", context) then
    return encode_fail("Blocking is disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, {})
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local blocked = list_friends_by_state(user_id, STATE_BLOCKED, 100)
  return responses.ok({ blocks = blocked or validation.empty_array() })
end

nk.register_rpc(rpc_social_get_state, "social_get_state")
nk.register_rpc(rpc_friend_request_send, "friend_request_send")
nk.register_rpc(rpc_friend_request_accept, "friend_request_accept")
nk.register_rpc(rpc_friend_request_decline, "friend_request_decline")
nk.register_rpc(rpc_friend_remove, "friend_remove")
nk.register_rpc(rpc_user_block, "user_block")
nk.register_rpc(rpc_user_unblock, "user_unblock")
nk.register_rpc(rpc_block_list_get, "block_list_get")
nk.logger_info("Phase 19 social RPCs registered")

return {
  is_blocked_either_way = is_blocked_either_way,
  find_relationship = find_relationship,
  STATE_FRIEND = STATE_FRIEND,
  STATE_BLOCKED = STATE_BLOCKED,
}
