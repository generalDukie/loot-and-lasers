extends Node
## When a combat replay overlay is dismissed mid-fight, settle rewards in the
## background and let the source page offer a "View Rewards" button.
## If the player already reached Victory/Defeat (outro) and leaves, keep the
## battle pending until they return and press View Rewards.
## `last_watch` survives clear() so Replay can remount the same fight presentation.

signal state_changed

const STATE_NONE := ""
const STATE_OUTRO_PENDING := "outro_pending"
const STATE_SETTLING := "settling"
const STATE_SETTLED := "settled_unviewed"

var state := STATE_NONE
var kind := "" ## mission | arena | dungeon
var prev_level := 1
var dungeon_ctx: Dictionary = {}
var settle_payload: Dictionary = {}
var settle_error := ""
var _settle_token := 0
## Survives clear() — battle + summary for watch-only Replay from source-page sheets.
var last_watch: Dictionary = {}


func clear() -> void:
	state = STATE_NONE
	kind = ""
	prev_level = 1
	dungeon_ctx = {}
	settle_payload = {}
	settle_error = ""
	state_changed.emit()


func has_view_rewards_cta() -> bool:
	return state == STATE_OUTRO_PENDING or state == STATE_SETTLED or state == STATE_SETTLING


func is_for_kind(k: String) -> bool:
	return kind == k and has_view_rewards_cta()


func note_outro_pending(combat_kind: String, level_before: int, ctx: Dictionary = {}) -> void:
	kind = combat_kind
	prev_level = level_before
	dungeon_ctx = ctx.duplicate(true) if not ctx.is_empty() else {}
	settle_payload = {}
	settle_error = ""
	state = STATE_OUTRO_PENDING
	state_changed.emit()


func begin_settle_from_replay(combat_kind: String, level_before: int, ctx: Dictionary = {}) -> void:
	kind = combat_kind
	prev_level = level_before
	dungeon_ctx = ctx.duplicate(true) if not ctx.is_empty() else {}
	settle_payload = {}
	settle_error = ""
	state = STATE_SETTLING
	state_changed.emit()
	_settle_token += 1
	var token := _settle_token
	var res: Dictionary = await _run_settle()
	if token != _settle_token:
		return
	if not bool(res.get("ok", false)):
		settle_error = str(res.get("error", "Settle failed"))
		# Arena mid-dismiss without finish used to only release the client lock.
		if kind == "arena":
			ArenaManager.release_presentation_lock()
		state = STATE_NONE
		state_changed.emit()
		return
	settle_payload = res
	state = STATE_SETTLED
	state_changed.emit()


func capture_presentation_from_managers(
	combat_kind: String,
	level_before: int,
	ctx: Dictionary = {}
) -> void:
	## Snapshot pending duel data before settle clears manager pending_* fields.
	var battle: Dictionary = {}
	var enemy: Dictionary = {}
	var player_items: Array = []
	var enemy_items: Array = []
	match combat_kind:
		"mission":
			battle = MissionManager.pending_battle.duplicate(true) \
				if typeof(MissionManager.pending_battle) == TYPE_DICTIONARY else {}
			enemy = MissionManager.pending_enemy.duplicate(true) \
				if typeof(MissionManager.pending_enemy) == TYPE_DICTIONARY else {}
			player_items = MissionManager.pending_player_items.duplicate(true) \
				if typeof(MissionManager.pending_player_items) == TYPE_ARRAY else []
		"dungeon":
			battle = DungeonManager.pending_battle.duplicate(true) \
				if typeof(DungeonManager.pending_battle) == TYPE_DICTIONARY else {}
			enemy = DungeonManager.pending_enemy.duplicate(true) \
				if typeof(DungeonManager.pending_enemy) == TYPE_DICTIONARY else {}
			player_items = DungeonManager.pending_player_items.duplicate(true) \
				if typeof(DungeonManager.pending_player_items) == TYPE_ARRAY else []
		_:
			battle = ArenaManager.pending_battle.duplicate(true) \
				if typeof(ArenaManager.pending_battle) == TYPE_DICTIONARY else {}
			enemy = ArenaManager.pending_opp.duplicate(true) \
				if typeof(ArenaManager.pending_opp) == TYPE_DICTIONARY else {}
			player_items = ArenaManager.equipped_items.duplicate(true) \
				if typeof(ArenaManager.equipped_items) == TYPE_ARRAY else []
			enemy_items = ArenaRules.resolve_opp_items(enemy) if not enemy.is_empty() else []
	if battle.is_empty() and typeof(last_watch.get("battle", null)) == TYPE_DICTIONARY:
		return
	last_watch = {
		"kind": combat_kind,
		"prev_level": level_before,
		"dungeon_ctx": ctx.duplicate(true) if not ctx.is_empty() else {},
		"battle": battle,
		"enemy": enemy,
		"player": GameManager.active_character.duplicate(true),
		"player_items": player_items,
		"enemy_items": enemy_items,
		"summary": last_watch.get("summary", {}),
	}


func remember_watch_summary(
	summary: Dictionary,
	battle: Dictionary = {},
	level_before: int = -1,
	ctx: Dictionary = {}
) -> void:
	## Attach the built combat report (without Callables) for later remount / CRM Replay.
	var slim := summary.duplicate(true)
	slim.erase("actions")
	if last_watch.is_empty():
		last_watch = {
			"kind": str(summary.get("mode", "arena")),
			"prev_level": level_before if level_before >= 0 else prev_level,
			"dungeon_ctx": ctx.duplicate(true) if not ctx.is_empty() else dungeon_ctx.duplicate(true),
			"battle": battle.duplicate(true) if not battle.is_empty() else {},
			"enemy": {},
			"player": GameManager.active_character.duplicate(true),
			"player_items": [],
			"enemy_items": [],
		}
	if not battle.is_empty():
		last_watch["battle"] = battle.duplicate(true)
	if level_before >= 0:
		last_watch["prev_level"] = level_before
	if not ctx.is_empty():
		last_watch["dungeon_ctx"] = ctx.duplicate(true)
	last_watch["summary"] = slim
	last_watch["won"] = bool(summary.get("won", false))


func restore_presentation_to_managers() -> void:
	if last_watch.is_empty():
		return
	var combat_kind := str(last_watch.get("kind", "arena"))
	var battle: Dictionary = last_watch.get("battle", {}) if typeof(last_watch.get("battle", null)) == TYPE_DICTIONARY else {}
	var enemy: Dictionary = last_watch.get("enemy", {}) if typeof(last_watch.get("enemy", null)) == TYPE_DICTIONARY else {}
	var player_items: Array = last_watch.get("player_items", []) if typeof(last_watch.get("player_items", null)) == TYPE_ARRAY else []
	match combat_kind:
		"mission":
			MissionManager.pending_battle = battle.duplicate(true)
			MissionManager.pending_enemy = enemy.duplicate(true)
			MissionManager.pending_player_items = player_items.duplicate(true)
		"dungeon":
			DungeonManager.pending_battle = battle.duplicate(true)
			DungeonManager.pending_enemy = enemy.duplicate(true)
			DungeonManager.pending_player_items = player_items.duplicate(true)
		_:
			ArenaManager.pending_battle = battle.duplicate(true)
			ArenaManager.pending_opp = enemy.duplicate(true)
			ArenaManager.equipped_items = player_items.duplicate(true)


func start_watch_replay() -> void:
	## From a source-page reward sheet: remount combat overlay in watch-only mode.
	if last_watch.is_empty() or typeof(last_watch.get("battle", null)) != TYPE_DICTIONARY:
		Notify.blocked("Combat replay unavailable")
		return
	if (last_watch.get("battle", {}) as Dictionary).is_empty():
		Notify.blocked("Combat replay unavailable")
		return
	restore_presentation_to_managers()
	GameManager.combat_watch_only = true
	var combat_kind := str(last_watch.get("kind", "arena"))
	match combat_kind:
		"mission":
			GameManager.go_mission_combat()
		"dungeon":
			GameManager.go_galaxy_combat()
		_:
			GameManager.go_arena_combat()


func _replay_action() -> Dictionary:
	return {
		"label": "Replay",
		"primary": false,
		"replay": true,
		"callback": func() -> void: start_watch_replay(),
	}


func _run_settle() -> Dictionary:
	match kind:
		"mission":
			var mission_won := str(MissionManager.pending_battle.get("winner", "")) == "player"
			var res: Dictionary = await MissionManager.resolve_combat_outcome()
			if not bool(res.get("ok", false)):
				return res
			return {
				"ok": true,
				"won": mission_won,
				"data": res.data if typeof(res.get("data", null)) == TYPE_DICTIONARY else {},
			}
		"dungeon":
			var dungeon_won := str(DungeonManager.pending_battle.get("winner", "")) == "player"
			var res: Dictionary = await DungeonManager.finish_battle()
			if not bool(res.get("ok", false)):
				return res
			var finish_data: Dictionary = DungeonManager.last_finish.duplicate(true)
			if not finish_data.has("won"):
				finish_data["won"] = dungeon_won
			return {"ok": true, "won": dungeon_won, "data": finish_data}
		_:
			var res: Dictionary = await ArenaManager.finish_battle()
			if not bool(res.get("ok", false)):
				return res
			return {"ok": true, "won": bool(res.get("won", false)), "data": res}


## Settle if still outro-pending, then mount the reward sheet on `host`.
func present_rewards(host: Control) -> void:
	if host == null or not is_instance_valid(host):
		return
	if state == STATE_SETTLING:
		Notify.blocked("Still settling rewards…")
		return
	if state == STATE_OUTRO_PENDING:
		state = STATE_SETTLING
		state_changed.emit()
		_settle_token += 1
		var token := _settle_token
		var res: Dictionary = await _run_settle()
		if token != _settle_token:
			return
		if not bool(res.get("ok", false)):
			settle_error = str(res.get("error", "Settle failed"))
			state = STATE_OUTRO_PENDING
			state_changed.emit()
			Notify.blocked(settle_error)
			return
		settle_payload = res
		state = STATE_SETTLED
		state_changed.emit()
	if state != STATE_SETTLED:
		return
	var payload := settle_payload.duplicate(true)
	var combat_kind := kind
	var level_before := prev_level
	var ctx := dungeon_ctx.duplicate(true)
	clear()
	_mount_sheet(host, combat_kind, level_before, payload, ctx)


func _mount_sheet(
	host: Control,
	combat_kind: String,
	level_before: int,
	payload: Dictionary,
	ctx: Dictionary
) -> void:
	for c in host.get_children():
		c.queue_free()
	host.visible = true
	host.mouse_filter = Control.MOUSE_FILTER_STOP
	var data: Dictionary = payload.get("data", {}) if typeof(payload.get("data", null)) == TYPE_DICTIONARY else {}
	var won := bool(payload.get("won", false))
	match combat_kind:
		"mission":
			ProgressManager.toast_newly_unlocked(host, data)
			var summary := _mission_summary(won, data)
			remember_watch_summary(summary, {}, level_before, ctx)
			CombatSheets.present_complete_then_level_up(
				host, summary, level_before, GameManager.active_character, true
			)
		"dungeon":
			ProgressManager.toast_newly_unlocked(host, data)
			var summary := _dungeon_summary(data, ctx)
			remember_watch_summary(summary, {}, level_before, ctx)
			CombatSheets.present_complete_then_level_up(
				host, summary, level_before, GameManager.active_character, true
			)
		_:
			ProgressManager.toast_newly_unlocked(
				host, data.get("data", {}) if typeof(data.get("data", null)) == TYPE_DICTIONARY else data
			)
			var summary := _arena_summary(data)
			remember_watch_summary(summary, {}, level_before, ctx)
			CombatSheets.present_complete_then_level_up(
				host, summary, level_before, GameManager.active_character, false
			)


func _mission_summary(won: bool, data: Dictionary) -> Dictionary:
	if bool(data.get("mission_missing", false)):
		return {
			"won": false,
			"mode": "mission",
			"title": "Mission record lost",
			"subtitle": "Your ship has been recalled — no rewards were issued.",
			"note": "Launch a new mission from the cantina.",
			"actions": [
				{"label": "Back to Cantina", "primary": true, "callback": func() -> void: GameManager.go_cantina()},
			],
		}
	var gains: Dictionary = data.get("gains", {}) if typeof(data.get("gains", null)) == TYPE_DICTIONARY else {}
	var items: Array = data.get("items", []) if typeof(data.get("items", null)) == TYPE_ARRAY else []
	var gear = items[0] if items.size() > 0 and typeof(items[0]) == TYPE_DICTIONARY else null
	var outcome := str(data.get("item_outcome", "")).to_upper()
	var note := ""
	if won and outcome == "NONE":
		note = "No item recovered this run."
	var xp_val := int(gains.get("experience", 0))
	var sd_val := int(gains.get("stardust", 0))
	var has_loss_rewards := not won and (xp_val > 0 or sd_val > 0 or not items.is_empty())
	return {
		"won": won,
		"mode": "mission",
		"title": "Victory" if won else "Defeat",
		"subtitle": "" if won else (
			"Reduced rewards issued." if has_loss_rewards
			else "No stardust, XP, or loot. Fuel was already spent."
		),
		"xp": xp_val,
		"stardust": sd_val,
		"gear_item": gear,
		"reward_items": items if (won or has_loss_rewards) else [],
		"note": note,
		"progression": data.get("progression", {}) if typeof(data.get("progression", null)) == TYPE_DICTIONARY else {},
		"actions": [
			{"label": "Cantina", "primary": true, "callback": func() -> void: GameManager.go_cantina()},
			{
				"label": "Operative" if won else "Hub",
				"primary": false,
				"callback": (func() -> void: GameManager.go_stats()) if won else (func() -> void: GameManager.go_hub()),
			},
			_replay_action(),
		],
	}


func _dungeon_summary(data: Dictionary, ctx: Dictionary) -> Dictionary:
	var won := bool(data.get("won", false))
	var rewards: Dictionary = data.get("rewards", {}) if typeof(data.get("rewards", null)) == TYPE_DICTIONARY else {}
	var items: Array = data.get("items", []) if typeof(data.get("items", null)) == TYPE_ARRAY else []
	var gear = items[0] if items.size() > 0 and typeof(items[0]) == TYPE_DICTIONARY else null
	var enemy_name := str(ctx.get("enemy_name", "Foe"))
	var planet_name := str(ctx.get("planet_name", "Frontier"))
	var is_boss := bool(ctx.get("is_boss", false))
	var enemy_index := int(ctx.get("enemy_index", 1))
	var context := planet_name
	if is_boss:
		context += " · Boss · %s" % enemy_name
	elif won:
		context += " · Enemy %s" % enemy_index
	else:
		context += " · Fell to %s" % enemy_name
	var note := ""
	if not won:
		note = "No rewards on defeat."
	elif items.size() > 1:
		note = "Loot: %s item(s)" % items.size()
	return {
		"won": won,
		"mode": "dungeon",
		"title": "Victory" if won else "Defeat",
		"subtitle": context,
		"xp": int(rewards.get("experience", 0)) if won else 0,
		"stardust": int(rewards.get("stardust", 0)) if won else 0,
		"gear_item": gear,
		"reward_items": items if won else [],
		"note": note,
		"progression": data.get("progression", {}) if typeof(data.get("progression", null)) == TYPE_DICTIONARY else {},
		"actions": [
			{"label": "Back to Frontier", "primary": true, "callback": func() -> void: GameManager.go_galaxy()},
			{"label": "Hub", "primary": false, "callback": func() -> void: GameManager.go_hub()},
			_replay_action(),
		],
	}


func _arena_summary(result: Dictionary) -> Dictionary:
	var won := bool(result.get("won", false))
	var rewards: Dictionary = result.get("rewards", {}) if typeof(result.get("rewards", null)) == TYPE_DICTIONARY else {}
	var opp: Dictionary = result.get("opp", {}) if typeof(result.get("opp", null)) == TYPE_DICTIONARY else {}
	var delta := int(rewards.get("arena_rating_delta", result.get("rankingChange", 0)))
	var rating_only := bool(result.get("rating_only", rewards.get("rating_only", false)))
	if int(rewards.get("experience", 0)) <= 0 and int(rewards.get("stardust", 0)) <= 0:
		rating_only = rating_only or won
	var nova_spent := int(result.get("nova_spent", 0))
	var note := ""
	if not won:
		note = "No rewards on defeat."
	elif rating_only:
		note = "Daily reward cap — rating only."
	else:
		note = "Arena rewards applied."
	if nova_spent > 0:
		note += " Nova spent: %s." % nova_spent
	var opp_name := str(opp.get("name", "rival"))
	return {
		"won": won,
		"mode": "arena",
		"title": "Victory" if won else "Defeat",
		"subtitle": "%s · Rating now %s" % [
			opp_name,
			str(GameManager.active_character.get("arena_rating", "?")),
		],
		"xp": int(rewards.get("experience", 0)),
		"stardust": int(rewards.get("stardust", 0)),
		"rating_delta": delta,
		"note": note,
		"progression": result.get("progression", {}) if typeof(result.get("progression", null)) == TYPE_DICTIONARY else {},
		"actions": [
			{"label": "Back to Arena", "primary": true, "callback": func() -> void: GameManager.go_arena()},
			{"label": "Hub", "primary": false, "callback": func() -> void: GameManager.go_hub()},
			_replay_action(),
		],
	}
