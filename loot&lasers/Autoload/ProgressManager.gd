extends Node
## Daily login + achievements / titles.

const PROMPT_CFG := "user://godot_daily_prompt.cfg"

var daily_progress: Dictionary = {}
var last_sync: Dictionary = {}
## Authoritative ET day key from GET /api/time/now (falls back to local approx).
var server_today_et: String = ""


func _ready() -> void:
	print("[ProgressManager] ready")


func sync_server_time() -> Dictionary:
	var res: Dictionary = await ApiClient.request("GET", "/api/time/now", null, true)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		var data: Dictionary = res.data
		var key := str(data.get("todayET", ""))
		if key.is_empty():
			key = str(data.get("dailyPeriodKey", ""))
		if not key.is_empty():
			server_today_et = key
	return res


## Prefer server calendar day; fallback approximates America/New_York (UTC−5, no DST).
func today_et() -> String:
	if not server_today_et.is_empty():
		return server_today_et
	var unix: int = int(Time.get_unix_time_from_system()) - 5 * 3600
	var d := Time.get_datetime_dict_from_unix_time(unix)
	return "%04d-%02d-%02d" % [int(d.get("year", 2026)), int(d.get("month", 1)), int(d.get("day", 1))]


func can_claim_daily() -> bool:
	var last := str(daily_progress.get("last_claim_date", ""))
	return last != today_et()


## Auto-open at most once per ET day per account (matches web loot_daily_shown_*).
func should_prompt_daily() -> bool:
	await sync_server_time()
	await load_daily()
	if not can_claim_daily():
		mark_daily_prompt_shown()
		return false
	if was_daily_prompt_shown():
		return false
	mark_daily_prompt_shown()
	return true


func load_daily() -> Dictionary:
	var cid := str(GameManager.active_character.get("id", ""))
	if cid.is_empty():
		daily_progress = {}
		return {"ok": false, "error": "No character"}
	var res: Dictionary = await ApiClient.request(
		"POST",
		"/api/entities/DailyLogin/filter",
		{"query": {"character_id": cid}, "sort": "-updated_date", "limit": 1},
		true
	)
	daily_progress = {}
	if res.ok and typeof(res.data) == TYPE_ARRAY and (res.data as Array).size() > 0:
		var row: Variant = res.data[0]
		if typeof(row) == TYPE_DICTIONARY:
			daily_progress = row
	return res


func claim_daily() -> Dictionary:
	await sync_server_time()
	var res: Dictionary = await ApiClient.invoke("ClaimDailyLogin", {})
	# 409 Already claimed — treat as success so the client locks the day.
	if not res.ok and int(res.get("status", 0)) == 409:
		_apply_progress_from_payload(res.get("data", {}))
		await load_daily()
		if can_claim_daily():
			_apply_progress_from_payload(res.get("data", {}))
			if can_claim_daily() and not today_et().is_empty():
				daily_progress["last_claim_date"] = today_et()
		mark_daily_prompt_shown()
		return {
			"ok": true,
			"status": 409,
			"error": "",
			"data": res.get("data", {}),
			"already_claimed": true,
		}
	_apply_character(res)
	_apply_progress_from_payload(res.get("data", {}))
	await load_daily()
	# Prefer server row; if filter lags/misses, keep claim payload progress.
	if res.ok and can_claim_daily():
		_apply_progress_from_payload(res.get("data", {}))
		if can_claim_daily() and not today_et().is_empty():
			daily_progress["last_claim_date"] = today_et()
	if res.ok:
		mark_daily_prompt_shown()
	return res


func was_daily_prompt_shown() -> bool:
	var key := _prompt_storage_key()
	if key.is_empty():
		return false
	var cfg := ConfigFile.new()
	if cfg.load(PROMPT_CFG) != OK:
		return false
	return str(cfg.get_value("shown", key, "")) == "1"


func mark_daily_prompt_shown() -> void:
	var key := _prompt_storage_key()
	if key.is_empty():
		return
	var cfg := ConfigFile.new()
	cfg.load(PROMPT_CFG)
	cfg.set_value("shown", key, "1")
	cfg.save(PROMPT_CFG)


func _prompt_storage_key() -> String:
	var uid := str(AuthManager.user.get("id", ""))
	if uid.is_empty():
		uid = "me"
	var day := today_et()
	if day.is_empty():
		return ""
	return "%s_%s" % [uid, day]


func _apply_progress_from_payload(payload: Variant) -> void:
	if typeof(payload) != TYPE_DICTIONARY:
		return
	var data: Dictionary = payload
	var prog: Variant = data.get("progress", null)
	if typeof(prog) == TYPE_DICTIONARY and not (prog as Dictionary).is_empty():
		daily_progress = prog


func sync_achievements(title = null) -> Dictionary:
	var body := {}
	if title != null:
		body["title"] = title
	var res: Dictionary = await ApiClient.invoke("SyncAchievements", body)
	_apply_character(res)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		last_sync = res.data
	return res


## Toast newly_unlocked ids from any claim/sync payload (web toastNewAchievements).
func toast_newly_unlocked(host: Node, payload: Dictionary = {}) -> void:
	var ids: Array = []
	var raw: Variant = payload.get("newly_unlocked", [])
	if typeof(raw) == TYPE_ARRAY:
		ids = raw
	elif typeof(payload.get("data", null)) == TYPE_DICTIONARY:
		var nested: Variant = payload.data.get("newly_unlocked", [])
		if typeof(nested) == TYPE_ARRAY:
			ids = nested
	if ids.is_empty():
		return
	var names := AchievementsCatalog.names_for_ids(ids)
	var title := "Achievement unlocked!" if ids.size() == 1 else "Achievements unlocked!"
	var body := ", ".join(names)
	if body.is_empty():
		var fallback: PackedStringArray = []
		for v in ids:
			fallback.append(str(v))
		body = ", ".join(fallback)
	ClientUi.show_toast(host, title, body)


func unlocked_titles() -> Array:
	var raw: Variant = GameManager.active_character.get("unlocked_titles", [])
	return raw if typeof(raw) == TYPE_ARRAY else []


func unlocked_achievements() -> Array:
	var raw: Variant = GameManager.active_character.get("unlocked_achievements", [])
	return raw if typeof(raw) == TYPE_ARRAY else []


func _apply_character(res: Dictionary) -> void:
	if not res.ok:
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var patch: Variant = data.get("patch", {})
	if typeof(patch) == TYPE_DICTIONARY and not (patch as Dictionary).is_empty():
		GameManager.active_character.merge(patch, true)
	var ch: Variant = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
		GameManager.active_character = ch
