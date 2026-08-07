extends Node
## Server-backed interactive onboarding (parity with web TutorialProvider).

signal tutorial_changed(tutorial: Dictionary)
signal tutorial_finished()

var tutorial: Dictionary = {}
var busy: bool = false
var _loaded_for: String = ""
var _prev_page: String = ""
var _step_at_page_watch: String = ""


func _ready() -> void:
	if not GameManager.active_character_changed.is_connected(_on_character_changed):
		GameManager.active_character_changed.connect(_on_character_changed)


func clear_local() -> void:
	tutorial = {}
	busy = false
	_loaded_for = ""
	_prev_page = ""
	_step_at_page_watch = ""


func should_show() -> bool:
	if tutorial.is_empty():
		return false
	var status := str(tutorial.get("status", ""))
	return bool(tutorial.get("should_show", false)) and (status == "pending" or status == "active")


func current_step() -> Dictionary:
	var step = tutorial.get("step", {})
	return step if typeof(step) == TYPE_DICTIONARY else {}


func step_id() -> String:
	return str(current_step().get("id", ""))


func spotlight_id() -> String:
	return str(current_step().get("spotlight", ""))


func _on_character_changed(character: Dictionary, _source: String) -> void:
	var cid := str(character.get("id", ""))
	if cid.is_empty():
		clear_local()
		tutorial_changed.emit({})
		return
	if _loaded_for == cid:
		return
	_loaded_for = cid
	refresh()


func refresh() -> void:
	if GameManager.selected_character_id().is_empty():
		return
	var res: Dictionary = await GameApiClient.invoke("GetTutorialState", {}, true)
	if not res.get("ok", false):
		return
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	_apply_payload(data)


func _apply_payload(data: Dictionary) -> void:
	var t = data.get("tutorial", {})
	tutorial = t if typeof(t) == TYPE_DICTIONARY else {}
	var ch = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not ch.is_empty():
		GameManager.apply_active_character(ch, "tutorial")
	_step_at_page_watch = step_id()
	_prev_page = GameManager.pending_page_path
	tutorial_changed.emit(tutorial)
	if not should_show():
		tutorial_finished.emit()


## Called by GameShell after a page swap.
func notify_page_changed(path: String) -> void:
	if not should_show():
		_prev_page = path
		return
	var step := current_step()
	var route := _godot_route_for_step(str(step.get("id", "")))
	var arrived := (not route.is_empty()) and path == route and _prev_page != route and _step_at_page_watch == step_id()
	_prev_page = path
	if arrived:
		advance_next()


func _godot_route_for_step(id: String) -> String:
	match id:
		"hero", "inventory":
			return GameManager.SCENE_STATS
		"mission":
			return GameManager.SCENE_CANTINA
		"arena":
			return GameManager.SCENE_ARENA
		_:
			return ""


func primary_label() -> String:
	match step_id():
		"welcome":
			return "Let's go"
		"hero":
			return "Open Hero"
		"mission":
			return "Open Cantina"
		"inventory":
			return "Continue"
		"arena":
			return "Open Arena"
		"daily":
			return "Got it"
		"wallet":
			return "Continue"
		"finish":
			return "Claim & play"
		_:
			return "Next"


func go_next() -> void:
	if busy:
		return
	var id := step_id()
	if id == "finish":
		complete()
		return
	var route := _godot_route_for_step(id)
	if not route.is_empty() and GameManager.pending_page_path != route and (id == "hero" or id == "mission" or id == "arena"):
		GameManager.open_game_page(route)
		return
	if id == "daily":
		var shell := _find_shell()
		if shell != null and shell.has_method("open_daily_login_modal"):
			shell.call("open_daily_login_modal")
	advance_next()


func go_back() -> void:
	if busy or step_id() == "welcome":
		return
	_mutate("AdvanceTutorial", {"action": "back"})


func skip() -> void:
	if busy:
		return
	_mutate("SkipTutorial", {})


func complete() -> void:
	if busy:
		return
	_mutate("CompleteTutorial", {})


func advance_next() -> void:
	if busy:
		return
	_mutate("AdvanceTutorial", {"action": "next"})


func _mutate(fn: String, body: Dictionary) -> void:
	busy = true
	var res: Dictionary = await GameApiClient.invoke(fn, body)
	busy = false
	if not res.get("ok", false):
		push_warning("[TutorialManager] %s failed: %s" % [fn, res.get("error", res)])
		return
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	_apply_payload(data)


func _find_shell() -> Node:
	var tree := get_tree()
	if tree == null:
		return null
	return tree.root.find_child("GameShell", true, false)
