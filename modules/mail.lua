--[[
  Phase 20 — Server-authoritative mail system (Nakama Lua).

  Public RPCs:
    mail_get_inbox, mail_get_message, mail_mark_read, mail_mark_unread,
    mail_delete, mail_claim_attachments, mail_send_player_text,
    mail_get_unread_count

  Internal (not registered):
    create_system_mail, create_player_text_mail, claim_mail_attachments_internal

  Ownership: account-level inbox (recipient_user_id). Optional target_character_id
  for item attachment claims. Player mail is text-only (no attachments).
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
local social = require("social")

local MAIL_COLLECTION = "mail_messages"
local SENT_COLLECTION = "mail_sent"
local INDEX_COLLECTION = "mail_indexes"
local TX_COLLECTION = "mail_transactions"
local RATE_COLLECTION = "mail_rate_limits"
local META_KEY = "meta"
local MAIL_VERSION = 1
local NOTIFY_CODE_NEW_MAIL = 20
local DEV_ENV_FLAG = "LOOT_DEV_MAIL_TEST"

local MAIL_TYPES = {
  player_text = true,
  system = true,
  reward = true,
  moderation = true,
  announcement = true,
}

local SYSTEM_TYPES = {
  system = true,
  reward = true,
  moderation = true,
  announcement = true,
}

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
  local v = remote_config.get_config_value("mail", key)
  local n = tonumber(v)
  if n == nil then
    return default
  end
  return math.floor(n)
end

local function cfg_bool(key, default)
  local v = remote_config.get_config_value("mail", key)
  if v == nil then
    return default
  end
  return v == true
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

local function sender_display(user_id)
  local username, display_name = username_of(user_id)
  local profile = auth.read_profile(user_id)
  local character_id = ""
  if profile ~= nil and type(profile.selected_character_id) == "string" then
    character_id = profile.selected_character_id
  end
  local name = display_name
  if name == nil or name == "" then
    name = username
  end
  return {
    sender_type = "player",
    sender_user_id = user_id,
    display_name = name,
    character_id = character_id,
  }
end

local function retention_days_for_type(mail_type)
  if mail_type == "player_text" then
    return cfg_int("player_text_mail_retention_days", 90)
  end
  if mail_type == "reward" then
    return cfg_int("reward_mail_retention_days", 365)
  end
  return cfg_int("system_mail_retention_days", 365)
end

local function expires_at_for(mail_type)
  local days = retention_days_for_type(mail_type)
  return time.iso_utc(time.unix() + (days * 86400))
end

local function parse_iso_unix(iso)
  if type(iso) ~= "string" or iso == "" then
    return nil
  end
  local y, mo, d, h, mi, s = string.match(iso, "^(%d+)%-(%d+)%-(%d+)T(%d+):(%d+):(%d+)")
  if y == nil then
    return nil
  end
  return os.time({
    year = tonumber(y),
    month = tonumber(mo),
    day = tonumber(d),
    hour = tonumber(h),
    min = tonumber(mi),
    sec = tonumber(s),
    isdst = false,
  })
end

local function is_mail_expired(doc)
  if type(doc) ~= "table" then
    return true
  end
  local exp = parse_iso_unix(doc.expires_at)
  if exp == nil then
    return false
  end
  return time.unix() >= exp
end

local function read_meta(user_id)
  local value, version, found = storage.read_one(user_id, INDEX_COLLECTION, META_KEY)
  if not found then
    return { unread_count = 0, revision = 1 }, nil
  end
  return value, version
end

local function write_meta(user_id, meta, version)
  return storage.write_one(user_id, INDEX_COLLECTION, META_KEY, meta, version, 1, 0)
end

local function adjust_unread(user_id, delta)
  if delta == 0 then
    return
  end
  local meta, version = read_meta(user_id)
  local n = tonumber(meta.unread_count) or 0
  n = n + delta
  if n < 0 then
    n = 0
  end
  meta.unread_count = n
  meta.updated_at = iso_now()
  write_meta(user_id, meta, version)
  return n
end

local function get_unread_count(user_id)
  local meta = read_meta(user_id)
  return tonumber(meta.unread_count) or 0
end

local function validate_text_field(text, field_name, max_len, allow_empty)
  if type(text) ~= "string" then
    return nil, field_name .. " must be a string"
  end
  local trimmed = text:match("^%s*(.-)%s*$") or ""
  if trimmed == "" and not allow_empty then
    return nil, field_name .. " cannot be empty"
  end
  if string.find(trimmed, "\0", 1, true) then
    return nil, field_name .. " contains invalid characters"
  end
  if string.find(trimmed, "[%z\1-\8\11\12\14-\31]") then
    return nil, field_name .. " contains invalid control characters"
  end
  if #trimmed > max_len then
    return nil, field_name .. " exceeds maximum length"
  end
  local lower = string.lower(trimmed)
  for i = 1, #DEFAULT_BLOCKED_TERMS do
    if string.find(lower, DEFAULT_BLOCKED_TERMS[i], 1, true) then
      return nil, field_name .. " rejected by content filter"
    end
  end
  return trimmed, nil
end

local function validate_attachments(attachments)
  if attachments == nil then
    return validation.empty_array(), nil
  end
  if type(attachments) ~= "table" then
    return nil, "attachments must be an array"
  end
  local out = validation.empty_array()
  for i = 1, #attachments do
    local a = attachments[i]
    if type(a) ~= "table" then
      return nil, "attachment " .. tostring(i) .. " invalid"
    end
    local atype = a.type
    if atype ~= "currency" and atype ~= "item" then
      return nil, "unsupported attachment type"
    end
    local aid = a.attachment_id
    if type(aid) ~= "string" or aid == "" then
      aid = ids.uuid()
    end
    if atype == "currency" then
      if a.currency_id ~= "stardust" then
        return nil, "only soft currency attachments allowed"
      end
      local amount = tonumber(a.amount)
      if amount == nil or amount ~= math.floor(amount) or amount <= 0 then
        return nil, "invalid currency amount"
      end
      if amount > 1000000000 then
        return nil, "currency amount too large"
      end
      table.insert(out, {
        attachment_id = aid,
        type = "currency",
        status = "unclaimed",
        currency_id = "stardust",
        amount = amount,
        claimed_at = "",
      })
    else
      local item_defs = require("data.item_definitions")
      local def = item_defs.get(a.item_id)
      if def == nil or def.enabled ~= true then
        return nil, "unknown item attachment"
      end
      if type(a.instance_id) ~= "string" or a.instance_id == "" then
        return nil, "item attachment requires instance_id"
      end
      local quantity = tonumber(a.quantity) or 1
      if quantity ~= math.floor(quantity) or quantity < 1 then
        return nil, "invalid item quantity"
      end
      local metadata = a.metadata
      if type(metadata) ~= "table" then
        metadata = { type = def.type or "weapon" }
      end
      if type(metadata.type) ~= "string" or metadata.type == "" then
        metadata.type = def.type or "weapon"
      end
      table.insert(out, {
        attachment_id = aid,
        type = "item",
        status = "unclaimed",
        item_id = a.item_id,
        instance_id = a.instance_id,
        quantity = quantity,
        metadata = metadata,
        claimed_at = "",
      })
    end
  end
  return out, nil
end

local function has_unclaimed(attachments)
  if type(attachments) ~= "table" then
    return false
  end
  for i = 1, #attachments do
    local a = attachments[i]
    if type(a) == "table" and a.status == "unclaimed" then
      return true
    end
  end
  return false
end

local function mailbox_for_type(mail_type)
  if SYSTEM_TYPES[mail_type] == true then
    return "system"
  end
  return "inbox"
end

local function build_mail_document(opts)
  local mail_type = opts.type or "system"
  local attachments = opts.attachments or validation.empty_array()
  local unclaimed = has_unclaimed(attachments)
  local now = iso_now()
  return {
    mail_version = MAIL_VERSION,
    mail_id = opts.mail_id,
    recipient_user_id = opts.recipient_user_id,
    target_character_id = opts.target_character_id or "",
    type = mail_type,
    sender = opts.sender,
    subject = opts.subject,
    body = opts.body,
    attachments = attachments,
    has_unclaimed_attachments = unclaimed,
    read = false,
    archived = false,
    deleted = false,
    mailbox = opts.mailbox or mailbox_for_type(mail_type),
    created_at = now,
    expires_at = opts.expires_at or expires_at_for(mail_type),
    read_at = "",
    claimed_at = "",
    deleted_at = "",
    revision = 1,
    metadata = opts.metadata or {},
  }
end

local function client_safe_mail(doc)
  if type(doc) ~= "table" then
    return {}
  end
  local attachments = validation.empty_array()
  if type(doc.attachments) == "table" then
    for i = 1, #doc.attachments do
      local a = doc.attachments[i]
      if type(a) == "table" then
        local safe = {
          attachment_id = a.attachment_id,
          type = a.type,
          status = a.status,
          claimed_at = a.claimed_at or "",
        }
        if a.type == "currency" then
          safe.currency_id = a.currency_id
          safe.amount = a.amount
        elseif a.type == "item" then
          safe.item_id = a.item_id
          safe.quantity = a.quantity
          -- instance_id exposed after claim for inventory reconcile; pre-claim hide internal ids? Spec allows item_reference.
          safe.instance_id = a.instance_id
        end
        table.insert(attachments, safe)
      end
    end
  end
  local sender = doc.sender or {}
  return {
    mail_id = doc.mail_id,
    type = doc.type,
    sender = {
      sender_type = sender.sender_type or "",
      sender_user_id = sender.sender_user_id or "",
      display_name = sender.display_name or "",
    },
    subject = doc.subject,
    body = doc.body,
    attachments = attachments,
    has_unclaimed_attachments = doc.has_unclaimed_attachments == true,
    read = doc.read == true,
    archived = doc.archived == true,
    deleted = doc.deleted == true,
    mailbox = doc.mailbox or "inbox",
    created_at = doc.created_at,
    expires_at = doc.expires_at,
    read_at = doc.read_at or "",
    claimed_at = doc.claimed_at or "",
    expired = is_mail_expired(doc),
    target_character_id = doc.target_character_id or "",
  }
end

local function build_mail_summary(doc)
  local sender = doc.sender or {}
  local preview = tostring(doc.body or "")
  if #preview > 80 then
    preview = string.sub(preview, 1, 80)
  end
  return {
    mail_id = doc.mail_id,
    type = doc.type,
    sender_display_name = sender.display_name or "",
    subject = doc.subject or "",
    preview = preview,
    read = doc.read == true,
    has_unclaimed_attachments = doc.has_unclaimed_attachments == true,
    created_at = doc.created_at or "",
    expires_at = doc.expires_at or "",
    mailbox = doc.mailbox or "inbox",
    expired = is_mail_expired(doc),
  }
end

local function publish_new_mail_notification(recipient_user_id, doc)
  local sender = doc.sender or {}
  local content = {
    event = "new_mail_received",
    mail_id = doc.mail_id,
    type = doc.type,
    sender_display_name = sender.display_name or "",
    subject = doc.subject or "",
    created_at = doc.created_at or "",
    has_attachments = doc.has_unclaimed_attachments == true,
    unread_count = get_unread_count(recipient_user_id),
  }
  local ok, err = pcall(function()
    nk.notification_send(
      recipient_user_id,
      "new_mail",
      content,
      NOTIFY_CODE_NEW_MAIL,
      "",
      true
    )
  end)
  if not ok then
    logging.error("mail", "publish_new_mail_notification", {
      user_id = recipient_user_id,
      error = tostring(err),
    })
  end
end

local function write_mail(user_id, doc, version)
  return storage.write_one(user_id, MAIL_COLLECTION, doc.mail_id, doc, version, 1, 0)
end

local function read_mail(user_id, mail_id)
  return storage.read_one(user_id, MAIL_COLLECTION, mail_id)
end

--- Trusted internal: create system / reward / moderation / announcement mail.
local function create_system_mail(opts)
  if type(opts) ~= "table" then
    return nil, "opts required"
  end
  local recipient = opts.recipient_user_id
  if type(recipient) ~= "string" or recipient == "" then
    return nil, "recipient_user_id required"
  end
  local accounts = nk.users_get_id({ recipient })
  if accounts == nil or #accounts == 0 then
    return nil, "recipient not found"
  end
  local mail_type = opts.type or "system"
  if SYSTEM_TYPES[mail_type] ~= true then
    return nil, "invalid system mail type"
  end
  if not feature_on("system_mail_enabled", nil) then
    return nil, "system mail disabled"
  end
  local subject, serr = validate_text_field(opts.subject or "System", "subject", cfg_int("maximum_subject_length", 80), false)
  if serr ~= nil then
    return nil, serr
  end
  local body, berr = validate_text_field(opts.body or "", "body", cfg_int("maximum_body_length", 2000), false)
  if berr ~= nil then
    return nil, berr
  end
  local attachments, aerr = validate_attachments(opts.attachments)
  if aerr ~= nil then
    return nil, aerr
  end
  if #attachments > 0 and not feature_on("mail_attachments_enabled", nil) then
    return nil, "mail attachments disabled"
  end
  local mail_id = opts.mail_id
  if type(mail_id) ~= "string" or mail_id == "" then
    mail_id = ids.uuid()
  end
  local sender = opts.sender or {
    sender_type = "system",
    sender_user_id = "",
    display_name = opts.sender_display_name or "Galactic Dispatch",
  }
  local doc = build_mail_document({
    mail_id = mail_id,
    recipient_user_id = recipient,
    target_character_id = opts.target_character_id or "",
    type = mail_type,
    sender = sender,
    subject = subject,
    body = body,
    attachments = attachments,
    mailbox = "system",
    metadata = opts.metadata or {},
  })
  local _, werr = write_mail(recipient, doc, nil)
  if werr ~= nil then
    return nil, tostring(werr)
  end
  adjust_unread(recipient, 1)
  publish_new_mail_notification(recipient, doc)
  logging.info("mail", "create_system_mail", {
    user_id = recipient,
    request_id = mail_id,
    type = mail_type,
  })
  return doc, nil
end

local function create_player_text_mail(sender_user_id, recipient_user_id, subject, body, request_id)
  if sender_user_id == recipient_user_id then
    return nil, "Cannot mail yourself", 400
  end
  local accounts = nk.users_get_id({ recipient_user_id })
  if accounts == nil or #accounts == 0 then
    return nil, "Recipient not found", 404
  end
  if social.is_blocked_either_way(sender_user_id, recipient_user_id) then
    return nil, "Cannot send mail while blocked", 403
  end
  local subj, serr = validate_text_field(subject, "subject", cfg_int("maximum_subject_length", 80), false)
  if serr ~= nil then
    return nil, serr, 400
  end
  local text, berr = validate_text_field(body, "body", cfg_int("maximum_body_length", 2000), false)
  if berr ~= nil then
    return nil, berr, 400
  end

  local mail_id = ids.uuid()
  local sender = sender_display(sender_user_id)
  local doc = build_mail_document({
    mail_id = mail_id,
    recipient_user_id = recipient_user_id,
    type = "player_text",
    sender = sender,
    subject = subj,
    body = text,
    attachments = validation.empty_array(),
    mailbox = "inbox",
    metadata = { request_id = request_id or "" },
  })
  local _, werr = write_mail(recipient_user_id, doc, nil)
  if werr ~= nil then
    return nil, tostring(werr), 500
  end

  -- Sent copy for sender (read, no unread impact).
  local sent = {}
  for k, v in pairs(doc) do
    sent[k] = v
  end
  sent.mailbox = "sent"
  sent.read = true
  sent.read_at = iso_now()
  storage.write_one(sender_user_id, SENT_COLLECTION, mail_id, sent, nil, 1, 0)

  adjust_unread(recipient_user_id, 1)
  publish_new_mail_notification(recipient_user_id, doc)
  return doc, nil, 200
end

local function matches_folder(doc, folder)
  if doc == nil then
    return false
  end
  if folder == "deleted" then
    return doc.deleted == true
  end
  if doc.deleted == true then
    return false
  end
  if folder == "system" then
    return SYSTEM_TYPES[doc.type] == true or doc.mailbox == "system"
  end
  if folder == "inbox" then
    -- Player + non-system mail; system/reward types live under the system folder.
    return SYSTEM_TYPES[doc.type] ~= true
  end
  -- default: all non-deleted
  return true
end

local function list_mails(user_id, collection, limit, cursor)
  local objects, next_cursor, err = nk.storage_list(user_id, collection, limit, cursor or "")
  if err ~= nil then
    return nil, nil, tostring(err)
  end
  if type(objects) ~= "table" then
    objects = {}
  end
  return objects, next_cursor or "", nil
end

local function claim_mail_attachments_internal(user_id, mail_id, character_id, request_id)
  local doc, version, found = read_mail(user_id, mail_id)
  if not found or type(doc) ~= "table" then
    return nil, "Mail not found", 404
  end
  if doc.recipient_user_id ~= user_id then
    return nil, "Forbidden", 403
  end
  if doc.deleted == true then
    return nil, "Mail unavailable", 404
  end
  if is_mail_expired(doc) then
    return nil, "Mail expired", 410
  end
  if doc.has_unclaimed_attachments ~= true or not has_unclaimed(doc.attachments) then
    -- Idempotent: already claimed — return current state
    if doc.claimed_at ~= nil and doc.claimed_at ~= "" then
      return {
        mail = client_safe_mail(doc),
        already_claimed = true,
        reward = nil,
      }, nil, 200
    end
    return nil, "No unclaimed attachments", 400
  end

  -- Build reward entries from stored attachments (server-authoritative).
  local rewards = validation.empty_array()
  local needs_character = false
  for i = 1, #doc.attachments do
    local a = doc.attachments[i]
    if type(a) == "table" and a.status == "unclaimed" then
      if a.type == "currency" then
        table.insert(rewards, {
          type = "currency",
          currency_id = a.currency_id,
          amount = a.amount,
        })
      elseif a.type == "item" then
        needs_character = true
        table.insert(rewards, {
          type = "item",
          item_id = a.item_id,
          instance_id = a.instance_id,
          quantity = a.quantity or 1,
          metadata = a.metadata or { type = "weapon" },
        })
      end
    end
  end

  if needs_character then
    if type(character_id) ~= "string" or character_id == "" then
      return nil, "target_character_id required for item attachments", 400
    end
    local cid, cerr = auth.resolve_character_id(user_id, character_id, false)
    if cerr ~= nil then
      return nil, cerr, 403
    end
    character_id = cid
  else
    character_id = character_id or ""
  end

  local transaction_id = "mail_reward:" .. mail_id
  local tid_err = transactions.validate_transaction_id(transaction_id)
  if tid_err ~= nil then
    return nil, tid_err, 400
  end

  -- Persist claim intent (idempotency by request_id).
  local existing_tx, _, tx_found = storage.read_one(user_id, TX_COLLECTION, request_id)
  if tx_found and type(existing_tx) == "table" then
    if existing_tx.mail_id ~= mail_id then
      return nil, "Conflicting reuse of request_id", 409
    end
    if existing_tx.status == "completed" then
      local fresh = read_mail(user_id, mail_id)
      return {
        mail = client_safe_mail(fresh or doc),
        already_claimed = true,
        reward = existing_tx.reward_result,
      }, nil, 200
    end
  end

  local intent = {
    request_id = request_id,
    mail_id = mail_id,
    transaction_id = transaction_id,
    status = "reward_applying",
    created_at = iso_now(),
  }
  storage.write_one(user_id, TX_COLLECTION, request_id, intent, nil, 1, 0)

  local rewards_mod = require("rewards")
  local bundle = {
    reward_version = 1,
    source_type = "mail",
    source_id = mail_id,
    user_id = user_id,
    character_id = character_id,
    transaction_id = transaction_id,
    reason = "mail_attachment_claim",
    rewards = rewards,
    metadata = { request_id = request_id },
  }
  local result, rerr = rewards_mod.apply_reward_bundle(bundle)
  if rerr ~= nil or (result and result.success ~= true) then
    intent.status = "failed"
    intent.error = tostring(rerr or (result and result.errors and result.errors[1]) or "reward failed")
    intent.updated_at = iso_now()
    storage.write_one(user_id, TX_COLLECTION, request_id, intent, nil, 1, 0)
    -- Do not mark attachments claimed
    local msg = intent.error
    if string.find(string.lower(msg), "inventory full", 1, true) then
      return nil, "Inventory full", 409
    end
    return nil, msg, 422
  end

  local now = iso_now()
  for i = 1, #doc.attachments do
    if type(doc.attachments[i]) == "table" and doc.attachments[i].status == "unclaimed" then
      doc.attachments[i].status = "claimed"
      doc.attachments[i].claimed_at = now
    end
  end
  doc.has_unclaimed_attachments = false
  doc.claimed_at = now
  doc.revision = (tonumber(doc.revision) or 1) + 1
  write_mail(user_id, doc, version)

  intent.status = "completed"
  intent.reward_result = result
  intent.updated_at = now
  storage.write_one(user_id, TX_COLLECTION, request_id, intent, nil, 1, 0)

  return {
    mail = client_safe_mail(doc),
    already_claimed = false,
    reward = result,
  }, nil, 200
end

-- Rate limiting for player mail
local function check_player_mail_rate(user_id)
  local limit = cfg_int("player_mail_rate_limit", 5)
  local daily = cfg_int("player_mail_daily_limit", 50)
  local value, version, found = storage.read_one(user_id, RATE_COLLECTION, "send")
  local now = time.unix()
  local doc = value
  if not found then
    doc = { window_start = now, count = 0, day = "", day_count = 0, last_at = 0, last_hash = "" }
    version = nil
  end
  if (tonumber(doc.window_start) or 0) + 60 <= now then
    doc.window_start = now
    doc.count = 0
  end
  local day = os.date("!%Y-%m-%d", now)
  if doc.day ~= day then
    doc.day = day
    doc.day_count = 0
  end
  if (tonumber(doc.count) or 0) >= limit then
    return false, "Rate limit exceeded", 429, doc, version
  end
  if (tonumber(doc.day_count) or 0) >= daily then
    return false, "Daily mail limit exceeded", 429, doc, version
  end
  return true, nil, nil, doc, version
end

local function bump_player_mail_rate(user_id, doc, version, content_hash)
  doc.count = (tonumber(doc.count) or 0) + 1
  doc.day_count = (tonumber(doc.day_count) or 0) + 1
  doc.last_at = time.unix()
  doc.last_hash = content_hash
  storage.write_one(user_id, RATE_COLLECTION, "send", doc, version, 1, 0)
end

-- ── Public RPCs ──────────────────────────────────────────────

local function rpc_mail_get_inbox(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("mail_enabled", context) then
    return responses.fail_status("Mail disabled", 403)
  end
  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return responses.fail(forbid, responses.CODES.INVALID_PAYLOAD)
  end

  local default_limit = cfg_int("inbox_default_page_size", 30)
  local max_limit = cfg_int("inbox_maximum_page_size", 50)
  local limit = tonumber(body.limit) or default_limit
  limit = math.floor(limit)
  if limit < 1 then
    limit = default_limit
  end
  if limit > max_limit then
    limit = max_limit
  end
  local cursor = ""
  if type(body.cursor) == "string" then
    cursor = body.cursor
  end
  local folder = "inbox"
  if type(body.folder) == "string" and body.folder ~= "" then
    folder = body.folder
  end
  local include_archived = body.include_archived == true

  local collection = MAIL_COLLECTION
  if folder == "sent" then
    collection = SENT_COLLECTION
  end

  -- Fetch a page; filter client-side for folder (bounded by limit).
  local fetch_limit = math.min(limit * 3, max_limit * 2)
  local objects, next_cursor, err = list_mails(user_id, collection, fetch_limit, cursor)
  if err ~= nil then
    return responses.fail(err, responses.CODES.STORAGE_ERROR)
  end

  local summaries = validation.empty_array()
  for i = 1, #objects do
    local obj = objects[i]
    local doc = obj.value
    if type(doc) == "table" then
      if folder == "sent" then
        table.insert(summaries, build_mail_summary(doc))
      elseif matches_folder(doc, folder) then
        if include_archived or doc.archived ~= true or folder == "deleted" then
          if body.unread_only == true and doc.read == true then
            -- skip
          elseif body.attachments_only == true and doc.has_unclaimed_attachments ~= true then
            -- skip
          else
            table.insert(summaries, build_mail_summary(doc))
          end
        end
      end
    end
    if #summaries >= limit then
      break
    end
  end

  local has_more = next_cursor ~= nil and next_cursor ~= ""
  -- Re-wrap empty list so Nakama JSON encodes [] not {}.
  if #summaries == 0 then
    summaries = validation.empty_array()
  end
  return responses.ok({
    mail = summaries,
    next_cursor = next_cursor or "",
    has_more = has_more,
    unread_count = get_unread_count(user_id),
    folder = folder,
  })
end

local function rpc_mail_get_message(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("mail_enabled", context) then
    return responses.fail_status("Mail disabled", 403)
  end
  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return responses.fail(forbid, responses.CODES.INVALID_PAYLOAD)
  end
  local mail_id, merr = validation.require_string(body.mail_id, "mail_id", 64)
  if merr ~= nil then
    return responses.fail(merr, responses.CODES.INVALID_PAYLOAD)
  end

  local doc, _, found = read_mail(user_id, mail_id)
  if not found then
    -- Try sent copies
    local sdoc, _, sfound = storage.read_one(user_id, SENT_COLLECTION, mail_id)
    if sfound then
      return responses.ok({ mail = client_safe_mail(sdoc) })
    end
    return responses.fail("Mail not found", responses.CODES.NOT_FOUND)
  end
  if doc.recipient_user_id ~= user_id then
    return responses.fail("Forbidden", responses.CODES.FORBIDDEN)
  end
  if doc.deleted == true and body.include_deleted ~= true then
    -- Still allow reading deleted for restore UI
  end
  return responses.ok({ mail = client_safe_mail(doc), unread_count = get_unread_count(user_id) })
end

local function rpc_mail_mark_read(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("mail_enabled", context) then
    return responses.fail_status("Mail disabled", 403)
  end
  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local mail_id, merr = validation.require_string(body.mail_id, "mail_id", 64)
  if merr ~= nil then
    return responses.fail(merr, responses.CODES.INVALID_PAYLOAD)
  end
  local doc, version, found = read_mail(user_id, mail_id)
  if not found or doc.recipient_user_id ~= user_id then
    return responses.fail("Mail not found", responses.CODES.NOT_FOUND)
  end
  if doc.read ~= true then
    doc.read = true
    doc.read_at = iso_now()
    doc.revision = (tonumber(doc.revision) or 1) + 1
    write_mail(user_id, doc, version)
    adjust_unread(user_id, -1)
  end
  return responses.ok({
    mail = client_safe_mail(doc),
    unread_count = get_unread_count(user_id),
  })
end

local function rpc_mail_mark_unread(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("mail_enabled", context) then
    return responses.fail_status("Mail disabled", 403)
  end
  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local mail_id, merr = validation.require_string(body.mail_id, "mail_id", 64)
  if merr ~= nil then
    return responses.fail(merr, responses.CODES.INVALID_PAYLOAD)
  end
  local doc, version, found = read_mail(user_id, mail_id)
  if not found or doc.recipient_user_id ~= user_id then
    return responses.fail("Mail not found", responses.CODES.NOT_FOUND)
  end
  if doc.deleted == true then
    return responses.fail("Cannot unread deleted mail", responses.CODES.UNPROCESSABLE)
  end
  if doc.read == true then
    doc.read = false
    doc.read_at = ""
    doc.revision = (tonumber(doc.revision) or 1) + 1
    write_mail(user_id, doc, version)
    adjust_unread(user_id, 1)
  end
  return responses.ok({
    mail = client_safe_mail(doc),
    unread_count = get_unread_count(user_id),
  })
end

local function rpc_mail_delete(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("mail_enabled", context) then
    return responses.fail_status("Mail disabled", 403)
  end
  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local mail_id, merr = validation.require_string(body.mail_id, "mail_id", 64)
  if merr ~= nil then
    return responses.fail(merr, responses.CODES.INVALID_PAYLOAD)
  end
  local restore = body.restore == true

  local doc, version, found = read_mail(user_id, mail_id)
  if not found or doc.recipient_user_id ~= user_id then
    return responses.fail("Mail not found", responses.CODES.NOT_FOUND)
  end

  if restore then
    if doc.deleted == true then
      local was_unread = doc.read ~= true
      doc.deleted = false
      doc.deleted_at = ""
      doc.mailbox = mailbox_for_type(doc.type)
      doc.revision = (tonumber(doc.revision) or 1) + 1
      write_mail(user_id, doc, version)
      if was_unread then
        adjust_unread(user_id, 1)
      end
    end
    return responses.ok({
      mail = client_safe_mail(doc),
      unread_count = get_unread_count(user_id),
      restored = true,
    })
  end

  if doc.has_unclaimed_attachments == true and has_unclaimed(doc.attachments) then
    return responses.fail(
      "Cannot delete mail with unclaimed attachments",
      responses.CODES.UNPROCESSABLE
    )
  end

  if doc.deleted ~= true then
    local was_unread = doc.read ~= true
    doc.deleted = true
    doc.deleted_at = iso_now()
    doc.mailbox = "deleted"
    doc.archived = true
    doc.revision = (tonumber(doc.revision) or 1) + 1
    write_mail(user_id, doc, version)
    if was_unread then
      adjust_unread(user_id, -1)
    end
  end
  return responses.ok({
    mail = client_safe_mail(doc),
    unread_count = get_unread_count(user_id),
    deleted = true,
  })
end

local function rpc_mail_claim_attachments(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("mail_enabled", context) or not feature_on("mail_claim_enabled", context) then
    return responses.fail_status("Mail claim disabled", 403)
  end
  if not feature_on("mail_attachments_enabled", context) then
    return responses.fail_status("Mail attachments disabled", 403)
  end
  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local forbid = validation.reject_client_identity_fields(body)
  if forbid ~= nil then
    return responses.fail(forbid, responses.CODES.INVALID_PAYLOAD)
  end
  -- Client must not submit attachment contents / amounts.
  if body.attachments ~= nil or body.amount ~= nil or body.item_id ~= nil or body.rewards ~= nil then
    return responses.fail("Unknown or forbidden field", responses.CODES.INVALID_PAYLOAD)
  end
  local mail_id, merr = validation.require_string(body.mail_id, "mail_id", 64)
  if merr ~= nil then
    return responses.fail(merr, responses.CODES.INVALID_PAYLOAD)
  end
  local request_id, rerr = validation.require_string(body.request_id, "request_id", 64)
  if rerr ~= nil then
    return responses.fail(rerr, responses.CODES.INVALID_PAYLOAD)
  end
  local character_id = ""
  if body.target_character_id ~= nil and body.target_character_id ~= "" then
    character_id = body.target_character_id
  end

  local data, err, code = claim_mail_attachments_internal(user_id, mail_id, character_id, request_id)
  if err ~= nil then
    return responses.fail_status(err, code or 400)
  end
  data.unread_count = get_unread_count(user_id)
  return responses.ok(data)
end

local function rpc_mail_send_player_text(context, payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("mail_enabled", context) or not feature_on("player_mail_enabled", context) then
    return responses.fail_status("Player mail disabled", 403)
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
    recipient_user_id = true,
    subject = true,
    body = true,
    request_id = true,
  })
  if unknown ~= nil then
    return responses.fail(unknown, responses.CODES.INVALID_PAYLOAD)
  end
  if body.attachments ~= nil or body.sender ~= nil or body.sender_user_id ~= nil then
    return responses.fail("Unknown or forbidden field", responses.CODES.INVALID_PAYLOAD)
  end

  local recipient, recerr = validation.require_string(body.recipient_user_id, "recipient_user_id", 128)
  if recerr ~= nil then
    return responses.fail(recerr, responses.CODES.INVALID_PAYLOAD)
  end
  local request_id, rerr = validation.require_string(body.request_id, "request_id", 64)
  if rerr ~= nil then
    return responses.fail(rerr, responses.CODES.INVALID_PAYLOAD)
  end

  -- Idempotency
  local existing, _, found = storage.read_one(user_id, TX_COLLECTION, request_id)
  if found and type(existing) == "table" then
    if existing.kind ~= "send_player_text" then
      return responses.fail("Conflicting reuse of request_id", responses.CODES.CONFLICT)
    end
    return responses.ok({
      mail_id = existing.mail_id,
      sent = true,
      already_sent = true,
    })
  end

  local ok_rate, rmsg, rstatus, rate_doc, rate_ver = check_player_mail_rate(user_id)
  if not ok_rate then
    return responses.fail_status(rmsg, rstatus or 429)
  end

  local doc, err, code = create_player_text_mail(
    user_id,
    recipient,
    body.subject,
    body.body,
    request_id
  )
  if err ~= nil then
    return responses.fail_status(err, code or 400)
  end

  bump_player_mail_rate(user_id, rate_doc, rate_ver, doc.mail_id)
  storage.write_one(user_id, TX_COLLECTION, request_id, {
    kind = "send_player_text",
    request_id = request_id,
    mail_id = doc.mail_id,
    recipient_user_id = recipient,
    status = "completed",
    created_at = iso_now(),
  }, nil, 1, 0)

  return responses.ok({
    mail_id = doc.mail_id,
    sent = true,
    already_sent = false,
    mail = client_safe_mail(doc),
  })
end

local function rpc_mail_get_unread_count(context, _payload)
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  if not feature_on("mail_enabled", context) then
    return responses.fail_status("Mail disabled", 403)
  end
  return responses.ok({ unread_count = get_unread_count(user_id) })
end

-- TEMPORARY DEV RPC — fixed fixtures only; gated; remove before production.
local function rpc_dev_mail_create_fixture(context, payload)
  local env = context and context.env
  if type(env) ~= "table" or env[DEV_ENV_FLAG] ~= "1" then
    return responses.fail_status("RPC not found", 404)
  end
  local user_id, unauth = auth.require_user(context)
  if unauth ~= nil then
    return unauth
  end
  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local fixture_id, ferr = validation.require_string(body.fixture_id, "fixture_id", 64)
  if ferr ~= nil then
    return responses.fail(ferr, responses.CODES.INVALID_PAYLOAD)
  end

  local doc, err
  if fixture_id == "system_text" then
    doc, err = create_system_mail({
      recipient_user_id = user_id,
      type = "system",
      subject = "System Dispatch",
      body = "Welcome to the galactic mail network.",
      attachments = validation.empty_array(),
    })
  elseif fixture_id == "soft_currency" then
    doc, err = create_system_mail({
      recipient_user_id = user_id,
      type = "reward",
      subject = "Compensation Credits",
      body = "A small soft-currency attachment for development testing.",
      attachments = {
        {
          type = "currency",
          currency_id = "stardust",
          amount = 50,
        },
      },
    })
  elseif fixture_id == "item_attachment" then
    local character_id = ""
    if body.target_character_id ~= nil and body.target_character_id ~= "" then
      local cid, cerr = auth.resolve_character_id(user_id, body.target_character_id, false)
      if cerr ~= nil then
        return responses.fail_status(cerr, 403)
      end
      character_id = cid
    else
      local cid, cerr = auth.resolve_character_id(user_id, nil, false)
      if cerr ~= nil then
        return responses.fail_status(cerr, 403)
      end
      character_id = cid
    end
    doc, err = create_system_mail({
      recipient_user_id = user_id,
      target_character_id = character_id,
      type = "reward",
      subject = "Gear Drop",
      body = "A fixed development item attachment.",
      attachments = {
        {
          type = "item",
          item_id = "laser_pistol",
          instance_id = "mail-dev-" .. ids.uuid(),
          quantity = 1,
          metadata = { type = "weapon", source = "mail_dev_fixture" },
        },
      },
    })
  else
    return responses.fail("Unknown or forbidden fixture_id", responses.CODES.FORBIDDEN)
  end

  if err ~= nil then
    return responses.fail(err, responses.CODES.UNPROCESSABLE)
  end
  return responses.ok({ mail = client_safe_mail(doc) })
end

nk.register_rpc(rpc_mail_get_inbox, "mail_get_inbox")
nk.register_rpc(rpc_mail_get_message, "mail_get_message")
nk.register_rpc(rpc_mail_mark_read, "mail_mark_read")
nk.register_rpc(rpc_mail_mark_unread, "mail_mark_unread")
nk.register_rpc(rpc_mail_delete, "mail_delete")
nk.register_rpc(rpc_mail_claim_attachments, "mail_claim_attachments")
nk.register_rpc(rpc_mail_send_player_text, "mail_send_player_text")
nk.register_rpc(rpc_mail_get_unread_count, "mail_get_unread_count")
nk.register_rpc(rpc_dev_mail_create_fixture, "dev_mail_create_fixture")
-- create_system_mail / mail_send_system / mail_attach_* intentionally NOT registered.

nk.logger_info("Phase 20 mail service: inbox/send/claim RPCs; internal create_system_mail; gated dev_mail_create_fixture")

return {
  create_system_mail = create_system_mail,
  create_player_text_mail = create_player_text_mail,
  claim_mail_attachments_internal = claim_mail_attachments_internal,
  build_mail_summary = build_mail_summary,
  publish_new_mail_notification = publish_new_mail_notification,
  MAIL_COLLECTION = MAIL_COLLECTION,
  SENT_COLLECTION = SENT_COLLECTION,
  TX_COLLECTION = TX_COLLECTION,
  DEV_ENV_FLAG = DEV_ENV_FLAG,
  NOTIFY_CODE_NEW_MAIL = NOTIFY_CODE_NEW_MAIL,
}
