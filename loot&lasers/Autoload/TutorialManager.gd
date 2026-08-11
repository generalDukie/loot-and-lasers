extends Node
## Click-locked, nav-ordered onboarding. Never navigates for the player.

signal tutorial_changed(tutorial: Dictionary)
signal tutorial_finished()

const HARD_GATES := ["click_target", "launch_mission", "arena_battle", "buy_attribute", "equip_item"]
const CLICK_GATES := ["click_target"]

var tutorial: Dictionary = {}
var busy: bool = false
var _loaded_for: String = ""
var _baseline: Dictionary = {}
var _checking_gate := false
var _coach_suppressed := false
var _mission_outro_ready := false


func _ready() -> void:
	if not GameManager.active_character_changed.is_connected(_on_character_changed):
		GameManager.active_character_changed.connect(_on_character_changed)
	if StatsManager != null and not StatsManager.character_changed.is_connected(_on_stats_changed):
		StatsManager.character_changed.connect(_on_stats_changed)
	if MissionManager != null and not MissionManager.active_mission_changed.is_connected(_on_mission_changed):
		MissionManager.active_mission_changed.connect(_on_mission_changed)
	if ArenaManager != null and not ArenaManager.battle_completed.is_connected(_on_arena_battle):
		ArenaManager.battle_completed.connect(_on_arena_battle)
	if DungeonManager != null and not DungeonManager.state_changed.is_connected(_on_dungeon_changed):
		DungeonManager.state_changed.connect(_on_dungeon_changed)


static func tag_target(node: Control, tutorial_id: String) -> void:
	if node == null or tutorial_id.is_empty():
		return
	node.set_meta("tutorial_id", tutorial_id)
	if not node.is_in_group("tutorial_target"):
		node.add_to_group("tutorial_target")
	_arm_target(node, tutorial_id)


static func _arm_target(node: Control, tutorial_id: String) -> void:
	var armed := str(node.get_meta("tutorial_armed", ""))
	if armed == tutorial_id:
		return
	node.set_meta("tutorial_armed", tutorial_id)
	if node is BaseButton:
		(node as BaseButton).pressed.connect(func() -> void: TutorialManager.report_click(tutorial_id))
	else:
		node.gui_input.connect(func(event: InputEvent) -> void:
			if not (event is InputEventMouseButton):
				return
			var mb := event as InputEventMouseButton
			if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
				TutorialManager.report_click(tutorial_id)
		)
	node.mouse_entered.connect(func() -> void: TutorialManager.report_hover(tutorial_id))


func clear_local() -> void:
	tutorial = {}
	busy = false
	_loaded_for = ""
	_baseline = {}
	_checking_gate = false
	_coach_suppressed = false
	_mission_outro_ready = false


func should_show() -> bool:
	if tutorial.is_empty():
		return false
	var status := str(tutorial.get("status", ""))
	return bool(tutorial.get("should_show", false)) and (status == "pending" or status == "active")


func coach_visible() -> bool:
	if not should_show():
		return false
	if _coach_suppressed:
		return false
	if step_id() == "mission_view_rewards" and not _mission_outro_ready:
		return false
	return true


func mission_outro_ready() -> bool:
	return _mission_outro_ready


func suppress_coach_for_combat() -> void:
	_coach_suppressed = true
	tutorial_changed.emit(tutorial)


func notify_mission_outro_ready() -> void:
	_mission_outro_ready = true
	_coach_suppressed = false
	tutorial_changed.emit(tutorial)


func current_step() -> Dictionary:
	var step = tutorial.get("step", {})
	return step if typeof(step) == TYPE_DICTIONARY else {}


func step_id() -> String:
	return str(current_step().get("id", ""))


func spotlight_id() -> String:
	return str(current_step().get("spotlight", ""))


func extra_spotlight_id() -> String:
	return str(current_step().get("extra_spotlight", ""))


func required_page() -> String:
	var raw = current_step().get("page", "")
	if raw == null:
		return ""
	var page := str(raw).strip_edges()
	if page.is_empty() or page == "<null>" or page == "null":
		return ""
	return page


func gate() -> String:
	return str(current_step().get("gate", "ack"))


func is_optional_gate() -> bool:
	return bool(current_step().get("optional", false))


func is_click_gate() -> bool:
	return gate() in CLICK_GATES


func is_hard_gate() -> bool:
	return gate() in HARD_GATES


func mounted_page_path() -> String:
	var mounted := str(GameManager.current_page_path).strip_edges()
	if not mounted.is_empty():
		return mounted
	return str(GameManager.pending_page_path).strip_edges()


func is_on_required_page() -> bool:
	var page := required_page()
	if page.is_empty():
		return true
	var mounted := str(GameManager.current_page_path).strip_edges()
	if mounted == page:
		return true
	# Combat overlays still count as their parent loop.
	if page == GameManager.SCENE_ARENA and mounted == GameManager.SCENE_ARENA_COMBAT:
		return true
	if page == GameManager.SCENE_GALAXY and mounted == GameManager.SCENE_GALAXY_COMBAT:
		return true
	if page == GameManager.SCENE_MISSION_COMBAT and mounted == GameManager.SCENE_MISSION_COMBAT:
		return true
	if page == GameManager.SCENE_CANTINA and mounted == GameManager.SCENE_MISSION_RUN:
		return gate() == "launch_mission"
	return false


func page_is_pending() -> bool:
	var page := required_page()
	if page.is_empty():
		return false
	var pending := str(GameManager.pending_page_path).strip_edges()
	var mounted := str(GameManager.current_page_path).strip_edges()
	return pending == page and mounted != page


func nav_path_for_id(tutorial_id: String) -> String:
	match tutorial_id:
		"nav-hero":
			return GameManager.SCENE_STATS
		"nav-cantina":
			return GameManager.SCENE_CANTINA
		"nav-frontier":
			return GameManager.SCENE_GALAXY
		"nav-friends":
			return GameManager.SCENE_FRIENDS
		"nav-mail":
			return GameManager.SCENE_MAIL
		"nav-arena":
			return GameManager.SCENE_ARENA
		"nav-ranks":
			return GameManager.SCENE_LEADERBOARD
		"nav-shop":
			return GameManager.SCENE_SHOP
		"nav-casino":
			return GameManager.SCENE_CASINO
		"nav-mine":
			return GameManager.SCENE_MINING
		_:
			return ""


func nav_spotlight_for_page(page: String) -> String:
	match page:
		GameManager.SCENE_STATS, GameManager.SCENE_COLLECTIBLES:
			return "nav-hero"
		GameManager.SCENE_CANTINA, GameManager.SCENE_MISSION_RUN:
			return "nav-cantina"
		GameManager.SCENE_GALAXY:
			return "nav-frontier"
		GameManager.SCENE_FRIENDS:
			return "nav-friends"
		GameManager.SCENE_MAIL:
			return "nav-mail"
		GameManager.SCENE_ARENA:
			return "nav-arena"
		GameManager.SCENE_LEADERBOARD:
			return "nav-ranks"
		GameManager.SCENE_SHOP:
			return "nav-shop"
		GameManager.SCENE_CASINO:
			return "nav-casino"
		GameManager.SCENE_MINING:
			return "nav-mine"
		_:
			return ""


## Lock unrelated side-nav while a step is active. Never blocks the highlighted control.
func nav_allowed(path: String) -> bool:
	if not should_show():
		return true
	if is_click_gate():
		var target_path := nav_path_for_id(spotlight_id())
		if target_path.is_empty():
			return false
		return path == target_path
	var req := required_page()
	if req.is_empty():
		return false
	if is_on_required_page():
		return false
	return path == req or path == nav_path_for_id(nav_spotlight_for_page(req))


func report_click(tutorial_id: String) -> void:
	if not should_show() or busy:
		return
	if not is_click_gate():
		return
	if tutorial_id != spotlight_id() and tutorial_id != extra_spotlight_id():
		if step_id() == "mission_fight" and tutorial_id == "mission-skip":
			tutorial_changed.emit(tutorial)
		return
	if step_id() == "mission_fight" and tutorial_id == "mission-skip":
		tutorial_changed.emit(tutorial)
		return
	if step_id() == "mission_fight" and tutorial_id == "mission-fight":
		suppress_coach_for_combat()
	if step_id() == "continue_travels" and tutorial_id == "nav-cantina":
		tutorial_changed.emit(tutorial)
		return
	advance_gate(gate())


func report_hover(tutorial_id: String) -> void:
	if not should_show() or busy:
		return
	if gate() != "hover_gear":
		return
	if tutorial_id != spotlight_id() and tutorial_id != extra_spotlight_id() and tutorial_id != "hero-doll":
		return
	advance_gate("hover_gear")


func _on_character_changed(character: Dictionary, source: String) -> void:
	var cid := str(character.get("id", ""))
	if cid.is_empty():
		if source == "logout" or GameManager.state != GameManager.GameState.IN_GAME:
			clear_local()
			tutorial_changed.emit({})
		return
	if _loaded_for == cid:
		if source != "tutorial":
			_check_action_progress()
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
	var next_step := str(tutorial.get("step", {}).get("id", "")) if typeof(tutorial.get("step", {})) == TYPE_DICTIONARY else ""
	if next_step != "mission_view_rewards":
		_mission_outro_ready = false
	if next_step != "mission_fight" and next_step != "mission_view_rewards":
		_coach_suppressed = false
	var ch = data.get("character", {})
	if typeof(ch) == TYPE_DICTIONARY and not ch.is_empty():
		GameManager.apply_active_character(ch, "tutorial")
	_capture_baseline()
	tutorial_changed.emit(tutorial)
	if not should_show():
		tutorial_finished.emit()
		return
	call_deferred("_resume_satisfied_gates")


func _resume_satisfied_gates() -> void:
	if busy or not should_show():
		return
	if not is_hard_gate() or is_click_gate() or gate() == "hover_gear":
		return
	if is_optional_gate() and not _can_perform_optional():
		return
	if not _resume_gate_already_done():
		return
	advance_gate(gate())


func _resume_gate_already_done() -> bool:
	var ch: Dictionary = GameManager.active_character
	match gate():
		"launch_mission":
			return _has_active_mission(ch) or _missions_done(ch) > 0
		"arena_battle":
			return _arena_fights(ch) > 0
		"dungeon_fight":
			return _dungeon_progress(ch) > 0 or not str(_dungeon_finish_key()).is_empty()
		"buy_attribute":
			return _attr_purchases(ch) > int(_baseline.get("purchases", 0))
		"equip_item":
			return _equipped_count() > int(_baseline.get("equipped", 0))
		_:
			return false


func _capture_baseline() -> void:
	var ch: Dictionary = GameManager.active_character
	_baseline = {
		"purchases": _attr_purchases(ch),
		"mission": _has_active_mission(ch),
		"missions_completed": _missions_done(ch),
		"equipped": _equipped_count(),
		"buffs": _buff_count(ch),
		"arena": _arena_fights(ch),
		"dungeon": _dungeon_progress(ch),
		"dungeon_finish": _dungeon_finish_key(),
	}


func notify_page_changed(path: String) -> void:
	if not should_show():
		return
	if step_id() == "continue_travels" and path == GameManager.SCENE_CANTINA:
		advance_next()
		return
	tutorial_changed.emit(tutorial)
	# Never auto-advance just because a page loaded. Clicks / real actions only.


func primary_label() -> String:
	return str(current_step().get("cta", "Continue"))


func can_press_primary() -> bool:
	if busy:
		return false
	if gate() == "finish":
		return true
	if gate() == "ack" and is_on_required_page():
		return true
	if is_hard_gate() and is_optional_gate() and is_on_required_page() and not _can_perform_optional():
		return true
	return false


func shows_primary() -> bool:
	if gate() == "finish" or gate() == "ack":
		return true
	if is_optional_gate() and is_on_required_page() and not _can_perform_optional():
		return true
	return false


func _can_perform_optional() -> bool:
	match gate():
		"hover_gear":
			return _equipped_count() > 0
		"equip_item":
			return _has_unequipped_gear()
		"arena_battle":
			return ArenaManager != null and ArenaManager.free_battles_left > 0
		"dungeon_fight":
			return _frontier_fight_available()
		"click_target":
			return true
		_:
			return true


func go_next() -> void:
	if busy or not shows_primary() or not can_press_primary():
		return
	if gate() == "finish":
		complete()
		return
	if is_optional_gate() and not _can_perform_optional():
		advance_next()
		return
	if gate() == "ack":
		advance_next()


func go_back() -> void:
	if busy or step_id() == "click_operative":
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


func advance_gate(gate_id: String) -> void:
	if busy or gate_id.is_empty():
		return
	_mutate("AdvanceTutorial", {"action": "gate", "gate": gate_id})


func _mutate(fn: String, body: Dictionary) -> void:
	busy = true
	tutorial_changed.emit(tutorial)
	var res: Dictionary = await GameApiClient.invoke(fn, body)
	busy = false
	if not res.get("ok", false):
		push_warning("[TutorialManager] %s failed: %s" % [fn, res.get("error", res)])
		tutorial_changed.emit(tutorial)
		return
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	_apply_payload(data)


func _on_stats_changed() -> void:
	if gate() in ["equip_item", "buy_attribute"]:
		_check_action_progress()
	else:
		tutorial_changed.emit(tutorial)


func _on_mission_changed(_mission: Dictionary = {}) -> void:
	if gate() == "launch_mission":
		_check_action_progress()
	else:
		tutorial_changed.emit(tutorial)


func _on_arena_battle(_result: Dictionary = {}) -> void:
	if gate() == "arena_battle":
		_check_action_progress()
	else:
		tutorial_changed.emit(tutorial)


func _on_dungeon_changed() -> void:
	if gate() == "dungeon_fight":
		_check_action_progress()
	else:
		tutorial_changed.emit(tutorial)


func _check_action_progress() -> void:
	if _checking_gate or busy or not should_show():
		return
	if not is_hard_gate() or is_click_gate() or gate() == "hover_gear":
		tutorial_changed.emit(tutorial)
		return
	if not _action_happened_this_step():
		tutorial_changed.emit(tutorial)
		return
	_checking_gate = true
	advance_gate(gate())
	_checking_gate = false


func _action_happened_this_step() -> bool:
	var ch: Dictionary = GameManager.active_character
	match gate():
		"launch_mission":
			return (_has_active_mission(ch) and not bool(_baseline.get("mission", false))) \
				or _missions_done(ch) > int(_baseline.get("missions_completed", 0))
		"equip_item":
			return _equipped_count() > int(_baseline.get("equipped", 0))
		"buy_attribute":
			return _attr_purchases(ch) > int(_baseline.get("purchases", 0))
		"arena_battle":
			return _arena_fights(ch) > int(_baseline.get("arena", 0))
		"dungeon_fight":
			return _dungeon_progress(ch) > int(_baseline.get("dungeon", 0)) \
				or (_dungeon_finish_key() != str(_baseline.get("dungeon_finish", "")))
		_:
			return false


func _attr_purchases(ch: Dictionary) -> int:
	var n := int(ch.get("attribute_purchases", 0))
	if n > 0:
		return n
	var by_stat = ch.get("attribute_purchases_by_stat", {})
	if typeof(by_stat) != TYPE_DICTIONARY:
		return 0
	var total := 0
	for k in by_stat.keys():
		total += int(by_stat[k])
	return total


func _has_active_mission(ch: Dictionary) -> bool:
	if MissionManager != null and MissionManager.has_method("has_active_mission") and MissionManager.has_active_mission():
		return true
	return not str(ch.get("active_mission_id", "")).is_empty()


func _missions_done(ch: Dictionary) -> int:
	return int(ch.get("missions_completed", 0))


func _equipped_count() -> int:
	if StatsManager == null:
		return 0
	return StatsManager.equipped_items.size()


func _has_unequipped_gear() -> bool:
	if StatsManager == null:
		return false
	for it in StatsManager.all_items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if bool(it.get("is_equipped", false)):
			continue
		if InventoryRules.is_equippable(str(it.get("type", ""))):
			return true
	return false


func _has_sellable_item() -> bool:
	if StatsManager == null:
		return false
	for it in StatsManager.all_items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if bool(it.get("is_equipped", false)):
			continue
		if str(it.get("id", "")).is_empty():
			continue
		return true
	return false


func _has_shop_stock() -> bool:
	if ShopManager == null:
		return false
	if not ShopManager.hot_deal().is_empty():
		return true
	return not ShopManager.shop_stock().is_empty() or not ShopManager.cons_stock().is_empty()


func _frontier_fight_available() -> bool:
	if DungeonManager == null:
		return false
	if DungeonManager.cooldown_ms() > 0:
		return false
	var enter: Dictionary = DungeonManager.can_enter_story(DungeonManager.current_planet_id())
	return bool(enter.get("ok", false))


func _buff_count(ch: Dictionary) -> int:
	var buffs = ch.get("active_buffs", [])
	return buffs.size() if typeof(buffs) == TYPE_ARRAY else 0


func _arena_fights(ch: Dictionary) -> int:
	return int(ch.get("arena_battles", 0)) + int(ch.get("arena_wins", 0)) + int(ch.get("arena_losses", 0))


func _dungeon_progress(ch: Dictionary) -> int:
	return int(ch.get("dungeon_nodes_cleared", 0)) + int(ch.get("dungeon_clears", 0))


func _dungeon_finish_key() -> String:
	if DungeonManager == null:
		return ""
	var finish = DungeonManager.last_finish
	if typeof(finish) != TYPE_DICTIONARY or finish.is_empty():
		return ""
	return str(finish.get("combat_id", finish.get("id", JSON.stringify(finish))))
