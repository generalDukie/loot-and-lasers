--[[
  Phase 19 — Chat foundation (Nakama Lua).

  Global room + direct messages via native channel APIs.
  Public RPCs:
    chat_get_global_history, chat_get_dm_history, chat_mark_read,
    chat_send_global, chat_send_dm

  Sender identity and timestamps are always server-derived.
  Blocked accounts cannot DM each other (checked both directions).
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
local social = require("social")

local READ_COLLECTION = "chat_read_state"
local RATE_COLLECTION = "chat_rate_limits"
local TX_COLLECTION = "chat_transactions"
local CHANNEL_ROOM = 1
local CHANNEL_DIRECT = 2
local GLOBAL_ROOM = "global"

-- Minimal server denylist (not comprehensive). RemoteConfig may extend later.
local DEFAULT_BLOCKED_TERMS = {
  "nigg", "faggot", "childporn", "cporn",
}

local function feature_on(flag_id, context)
  local flag = remote_config.get_feature_flag(flag_id, context)
  if flag == nil then
    return true
  end
  return flag.enabled == true
end

local function cfg_int(key, default)
  local v = remote_config.get_config_value("chat", key)
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
    return "player", ""
  end
  return accounts[1].username or "player", accounts[1].display_name or ""
end

--- Deterministic conversation id (order-independent).
local function conversation_id(user_a, user_b)
  if tostring(user_a) < tostring(user_b) then
    return tostring(user_a) .. ":" .. tostring(user_b)
  end
  return tostring(user_b) .. ":" .. tostring(user_a)
end

local function global_channel_id()
  local id, err = nk.channel_id_build("", GLOBAL_ROOM, CHANNEL_ROOM)
  if err ~= nil then
    return nil, err
  end
  return id, nil
end

local function dm_channel_id(user_a, user_b)
  -- Build from lexicographically smaller as sender for stability.
  local a, b = user_a, user_b
  if tostring(b) < tostring(a) then
    a, b = b, a
  end
  local id, err = nk.channel_id_build(a, b, CHANNEL_DIRECT)
  if err ~= nil then
    return nil, err
  end
  return id, nil
end

local function validate_content(content)
  if type(content) ~= "string" then
    return nil, "content must be a string"
  end
  local text = content:match("^%s*(.-)%s*$") or ""
  if text == "" then
    return nil, "Message cannot be empty"
  end
  if string.find(text, "\0", 1, true) then
    return nil, "Message contains invalid characters"
  end
  local max_len = cfg_int("maximum_message_length", 280)
  if #text > max_len then
    return nil, "Message exceeds maximum length"
  end
  -- Control-char abuse (allow tab/newline lightly — strip most C0)
  if string.find(text, "[%z\1-\8\11\12\14-\31]") then
    return nil, "Message contains invalid control characters"
  end
  local lower = string.lower(text)
  for i = 1, #DEFAULT_BLOCKED_TERMS do
    if string.find(lower, DEFAULT_BLOCKED_TERMS[i], 1, true) then
      return nil, "Message rejected by content filter"
    end
  end
  return text, nil
end

local function read_rate(user_id, key)
  local value, version, found = storage.read_one(user_id, RATE_COLLECTION, key)
  if not found then
    return { window_start = 0, count = 0, last_content = "", last_at = 0, dup_count = 0 }, nil
  end
  return value, version
end

local function write_rate(user_id, key, doc, version)
  return storage.write_one(user_id, RATE_COLLECTION, key, doc, version, 1, 0)
end

local function check_rate(user_id, key, limit_per_10s)
  local doc, version = read_rate(user_id, key)
  local now = time.unix()
  local window = 10
  if (tonumber(doc.window_start) or 0) + window <= now then
    doc.window_start = now
    doc.count = 0
  end
  local min_interval = cfg_int("minimum_message_interval_ms", 500)
  if (now * 1000) - ((tonumber(doc.last_at) or 0) * 1000) < min_interval then
    -- last_at stored as unix seconds; approximate
    if (tonumber(doc.last_at) or 0) + 1 > now and (tonumber(doc.count) or 0) > 0 then
      return false, "Sending too quickly", 429, doc, version
    end
  end
  if (tonumber(doc.count) or 0) >= limit_per_10s then
    return false, "Rate limit exceeded", 429, doc, version
  end
  return true, nil, nil, doc, version
end

local function check_duplicate(doc, content)
  local window = cfg_int("duplicate_message_window_seconds", 30)
  local max_dups = cfg_int("duplicate_message_limit", 2)
  local now = time.unix()
  if doc.last_content == content and (now - (tonumber(doc.last_at) or 0)) <= window then
    local d = (tonumber(doc.dup_count) or 0) + 1
    if d >= max_dups then
      return false, "Duplicate message rejected"
    end
    doc.dup_count = d
  else
    doc.dup_count = 0
  end
  return true, nil
end

local function bump_rate(user_id, key, doc, version, content)
  doc.count = (tonumber(doc.count) or 0) + 1
  doc.last_at = time.unix()
  doc.last_content = content
  write_rate(user_id, key, doc, version)
end

local function sender_profile(user_id)
  local username, display_name = username_of(user_id)
  local profile = auth.read_profile(user_id)
  local character_id = ""
  local account_display = display_name
  if profile ~= nil then
    character_id = profile.selected_character_id or ""
    if type(profile.display_name) == "string" and profile.display_name ~= "" then
      account_display = profile.display_name
    end
  end
  return {
    sender_user_id = user_id,
    sender_username = username,
    sender_display_name = account_display,
    sender_character_id = character_id,
    sender_character_name = account_display,
    sender_avatar_id = "",
  }
end

local function public_message(msg, channel_label, conversation)
  local content = msg.content
  if type(content) == "string" then
    local ok, decoded = pcall(nk.json_decode, content)
    if ok and type(decoded) == "table" then
      content = decoded
    else
      content = { text = msg.content }
    end
  end
  if type(content) ~= "table" then
    content = { text = tostring(msg.content or "") }
  end
  return {
    message_id = msg.message_id or msg.messageId or "",
    channel_id = channel_label or msg.channel_id or "",
    conversation_id = conversation or "",
    sender_user_id = msg.sender_id or msg.senderId or "",
    sender_display_name = (content.sender_display_name or msg.username or ""),
    sender_character_id = content.sender_character_id or "",
    sender_character_name = content.sender_character_name or content.sender_display_name or "",
    sender_avatar_id = content.sender_avatar_id or "",
    content = content.text or content.message or "",
    created_at = msg.create_time or msg.createTime or "",
    edited = false,
    moderation_state = "visible",
  }
end

local function list_messages(channel_id, limit, cursor, channel_label, conversation)
  local msgs, next_cursor, err = nk.channel_messages_list(channel_id, limit, false, cursor or "")
  if err ~= nil then
    return nil, nil, err
  end
  local out = validation.empty_array()
  if msgs ~= nil then
    -- list newest-first when forward=false; reverse for chronological UI
    for i = #msgs, 1, -1 do
      table.insert(out, public_message(msgs[i], channel_label, conversation))
    end
  end
  return out, next_cursor or "", nil
end

---------------------------------------------------------------------------
-- RPCs
---------------------------------------------------------------------------

local function rpc_chat_get_global_history(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("global_chat_enabled", context) then
    return encode_fail("Global chat is disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  local unknown = validation.reject_unknown_keys(body, { limit = true, cursor = true })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local max_page = cfg_int("global_history_page_size", 50)
  local hard_max = cfg_int("history_absolute_max", 100)
  local limit = tonumber(body.limit) or max_page
  if limit < 1 then
    limit = 1
  end
  if limit > hard_max then
    limit = hard_max
  end
  if limit > max_page then
    limit = max_page
  end
  local channel_id, cerr = global_channel_id()
  if cerr ~= nil then
    return encode_fail("Failed to resolve global channel", 500)
  end
  local messages, next_cursor, err = list_messages(channel_id, limit, body.cursor, "global", "")
  if err ~= nil then
    return encode_fail("Failed to load history", 500)
  end
  return responses.ok({
    messages = messages,
    next_cursor = next_cursor,
    has_more = next_cursor ~= nil and next_cursor ~= "",
    channel_id = "global",
  })
end

local function rpc_chat_get_dm_history(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("direct_messages_enabled", context) then
    return encode_fail("Direct messages are disabled", 403)
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
    target_user_id = true, limit = true, cursor = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local target, terr = validation.require_string(body.target_user_id, "target_user_id", 64)
  if terr ~= nil then
    return encode_fail(terr, 400)
  end
  if target == user_id then
    return encode_fail("Cannot open DM with yourself", 400)
  end
  if social.is_blocked_either_way(user_id, target) then
    return encode_fail("Cannot load DMs while blocked", 403)
  end
  local max_page = cfg_int("dm_history_page_size", 50)
  local hard_max = cfg_int("history_absolute_max", 100)
  local limit = tonumber(body.limit) or max_page
  if limit < 1 then
    limit = 1
  end
  if limit > hard_max then
    limit = hard_max
  end
  if limit > max_page then
    limit = max_page
  end
  local channel_id, cerr = dm_channel_id(user_id, target)
  if cerr ~= nil then
    return encode_fail("Failed to resolve DM channel", 500)
  end
  local conv = conversation_id(user_id, target)
  local messages, next_cursor, err = list_messages(channel_id, limit, body.cursor, channel_id, conv)
  if err ~= nil then
    return encode_fail("Failed to load DM history", 500)
  end
  return responses.ok({
    messages = messages,
    next_cursor = next_cursor,
    has_more = next_cursor ~= nil and next_cursor ~= "",
    conversation_id = conv,
    target_user_id = target,
  })
end

local function rpc_chat_mark_read(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("direct_messages_enabled", context) then
    return encode_fail("Direct messages are disabled", 403)
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
    target_user_id = true,
    last_read_message_id = true,
    request_id = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local target, terr = validation.require_string(body.target_user_id, "target_user_id", 64)
  if terr ~= nil then
    return encode_fail(terr, 400)
  end
  if target == user_id then
    return encode_fail("Invalid conversation", 400)
  end
  local conv = conversation_id(user_id, target)
  local key = conv
  local existing, version = storage.read_one(user_id, READ_COLLECTION, key)
  local doc = {
    conversation_id = conv,
    peer_user_id = target,
    last_read_message_id = tostring(body.last_read_message_id or ""),
    last_read_at = iso_now(),
    unread_count = 0,
    owner_user_id = user_id,
  }
  if existing ~= nil and existing.last_read_message_id == doc.last_read_message_id then
    return responses.ok({ read_state = existing, replay = true })
  end
  storage.write_one(user_id, READ_COLLECTION, key, doc, version, 1, 0)
  return responses.ok({ read_state = doc, replay = false })
end

local function build_message_content(user_id, text)
  local profile = sender_profile(user_id)
  return {
    text = text,
    sender_display_name = profile.sender_display_name,
    sender_character_id = profile.sender_character_id,
    sender_character_name = profile.sender_character_name,
    sender_avatar_id = profile.sender_avatar_id,
  }
end

local function rpc_chat_send_global(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("global_chat_enabled", context) then
    return encode_fail("Global chat is disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  -- Reject client-authored identity/timestamp fields
  for _, k in ipairs({
    "sender_user_id", "sender_display_name", "sender_avatar", "created_at",
    "timestamp", "message_id", "username",
  }) do
    if body[k] ~= nil then
      return encode_fail("Client may not submit authoritative field: " .. k, 400)
    end
  end
  local unknown = validation.reject_unknown_keys(body, {
    content = true, request_id = true,
  })
  if unknown ~= nil then
    return encode_fail(unknown, 400)
  end
  local tid_err = transactions.validate_transaction_id(body.request_id)
  if tid_err ~= nil then
    return encode_fail(tid_err, 400)
  end
  local text, verr = validate_content(body.content)
  if verr ~= nil then
    return encode_fail(verr, 400)
  end

  local existing = storage.read_one(user_id, TX_COLLECTION, body.request_id)
  if existing ~= nil and existing.type == "chat_send_global" and type(existing.result) == "table" then
    return responses.ok(existing.result)
  end

  local ok_rate, rerr, rstatus, doc, version = check_rate(user_id, "global", cfg_int("global_rate_limit", 8))
  if not ok_rate then
    return encode_fail(rerr, rstatus)
  end
  local ok_dup, derr = check_duplicate(doc, text)
  if not ok_dup then
    return encode_fail(derr, 429)
  end

  local channel_id, cerr = global_channel_id()
  if cerr ~= nil then
    return encode_fail("Failed to resolve global channel", 500)
  end
  local username = username_of(user_id)
  local content = build_message_content(user_id, text)
  local ack, err = nk.channel_message_send(channel_id, content, user_id, username, true)
  if err ~= nil then
    logging.error("chat", "chat_send_global", { error = tostring(err) })
    return encode_fail("Failed to send message", 500)
  end
  bump_rate(user_id, "global", doc, version, text)

  local profile = sender_profile(user_id)
  local result = {
    message = {
      message_id = ack.message_id or ack.messageId or "",
      channel_id = "global",
      sender_user_id = user_id,
      sender_display_name = profile.sender_display_name,
      sender_character_id = profile.sender_character_id,
      sender_character_name = profile.sender_character_name,
      sender_avatar_id = "",
      content = text,
      created_at = ack.create_time or ack.createTime or iso_now(),
      edited = false,
      moderation_state = "visible",
    },
  }
  storage.write_one(user_id, TX_COLLECTION, body.request_id, {
    type = "chat_send_global",
    result = result,
    status = "completed",
    created_at = iso_now(),
  }, nil, 1, 0)
  return responses.ok(result)
end

local function rpc_chat_send_dm(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("direct_messages_enabled", context) then
    return encode_fail("Direct messages are disabled", 403)
  end
  local body = decode_payload(payload)
  if body == nil then
    return encode_fail("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return encode_fail(forbid, 400)
  end
  for _, k in ipairs({
    "sender_user_id", "sender_display_name", "sender_avatar", "created_at",
    "timestamp", "message_id", "username",
  }) do
    if body[k] ~= nil then
      return encode_fail("Client may not submit authoritative field: " .. k, 400)
    end
  end
  local unknown = validation.reject_unknown_keys(body, {
    target_user_id = true, content = true, request_id = true,
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
    return encode_fail("Cannot DM yourself", 400)
  end
  local text, verr = validate_content(body.content)
  if verr ~= nil then
    return encode_fail(verr, 400)
  end
  if social.is_blocked_either_way(user_id, target) then
    return encode_fail("Cannot DM while blocked", 403)
  end

  local existing = storage.read_one(user_id, TX_COLLECTION, body.request_id)
  if existing ~= nil and existing.type == "chat_send_dm" then
    if existing.target_user_id ~= target then
      return encode_fail("Conflicting reuse of request_id", 409)
    end
    if type(existing.result) == "table" then
      return responses.ok(existing.result)
    end
  end

  local ok_rate, rerr, rstatus, doc, version = check_rate(user_id, "dm", cfg_int("dm_rate_limit", 10))
  if not ok_rate then
    return encode_fail(rerr, rstatus)
  end
  local ok_dup, derr = check_duplicate(doc, text)
  if not ok_dup then
    return encode_fail(derr, 429)
  end

  local channel_id, cerr = dm_channel_id(user_id, target)
  if cerr ~= nil then
    return encode_fail("Failed to resolve DM channel", 500)
  end
  local username = username_of(user_id)
  local content = build_message_content(user_id, text)
  local ack, err = nk.channel_message_send(channel_id, content, user_id, username, true)
  if err ~= nil then
    logging.error("chat", "chat_send_dm", { error = tostring(err) })
    return encode_fail("Failed to send DM", 500)
  end
  bump_rate(user_id, "dm", doc, version, text)

  -- Increment peer unread (best-effort)
  local conv = conversation_id(user_id, target)
  local peer_read, peer_ver = storage.read_one(target, READ_COLLECTION, conv)
  local unread = 1
  if peer_read ~= nil then
    unread = (tonumber(peer_read.unread_count) or 0) + 1
  end
  storage.write_one(target, READ_COLLECTION, conv, {
    conversation_id = conv,
    peer_user_id = user_id,
    last_read_message_id = peer_read and peer_read.last_read_message_id or "",
    last_read_at = peer_read and peer_read.last_read_at or "",
    unread_count = unread,
    owner_user_id = target,
    updated_at = iso_now(),
  }, peer_ver, 1, 0)

  local profile = sender_profile(user_id)
  local result = {
    message = {
      message_id = ack.message_id or ack.messageId or "",
      channel_id = channel_id,
      conversation_id = conv,
      sender_user_id = user_id,
      sender_display_name = profile.sender_display_name,
      sender_character_id = profile.sender_character_id,
      sender_character_name = profile.sender_character_name,
      sender_avatar_id = "",
      content = text,
      created_at = ack.create_time or ack.createTime or iso_now(),
      edited = false,
      moderation_state = "visible",
    },
    conversation_id = conv,
    target_user_id = target,
  }
  storage.write_one(user_id, TX_COLLECTION, body.request_id, {
    type = "chat_send_dm",
    target_user_id = target,
    result = result,
    status = "completed",
    created_at = iso_now(),
  }, nil, 1, 0)
  return responses.ok(result)
end

nk.register_rpc(rpc_chat_get_global_history, "chat_get_global_history")
nk.register_rpc(rpc_chat_get_dm_history, "chat_get_dm_history")
nk.register_rpc(rpc_chat_mark_read, "chat_mark_read")
nk.register_rpc(rpc_chat_send_global, "chat_send_global")
nk.register_rpc(rpc_chat_send_dm, "chat_send_dm")
nk.logger_info("Phase 19 chat RPCs registered")

return {
  conversation_id = conversation_id,
  validate_content = validate_content,
}
