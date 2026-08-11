extends Node
## Daily login + achievements / titles.

const PROMPT_CFG := "user://godot_daily_prompt.cfg"

var daily_progress: Dictionary = {}
var last_sync: Dictionary = {}
var last_achievements: Dictionary = {}
var last_collections: Dictionary = {}
## Authoritative ET day key from GET /api/time/now (falls back to local approx).
var server_today_et: String = ""
## serverNow ≈ localUnixMs + server_offset_ms (display countdowns only).
var server_offset_ms: int = 0
var ms_until_daily_reset: int = 0
var last_time_payload: Dictionary = {}


func _ready() -> void:
	print("[ProgressManager] ready")


func clear_local() -> void:
	daily_progress = {}
	last_sync = {}
	last_achievements = {}
	last_collections = {}
	server_today_et = ""
	server_offset_ms = 0
	ms_until_daily_reset = 0
	last_time_payload = {}


func sync_server_time() -> Dictionary:
	var res: Dictionary = await GameApiClient.request("GET", "/api/time/now", null, true)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		var data: Dictionary = res.data
		var key := str(data.get("todayET", ""))
		if key.is_empty():
			key = str(data.get("dailyPeriodKey", ""))
		if not key.is_empty():
			server_today_et = key
		var server_iso := str(data.get("serverTimeUtc", data.get("responseGeneratedAtUtc", "")))
		if not server_iso.is_empty():
			var server_ms := _parse_iso_ms(server_iso)
			if server_ms > 0:
				server_offset_ms = server_ms - int(Time.get_unix_time_from_system() * 1000)
		ms_until_daily_reset = int(data.get("msUntilDailyReset", data.get("msUntilNextETMidnight", 0)))
		last_time_payload = data
	return res


func estimate_server_now_ms() -> int:
	return int(Time.get_unix_time_from_system() * 1000) + server_offset_ms


## Prefer Node nextDailyResetAtUtc; fallback to local ET approx.
func ms_until_daily_reset_display() -> int:
	if not last_time_payload.is_empty():
		var next_iso := str(last_time_payload.get("nextDailyResetAtUtc", ""))
		if not next_iso.is_empty():
			var ends := _parse_iso_ms(next_iso)
			if ends > 0:
				return maxi(0, ends - estimate_server_now_ms())
		if ms_until_daily_reset > 0:
			return maxi(0, ms_until_daily_reset)
	return ArenaRules.ms_until_et_midnight_local_fallback()


func _parse_iso_ms(iso: String) -> int:
	var t := Time.get_unix_time_from_datetime_string(iso)
	if t <= 0:
		return 0
	return int(t * 1000)


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


## Server-authored daily login calendar + claim eligibility.
func load_daily_login_status() -> Dictionary:
	await sync_server_time()
	var res: Dictionary = await GameApiClient.invoke("GetDailyLoginStatus", {})
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		var data: Dictionary = res.data
		GameApiClient.apply_authoritative_response(data, "daily_login_status")
		var dl: Variant = data.get("daily_login", data)
		if typeof(dl) == TYPE_DICTIONARY:
			_ingest_daily_login_state(dl)
			return {"ok": true, "daily_login": dl, "data": data}
	# Fallback: entity filter + local calendar labels (eligibility still from server progress).
	await load_daily()
	var local := build_local_daily_login_state()
	return {"ok": true, "daily_login": local, "data": {}, "fallback": true}


func _ingest_daily_login_state(dl: Dictionary) -> void:
	var prog: Variant = dl.get("progress", null)
	if typeof(prog) == TYPE_DICTIONARY and not (prog as Dictionary).is_empty():
		daily_progress = prog
		return
	if dl.has("lastClaimedAt") or dl.has("currentDay"):
		daily_progress = {
			"last_claim_date": str(dl.get("lastClaimedAt", daily_progress.get("last_claim_date", ""))),
			"current_day": int(dl.get("currentDay", daily_progress.get("current_day", 1))),
			"claimed_days": _claimed_days_from_state(dl),
			"cycle_theme": str(dl.get("cycleTheme", daily_progress.get("cycle_theme", "Stardust Voyage"))),
		}


func _claimed_days_from_state(dl: Dictionary) -> Array:
	var out: Array = []
	var rows: Array = dl.get("rewards", []) if typeof(dl.get("rewards", [])) == TYPE_ARRAY else []
	for row in rows:
		if typeof(row) == TYPE_DICTIONARY and str(row.get("status", "")) == "claimed":
			out.append(int(row.get("day", 0)))
	if out.is_empty():
		var raw: Variant = daily_progress.get("claimed_days", [])
		if typeof(raw) == TYPE_ARRAY:
			return raw
	return out


## Client-side mirror for UI when GetDailyLoginStatus is unavailable.
## Does not grant rewards; claimability uses ProgressManager.can_claim_daily().
func build_local_daily_login_state() -> Dictionary:
	var current_day := int(daily_progress.get("current_day", 1))
	if current_day < 1:
		current_day = 1
	var last := str(daily_progress.get("last_claim_date", ""))
	var can_claim := can_claim_daily()
	var claimed_raw: Variant = daily_progress.get("claimed_days", [])
	var claimed: Array = claimed_raw if typeof(claimed_raw) == TYPE_ARRAY else []
	var claimed_set := {}
	for d in claimed:
		claimed_set[int(d)] = true
	var rewards: Array = []
	for entry in DailyLoginCatalog.ENTRIES:
		var day := int(entry.day)
		var status := "locked"
		if claimed_set.has(day):
			status = "claimed"
		elif day == current_day and can_claim:
			status = "available"
		rewards.append({
			"day": day,
			"status": status,
			"rewards": entry.rewards,
			"label": DailyLoginCatalog.reward_label(entry.rewards),
			"rewardType": "",
			"rewardAmount": 0,
		})
	return {
		"currentDay": current_day,
		"lastClaimedAt": last if not last.is_empty() else null,
		"canClaimToday": can_claim,
		"streakCount": claimed.size(),
		"cycleTheme": str(daily_progress.get("cycle_theme", "Stardust Voyage")),
		"rewards": rewards,
		"progress": daily_progress,
	}


## Auto-open at most once per ET day per account (matches web loot_daily_shown_*).
## Skipped (and not marked shown) while onboarding tutorial is pending/active.
func should_prompt_daily() -> bool:
	await sync_server_time()
	await load_daily()
	if not can_claim_daily():
		mark_daily_prompt_shown()
		return false
	if TutorialManager != null and TutorialManager.blocks_daily_login_prompt():
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
	var res: Dictionary = await GameApiClient.request(
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
	var res: Dictionary = await GameApiClient.invoke("ClaimDailyLogin", {})
	# 409 Already claimed — treat as success so the client locks the day.
	if not res.ok and int(res.get("status", 0)) == 409:
		_apply_progress_from_payload(res.get("data", {}))
		_apply_character(res)
		if typeof(res.get("data", null)) == TYPE_DICTIONARY:
			var dl409: Variant = res.data.get("daily_login", null)
			if typeof(dl409) == TYPE_DICTIONARY:
				_ingest_daily_login_state(dl409)
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
	if res.ok and typeof(res.get("data", null)) == TYPE_DICTIONARY:
		var dl: Variant = res.data.get("daily_login", null)
		if typeof(dl) == TYPE_DICTIONARY:
			_ingest_daily_login_state(dl)
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
	var res: Dictionary = await GameApiClient.invoke("SyncAchievements", body)
	_apply_character(res)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		last_sync = res.data
		var ach: Variant = res.data.get("achievements", null)
		if typeof(ach) == TYPE_DICTIONARY:
			last_achievements = ach
	return res


## Read-only hydrate — does not unlock; SyncAchievements evaluates retroactively.
func load_achievements() -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetAchievements", {})
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		last_achievements = res.data
		GameApiClient.apply_authoritative_response(res.data, "get_achievements")
	return res


func load_collections(gear_total: int = 0) -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("GetCollections", {
		"gear_total": maxi(0, gear_total),
	})
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		last_collections = res.data
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
	GameApiClient.apply_authoritative_response(
		res.data if typeof(res.data) == TYPE_DICTIONARY else {},
		"progress_mutation"
	)
