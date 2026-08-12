extends Node
## Scene router + high-level client state for the Godot client.

signal active_character_changed(character: Dictionary, source: String)

enum GameState {
	BOOT,
	LOGIN,
	CHARACTER_SELECT,
	IN_GAME,
}

const SCENE_LOGIN := "res://Scenes/UI/login.tscn"
const SCENE_CHARACTER_SELECT := "res://Scenes/UI/character_select.tscn"
const SCENE_CHARACTER_CREATE := "res://Scenes/UI/character_create.tscn"
const SCENE_GAME_SHELL := "res://Scenes/Main/game_shell.tscn"
const SCENE_HUB := "res://Scenes/UI/hub.tscn"
const SCENE_CANTINA := "res://Scenes/UI/cantina.tscn"
const SCENE_MISSION_RUN := "res://Scenes/UI/mission_run.tscn"
const SCENE_MISSION_COMBAT := "res://Scenes/UI/mission_combat.tscn"
const SCENE_ARENA := "res://Scenes/UI/arena.tscn"
const SCENE_ARENA_COMBAT := "res://Scenes/UI/arena_combat.tscn"
const SCENE_SHOP := "res://Scenes/UI/shop.tscn"
const SCENE_STATS := "res://Scenes/UI/stats.tscn"
const SCENE_SHIP := "res://Scenes/UI/ship.tscn"
const SCENE_PROGRESS := "res://Scenes/UI/progress.tscn"
const SCENE_LEADERBOARD := "res://Scenes/UI/leaderboard.tscn"
const SCENE_MAIL := "res://Scenes/UI/mail.tscn"
const SCENE_FRIENDS := "res://Scenes/UI/friends.tscn"
const SCENE_GUILD := "res://Scenes/UI/guild.tscn"
const SCENE_GALAXY := "res://Scenes/UI/galaxy.tscn"
const SCENE_GALAXY_COMBAT := "res://Scenes/UI/galaxy_combat.tscn"
const SCENE_NEXUS := "res://Scenes/UI/nexus.tscn"
const SCENE_MINING := "res://Scenes/UI/mining.tscn"
const SCENE_CASINO := "res://Scenes/UI/casino.tscn"
const SCENE_VOID := "res://Scenes/UI/void.tscn"
const SCENE_MESSAGES := "res://Scenes/UI/messages.tscn"
const SCENE_GUILD_WARS := "res://Scenes/UI/guild_wars.tscn"
const SCENE_SETTINGS := "res://Scenes/UI/settings.tscn"
const SCENE_CRYSTAL_STORE := "res://Scenes/UI/crystal_store.tscn"
const SCENE_ADMIN := "res://Scenes/UI/admin.tscn"
const SCENE_PUBLIC_PROFILE := "res://Scenes/UI/public_profile.tscn"
const SCENE_GALAXY_NEWS := "res://Scenes/UI/galaxy_news.tscn"
const SCENE_NOTIFICATIONS := "res://Scenes/UI/notifications.tscn"
const SCENE_COLLECTIBLES := "res://Scenes/UI/collectibles.tscn"
const SCENE_CODEX := "res://Scenes/UI/codex.tscn"

var state: GameState = GameState.BOOT
var active_character: Dictionary = {}
## Item ids from the most recent ClaimMission payload (highlighted in inventory).
var recent_loot_ids: PackedStringArray = []
## Active duel overlay source: "arena" | "mission" (web reuses one ArenaBattleOverlay).
var combat_overlay_kind := "arena"
## When true, next combat overlay remounts a settled fight for watch-only Replay.
var combat_watch_only := false
## Character dict for Public Profile scene.
var pending_profile: Dictionary = {}
## Optional character to open a DM with from Messages.
var pending_dm_character: Dictionary = {}
## Optional character to open Mail compose (any pilot — not friends-only).
var pending_mail_character: Dictionary = {}
## Page scene currently requested inside the persistent in-game shell.
var pending_page_path := ""
## Page scene actually mounted in the shell (set after instantiate). Empty outside the shell.
var current_page_path := ""


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	print("[GameManager] ready")


func go_login() -> void:
	pending_page_path = ""
	current_page_path = ""
	change_state(GameState.LOGIN)
	_change_scene(SCENE_LOGIN)


func go_character_select() -> void:
	pending_page_path = ""
	current_page_path = ""
	change_state(GameState.CHARACTER_SELECT)
	_change_scene(SCENE_CHARACTER_SELECT)


func go_character_create() -> void:
	pending_page_path = ""
	current_page_path = ""
	change_state(GameState.CHARACTER_SELECT)
	_change_scene(SCENE_CHARACTER_CREATE)


func go_hub(character: Dictionary = {}) -> void:
	if not character.is_empty():
		apply_active_character(character, "go_hub")
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_HUB)


## The only supported way for managers to replace the selected Character cache.
## CurrencyManager mirrors authoritative balance fields and fans out wallet signals.
func apply_active_character(character: Dictionary, source: String = "manager", sync_wallet: bool = true) -> void:
	active_character = character.duplicate(true)
	if sync_wallet and CurrencyManager != null:
		CurrencyManager.apply_character_snapshot(active_character, source)
	active_character_changed.emit(active_character, source)


func apply_active_character_patch(patch: Dictionary, source: String = "manager") -> void:
	if patch.is_empty():
		return
	active_character.merge(patch, true)
	if CurrencyManager != null:
		CurrencyManager.apply_character_snapshot(active_character, source)
	active_character_changed.emit(active_character, source)


## Live selected Character id: GameManager cache first, then Node account pointer.
## Never use ProfileManager — that is Nakama metadata, not gameplay selection SoT.
func selected_character_id() -> String:
	var cid := str(active_character.get("id", "")).strip_edges()
	if cid.is_empty() and AuthManager != null and typeof(AuthManager.user) == TYPE_DICTIONARY:
		cid = str(AuthManager.user.get("active_character_id", "")).strip_edges()
	return cid


func clear_active_character(source: String = "logout") -> void:
	active_character = {}
	recent_loot_ids = PackedStringArray()
	pending_profile = {}
	pending_dm_character = {}
	pending_mail_character = {}
	pending_page_path = ""
	current_page_path = ""
	combat_overlay_kind = "arena"
	if CurrencyManager != null:
		CurrencyManager.clear_local()
	if CareerStatsManager != null:
		CareerStatsManager.clear_local()
	active_character_changed.emit(active_character, source)


func go_cantina() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_CANTINA)


func go_mission_run() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_MISSION_RUN)


func go_mission_combat() -> void:
	combat_overlay_kind = "mission"
	open_overlay(SCENE_MISSION_COMBAT)


func go_arena() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_ARENA)


func go_arena_combat() -> void:
	if TutorialManager.blocks_arena_combat() and not combat_watch_only:
		return
	combat_overlay_kind = "arena"
	open_overlay(SCENE_ARENA_COMBAT)


func go_shop() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_SHOP)


func go_stats() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_STATS)


func go_ship() -> void:
	## Ship Hangar temporarily retired — Coming Soon. Do not open hangar or apply upgrades.
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_SHIP_HANGAR):
		var host := get_tree().current_scene
		if host != null:
			ClientUi.show_toast(host, "Coming Soon", "Ship Hangar is offline for now.")
		return
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_SHIP)


func go_progress() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_PROGRESS)


func go_leaderboard() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_LEADERBOARD)


func go_mail(to_character: Dictionary = {}) -> void:
	if not to_character.is_empty():
		pending_mail_character = to_character.duplicate(true)
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_MAIL)


func go_friends() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_FRIENDS)


func go_guild() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_GUILD)


func go_galaxy() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_GALAXY)


func go_galaxy_combat() -> void:
	combat_overlay_kind = "dungeon"
	open_overlay(SCENE_GALAXY_COMBAT)


func go_nexus() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_NEXUS)


func go_mining() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_MINING)


func go_casino() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_CASINO)


func go_void() -> void:
	## Void page retired from play — Coming Soon in nav. Do not open the old sell UI.
	if FeatureFlags.is_coming_soon(FeatureFlags.FEATURE_VOID):
		var host := get_tree().current_scene
		if host != null:
			ClientUi.show_toast(host, "Coming Soon", "The Void is offline for now.")
		return
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_VOID)


func go_messages() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_MESSAGES)


func go_guild_wars() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_GUILD_WARS)


func go_settings() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_SETTINGS)


func go_crystal_store() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_CRYSTAL_STORE)


func go_admin() -> void:
	if not AdminManager.is_admin():
		push_warning("go_admin blocked — user is not admin")
		return
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_ADMIN)


func go_public_profile(character: Dictionary = {}) -> void:
	if not character.is_empty():
		pending_profile = character
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_PUBLIC_PROFILE)


func go_galaxy_news() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_GALAXY_NEWS)


func go_notifications() -> void:
	change_state(GameState.IN_GAME)
	var current := get_tree().current_scene
	if current != null and current.is_in_group("game_shell") and current.has_method("toggle_notifications"):
		current.call_deferred("toggle_notifications")
		return
	open_game_page(SCENE_NOTIFICATIONS)


func go_collectibles() -> void:
	change_state(GameState.IN_GAME)
	open_game_page(SCENE_COLLECTIBLES)


func go_codex() -> void:
	open_overlay(SCENE_CODEX)


func open_game_page(path: String) -> void:
	if path == SCENE_VOID:
		go_void()
		return
	if path == SCENE_SHIP:
		go_ship()
		return
	change_state(GameState.IN_GAME)
	var current := get_tree().current_scene
	if current != null and current.is_in_group("game_shell") and current.has_method("show_page"):
		# Tutorial combat: never dismiss the duel via side-nav / page hops.
		if TutorialManager.locks_combat_navigation() \
			and current.has_method("has_overlay") \
			and bool(current.call("has_overlay")) \
			and current.has_method("has_combat_replay_overlay") \
			and bool(current.call("has_combat_replay_overlay")):
			Notify.blocked("Finish the tutorial fight first")
			return
		# Always dismiss combat overlays first. Returning to the same underlying
		# page (e.g. Arena after arena combat) used to early-out in
		# try_begin_page_nav before close_overlay — leaving a dead combat screen.
		close_overlay()
		# Drop rapid/duplicate clicks before a deferred show_page can stack.
		if current.has_method("try_begin_page_nav") and not current.try_begin_page_nav(path):
			return
		pending_page_path = path
		current.call_deferred("show_page", path)
		return
	close_overlay()
	pending_page_path = path
	_change_scene(SCENE_GAME_SHELL)


func open_overlay(path: String) -> void:
	change_state(GameState.IN_GAME)
	var current := get_tree().current_scene
	if current != null and current.is_in_group("game_shell") and current.has_method("show_overlay_scene"):
		current.call_deferred("show_overlay_scene", path)
		return
	# Fallback when shell is not mounted yet.
	open_game_page(path)


func close_overlay() -> void:
	var current := get_tree().current_scene
	if current != null and current.is_in_group("game_shell") and current.has_method("clear_overlays"):
		current.call("clear_overlays")


func remember_loot_from_claim(claim_data: Dictionary) -> void:
	recent_loot_ids = PackedStringArray()
	var items: Variant = claim_data.get("items", [])
	if typeof(items) != TYPE_ARRAY:
		return
	var item_arr: Array = items
	for it in item_arr:
		if typeof(it) == TYPE_DICTIONARY and it.has("id"):
			recent_loot_ids.append(str(it["id"]))
	# Session-local Cosmic Vault gear discoveries (server blocks client PATCH of discovered_gear).
	var new_keys: Array = CollectiblesCatalog.keys_from_items(item_arr)
	if new_keys.is_empty():
		return
	var gear: Array = []
	var existing: Variant = active_character.get("discovered_gear", [])
	if typeof(existing) == TYPE_ARRAY:
		gear = (existing as Array).duplicate()
	var seen := {}
	for g in gear:
		seen[str(g)] = true
	var changed := false
	for key in new_keys:
		var k := str(key)
		if k.is_empty() or seen.has(k):
			continue
		seen[k] = true
		gear.append(k)
		changed = true
	if changed:
		active_character["discovered_gear"] = gear


func change_state(next: GameState) -> void:
	if state == next:
		return
	state = next
	print("[GameManager] state -> %s" % next)


func _change_scene(path: String) -> void:
	var err := get_tree().change_scene_to_file(path)
	if err != OK:
		push_error("Failed to change scene to %s (%s)" % [path, err])
