extends Node
## Centralized admin API — UI only; server enforces role=admin on every mutation.

signal admin_action_finished(result: Dictionary)


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
	if typeof(data) == TYPE_DICTIONARY:
		audit_id = str(data.get("audit_id", data.get("auditId", "")))
	return {
		"ok": ok,
		"message": msg,
		"error_code": str(res.get("status", 0)),
		"data": data if typeof(data) == TYPE_DICTIONARY else {},
		"raw": data,
		"audit_id": audit_id,
	}


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
	var res: Dictionary = await ApiClient.invoke("AdminModeration", payload)
	return _result(res, action)


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


func adjust_currency(character_id: String, deltas: Dictionary, reason: String) -> Dictionary:
	return await moderation("adjust_currency", {
		"character_id": character_id,
		"deltas": deltas,
		"reason": reason,
	})


func grant_item(character_id: String, item_spec: Dictionary, reason: String) -> Dictionary:
	var body := {"character_id": character_id, "reason": reason}
	body.merge(item_spec, true)
	return await moderation("give_item", body)


func reset_player(character_id: String, reason: String) -> Dictionary:
	return await moderation("reset_player", {"character_id": character_id, "reason": reason})


func set_role(user_id: String, role: String, reason: String) -> Dictionary:
	return await moderation("set_role", {
		"user_id": user_id,
		"role": role,
		"reason": reason,
	})


func transfer_guild(guild_id: String, new_leader_id: String, reason: String = "") -> Dictionary:
	return await moderation("transfer_guild", {
		"guild_id": guild_id,
		"new_leader_id": new_leader_id,
		"reason": reason,
	})


func send_system_mail(subject: String, body: String, recipients: Variant, reason: String, rewards: Dictionary = {}, expires_days: int = 14) -> Dictionary:
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


func create_promo_code(code: String, label: String, rewards: Dictionary, max_redemptions: int = 100) -> Dictionary:
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


func search_players(query: String = "", limit: int = 200) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/entities/Character?sort=-created_date&limit=%s" % clampi(limit, 1, 500), null, true
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
	var q := query.strip_edges().to_lower()
	if not q.is_empty():
		var filtered: Array = []
		for row in rows:
			if typeof(row) != TYPE_DICTIONARY:
				continue
			var name := str(row.get("name", "")).to_lower()
			var cid := str(row.get("id", "")).to_lower()
			if name.find(q) >= 0 or cid.find(q) >= 0:
				filtered.append(row)
		rows = filtered
	out["data"] = {"players": rows}
	out["raw"] = rows
	return out


func get_character(character_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/entities/Character/%s" % character_id.uri_encode(), null, true
	)
	return _result(res, "character")


func get_user(user_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/entities/User/%s" % user_id.uri_encode(), null, true
	)
	return _result(res, "user")


func list_character_items(character_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/entities/Item/filter",
		{"query": {"character_id": character_id}, "limit": 200}, true
	)
	return _result(res, "items")


func rename_character(character_id: String, new_name: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"PATCH", "/api/entities/Character/%s" % character_id.uri_encode(),
		{"name": new_name}, true
	)
	return _result(res, "renamed")


func list_open_reports(limit: int = 50) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/entities/Report/filter",
		{"query": {"status": "open"}, "sort": "-created_date", "limit": limit}, true
	)
	return _result(res, "reports")


func list_guilds(limit: int = 100) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/entities/Guild?sort=-created_date&limit=%s" % clampi(limit, 1, 200), null, true
	)
	return _result(res, "guilds")


func list_guild_members(guild_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/entities/GuildMember/filter",
		{"query": {"guild_id": guild_id}, "limit": 100}, true
	)
	return _result(res, "members")


func list_promo_codes() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/entities/PromoCode?sort=-created_date&limit=200", null, true
	)
	return _result(res, "promos")


func get_moderation_filter() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
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
	var chars: Dictionary = await ApiClient.request(
		"GET", "/api/entities/Character?sort=-created_date&limit=500", null, true
	)
	var nova_ev: Dictionary = await ApiClient.request(
		"GET", "/api/entities/NovaSpendEvent?sort=-created_date&limit=200", null, true
	)
	var sd_ev: Dictionary = await ApiClient.request(
		"GET", "/api/entities/StardustSpendEvent?sort=-created_date&limit=200", null, true
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
	var res: Dictionary = await ApiClient.request("GET", "/api/entitlements/admin/search%s" % q, null, true)
	return _result(res, "entitlements")


func entitlements_grant(body: Dictionary) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request("POST", "/api/entitlements/admin/grant", body, true)
	return _result(res, "granted")


func entitlements_revoke(entitlement_id: String, body: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/entitlements/admin/%s/revoke" % entitlement_id.uri_encode(), body, true
	)
	return _result(res, "revoked")


func entitlements_restore(entitlement_id: String, body: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/entitlements/admin/%s/restore" % entitlement_id.uri_encode(), body, true
	)
	return _result(res, "restored")


func entitlements_audit(params: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var q := _query_string(params)
	var res: Dictionary = await ApiClient.request("GET", "/api/entitlements/admin/audit%s" % q, null, true)
	return _result(res, "entitlement_audit")


func entitlements_products() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request("GET", "/api/entitlements/admin/products", null, true)
	return _result(res, "products")


# —— Rewards ——

func rewards_search(params: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var q := _query_string(params)
	var res: Dictionary = await ApiClient.request("GET", "/api/rewards/admin/search%s" % q, null, true)
	return _result(res, "rewards")


func rewards_get(claim_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/rewards/admin/%s" % claim_id.uri_encode(), null, true
	)
	return _result(res, "reward")


func rewards_grant(body: Dictionary) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request("POST", "/api/rewards/admin/grant", body, true)
	return _result(res, "reward_granted")


func rewards_retry(claim_id: String, body: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/rewards/admin/%s/retry-delivery" % claim_id.uri_encode(), body, true
	)
	return _result(res, "retried")


func rewards_audit(params: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var q := _query_string(params)
	var res: Dictionary = await ApiClient.request("GET", "/api/rewards/admin/audit/recent%s" % q, null, true)
	return _result(res, "reward_audit")


# —— Audit ——

func audit_search(params: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var q := _query_string(params)
	var res: Dictionary = await ApiClient.request("GET", "/api/audit/admin/search%s" % q, null, true)
	return _result(res, "audit")


func audit_get(entry_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/audit/admin/%s" % entry_id.uri_encode(), null, true
	)
	return _result(res, "audit_entry")


func audit_timeline(account_id: String, params: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var q := _query_string(params)
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/audit/admin/timeline/%s%s" % [account_id.uri_encode(), q], null, true
	)
	return _result(res, "timeline")


func audit_annotate(entry_id: String, note: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/audit/admin/%s/annotations" % entry_id.uri_encode(),
		{"note": note}, true
	)
	return _result(res, "annotated")


func audit_export(body: Dictionary = {}) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request("POST", "/api/audit/admin/export", body, true)
	return _result(res, "exported")


func audit_integrity(entry_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/audit/admin/%s/integrity" % entry_id.uri_encode(), null, true
	)
	return _result(res, "integrity")


# —— Email / Schedules ——

func email_log(limit: int = 50) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/auth/admin/email-log?limit=%s" % clampi(limit, 1, 200), null, true
	)
	return _result(res, "email_log")


func email_test() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request("POST", "/api/auth/admin/email-test", {}, true)
	return _result(res, "email_test")


func schedules_list() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request("GET", "/api/schedules", null, true)
	return _result(res, "schedules")


func schedules_audit(limit: int = 50) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/schedules/audit?limit=%s" % clampi(limit, 1, 200), null, true
	)
	return _result(res, "schedule_audit")


func schedules_create(body: Dictionary) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request("POST", "/api/schedules", body, true)
	return _result(res, "schedule_created")


func schedules_pause(schedule_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/schedules/%s/pause" % schedule_id.uri_encode(), {}, true
	)
	return _result(res, "paused")


func schedules_resume(schedule_id: String) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/schedules/%s/resume" % schedule_id.uri_encode(), {}, true
	)
	return _result(res, "resumed")


func schedules_tick() -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request("POST", "/api/schedules/tick", {}, true)
	return _result(res, "ticked")


func schedules_preview(body: Dictionary) -> Dictionary:
	var gate := _require_admin()
	if not gate.is_empty():
		return gate
	var res: Dictionary = await ApiClient.request("POST", "/api/schedules/preview", body, true)
	return _result(res, "preview")


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
