extends Node
## Centralized admin API — UI only; server enforces role=admin on every mutation.

signal admin_action_finished(result: Dictionary)

const AUDIT_REFERENCE_PREVIEW_LENGTH := 12
const DEFAULT_ADMIN_LIST_LIMIT := 50
const DEFAULT_PLAYER_SEARCH_LIMIT := 200
const DEFAULT_GUILD_LIST_LIMIT := 100
const DEFAULT_SYSTEM_MAIL_EXPIRY_DAYS := 14
const DEFAULT_PROMO_MAX_REDEMPTIONS := 100
const MAX_LOOKUP_RESULTS := 50
const MAX_ADMIN_LIST_RESULTS := 200
const MAX_CHARACTER_RESULTS := 500
const ADMIN_GRANT_UNSPECIFIED_REASON := "unspecified"


func _ready() -> void:
	print("[AdminManager] ready")


func is_admin() -> bool:
	return str(AuthManager.user.get("role", "user")) == "admin"


func _result(res: Dictionary, fallback_msg: String = "") -> Dictionary:
	var data: Variant = res.get("data", {})
	var ok := bool(res.get("ok", false))
	var err := str(res.get("error", ""))
	var msg := err
	if ok:
		if typeof(data) == TYPE_DICTIONARY and data.has("message"):
			msg = str(data["message"])
		elif not fallback_msg.is_empty():
			msg = fallback_msg
		else:
			msg = "OK"
	elif msg.is_empty():
		msg = fallback_msg if not fallback_msg.is_empty() else "Request failed"
	var audit_id := ""
	var correlation_id := ""
	var reference_id := ""
	if typeof(data) == TYPE_DICTIONARY:
		audit_id = str(data.get("audit_id", data.get("auditId", "")))
		correlation_id = str(data.get("correlation_id", data.get("correlationId", "")))
		reference_id = str(data.get("transaction_id", data.get("id", "")))
		if audit_id.is_empty() == false:
			msg = "%s · audit=%s" % [
				msg,
				audit_id.substr(0, AUDIT_REFERENCE_PREVIEW_LENGTH),
			]
		elif correlation_id.is_empty() == false:
			msg = "%s · corr=%s" % [
				msg,
				correlation_id.substr(0, AUDIT_REFERENCE_PREVIEW_LENGTH),
			]
	var out := {
		"ok": ok,
		"message": msg,
		"error_code": str(res.get("status", 0)),
		"status": int(res.get("status", 0)),
		"data": data if typeof(data) == TYPE_DICTIONARY else {},
		"raw": data,
		"audit_id": audit_id,
		"correlation_id": correlation_id,
		"reference_id": reference_id,
	}
	admin_action_finished.emit(out)
	return out


func _require_admin() -> Dictionary:
	if not is_admin():
		return {"ok": false, "message": "Admin access required.", "error_code": "403", "data": {}, "raw": {}, "audit_id": ""}
	return {}


func moderation(action: String, body: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var payload := body.duplicate(true)
	payload["action"] = action
	var res: Dictionary = await GameApiClient.invoke("AdminModeration", payload)
	return _result(res, action)


func _reason_for_grant(reason: String) -> String:
	var r := reason.strip_edges()
	return r if not r.is_empty() else ADMIN_GRANT_UNSPECIFIED_REASON


func mute_player(character_id: String, minutes: int, reason: String) -> Dictionary:
	return await moderation("mute", {
		"character_id": character_id,
		"minutes": minutes,
		"reason": reason,
	})


func ban_player(character_id: String, reason: String) -> Dictionary:
	return await moderation("ban", {"character_id": character_id, "reason": reason})


func unban_player(character_id: String, reason: String = "") -> Dictionary:
	return await moderation("unban", {"character_id": character_id, "reason": reason})


func unmute_player(character_id: String, reason: String = "") -> Dictionary:
	return await moderation("unmute", {"character_id": character_id, "reason": reason})


func resolve_report(report_id: String, action_taken: String = "warned") -> Dictionary:
	return await moderation("resolve_report", {
		"report_id": report_id,
		"action_taken": action_taken,
	})


func _refresh_if_active_character(character_id: String) -> void:
	var cid := character_id.strip_edges()
	if cid.is_empty() or cid != GameManager.selected_character_id():
		return
	if MissionManager != null and MissionManager.has_method("invalidate_character_cache"):
		MissionManager.invalidate_character_cache()
	if MissionManager != null:
		await MissionManager.refresh_character(true)
	if InventoryManager != null and InventoryManager.has_method("load_inventory"):
		await InventoryManager.load_inventory(cid)


func adjust_currency(character_id: String, deltas: Dictionary, reason: String) -> Dictionary:
	var res: Dictionary = await moderation("adjust_currency", {
		"character_id": character_id,
		"deltas": deltas,
		"reason": _reason_for_grant(reason),
	})
	if bool(res.get("ok", false)):
		await _refresh_if_active_character(character_id)
	return res


func grant_item(character_id: String, item_spec: Dictionary, reason: String) -> Dictionary:
	var body := {"character_id": character_id, "reason": _reason_for_grant(reason)}
	body.merge(item_spec, true)
	var res: Dictionary = await moderation("give_item", body)
	if bool(res.get("ok", false)):
		await _refresh_if_active_character(character_id)
	return res


func reset_player(character_id: String, reason: String) -> Dictionary:
	return await moderation("reset_player", {"character_id": character_id, "reason": reason})


func simulate_level(character_id: String, level: int, reason: String) -> Dictionary:
	var res: Dictionary = await moderation("simulate_level", {
		"character_id": character_id,
		"level": level,
		"reason": _reason_for_grant(reason),
	})
	if bool(res.get("ok", false)):
		await _refresh_if_active_character(character_id)
	return res


func set_role(user_id: String, role: String, reason: String, character_id: String = "") -> Dictionary:
	var body := {
		"role": role,
		"reason": reason,
	}
	if not user_id.strip_edges().is_empty():
		body["user_id"] = user_id.strip_edges()
	if not character_id.strip_edges().is_empty():
		body["character_id"] = character_id.strip_edges()
	return await moderation("set_role", body)


func transfer_guild(guild_id: String, new_leader_id: String, reason: String = "") -> Dictionary:
	return await moderation("transfer_guild", {
		"guild_id": guild_id,
		"new_leader_id": new_leader_id,
		"reason": reason,
	})


func send_system_mail(subject: String, body: String, recipients: Variant, reason: String, rewards: Dictionary = {}, expires_days: int = DEFAULT_SYSTEM_MAIL_EXPIRY_DAYS) -> Dictionary:
	var payload := {
		"subject": subject,
		"body": body,
		"recipients": recipients,
		"reason": reason,
		"expires_days": expires_days,
	}
	if not rewards.is_empty():
		payload["rewards"] = rewards
	return await moderation("send_system_mail", payload)


func edit_filter(words: Array) -> Dictionary:
	return await moderation("edit_filter", {"words": words})


func create_promo_code(code: String, label: String, rewards: Dictionary, max_redemptions: int = DEFAULT_PROMO_MAX_REDEMPTIONS) -> Dictionary:
	return await moderation("create_promo_code", {
		"code": code,
		"label": label,
		"rewards": rewards,
		"max_redemptions": max_redemptions,
	})


func delete_promo_code(promo_code_id: String) -> Dictionary:
	return await moderation("delete_promo_code", {"promo_code_id": promo_code_id})


func toggle_promo_code(promo_code_id: String, active: bool) -> Dictionary:
	return await moderation("toggle_promo_code", {
		"promo_code_id": promo_code_id,
		"active": active,
	})


func list_own_characters() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await AuthManager.list_characters()
	var out := _result(res, "own_characters")
	var rows: Array = []
	if typeof(out.raw) == TYPE_ARRAY:
		rows = out.raw
	elif typeof(out.data) == TYPE_DICTIONARY and typeof(out.data.get("data", null)) == TYPE_ARRAY:
		rows = out.data["data"]
	out["data"] = {"players": rows, "characters": rows}
	out["raw"] = rows
	return out


func search_players(query: String = "", limit: int = DEFAULT_PLAYER_SEARCH_LIMIT) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var q := query.strip_edges()
	# Prefer authoritative LookupPlayer when a query is present (name / id / email / nakama).
	if not q.is_empty():
		var look: Dictionary = await lookup_player(q, clampi(limit, 1, MAX_LOOKUP_RESULTS))
		if look.ok and typeof(look.data) == TYPE_DICTIONARY:
			var chars: Array = look.data.get("characters", []) if typeof(look.data.get("characters", null)) == TYPE_ARRAY else []
			var accounts: Array = look.data.get("accounts", []) if typeof(look.data.get("accounts", null)) == TYPE_ARRAY else []
			look["data"] = {
				"players": chars,
				"characters": chars,
				"accounts": accounts,
				"query": q,
			}
			look["raw"] = chars
			look["message"] = "Found %s character(s), %s account(s)." % [chars.size(), accounts.size()]
			return look
		if not look.ok:
			return look
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/Character?sort=-created_date&limit=%s" % clampi(limit, 1, MAX_CHARACTER_RESULTS), null, true
	)
	var out := _result(res, "players")
	if not out.ok:
		return out
	var rows: Array = []
	var raw: Variant = out.raw
	if typeof(raw) == TYPE_ARRAY:
		rows = raw
	elif typeof(raw) == TYPE_DICTIONARY and typeof(raw.get("data", null)) == TYPE_ARRAY:
		rows = raw["data"]
	out["data"] = {"players": rows, "accounts": []}
	out["raw"] = rows
	return out


func get_character(character_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/Character/%s" % character_id.uri_encode(), null, true
	)
	return _result(res, "character")


func get_user(user_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/User/%s" % user_id.uri_encode(), null, true
	)
	return _result(res, "user")


func list_character_items(character_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/Item/filter",
		{"query": {"character_id": character_id}, "limit": MAX_ADMIN_LIST_RESULTS}, true
	)
	return _result(res, "items")


func rename_character(character_id: String, new_name: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"PATCH", "/api/entities/Character/%s" % character_id.uri_encode(),
		{"name": new_name}, true
	)
	return _result(res, "renamed")


func list_open_reports(limit: int = DEFAULT_ADMIN_LIST_LIMIT) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/Report/filter",
		{"query": {"status": "open"}, "sort": "-created_date", "limit": limit}, true
	)
	return _result(res, "reports")


func list_guilds(limit: int = DEFAULT_GUILD_LIST_LIMIT) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/Guild?sort=-created_date&limit=%s" % clampi(limit, 1, MAX_ADMIN_LIST_RESULTS), null, true
	)
	return _result(res, "guilds")


func list_guild_members(guild_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildMember/filter",
		{"query": {"guild_id": guild_id}, "limit": DEFAULT_GUILD_LIST_LIMIT}, true
	)
	return _result(res, "members")


func list_promo_codes() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/PromoCode?sort=-created_date&limit=%s" % MAX_ADMIN_LIST_RESULTS, null, true
	)
	return _result(res, "promos")


func get_moderation_filter() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/ModerationConfig/filter",
		{"query": {}, "limit": 1}, true
	)
	var out := _result(res, "filter")
	if out.ok:
		var rows: Array = out.raw if typeof(out.raw) == TYPE_ARRAY else []
		if rows.is_empty() and typeof(out.data) == TYPE_DICTIONARY:
			var d: Variant = out.data.get("data", null)
			if typeof(d) == TYPE_ARRAY:
				rows = d
		out["data"] = rows[0] if not rows.is_empty() and typeof(rows[0]) == TYPE_DICTIONARY else {}
	return out


func economy_snapshot() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var chars: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/Character?sort=-created_date&limit=%s" % MAX_CHARACTER_RESULTS, null, true
	)
	var nova_ev: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/NovaSpendEvent?sort=-created_date&limit=%s" % MAX_ADMIN_LIST_RESULTS, null, true
	)
	var sd_ev: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/StardustSpendEvent?sort=-created_date&limit=%s" % MAX_ADMIN_LIST_RESULTS, null, true
	)
	if not chars.ok:
		return _result(chars, "economy")
	var list: Array = []
	var chars_data: Variant = chars.get("data", null)
	if typeof(chars_data) == TYPE_ARRAY:
		list = chars_data
	elif typeof(chars_data) == TYPE_DICTIONARY and typeof(chars_data.get("data", null)) == TYPE_ARRAY:
		list = chars_data["data"]
	var total_sd := 0
	var total_nova := 0
	for c in list:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		total_sd += int(c.get("stardust", 0))
		total_nova += int(c.get("nova_crystals", 0))
	return {
		"ok": true,
		"message": "OK",
		"error_code": "200",
		"data": {
			"character_count": list.size(),
			"total_stardust": total_sd,
			"total_nova": total_nova,
			"nova_events": nova_ev.data if nova_ev.ok else [],
			"stardust_events": sd_ev.data if sd_ev.ok else [],
		},
		"raw": {},
		"audit_id": "",
	}


# —— Entitlements ——

func entitlements_search(params: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var q := _query_string(params)
	var res: Dictionary = await GameApiClient.request("GET", "/api/entitlements/admin/search%s" % q, null, true)
	return _result(res, "entitlements")


func entitlements_grant(body: Dictionary) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var payload := body.duplicate(true)
	payload["reason"] = _reason_for_grant(str(payload.get("reason", "")))
	var res: Dictionary = await GameApiClient.request("POST", "/api/entitlements/admin/grant", payload, true)
	return _result(res, "granted")


func entitlements_revoke(entitlement_id: String, body: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entitlements/admin/%s/revoke" % entitlement_id.uri_encode(), body, true
	)
	return _result(res, "revoked")


func entitlements_restore(entitlement_id: String, body: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entitlements/admin/%s/restore" % entitlement_id.uri_encode(), body, true
	)
	return _result(res, "restored")


func entitlements_audit(params: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var q := _query_string(params)
	var res: Dictionary = await GameApiClient.request("GET", "/api/entitlements/admin/audit%s" % q, null, true)
	return _result(res, "entitlement_audit")


func entitlements_products() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request("GET", "/api/entitlements/admin/products", null, true)
	return _result(res, "products")


# —— Rewards ——

func rewards_search(params: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var q := _query_string(params)
	var res: Dictionary = await GameApiClient.request("GET", "/api/rewards/admin/search%s" % q, null, true)
	return _result(res, "rewards")


func rewards_get(claim_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/rewards/admin/%s" % claim_id.uri_encode(), null, true
	)
	return _result(res, "reward")


func rewards_grant(body: Dictionary) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var payload := body.duplicate(true)
	payload["reason"] = _reason_for_grant(str(payload.get("reason", "")))
	var res: Dictionary = await GameApiClient.request("POST", "/api/rewards/admin/grant", payload, true)
	var out: Dictionary = _result(res, "reward_granted")
	if bool(out.get("ok", false)):
		await _refresh_if_active_character(str(payload.get("characterId", payload.get("character_id", ""))))
	return out


func rewards_retry(claim_id: String, body: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/rewards/admin/%s/retry-delivery" % claim_id.uri_encode(), body, true
	)
	return _result(res, "retried")


func rewards_audit(params: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var q := _query_string(params)
	var res: Dictionary = await GameApiClient.request("GET", "/api/rewards/admin/audit/recent%s" % q, null, true)
	return _result(res, "reward_audit")


# —— Audit ——

func audit_search(params: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var q := _query_string(params)
	var res: Dictionary = await GameApiClient.request("GET", "/api/audit/admin/search%s" % q, null, true)
	return _result(res, "audit")


func audit_get(entry_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/audit/admin/%s" % entry_id.uri_encode(), null, true
	)
	return _result(res, "audit_entry")


func audit_timeline(account_id: String, params: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var q := _query_string(params)
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/audit/admin/timeline/%s%s" % [account_id.uri_encode(), q], null, true
	)
	return _result(res, "timeline")


func audit_annotate(entry_id: String, note: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/audit/admin/%s/annotations" % entry_id.uri_encode(),
		{"note": note}, true
	)
	return _result(res, "annotated")


func audit_export(body: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request("POST", "/api/audit/admin/export", body, true)
	return _result(res, "exported")


func audit_integrity(entry_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/audit/admin/%s/integrity" % entry_id.uri_encode(), null, true
	)
	return _result(res, "integrity")


# —— Email / Schedules ——

func email_log(limit: int = DEFAULT_ADMIN_LIST_LIMIT) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/auth/admin/email-log?limit=%s" % clampi(limit, 1, MAX_ADMIN_LIST_RESULTS), null, true
	)
	return _result(res, "email_log")


func email_test() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request("POST", "/api/auth/admin/email-test", {}, true)
	return _result(res, "email_test")


func schedules_list() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request("GET", "/api/schedules", null, true)
	return _result(res, "schedules")


func schedules_audit(limit: int = DEFAULT_ADMIN_LIST_LIMIT) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/schedules/audit?limit=%s" % clampi(limit, 1, MAX_ADMIN_LIST_RESULTS), null, true
	)
	return _result(res, "schedule_audit")


func schedules_create(body: Dictionary) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request("POST", "/api/schedules", body, true)
	return _result(res, "schedule_created")


func schedules_pause(schedule_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/schedules/%s/pause" % schedule_id.uri_encode(), {}, true
	)
	return _result(res, "paused")


func schedules_resume(schedule_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/schedules/%s/resume" % schedule_id.uri_encode(), {}, true
	)
	return _result(res, "resumed")


func schedules_tick() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request("POST", "/api/schedules/tick", {}, true)
	return _result(res, "ticked")


func schedules_preview(body: Dictionary) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.request("POST", "/api/schedules/preview", body, true)
	return _result(res, "preview")


# —— Live ops / integrity (Restoration 26) ——

func lookup_player(query: String, limit: int = 20) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.invoke("LookupPlayer", {
		"q": query,
		"limit": limit,
	})
	return _result(res, "lookup")


func inspect_character(character_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.invoke("InspectCharacter", {
		"character_id": character_id,
	})
	return _result(res, "inspect")


func get_ops_dashboard() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.invoke("GetOpsDashboard", {})
	return _result(res, "ops")


func get_runtime_config() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetRuntimeConfig", {})
	return _result(res, "runtime_config")


func set_feature_flag(flag: String, enabled: bool, reason: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.invoke("SetFeatureFlag", {
		"flag": flag,
		"enabled": enabled,
		"reason": reason,
	})
	return _result(res, "flag_set")


func set_maintenance_mode(enabled: bool, message: String = "", reason: String = "admin_ui") -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.invoke("SetMaintenanceMode", {
		"enabled": enabled,
		"message": message,
		"reason": reason,
	})
	return _result(res, "maintenance")


func run_integrity_audit(character_id: String = "", account_id: String = "", quarantine: bool = false) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var body := {"quarantine": quarantine}
	if not character_id.is_empty():
		body["character_id"] = character_id
	if not account_id.is_empty():
		body["account_id"] = account_id
	var res: Dictionary = await GameApiClient.invoke("RunIntegrityAudit", body)
	return _result(res, "integrity_audit")


func apply_data_repair(repair_type: String, character_id: String, apply: bool = false) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.invoke("ApplyDataRepair", {
		"repair_type": repair_type,
		"character_id": character_id,
		"apply": apply,
	})
	return _result(res, "repair")


func run_migration(migration_id: String, apply: bool = false) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await GameApiClient.invoke("RunMigration", {
		"migration_id": migration_id,
		"apply": apply,
	})
	return _result(res, "migration")


func arena_suspend(character_id: String, hours: int, reason: String) -> Dictionary:
	return await moderation("arena_suspend", {
		"character_id": character_id,
		"hours": hours,
		"reason": reason,
	})


func arena_ban(character_id: String, reason: String) -> Dictionary:
	return await moderation("arena_ban", {"character_id": character_id, "reason": reason})


func arena_unban(character_id: String, reason: String = "") -> Dictionary:
	return await moderation("arena_unban", {"character_id": character_id, "reason": reason})


func _query_string(params: Dictionary) -> String:
	if params.is_empty():
		return ""
	var parts: PackedStringArray = []
	for k in params.keys():
		var v: Variant = params[k]
		if v == null:
			continue
		var s := str(v).strip_edges()
		if s.is_empty():
			continue
		parts.append("%s=%s" % [str(k).uri_encode(), s.uri_encode()])
	if parts.is_empty():
		return ""
	return "?" + "&".join(parts)
