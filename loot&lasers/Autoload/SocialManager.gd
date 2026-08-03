extends Node
## Friends · guild. Phase 19: friends/blocks are Nakama account-level.
## Phase 20: mail delegated to MailManager (Nakama). Guild remains on Node.

signal mail_changed
signal friends_changed
signal guild_changed
signal social_state_loaded(state: Dictionary)
signal friend_request_received
signal friend_request_sent
signal friend_request_accepted
signal friend_request_declined
signal friend_removed
signal user_blocked
signal user_unblocked
signal presence_changed(user_id: String, status: Dictionary)
signal social_error(error: String)
signal loading_changed(loading: bool)
signal mutation_state_changed(mutating: bool)

var inbox: Array = []
var mail_folder: String = "inbox"
var unread_count: int = 0
var friendships: Array = []
var incoming_requests: Array = []
var outgoing_requests: Array = []
var blocks: Array = []
var social_state: Dictionary = {}
var loading := false
var mutating := false
var _busy := false
var my_membership: Dictionary = {}
var my_guild: Dictionary = {}
var guild_members: Array = []
var guild_browse: Array = []
var guild_challenge: Dictionary = {}
var guild_log: Array = []


func _ready() -> void:
	print("[SocialManager] ready (Nakama friends; MailManager mail; Node guild)")


func is_loading() -> bool:
	return loading


func is_mutating() -> bool:
	return mutating


func char_id() -> String:
	return str(GameManager.active_character.get("id", ""))


func active_char() -> Dictionary:
	return GameManager.active_character


func get_friends() -> Array:
	return friendships


func get_pending_requests() -> Dictionary:
	return {"incoming": incoming_requests, "outgoing": outgoing_requests}


func get_presence(_user_id: String) -> Dictionary:
	return {}


func _set_loading(v: bool) -> void:
	loading = v
	loading_changed.emit(v)


func _set_mutating(v: bool) -> void:
	mutating = v
	mutation_state_changed.emit(v)


func _rid(prefix: String) -> String:
	return "%s-%s-%s" % [prefix, Time.get_ticks_msec(), randi()]


func _apply_social_state(data: Dictionary) -> void:
	social_state = data.duplicate(true)
	friendships = data.get("friends", []) if typeof(data.get("friends", [])) == TYPE_ARRAY else []
	incoming_requests = data.get("incoming_requests", []) if typeof(data.get("incoming_requests", [])) == TYPE_ARRAY else []
	outgoing_requests = data.get("outgoing_requests", []) if typeof(data.get("outgoing_requests", [])) == TYPE_ARRAY else []
	blocks = data.get("blocks", []) if typeof(data.get("blocks", [])) == TYPE_ARRAY else []
	friends_changed.emit()
	social_state_loaded.emit(social_state)


# ── Mail (Phase 20 — delegated to MailManager / Nakama) ────────

func load_inbox() -> Array:
	return await load_mail("inbox")


func load_mail(folder: String = "inbox") -> Array:
	mail_folder = folder if not folder.is_empty() else "inbox"
	inbox = await MailManager.load_mail(mail_folder)
	unread_count = MailManager.unread_count
	mail_changed.emit()
	return inbox


func refresh_unread() -> int:
	unread_count = await MailManager.refresh_unread()
	mail_changed.emit()
	return unread_count


func mark_read(mail_id: String) -> Dictionary:
	var res: Dictionary = await MailManager.mark_read(mail_id)
	inbox = MailManager.inbox
	unread_count = MailManager.unread_count
	mail_changed.emit()
	return res


func delete_mail(mail_id: String) -> Dictionary:
	var res: Dictionary = await MailManager.delete_mail(mail_id)
	inbox = MailManager.inbox
	unread_count = MailManager.unread_count
	mail_changed.emit()
	return res


func restore_mail(mail_id: String) -> Dictionary:
	var res: Dictionary = await MailManager.restore_mail(mail_id)
	inbox = MailManager.inbox
	unread_count = MailManager.unread_count
	mail_changed.emit()
	return res


func claim_mail(mail_id: String) -> Dictionary:
	var res: Dictionary = await MailManager.claim_mail(mail_id)
	inbox = MailManager.inbox
	unread_count = MailManager.unread_count
	mail_changed.emit()
	return res


## Accept guild invite / request mail side-effects.
func handle_guild_mail(mail: Dictionary, accept: bool) -> Dictionary:
	var mtype := str(mail.get("mail_type", ""))
	if not accept:
		return await delete_mail(str(mail.get("id", "")))
	if mtype == "guild_invite":
		var join: Dictionary = await join_guild(str(mail.get("guild_id", "")))
		if not join.ok:
			return join
		await delete_mail(str(mail.get("id", "")))
		return join
	if mtype == "guild_request":
		# Officer accepting a request: join requester into my guild.
		var requester_id := str(mail.get("from_id", ""))
		var guild_id := str(mail.get("guild_id", my_guild.get("id", "")))
		if requester_id.is_empty() or guild_id.is_empty():
			return {"ok": false, "error": "Missing guild request data"}
		var req_char: Dictionary = await GameApiClient.request(
			"GET", "/api/entities/Character/%s" % requester_id.uri_encode(), null, true
		)
		if not req_char.ok or typeof(req_char.data) != TYPE_DICTIONARY:
			return {"ok": false, "error": "Requester not found"}
		var join: Dictionary = await _join_character_into_guild(req_char.data, guild_id)
		if not join.ok:
			return join
		# Soft-delete all pending request copies for this requester+guild.
		var siblings: Dictionary = await GameApiClient.request(
			"POST", "/api/entities/Mail/filter",
			{"query": {
				"guild_id": guild_id,
				"mail_type": "guild_request",
				"from_id": requester_id,
				"folder": "inbox",
			}, "limit": 50}, true
		)
		if siblings.ok and typeof(siblings.data) == TYPE_ARRAY:
			for row in siblings.data:
				if typeof(row) == TYPE_DICTIONARY and row.has("id"):
					await GameApiClient.request(
						"PATCH", "/api/entities/Mail/%s" % str(row["id"]).uri_encode(),
						{"folder": "deleted"}, true
					)
		var me := active_char()
		var gname := str(my_guild.get("name", "guild"))
		await GameApiClient.request("POST", "/api/entities/Mail", {
			"owner_id": requester_id,
			"from_id": str(me.get("id", "")),
			"from_name": str(me.get("name", "")),
			"to_id": requester_id,
			"to_name": str(mail.get("from_name", "")),
			"subject": "Request Accepted: %s" % gname,
			"body": "%s accepted your request to join %s. Welcome aboard!" % [str(me.get("name", "")), gname],
			"mail_type": "system",
			"folder": "inbox",
			"read": false,
			"claimed": false,
			"has_rewards": false,
			"guild_id": guild_id,
		}, true)
		await GameApiClient.request("POST", "/api/entities/AppNotification", {
			"owner_id": requester_id,
			"type": "mail",
			"title": gname,
			"body": "Your join request was accepted!",
			"read": false,
		}, true)
		await load_mail(mail_folder)
		return join
	return {"ok": false, "error": "Not a guild mail"}


# ── Friends (Nakama account-level) ────────────────────────────

func load_social_state() -> Dictionary:
	if _busy:
		return {"ok": false, "error": "Social request already in progress"}
	_busy = true
	_set_loading(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("social_get_state", {})
	_busy = false
	_set_loading(false)
	if not bool(res.get("success", false)):
		var err := str(res.get("error", "social_get_state failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	_apply_social_state(data)
	return {"ok": true, "error": "", "data": data}


func load_friends() -> Dictionary:
	return await load_social_state()


func search_characters(query: String) -> Array:
	## User search is deferred (Phase 19). Keep empty rather than scraping Character list.
	var q := query.strip_edges()
	if q.length() < 3:
		return []
	return []


func send_friend_request(to_char: Dictionary) -> Dictionary:
	var target := str(to_char.get("user_id", to_char.get("id", "")))
	if target.is_empty():
		return {"ok": false, "error": "Missing target user id"}
	_set_mutating(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("friend_request_send", {
		"target_user_id": target,
		"request_id": _rid("frs"),
	})
	_set_mutating(false)
	if not bool(res.get("success", false)):
		var err := str(res.get("error", "friend_request_send failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	if typeof(data.get("state", {})) == TYPE_DICTIONARY:
		_apply_social_state(data["state"])
	friend_request_sent.emit()
	return {"ok": true, "error": "", "data": data}


func accept_friend(request: Dictionary) -> Dictionary:
	var target := str(request.get("user_id", request.get("from_character_id", request.get("id", ""))))
	return await accept_friend_request(target)


func accept_friend_request(target_user_id: String) -> Dictionary:
	if target_user_id.is_empty():
		return {"ok": false, "error": "Missing target"}
	_set_mutating(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("friend_request_accept", {
		"target_user_id": target_user_id,
		"request_id": _rid("fra"),
	})
	_set_mutating(false)
	if not bool(res.get("success", false)):
		var err := str(res.get("error", "accept failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	if typeof(data.get("state", {})) == TYPE_DICTIONARY:
		_apply_social_state(data["state"])
	friend_request_accepted.emit()
	return {"ok": true, "error": "", "data": data}


func decline_friend(request: Dictionary) -> Dictionary:
	var target := str(request.get("user_id", request.get("from_character_id", request.get("id", ""))))
	return await decline_friend_request(target)


func decline_friend_request(target_user_id: String) -> Dictionary:
	if target_user_id.is_empty():
		return {"ok": false, "error": "Missing target"}
	_set_mutating(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("friend_request_decline", {
		"target_user_id": target_user_id,
		"request_id": _rid("frd"),
	})
	_set_mutating(false)
	if not bool(res.get("success", false)):
		var err := str(res.get("error", "decline failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	if typeof(data.get("state", {})) == TYPE_DICTIONARY:
		_apply_social_state(data["state"])
	friend_request_declined.emit()
	return {"ok": true, "error": "", "data": data}


func cancel_friend_request(request: Dictionary) -> Dictionary:
	# Outgoing cancel = friend_remove / delete pending via remove.
	var target := str(request.get("user_id", request.get("to_character_id", request.get("id", ""))))
	return await remove_friend(target)


func remove_friend(other_id: String) -> Dictionary:
	if other_id.is_empty():
		return {"ok": false, "error": "Missing id"}
	_set_mutating(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("friend_remove", {
		"target_user_id": other_id,
		"request_id": _rid("frm"),
	})
	_set_mutating(false)
	if not bool(res.get("success", false)):
		var err := str(res.get("error", "remove failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	if typeof(data.get("state", {})) == TYPE_DICTIONARY:
		_apply_social_state(data["state"])
	friend_removed.emit()
	return {"ok": true, "error": "", "data": data}


func friend_other_id(friendship: Dictionary) -> String:
	return str(friendship.get("user_id", friendship.get("id", "")))


# ── Blocks (Nakama account-level) ─────────────────────────────

func load_blocks() -> Array:
	var res: Dictionary = await NakamaManager.invoke_rpc("block_list_get", {})
	if bool(res.get("success", false)):
		var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
		blocks = data.get("blocks", []) if typeof(data.get("blocks", [])) == TYPE_ARRAY else []
	else:
		blocks = []
	return blocks


func load_block_list() -> Array:
	return await load_blocks()


func block_user(target_user_id: String) -> Dictionary:
	return await block_character(target_user_id, "")


func block_character(other_id: String, _other_name: String = "") -> Dictionary:
	if other_id.is_empty():
		return {"ok": false, "error": "Missing ids"}
	_set_mutating(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("user_block", {
		"target_user_id": other_id,
		"request_id": _rid("blk"),
	})
	_set_mutating(false)
	if not bool(res.get("success", false)):
		var err := str(res.get("error", "block failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	if typeof(data.get("state", {})) == TYPE_DICTIONARY:
		_apply_social_state(data["state"])
	user_blocked.emit()
	return {"ok": true, "error": "", "data": data}


func unblock_user(target_user_id: String) -> Dictionary:
	return await unblock(target_user_id)


func unblock(other_id: String) -> Dictionary:
	if other_id.is_empty():
		return {"ok": false, "error": "Missing id"}
	_set_mutating(true)
	var res: Dictionary = await NakamaManager.invoke_rpc("user_unblock", {
		"target_user_id": other_id,
		"request_id": _rid("ubk"),
	})
	_set_mutating(false)
	if not bool(res.get("success", false)):
		var err := str(res.get("error", "unblock failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	if typeof(data.get("state", {})) == TYPE_DICTIONARY:
		_apply_social_state(data["state"])
	user_unblocked.emit()
	return {"ok": true, "error": "", "data": data}


func clear_account_social_cache() -> void:
	friendships = []
	incoming_requests = []
	outgoing_requests = []
	blocks = []
	social_state = {}
	inbox = []
	unread_count = 0
	if MailManager != null and MailManager.has_method("clear_account_mail_cache"):
		MailManager.clear_account_mail_cache()
	friends_changed.emit()
	mail_changed.emit()


# ── Guild challenge (client entity CRUD; no claim payout yet) ─

func _week_key() -> String:
	## Approximate America/New_York Monday ISO week (matches web getWeekKey closely).
	var unix: int = int(Time.get_unix_time_from_system()) - 5 * 3600
	var dict := Time.get_datetime_dict_from_unix_time(unix)
	var y: int = int(dict.get("year", 2026))
	var m: int = int(dict.get("month", 1))
	var d: int = int(dict.get("day", 1))
	# Sakamoto weekday: 0=Sun … 6=Sat
	var t := [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
	var yy: int = y - (1 if m < 3 else 0)
	var wd: int = (yy + int(yy / 4) - int(yy / 100) + int(yy / 400) + int(t[m - 1]) + d) % 7
	var since_mon: int = (wd + 6) % 7
	var mon_unix: int = unix - since_mon * 86400
	var thu_unix: int = mon_unix + 3 * 86400
	var thu := Time.get_datetime_dict_from_unix_time(thu_unix)
	var my: int = int(thu.get("year", y))
	var jan4: int = int(Time.get_unix_time_from_datetime_dict({
		"year": my, "month": 1, "day": 4, "hour": 12, "minute": 0, "second": 0,
	}))
	var week: int = 1 + int(round((float(thu_unix) - float(jan4)) / 86400.0 / 7.0))
	week = clampi(week, 1, 53)
	return "%s-W%02d" % [my, week]


func ensure_guild_challenge() -> Dictionary:
	guild_challenge = {}
	if my_guild.is_empty():
		return {"ok": false, "error": "No guild"}
	var gid := str(my_guild.get("id", ""))
	# Prefer any active challenge so web/Godot week_key drift does not fork progress.
	var active: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildChallenge/filter",
		{"query": {"guild_id": gid, "status": "active"}, "sort": "-created_date", "limit": 1}, true
	)
	if active.ok and typeof(active.data) == TYPE_ARRAY and (active.data as Array).size() > 0:
		guild_challenge = active.data[0]
		return {"ok": true, "challenge": guild_challenge}
	var wk := _week_key()
	var existing: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildChallenge/filter",
		{"query": {"guild_id": gid, "week_key": wk}, "limit": 1}, true
	)
	if existing.ok and typeof(existing.data) == TYPE_ARRAY and (existing.data as Array).size() > 0:
		guild_challenge = existing.data[0]
		return {"ok": true, "challenge": guild_challenge}
	var tiers := [
		{"title": "Weekly Operations", "base": 20, "sd": 5000, "gxp": 600},
		{"title": "Strike Directive", "base": 35, "sd": 9000, "gxp": 1000},
		{"title": "Galactic Offensive", "base": 55, "sd": 15000, "gxp": 1600},
		{"title": "Apex Crusade", "base": 80, "sd": 24000, "gxp": 2600},
	]
	var tier_idx := mini(3, int(floor(float(my_guild.get("level", 1)) / 3.0)))
	var tier: Dictionary = tiers[tier_idx]
	var members_n := maxi(1, int(my_guild.get("member_count", guild_members.size())))
	var goal := int(tier["base"]) + members_n * 5
	var create: Dictionary = await GameApiClient.request("POST", "/api/entities/GuildChallenge", {
		"guild_id": gid,
		"week_key": wk,
		"title": str(tier["title"]),
		"goal": goal,
		"progress": 0,
		"status": "active",
		"reward_stardust": int(tier["sd"]),
		"reward_guild_xp": int(tier["gxp"]),
		"ends_at": Time.get_datetime_string_from_unix_time(int(Time.get_unix_time_from_system()) + 7 * 86400, true),
	}, true)
	if create.ok and typeof(create.data) == TYPE_DICTIONARY:
		guild_challenge = create.data
	return create


func add_challenge_progress(amount: int = 1) -> Dictionary:
	if my_guild.is_empty():
		await load_my_guild()
	if my_guild.is_empty():
		return {"ok": false, "error": "No guild"}
	await ensure_guild_challenge()
	if guild_challenge.is_empty() or str(guild_challenge.get("status", "")) != "active":
		return {"ok": false, "error": "No active challenge"}
	var goal := int(guild_challenge.get("goal", 1))
	var new_progress := int(guild_challenge.get("progress", 0)) + amount
	var completed := new_progress >= goal
	var patch := {"progress": goal if completed else new_progress}
	if completed:
		patch["status"] = "completed"
	var upd: Dictionary = await GameApiClient.request(
		"PATCH", "/api/entities/GuildChallenge/%s" % str(guild_challenge.get("id", "")).uri_encode(),
		patch, true
	)
	if not upd.ok:
		return upd
	guild_challenge = upd.data if typeof(upd.data) == TYPE_DICTIONARY else guild_challenge
	if completed:
		await _apply_guild_xp(int(guild_challenge.get("reward_guild_xp", 0)))
	return {"ok": true, "completed": completed, "challenge": guild_challenge, "reward_stardust": int(guild_challenge.get("reward_stardust", 0)) if completed else 0}


func _apply_guild_xp(xp_amount: int) -> void:
	if xp_amount <= 0 or my_guild.is_empty():
		return
	var g: Dictionary = my_guild
	var exp := int(g.get("experience", 0)) + xp_amount
	var level := int(g.get("level", 1))
	var exp_to_next := int(g.get("experience_to_next", 1000))
	var leveled := false
	while exp >= exp_to_next:
		exp -= exp_to_next
		level += 1
		exp_to_next = int(floor(float(exp_to_next) * 1.4))
		leveled = true
	await GameApiClient.request(
		"PATCH", "/api/entities/Guild/%s" % str(g.get("id", "")).uri_encode(),
		{"experience": exp, "level": level, "experience_to_next": exp_to_next}, true
	)
	if leveled:
		await GameApiClient.request("POST", "/api/entities/GuildLog", {
			"guild_id": str(g.get("id", "")),
			"entry_type": "levelup",
			"message": "reached Guild Level %s!" % level,
			"character_name": "Challenge System",
		}, true)
	await load_my_guild()


## After a successful mission claim — mirrors guildUtils.contributeMission.
func contribute_mission(mission: Dictionary = {}, gains: Dictionary = {}) -> void:
	if my_membership.is_empty():
		await load_my_guild()
	if my_membership.is_empty() or my_guild.is_empty():
		return
	var character := active_char()
	var stardust := int(gains.get("stardust", 0))
	var xp := int(gains.get("experience", 0))
	var g: Dictionary = my_guild
	var new_exp := int(g.get("experience", 0)) + int(floor(float(xp) * 0.5))
	var level := int(g.get("level", 1))
	var exp_to_next := int(g.get("experience_to_next", 1000))
	var leveled := false
	while new_exp >= exp_to_next:
		new_exp -= exp_to_next
		level += 1
		exp_to_next = int(floor(float(exp_to_next) * 1.4))
		leveled = true
	await GameApiClient.request(
		"PATCH", "/api/entities/Guild/%s" % str(g.get("id", "")).uri_encode(),
		{
			"experience": new_exp,
			"level": level,
			"experience_to_next": exp_to_next,
			"total_missions": int(g.get("total_missions", 0)) + 1,
			"total_stardust": int(g.get("total_stardust", 0)) + stardust,
		}, true
	)
	await GameApiClient.request(
		"PATCH", "/api/entities/GuildMember/%s" % str(my_membership.get("id", "")).uri_encode(),
		{
			"contributed_missions": int(my_membership.get("contributed_missions", 0)) + 1,
			"contributed_stardust": int(my_membership.get("contributed_stardust", 0)) + stardust,
			"character_level": int(character.get("level", 1)),
		}, true
	)
	await GameApiClient.request("POST", "/api/entities/GuildLog", {
		"guild_id": str(g.get("id", "")),
		"entry_type": "mission",
		"message": "completed \"%s\" at %s" % [str(mission.get("name", "a mission")), str(mission.get("location", "?"))],
		"character_name": str(character.get("name", "")),
		"amount": stardust,
	}, true)
	if leveled:
		await GameApiClient.request("POST", "/api/entities/GuildLog", {
			"guild_id": str(g.get("id", "")),
			"entry_type": "levelup",
			"message": "reached Guild Level %s!" % level,
			"character_name": str(character.get("name", "")),
		}, true)
	var ch: Dictionary = await add_challenge_progress(1)
	if bool(ch.get("completed", false)) and int(ch.get("reward_stardust", 0)) > 0:
		await GameApiClient.request("POST", "/api/entities/GuildLog", {
			"guild_id": str(g.get("id", "")),
			"entry_type": "levelup",
			"message": "Weekly Challenge complete! +%s SD bonus (claim pending)" % int(ch.get("reward_stardust", 0)),
			"character_name": str(character.get("name", "")),
		}, true)
	await load_my_guild()


## After an arena win — mirrors guildUtils.contributeArenaWin.
func contribute_arena_win() -> void:
	if my_membership.is_empty():
		await load_my_guild()
	if my_membership.is_empty() or my_guild.is_empty():
		return
	var character := active_char()
	await GameApiClient.request("POST", "/api/entities/GuildLog", {
		"guild_id": str(my_guild.get("id", "")),
		"entry_type": "arena",
		"message": "won an Arena duel",
		"character_name": str(character.get("name", "")),
	}, true)
	var ch: Dictionary = await add_challenge_progress(1)
	if bool(ch.get("completed", false)) and int(ch.get("reward_stardust", 0)) > 0:
		await GameApiClient.request("POST", "/api/entities/GuildLog", {
			"guild_id": str(my_guild.get("id", "")),
			"entry_type": "levelup",
			"message": "Weekly Challenge complete! +%s SD bonus (claim pending)" % int(ch.get("reward_stardust", 0)),
			"character_name": str(character.get("name", "")),
		}, true)


func load_guild_log(limit: int = 30) -> Array:
	guild_log = []
	if my_guild.is_empty():
		return guild_log
	var gid := str(my_guild.get("id", ""))
	var res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildLog/filter",
		{"query": {"guild_id": gid}, "sort": "-created_date", "limit": limit}, true
	)
	guild_log = res.data if res.ok and typeof(res.data) == TYPE_ARRAY else []
	return guild_log


func can_invite_to_guild() -> bool:
	var role := str(my_membership.get("role", ""))
	return role == "leader" or role == "officer"


func can_manage_guild() -> bool:
	return str(my_membership.get("role", "")) == "leader"


func set_guild_recruiting(open: bool) -> Dictionary:
	if not can_manage_guild() or my_guild.is_empty():
		return {"ok": false, "error": "Only the guild leader can change recruiting"}
	var gid := str(my_guild.get("id", ""))
	var res: Dictionary = await GameApiClient.request(
		"PATCH", "/api/entities/Guild/%s" % gid.uri_encode(),
		{"recruiting": open}, true
	)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		my_guild = res.data
		guild_changed.emit()
	return res


func set_guild_public_listing(visible: bool) -> Dictionary:
	if not can_manage_guild() or my_guild.is_empty():
		return {"ok": false, "error": "Only the guild leader can change listing"}
	var gid := str(my_guild.get("id", ""))
	var res: Dictionary = await GameApiClient.request(
		"PATCH", "/api/entities/Guild/%s" % gid.uri_encode(),
		{"public_listing": visible}, true
	)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		my_guild = res.data
		guild_changed.emit()
	return res


func request_to_join_guild(guild: Dictionary) -> Dictionary:
	var me := active_char()
	var cid := str(me.get("id", ""))
	var gid := str(guild.get("id", ""))
	if cid.is_empty() or gid.is_empty():
		return {"ok": false, "error": "Missing guild or character"}
	if int(guild.get("member_count", 0)) >= 50:
		return {"ok": false, "error": "That guild is full."}
	var existing: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildMember/filter",
		{"query": {"character_id": cid}, "limit": 1}, true
	)
	if existing.ok and typeof(existing.data) == TYPE_ARRAY and (existing.data as Array).size() > 0:
		return {"ok": false, "error": "You are already in a guild."}
	var pending: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/Mail/filter",
		{"query": {"from_id": cid, "mail_type": "guild_request", "folder": "inbox"}, "limit": 1}, true
	)
	if pending.ok and typeof(pending.data) == TYPE_ARRAY and (pending.data as Array).size() > 0:
		return {"ok": false, "error": "You already have a pending guild request."}
	var members: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildMember/filter",
		{"query": {"guild_id": gid}, "limit": 50}, true
	)
	var recipients: Array = []
	if members.ok and typeof(members.data) == TYPE_ARRAY:
		for m in members.data:
			if typeof(m) != TYPE_DICTIONARY:
				continue
			var role := str(m.get("role", ""))
			if role == "leader" or role == "officer":
				recipients.append(m)
	if recipients.is_empty():
		return {"ok": false, "error": "No officers found to receive your request."}
	var gname := str(guild.get("name", "guild"))
	var subject := "Guild Join Request: %s" % gname
	var body := "%s (Level %s, %s) is requesting to join %s." % [
		str(me.get("name", "?")), str(me.get("level", 1)), str(me.get("race", "Unknown")), gname,
	]
	for r in recipients:
		var rid := str(r.get("character_id", ""))
		if rid.is_empty():
			continue
		await GameApiClient.request("POST", "/api/entities/Mail", {
			"owner_id": rid,
			"from_id": cid,
			"from_name": str(me.get("name", "")),
			"to_id": rid,
			"to_name": str(r.get("character_name", "")),
			"subject": subject,
			"body": body,
			"mail_type": "guild_request",
			"folder": "inbox",
			"read": false,
			"claimed": false,
			"has_rewards": false,
			"guild_id": gid,
		}, true)
		await GameApiClient.request("POST", "/api/entities/AppNotification", {
			"owner_id": rid,
			"type": "mail",
			"title": str(me.get("name", "")),
			"body": "wants to join %s" % gname,
			"read": false,
		}, true)
	return {"ok": true}


func invite_to_guild(target: Dictionary) -> Dictionary:
	if not can_invite_to_guild() or my_guild.is_empty():
		return {"ok": false, "error": "Only officers/leaders can invite"}
	var tid := str(target.get("id", ""))
	if tid.is_empty():
		return {"ok": false, "error": "Missing target"}
	var existing: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildMember/filter",
		{"query": {"character_id": tid}, "limit": 1}, true
	)
	if existing.ok and typeof(existing.data) == TYPE_ARRAY and (existing.data as Array).size() > 0:
		return {"ok": false, "error": "Already in a guild"}
	var gid := str(my_guild.get("id", ""))
	var dup: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/Mail/filter",
		{"query": {"owner_id": tid, "mail_type": "guild_invite", "guild_id": gid, "folder": "inbox"}, "limit": 1}, true
	)
	if dup.ok and typeof(dup.data) == TYPE_ARRAY and (dup.data as Array).size() > 0:
		return {"ok": false, "error": "Invite already pending"}
	var me := active_char()
	var gname := str(my_guild.get("name", "guild"))
	var mail: Dictionary = await GameApiClient.request("POST", "/api/entities/Mail", {
		"owner_id": tid,
		"from_id": str(me.get("id", "")),
		"from_name": str(me.get("name", "")),
		"to_id": tid,
		"to_name": str(target.get("name", "")),
		"subject": "Guild Invitation: %s" % gname,
		"body": "%s has invited you to join %s." % [str(me.get("name", "")), gname],
		"mail_type": "guild_invite",
		"folder": "inbox",
		"read": false,
		"claimed": false,
		"has_rewards": false,
		"guild_id": gid,
	}, true)
	if not mail.ok:
		return mail
	await GameApiClient.request("POST", "/api/entities/AppNotification", {
		"owner_id": tid,
		"type": "mail",
		"title": str(me.get("name", "")),
		"body": "invited you to join %s" % gname,
		"read": false,
	}, true)
	return {"ok": true, "mail": mail.data}


func send_player_mail(to_char: Dictionary, subject: String, body: String) -> Dictionary:
	var res: Dictionary = await MailManager.send_player_mail_to(to_char, subject, body)
	if bool(res.get("ok", false)):
		await load_mail("sent")
	return res


func mail_compose_recipients() -> Array:
	return await MailManager.mail_compose_recipients()


# ── Guild ─────────────────────────────────────────────────────

func load_my_guild() -> Dictionary:
	var cid := char_id()
	my_membership = {}
	my_guild = {}
	guild_members = []
	if cid.is_empty():
		return {"ok": false, "error": "No character"}
	var mem: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildMember/filter",
		{"query": {"character_id": cid}, "sort": "-created_date", "limit": 1}, true
	)
	if not mem.ok or typeof(mem.data) != TYPE_ARRAY or (mem.data as Array).is_empty():
		guild_changed.emit()
		return {"ok": true, "membership": null}
	my_membership = mem.data[0]
	var gid := str(my_membership.get("guild_id", ""))
	var gres: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/Guild/%s" % gid.uri_encode(), null, true
	)
	if gres.ok and typeof(gres.data) == TYPE_DICTIONARY:
		my_guild = gres.data
	var members: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildMember/filter",
		{"query": {"guild_id": gid}, "sort": "-created_date", "limit": 50}, true
	)
	guild_members = members.data if members.ok and typeof(members.data) == TYPE_ARRAY else []
	guild_changed.emit()
	return {"ok": true, "guild": my_guild, "membership": my_membership}


func browse_guilds() -> Array:
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/Guild?sort=-created_date&limit=100", null, true
	)
	guild_browse = []
	if res.ok and typeof(res.data) == TYPE_ARRAY:
		for g in res.data:
			if typeof(g) != TYPE_DICTIONARY:
				continue
			if g.has("public_listing") and g.get("public_listing") == false:
				continue
			guild_browse.append(g)
	return guild_browse


func create_guild(name: String, tag: String, description: String = "") -> Dictionary:
	var res: Dictionary = await GameApiClient.invoke("CreateGuild", {
		"name": name.strip_edges(),
		"tag": tag.strip_edges().to_upper(),
		"description": description.strip_edges(),
	})
	if res.ok:
		var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
		var patch: Variant = data.get("patch", {})
		if typeof(patch) == TYPE_DICTIONARY:
			GameManager.apply_active_character_patch(patch, "social_create_guild")
		var ch: Variant = data.get("character", {})
		if typeof(ch) == TYPE_DICTIONARY and not (ch as Dictionary).is_empty():
			GameManager.apply_active_character(ch, "social_create_guild")
		await load_my_guild()
	return res


func join_guild(guild_id: String) -> Dictionary:
	return await _join_character_into_guild(active_char(), guild_id)


func _join_character_into_guild(character: Dictionary, guild_id: String) -> Dictionary:
	if guild_id.is_empty() or character.is_empty():
		return {"ok": false, "error": "Missing guild or character"}
	var gres: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/Guild/%s" % guild_id.uri_encode(), null, true
	)
	if not gres.ok or typeof(gres.data) != TYPE_DICTIONARY:
		return {"ok": false, "error": "Guild not found"}
	var guild: Dictionary = gres.data
	if int(guild.get("member_count", 0)) >= 50:
		return {"ok": false, "error": "Guild is full"}
	var existing: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildMember/filter",
		{"query": {"character_id": str(character.get("id", ""))}, "limit": 1}, true
	)
	if existing.ok and typeof(existing.data) == TYPE_ARRAY and (existing.data as Array).size() > 0:
		if str(existing.data[0].get("guild_id", "")) == guild_id:
			return {"ok": true, "alreadyMember": true}
		return {"ok": false, "error": "Already in a guild"}
	var create: Dictionary = await GameApiClient.request("POST", "/api/entities/GuildMember", {
		"guild_id": guild_id,
		"character_id": str(character.get("id", "")),
		"character_name": str(character.get("name", "")),
		"character_level": int(character.get("level", 1)),
		"character_race": str(character.get("race", "")),
		"role": "member",
		"contributed_missions": 0,
		"contributed_stardust": 0,
		"joined_date": Time.get_datetime_string_from_system(true),
	}, true)
	if not create.ok:
		return create
	await GameApiClient.request(
		"PATCH", "/api/entities/Guild/%s" % guild_id.uri_encode(),
		{"member_count": int(guild.get("member_count", 1)) + 1}, true
	)
	await GameApiClient.request("POST", "/api/entities/GuildLog", {
		"guild_id": guild_id,
		"entry_type": "join",
		"message": "joined the guild",
		"character_name": str(character.get("name", "")),
	}, true)
	if str(character.get("id", "")) == char_id():
		await load_my_guild()
	return {"ok": true}


func report_player(reported: Dictionary, reason: String, context: String = "profile", snapshot: String = "") -> Dictionary:
	var cid := char_id()
	var rid := str(reported.get("id", ""))
	if cid.is_empty() or rid.is_empty():
		return {"ok": false, "error": "Missing reporter or target"}
	if cid == rid:
		return {"ok": false, "error": "Cannot report yourself"}
	return await GameApiClient.request("POST", "/api/entities/Report", {
		"reporter_id": cid,
		"reported_id": rid,
		"reported_name": str(reported.get("name", "")),
		"reason": reason if not reason.is_empty() else "Inappropriate profile",
		"context": context if not context.is_empty() else "profile",
		"message_snapshot": snapshot,
		"status": "open",
	}, true)


func load_public_profile(character_id: String) -> Dictionary:
	if character_id.is_empty():
		return {"ok": false, "error": "Missing character"}
	var cres: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/Character/%s" % character_id.uri_encode(), null, true
	)
	if not cres.ok or typeof(cres.data) != TYPE_DICTIONARY:
		return {"ok": false, "error": "Character not found"}
	var character: Dictionary = cres.data
	var items_res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/Item/filter",
		{"query": {"character_id": character_id, "is_equipped": true}, "limit": 40}, true
	)
	var equipped: Array = items_res.data if items_res.ok and typeof(items_res.data) == TYPE_ARRAY else []
	var stats_res: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/CharacterStats/filter",
		{"query": {"character_id": character_id}, "limit": 1}, true
	)
	var career: Dictionary = {}
	if stats_res.ok and typeof(stats_res.data) == TYPE_ARRAY and (stats_res.data as Array).size() > 0:
		career = stats_res.data[0]
	var guild_tag := ""
	var mem: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildMember/filter",
		{"query": {"character_id": character_id}, "limit": 1}, true
	)
	if mem.ok and typeof(mem.data) == TYPE_ARRAY and (mem.data as Array).size() > 0:
		var gid := str(mem.data[0].get("guild_id", ""))
		if not gid.is_empty():
			var gres: Dictionary = await GameApiClient.request(
				"GET", "/api/entities/Guild/%s" % gid.uri_encode(), null, true
			)
			if gres.ok and typeof(gres.data) == TYPE_DICTIONARY:
				guild_tag = str(gres.data.get("tag", ""))
	var presence: Dictionary = await PresenceManager.load_for(character_id)
	return {
		"ok": true,
		"character": character,
		"equipped": equipped,
		"career": career,
		"guild_tag": guild_tag,
		"presence": presence,
	}


func leave_guild() -> Dictionary:
	if my_membership.is_empty():
		return {"ok": false, "error": "Not in a guild"}
	var mid := str(my_membership.get("id", ""))
	var gid := str(my_membership.get("guild_id", ""))
	var role := str(my_membership.get("role", "member"))
	var my_name := str(my_membership.get("character_name", ""))
	var others: Dictionary = await GameApiClient.request(
		"POST", "/api/entities/GuildMember/filter",
		{"query": {"guild_id": gid}, "limit": 100}, true
	)
	var remaining: Array = []
	if others.ok and typeof(others.data) == TYPE_ARRAY:
		for m in others.data:
			if typeof(m) != TYPE_DICTIONARY:
				continue
			if str(m.get("id", "")) == mid:
				continue
			remaining.append(m)

	# Delete membership first so we never orphan the row.
	var res: Dictionary = await GameApiClient.request(
		"DELETE", "/api/entities/GuildMember/%s" % mid.uri_encode(), null, true
	)
	if not res.ok:
		return res

	if remaining.is_empty():
		# Last member — wipe guild wars/logs/ready then the guild (web departFromGuild).
		await GameApiClient.request("POST", "/api/entities/GuildLog/delete-many", {"query": {"guild_id": gid}}, true)
		await GameApiClient.request("POST", "/api/entities/GuildWarReady/delete-many", {"query": {"guild_id": gid}}, true)
		await GameApiClient.request("POST", "/api/entities/GuildWar/delete-many", {"query": {"attacker_guild_id": gid}}, true)
		await GameApiClient.request("POST", "/api/entities/GuildWar/delete-many", {"query": {"defender_guild_id": gid}}, true)
		await GameApiClient.request("DELETE", "/api/entities/Guild/%s" % gid.uri_encode(), null, true)
		await load_my_guild()
		return {"ok": true, "guild_deleted": true}

	var patch := {"member_count": remaining.size()}
	if role == "leader":
		remaining.sort_custom(func(a, b):
			var ra := 2 if str(a.get("role", "")) == "officer" else (1 if str(a.get("role", "")) == "member" else 0)
			var rb := 2 if str(b.get("role", "")) == "officer" else (1 if str(b.get("role", "")) == "member" else 0)
			if ra != rb:
				return ra > rb
			var la := int(a.get("character_level", 1))
			var lb := int(b.get("character_level", 1))
			if la != lb:
				return la > lb
			return str(a.get("joined_date", "")) < str(b.get("joined_date", ""))
		)
		var next_m: Dictionary = remaining[0]
		await GameApiClient.request(
			"PATCH", "/api/entities/GuildMember/%s" % str(next_m.get("id", "")).uri_encode(),
			{"role": "leader"}, true
		)
		patch["leader_id"] = str(next_m.get("character_id", ""))
		patch["leader_name"] = str(next_m.get("character_name", ""))
		await GameApiClient.request("POST", "/api/entities/GuildLog", {
			"guild_id": gid,
			"entry_type": "leave",
			"message": "departed — leadership passed to %s" % str(next_m.get("character_name", "")),
			"character_name": my_name,
		}, true)
	await GameApiClient.request(
		"PATCH", "/api/entities/Guild/%s" % gid.uri_encode(), patch, true
	)
	await load_my_guild()
	return {"ok": true}


func guild_tag_label() -> String:
	var tag := str(my_guild.get("tag", ""))
	if tag.is_empty() or tag == "<null>":
		return ""
	return "[%s]" % tag if not tag.begins_with("[") else tag
