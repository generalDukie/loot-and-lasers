extends Node
## PlayerPresence heartbeat + lookup (mirrors src/hooks/usePresence.jsx).

const HEARTBEAT_SEC := 30.0
const OFFLINE_MS := 90000.0

var current_status := "online"
var _timer: Timer
var _presence_id := ""
var _busy := false


func _ready() -> void:
	_timer = Timer.new()
	_timer.wait_time = HEARTBEAT_SEC
	_timer.timeout.connect(_on_tick)
	add_child(_timer)
	print("[PresenceManager] ready")


func start(status: String = "online") -> void:
	current_status = status
	_presence_id = ""
	await ping()
	if _timer.is_stopped():
		_timer.start()


func stop() -> void:
	_timer.stop()
	_presence_id = ""


func set_status(status: String) -> void:
	current_status = status
	ping()


func ping() -> void:
	if _busy:
		return
	var c: Dictionary = GameManager.active_character
	var cid := str(c.get("id", ""))
	if cid.is_empty() or AuthManager.access_token.is_empty():
		return
	_busy = true
	# Optional Nakama status side-channel (account-level); Node owns authority.
	if RealtimeManager.is_nakama_connected() and NakamaManager.socket != null:
		var status_payload := {"status": current_status}
		NakamaManager.socket.update_status_async(JSON.stringify(status_payload))
	var res: Dictionary = await GameApiClient.invoke("SetPresence", {"status": current_status})
	if bool(res.get("ok", false)) and typeof(res.get("data", {})) == TYPE_DICTIONARY:
		var presence: Variant = res.data.get("presence", {})
		if typeof(presence) == TYPE_DICTIONARY:
			_presence_id = str(presence.get("id", _presence_id))
	_busy = false


func _on_tick() -> void:
	ping()


static func display_status(presence: Variant) -> String:
	if typeof(presence) != TYPE_DICTIONARY or (presence as Dictionary).is_empty():
		return "offline"
	var age := _age_ms(str(presence.get("last_seen_at", "")))
	if age > OFFLINE_MS:
		return "offline"
	var st := str(presence.get("status", "online"))
	return "in_mission" if st == "in_mission" else "online"


static func status_color(status: String) -> Color:
	match status:
		"online":
			return Color(0.2, 0.83, 0.6)
		"in_mission":
			return Color(0.98, 0.75, 0.14)
		_:
			return Color(0.42, 0.45, 0.5)


static func status_label(status: String) -> String:
	match status:
		"online":
			return "Online"
		"in_mission":
			return "In mission"
		_:
			return "Offline"


func load_for(character_id: String) -> Dictionary:
	if character_id.is_empty():
		return {}
	var map: Dictionary = await load_map([character_id])
	return map.get(character_id, {}) if typeof(map.get(character_id, {})) == TYPE_DICTIONARY else {}


func load_map(character_ids: Array) -> Dictionary:
	var ids: Array = []
	for id in character_ids:
		var s := str(id)
		if not s.is_empty():
			ids.append(s)
	if ids.is_empty():
		return {}
	var res: Dictionary = await GameApiClient.invoke("GetPresenceMap", {"character_ids": ids})
	if not bool(res.get("ok", false)):
		return {}
	var data: Variant = res.get("data", {})
	if typeof(data) != TYPE_DICTIONARY:
		return {}
	var presence: Variant = data.get("presence", {})
	return presence if typeof(presence) == TYPE_DICTIONARY else {}


static func _age_ms(iso: String) -> float:
	if iso.is_empty():
		return OFFLINE_MS + 1.0
	var cleaned := iso.replace("Z", "").replace("z", "")
	var dict := Time.get_datetime_dict_from_datetime_string(cleaned, false)
	if dict.is_empty():
		return OFFLINE_MS + 1.0
	var then_ms := float(Time.get_unix_time_from_datetime_dict(dict)) * 1000.0
	return maxf(0.0, Time.get_unix_time_from_system() * 1000.0 - then_ms)
