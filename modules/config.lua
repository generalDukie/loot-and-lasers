--[[
  Phase 10 — Remote configuration and feature flags (Nakama Lua).

  Public RPC: config_get (client-visible values only)
  Mutation RPCs are intentionally NOT registered.

  Storage (system-owned):
    remote_config / <namespace>
    feature_flags / <flag_id>

  Environment: context.env.LOOT_ENVIRONMENT (development|staging|production).
  Defaults preserve live mission board_size=3 and refresh cooldown=15s.
]]

local nk = require("nakama")
local auth = require("lib.auth")
local responses = require("lib.responses")
local validation = require("lib.validation")
local storage = require("lib.storage")
local time = require("lib.time")
local logging = require("lib.logging")

local CONFIG_COLLECTION = "remote_config"
local FLAGS_COLLECTION = "feature_flags"
-- Server-owned records; clients never write these directly.
local SYSTEM_OWNER = "00000000-0000-0000-0000-000000000000"
local CONFIG_VERSION = 1
local ENV_KEY = "LOOT_ENVIRONMENT"

local ALLOWED_ENVIRONMENTS = {
  development = true,
  staging = true,
  production = true,
}

local ALLOWED_NAMESPACES = {
  global = true,
  missions = true,
  client_ui = true,
  shops = true,
}

-- Schema: type + optional min/max/maxlen + client_visible.
-- Unknown keys rejected on internal write. Missing storage → code defaults.
local NAMESPACE_SCHEMAS = {
  global = {
    maintenance_enabled = { type = "boolean", client_visible = true, default = false },
    maintenance_message = { type = "string", client_visible = true, default = "", maxlen = 500 },
    maintenance_started_at = { type = "string", client_visible = true, default = "", maxlen = 64 },
    maintenance_expected_end = { type = "string", client_visible = true, default = "", maxlen = 64 },
    minimum_client_version = { type = "string", client_visible = true, default = "", maxlen = 32 },
    recommended_client_version = { type = "string", client_visible = true, default = "", maxlen = 32 },
    update_message = { type = "string", client_visible = true, default = "", maxlen = 500 },
    update_required = { type = "boolean", client_visible = true, default = false },
    announcement_text = { type = "string", client_visible = true, default = "", maxlen = 500 },
    -- Server-only sample (never returned by config_get).
    admin_notes = { type = "string", client_visible = false, default = "", maxlen = 500 },
  },
  missions = {
    board_size = { type = "integer", client_visible = true, default = 3, min = 1, max = 10 },
    free_refresh_cooldown_seconds = { type = "integer", client_visible = true, default = 15, min = 0, max = 86400 },
    -- Server-only sample.
    server_generation_salt = { type = "string", client_visible = false, default = "", maxlen = 64 },
  },
  client_ui = {
    show_development_banner = { type = "boolean", client_visible = true, default = true },
  },
  shops = {
    offer_count = { type = "integer", client_visible = true, default = 4, min = 1, max = 8 },
    refresh_cooldown_seconds = { type = "integer", client_visible = true, default = 60, min = 0, max = 86400 },
    sell_value_ratio = { type = "integer", client_visible = false, default = 100, min = 1, max = 100 },
    buy_price_multiplier_percent = { type = "integer", client_visible = false, default = 100, min = 50, max = 300 },
  },
}

local DEFAULT_FLAGS = {
  shipments_enabled = {
    flag_id = "shipments_enabled",
    enabled = false,
    environment = "development",
    client_visible = true,
    minimum_client_version = "",
    starts_at = "",
    ends_at = "",
    metadata = {},
  },
  shops_enabled = {
    flag_id = "shops_enabled",
    enabled = true,
    environment = "development",
    client_visible = true,
    minimum_client_version = "",
    starts_at = "",
    ends_at = "",
    metadata = {},
  },
  shop_buy_enabled = {
    flag_id = "shop_buy_enabled",
    enabled = true,
    environment = "development",
    client_visible = true,
    minimum_client_version = "",
    starts_at = "",
    ends_at = "",
    metadata = {},
  },
  shop_sell_enabled = {
    flag_id = "shop_sell_enabled",
    enabled = true,
    environment = "development",
    client_visible = true,
    minimum_client_version = "",
    starts_at = "",
    ends_at = "",
    metadata = {},
  },
  shop_refresh_enabled = {
    flag_id = "shop_refresh_enabled",
    enabled = true,
    environment = "development",
    client_visible = true,
    minimum_client_version = "",
    starts_at = "",
    ends_at = "",
    metadata = {},
  },
  combat_simulate_enabled = {
    flag_id = "combat_simulate_enabled",
    enabled = true,
    environment = "development",
    client_visible = true,
    minimum_client_version = "",
    starts_at = "",
    ends_at = "",
    metadata = {},
  },
}

local function get_environment(context)
  local env_map = nil
  if context ~= nil then
    env_map = context.env
  end
  if type(env_map) == "table" then
    local raw = env_map[ENV_KEY]
    if type(raw) == "string" and ALLOWED_ENVIRONMENTS[raw] == true then
      return raw
    end
  end
  return "development"
end

local function default_values_for(namespace)
  local schema = NAMESPACE_SCHEMAS[namespace]
  local values = {}
  if schema == nil then
    return values
  end
  for key, spec in pairs(schema) do
    values[key] = spec.default
  end
  return values
end

local function client_visible_keys_for(namespace)
  local schema = NAMESPACE_SCHEMAS[namespace]
  local keys = {}
  if schema == nil then
    return keys
  end
  for key, spec in pairs(schema) do
    if spec.client_visible == true then
      table.insert(keys, key)
    end
  end
  table.sort(keys)
  return keys
end

local function filter_client_values(namespace, values)
  local schema = NAMESPACE_SCHEMAS[namespace]
  local out = {}
  if schema == nil or type(values) ~= "table" then
    return out
  end
  for key, spec in pairs(schema) do
    if spec.client_visible == true then
      local v = values[key]
      if v == nil then
        v = spec.default
      end
      out[key] = v
    end
  end
  return out
end

local function validate_value(key, value, spec)
  if spec.type == "boolean" then
    if type(value) ~= "boolean" then
      return nil, key .. " must be a boolean"
    end
    return value, nil
  end
  if spec.type == "string" then
    if type(value) ~= "string" then
      return nil, key .. " must be a string"
    end
    if spec.maxlen ~= nil and #value > spec.maxlen then
      return nil, key .. " is too long"
    end
    return value, nil
  end
  if spec.type == "integer" then
    local n = tonumber(value)
    if n == nil or n ~= math.floor(n) then
      return nil, key .. " must be an integer"
    end
    if spec.min ~= nil and n < spec.min then
      return nil, key .. " is too small"
    end
    if spec.max ~= nil and n > spec.max then
      return nil, key .. " is too large"
    end
    return n, nil
  end
  return nil, key .. " has unsupported type"
end

--- Validate a full config document for internal writes.
local function validate_config_document(doc)
  if type(doc) ~= "table" then
    return nil, "Config document must be an object"
  end
  local namespace = doc.namespace
  if type(namespace) ~= "string" or ALLOWED_NAMESPACES[namespace] ~= true then
    return nil, "Invalid namespace"
  end
  local schema = NAMESPACE_SCHEMAS[namespace]
  if schema == nil then
    return nil, "Unknown namespace schema"
  end
  if type(doc.values) ~= "table" then
    return nil, "values must be an object"
  end
  for k, _ in pairs(doc.values) do
    if schema[k] == nil then
      return nil, "Unknown config key: " .. tostring(k)
    end
  end
  local cleaned = {}
  for key, spec in pairs(schema) do
    local raw = doc.values[key]
    if raw == nil then
      cleaned[key] = spec.default
    else
      local v, err = validate_value(key, raw, spec)
      if err ~= nil then
        return nil, err
      end
      cleaned[key] = v
    end
  end

  local env = doc.environment
  if env == nil or env == "" then
    env = "development"
  end
  if ALLOWED_ENVIRONMENTS[env] ~= true then
    return nil, "Invalid environment"
  end

  local revision = tonumber(doc.revision) or 1
  if revision < 1 or revision ~= math.floor(revision) then
    return nil, "revision must be a positive integer"
  end

  local config_version = tonumber(doc.config_version) or CONFIG_VERSION
  if config_version ~= CONFIG_VERSION then
    return nil, "Unsupported config_version"
  end

  return {
    config_version = CONFIG_VERSION,
    namespace = namespace,
    revision = revision,
    environment = env,
    values = cleaned,
    client_visible_keys = client_visible_keys_for(namespace),
    updated_at = doc.updated_at or time.iso_utc(),
    updated_by = type(doc.updated_by) == "string" and doc.updated_by or "system",
  }, nil
end

local function build_default_document(namespace, environment)
  return {
    config_version = CONFIG_VERSION,
    namespace = namespace,
    revision = 1,
    environment = environment or "development",
    values = default_values_for(namespace),
    client_visible_keys = client_visible_keys_for(namespace),
    updated_at = "",
    updated_by = "system",
  }
end

local function read_namespace_raw(namespace)
  local value, version, found = storage.read_one(SYSTEM_OWNER, CONFIG_COLLECTION, namespace)
  if not found then
    return nil, nil, false
  end
  if type(value) ~= "table" then
    return nil, version, true -- found but malformed
  end
  return value, version, true
end

--- Resolve namespace values with safe defaults. Malformed storage → defaults + log.
local function get_config_namespace(namespace, context)
  if ALLOWED_NAMESPACES[namespace] ~= true then
    return nil, "Invalid namespace"
  end
  local environment = get_environment(context)
  local raw, _, found = read_namespace_raw(namespace)
  if not found then
    return build_default_document(namespace, environment), nil
  end
  local validated, err = validate_config_document(raw)
  if err ~= nil then
    logging.error("config", "malformed_namespace", {
      code = responses.CODES.STORAGE_ERROR,
      error = err,
    })
    return build_default_document(namespace, environment), nil
  end
  -- Prefer active server environment for response metadata.
  validated.environment = environment
  return validated, nil
end

local function get_config_value(namespace, key, context)
  local doc, err = get_config_namespace(namespace, context)
  if err ~= nil or doc == nil then
    local schema = NAMESPACE_SCHEMAS[namespace]
    if schema ~= nil and schema[key] ~= nil then
      return schema[key].default
    end
    return nil
  end
  if doc.values == nil then
    return nil
  end
  local v = doc.values[key]
  if v == nil then
    local schema = NAMESPACE_SCHEMAS[namespace]
    if schema ~= nil and schema[key] ~= nil then
      return schema[key].default
    end
  end
  return v
end

local function validate_flag_document(doc)
  if type(doc) ~= "table" then
    return nil, "Flag document must be an object"
  end
  if type(doc.flag_id) ~= "string" or doc.flag_id == "" or #doc.flag_id > 64 then
    return nil, "flag_id is required"
  end
  if type(doc.enabled) ~= "boolean" then
    return nil, "enabled must be a boolean"
  end
  local env = doc.environment or "development"
  if ALLOWED_ENVIRONMENTS[env] ~= true then
    return nil, "Invalid environment"
  end
  if doc.client_visible ~= nil and type(doc.client_visible) ~= "boolean" then
    return nil, "client_visible must be a boolean"
  end
  if doc.starts_at ~= nil and type(doc.starts_at) ~= "string" then
    return nil, "starts_at must be a string"
  end
  if doc.ends_at ~= nil and type(doc.ends_at) ~= "string" then
    return nil, "ends_at must be a string"
  end
  -- Reject percentage rollout fields in this phase (keep schema simple).
  if doc.rollout_percentage ~= nil or doc.allow_user_ids ~= nil or doc.deny_user_ids ~= nil then
    return nil, "Percentage / allowlist rollout not supported in Phase 10"
  end

  local allowed = {
    flag_id = true,
    enabled = true,
    environment = true,
    client_visible = true,
    minimum_client_version = true,
    starts_at = true,
    ends_at = true,
    metadata = true,
  }
  local unknown = validation.reject_unknown_keys(doc, allowed)
  if unknown ~= nil then
    return nil, unknown
  end

  return {
    flag_id = doc.flag_id,
    enabled = doc.enabled,
    environment = env,
    client_visible = doc.client_visible ~= false,
    minimum_client_version = type(doc.minimum_client_version) == "string" and doc.minimum_client_version or "",
    starts_at = type(doc.starts_at) == "string" and doc.starts_at or "",
    ends_at = type(doc.ends_at) == "string" and doc.ends_at or "",
    metadata = type(doc.metadata) == "table" and doc.metadata or {},
  }, nil
end

local function parse_iso_or_unix(value)
  if value == nil or value == "" then
    return nil
  end
  local n = tonumber(value)
  if n ~= nil then
    return n
  end
  if type(value) ~= "string" then
    return nil
  end
  -- Expect YYYY-MM-DDTHH:MM:SSZ
  local y, mo, d, h, mi, s = value:match("^(%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d):(%d%d)Z$")
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

local function flag_in_window(flag, now_unix)
  local starts = parse_iso_or_unix(flag.starts_at)
  local ends = parse_iso_or_unix(flag.ends_at)
  if starts ~= nil and now_unix < starts then
    return false
  end
  if ends ~= nil and now_unix >= ends then
    return false
  end
  return true
end

local function get_feature_flag(flag_id, context)
  if type(flag_id) ~= "string" or flag_id == "" then
    return nil
  end
  local environment = get_environment(context)
  local raw, _, found = storage.read_one(SYSTEM_OWNER, FLAGS_COLLECTION, flag_id)
  local doc
  if found and type(raw) == "table" then
    local validated, err = validate_flag_document(raw)
    if err ~= nil then
      logging.error("config", "malformed_flag", { error = err, code = responses.CODES.STORAGE_ERROR })
      doc = DEFAULT_FLAGS[flag_id]
    else
      doc = validated
    end
  else
    doc = DEFAULT_FLAGS[flag_id]
  end
  if doc == nil then
    return nil
  end
  -- Copy so callers cannot mutate defaults.
  return {
    flag_id = doc.flag_id,
    enabled = doc.enabled,
    environment = doc.environment,
    client_visible = doc.client_visible,
    minimum_client_version = doc.minimum_client_version or "",
    starts_at = doc.starts_at or "",
    ends_at = doc.ends_at or "",
    metadata = doc.metadata or {},
    _active_environment = environment,
  }
end

local function is_feature_enabled(flag_id, context)
  local flag = get_feature_flag(flag_id, context)
  if flag == nil then
    return false
  end
  local environment = get_environment(context)
  -- Exact environment match; development flags never activate in production.
  if environment == "production" and flag.environment == "development" then
    return false
  end
  if flag.environment ~= environment then
    return false
  end
  if not flag.enabled then
    return false
  end
  if not flag_in_window(flag, time.unix()) then
    return false
  end
  return true
end

--- Internal write — not registered as RPC.
local function write_config_internal(namespace, values, updated_by, context)
  local environment = get_environment(context)
  local existing, _, found = read_namespace_raw(namespace)
  local revision = 1
  if found and type(existing) == "table" and tonumber(existing.revision) ~= nil then
    revision = math.floor(tonumber(existing.revision)) + 1
  end
  local doc = {
    config_version = CONFIG_VERSION,
    namespace = namespace,
    revision = revision,
    environment = environment,
    values = values or {},
    updated_at = time.iso_utc(),
    updated_by = updated_by or "system",
  }
  local validated, err = validate_config_document(doc)
  if err ~= nil then
    return nil, err
  end
  local _, version = read_namespace_raw(namespace)
  local _, write_err = storage.write_one(
    SYSTEM_OWNER,
    CONFIG_COLLECTION,
    namespace,
    validated,
    version,
    0,
    0
  )
  if write_err ~= nil then
    return nil, write_err
  end
  return validated, nil
end

local function update_feature_flag_internal(flag_id, patch, context)
  if type(flag_id) ~= "string" or flag_id == "" then
    return nil, "flag_id is required"
  end
  local environment = get_environment(context)
  local current = get_feature_flag(flag_id, context)
  local base = current or {
    flag_id = flag_id,
    enabled = false,
    environment = environment,
    client_visible = true,
    minimum_client_version = "",
    starts_at = "",
    ends_at = "",
    metadata = {},
  }
  local merged = {
    flag_id = flag_id,
    enabled = base.enabled,
    environment = base.environment,
    client_visible = base.client_visible,
    minimum_client_version = base.minimum_client_version,
    starts_at = base.starts_at,
    ends_at = base.ends_at,
    metadata = base.metadata,
  }
  if type(patch) == "table" then
    for k, v in pairs(patch) do
      if k ~= "flag_id" then
        merged[k] = v
      end
    end
  end
  merged.flag_id = flag_id
  local validated, err = validate_flag_document(merged)
  if err ~= nil then
    return nil, err
  end
  local _, version = storage.read_one(SYSTEM_OWNER, FLAGS_COLLECTION, flag_id)
  local _, write_err = storage.write_one(
    SYSTEM_OWNER,
    FLAGS_COLLECTION,
    flag_id,
    validated,
    version,
    0,
    0
  )
  if write_err ~= nil then
    return nil, write_err
  end
  return validated, nil
end

--- Parse "1.10.0" style versions into numeric components. Rejects malformed.
local function parse_semver(version)
  if type(version) ~= "string" or version == "" then
    return nil
  end
  local parts = {}
  for piece in string.gmatch(version, "[^.]+") do
    if not string.match(piece, "^%d+$") then
      return nil
    end
    table.insert(parts, tonumber(piece))
  end
  if #parts == 0 then
    return nil
  end
  return parts
end

--- Returns -1, 0, 1 like strcmp. nil if either side malformed.
local function compare_versions(a, b)
  local pa = parse_semver(a)
  local pb = parse_semver(b)
  if pa == nil or pb == nil then
    return nil
  end
  local n = math.max(#pa, #pb)
  for i = 1, n do
    local x = pa[i] or 0
    local y = pb[i] or 0
    if x < y then
      return -1
    end
    if x > y then
      return 1
    end
  end
  return 0
end

local function collect_client_flags(context)
  local environment = get_environment(context)
  local out = {}
  -- Known default flags + any stored keys we know about.
  local ids = {}
  for id, _ in pairs(DEFAULT_FLAGS) do
    ids[id] = true
  end
  for id, _ in pairs(ids) do
    local flag = get_feature_flag(id, context)
    if flag ~= nil and flag.client_visible == true then
      -- Production must not surface development-only enabled tools as true.
      local enabled = is_feature_enabled(id, context)
      if environment == "production" and flag.environment == "development" then
        enabled = false
      end
      out[id] = enabled
    end
  end
  return out
end

local function aggregate_revision(namespaces)
  local sum = 0
  for _, doc in pairs(namespaces) do
    if type(doc) == "table" and tonumber(doc.revision) ~= nil then
      sum = sum + math.floor(tonumber(doc.revision))
    end
  end
  return sum
end

local function rpc_config_get(context, payload)
  local user_id, auth_fail = auth.require_user(context)
  if auth_fail ~= nil then
    return auth_fail
  end

  local body = validation.decode_payload(payload)
  if body == nil then
    return responses.fail_status("Malformed JSON payload", 400)
  end
  local identity_err = validation.reject_client_identity_fields(body)
  if identity_err ~= nil then
    return responses.fail(identity_err, responses.CODES.INVALID_PAYLOAD)
  end
  local unknown = validation.reject_unknown_keys(body, {
    namespace = true,
    client_version = true,
  })
  if unknown ~= nil then
    return responses.fail(unknown, responses.CODES.INVALID_PAYLOAD)
  end

  local environment = get_environment(context)
  local wanted = {}
  if body.namespace ~= nil and body.namespace ~= "" then
    if type(body.namespace) ~= "string" or ALLOWED_NAMESPACES[body.namespace] ~= true then
      return responses.fail("Unknown or forbidden namespace", responses.CODES.INVALID_PAYLOAD)
    end
    wanted[body.namespace] = true
  else
    for ns, _ in pairs(ALLOWED_NAMESPACES) do
      wanted[ns] = true
    end
  end

  local namespaces_out = {}
  local docs_for_rev = {}
  for ns, _ in pairs(wanted) do
    local doc = get_config_namespace(ns, context)
    docs_for_rev[ns] = doc
    namespaces_out[ns] = filter_client_values(ns, doc.values)
  end

  local data = {
    revision = aggregate_revision(docs_for_rev),
    environment = environment,
    namespaces = namespaces_out,
    feature_flags = collect_client_flags(context),
  }

  -- Optional client version advisory (does not block in Phase 10 unless update_required + min set).
  if type(body.client_version) == "string" and body.client_version ~= "" then
    local min_v = get_config_value("global", "minimum_client_version", context)
    local cmp = nil
    if type(min_v) == "string" and min_v ~= "" then
      cmp = compare_versions(body.client_version, min_v)
    end
    data.client_version_check = {
      client_version = body.client_version,
      minimum_client_version = min_v or "",
      recommended_client_version = get_config_value("global", "recommended_client_version", context) or "",
      update_message = get_config_value("global", "update_message", context) or "",
      update_required = get_config_value("global", "update_required", context) == true,
      below_minimum = cmp ~= nil and cmp < 0,
    }
  end

  logging.info("config", "config_get", { user_id = user_id, ok = true, code = responses.CODES.OK })
  return responses.ok(data)
end

nk.register_rpc(rpc_config_get, "config_get")
-- config_set / config_update / feature_flag_* / maintenance_set intentionally NOT registered.

nk.logger_info("Phase 10 remote config: public RPC config_get; mutations internal-only")

return {
  get_config_value = get_config_value,
  get_config_namespace = get_config_namespace,
  get_feature_flag = get_feature_flag,
  is_feature_enabled = is_feature_enabled,
  validate_config_document = validate_config_document,
  write_config_internal = write_config_internal,
  update_feature_flag_internal = update_feature_flag_internal,
  compare_versions = compare_versions,
  get_environment = get_environment,
  SYSTEM_OWNER = SYSTEM_OWNER,
  CONFIG_COLLECTION = CONFIG_COLLECTION,
  FLAGS_COLLECTION = FLAGS_COLLECTION,
  ALLOWED_NAMESPACES = ALLOWED_NAMESPACES,
  NAMESPACE_SCHEMAS = NAMESPACE_SCHEMAS,
  DEFAULT_FLAGS = DEFAULT_FLAGS,
}
