extends Node
## When a combat replay overlay is dismissed mid-fight, settle rewards in the
## background and let the source page offer a "View Rewards" button.
## If the player already reached Victory/Defeat (outro) and leaves, keep the
## battle pending until they return and press View Rewards.

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
			CombatSheets.present_complete_then_level_up(
				host, summary, level_before, GameManager.active_character, true
			)
		"dungeon":
			ProgressManager.toast_newly_unlocked(host, data)
			var summary := _dungeon_summary(data, ctx)
			CombatSheets.present_complete_then_level_up(
				host, summary, level_before, GameManager.active_character, true
			)
		_:
			ProgressManager.toast_newly_unlocked(
				host, data.get("data", {}) if typeof(data.get("data", null)) == TYPE_DICTIONARY else data
			)
			var summary := _arena_summary(data)
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
		"title": "Mission claimed!" if won else "Mission failed",
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
	var title := ""
	if won:
		title = ("Defeated %s" % enemy_name) if is_boss else ("Cleared enemy %s" % enemy_index)
	else:
		title = "Fell to %s" % enemy_name
	var subtitle := planet_name
	if is_boss:
		subtitle += " · Boss"
	var note := ""
	if not won:
		note = "No rewards on defeat."
	elif items.size() > 1:
		note = "Loot: %s item(s)" % items.size()
	return {
		"won": won,
		"mode": "dungeon",
		"title": title,
		"subtitle": subtitle,
		"xp": int(rewards.get("experience", 0)) if won else 0,
		"stardust": int(rewards.get("stardust", 0)) if won else 0,
		"gear_item": gear,
		"reward_items": items if won else [],
		"note": note,
		"progression": data.get("progression", {}) if typeof(data.get("progression", null)) == TYPE_DICTIONARY else {},
		"actions": [
			{"label": "Back to Frontier", "primary": true, "callback": func() -> void: GameManager.go_galaxy()},
			{"label": "Hub", "primary": false, "callback": func() -> void: GameManager.go_hub()},
		],
	}


func _arena_summary(result: Dictionary) -> Dictionary:
	var won := bool(result.get("won", false))
	var rewards: Dictionary = result.get("rewards", {}) if typeof(result.get("rewards", null)) == TYPE_DICTIONARY else {}
	var opp: Dictionary = result.get("opp", {}) if typeof(result.get("opp", null)) == TYPE_DICTIONARY else {}
	var delta := int(rewards.get("arena_rating_delta", result.get("rankingChange", 0)))
	var was_free := bool(result.get("is_free", rewards.get("free", true)))
	var nova_spent := int(result.get("nova_spent", 0))
	var note := ""
	if not won:
		note = "No rewards on defeat."
	elif not was_free:
		note = "Paid battle — rating only."
	else:
		note = "Free battle rewards applied."
	if nova_spent > 0:
		note += " Nova spent: %s." % nova_spent
	return {
		"won": won,
		"mode": "arena",
		"title": ("Defeated %s" if won else "Defeated by %s") % str(opp.get("name", "rival")),
		"subtitle": "Rating now %s" % str(GameManager.active_character.get("arena_rating", "?")),
		"xp": int(rewards.get("experience", 0)),
		"stardust": int(rewards.get("stardust", 0)),
		"rating_delta": delta,
		"note": note,
		"progression": result.get("progression", {}) if typeof(result.get("progression", null)) == TYPE_DICTIONARY else {},
		"actions": [
			{"label": "Back to Arena", "primary": true, "callback": func() -> void: GameManager.go_arena()},
			{"label": "Hub", "primary": false, "callback": func() -> void: GameManager.go_hub()},
		],
	}
