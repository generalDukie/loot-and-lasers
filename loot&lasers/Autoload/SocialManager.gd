extends Node
## Friends · guild · mail. Restoration 23: Node owns social persistence.
## Nakama may still transport realtime; Godot is presentation-only.

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
	print("[SocialManager] ready (Node social)")


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
		await GameApiClient.invoke("CreateNotification", {
			"owner_id": requester_id,
			"type": "mail",
			"title": gname,
			"body": "Your join request was accepted!",
		})
		await load_mail(mail_folder)
		return join
	return {"ok": false, "error": "Not a guild mail"}


# ── Friends (Node GetSocialState / friend RPCs — Restoration 23) ─

func _node_data(res: Dictionary) -> Dictionary:
	if not bool(res.get("ok", false)):
		return {}
	var data: Variant = res.get("data", {})
	return data if typeof(data) == TYPE_DICTIONARY else {}


func load_social_state() -> Dictionary:
	if _busy:
		return {"ok": false, "error": "Social request already in progress"}
	_busy = true
	_set_loading(true)
	var res: Dictionary = await GameApiClient.invoke("GetSocialState", {})
	_busy = false
	_set_loading(false)
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "GetSocialState failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data := _node_data(res)
	_apply_social_state(data)
	return {"ok": true, "error": "", "data": data}


func load_friends() -> Dictionary:
	return await load_social_state()


func search_characters(query: String) -> Array:
	var q := query.strip_edges()
	if q.length() < 2:
		return []
	var res: Dictionary = await GameApiClient.invoke("SearchCharacters", {"query": q, "limit": 20})
	if not bool(res.get("ok", false)):
		return []
	var data := _node_data(res)
	var results: Variant = data.get("results", [])
	return results if typeof(results) == TYPE_ARRAY else []


func send_friend_request(to_char: Dictionary) -> Dictionary:
	var target := str(to_char.get("id", to_char.get("character_id", "")))
	if target.is_empty():
		return {"ok": false, "error": "Missing target character id"}
	_set_mutating(true)
	var res: Dictionary = await GameApiClient.invoke("SendFriendRequest", {
		"to_character_id": target,
	})
	_set_mutating(false)
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "SendFriendRequest failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data := _node_data(res)
	if typeof(data.get("state", {})) == TYPE_DICTIONARY:
		_apply_social_state(data["state"])
	friend_request_sent.emit()
	return {"ok": true, "error": "", "data": data}


func accept_friend(request: Dictionary) -> Dictionary:
	var rid := str(request.get("id", request.get("request_id", "")))
	if rid.is_empty():
		return {"ok": false, "error": "Missing request id"}
	_set_mutating(true)
	var res: Dictionary = await GameApiClient.invoke("AcceptFriendRequest", {"request_id": rid})
	_set_mutating(false)
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "accept failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data := _node_data(res)
	if typeof(data.get("state", {})) == TYPE_DICTIONARY:
		_apply_social_state(data["state"])
	friend_request_accepted.emit()
	return {"ok": true, "error": "", "data": data}


func accept_friend_request(request_or_user_id: String) -> Dictionary:
	## Prefer FriendRequest id; fall back to matching incoming by from_character_id.
	if request_or_user_id.is_empty():
		return {"ok": false, "error": "Missing target"}
	for req in incoming_requests:
		if typeof(req) != TYPE_DICTIONARY:
			continue
		if str(req.get("id", "")) == request_or_user_id or str(req.get("from_character_id", "")) == request_or_user_id:
			return await accept_friend(req)
	return await accept_friend({"id": request_or_user_id})


func decline_friend(request: Dictionary) -> Dictionary:
	var rid := str(request.get("id", request.get("request_id", "")))
	if rid.is_empty():
		return {"ok": false, "error": "Missing request id"}
	_set_mutating(true)
	var res: Dictionary = await GameApiClient.invoke("DeclineFriendRequest", {"request_id": rid})
	_set_mutating(false)
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "decline failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data := _node_data(res)
	if typeof(data.get("state", {})) == TYPE_DICTIONARY:
		_apply_social_state(data["state"])
	friend_request_declined.emit()
	return {"ok": true, "error": "", "data": data}


func decline_friend_request(request_or_user_id: String) -> Dictionary:
	if request_or_user_id.is_empty():
		return {"ok": false, "error": "Missing target"}
	for req in incoming_requests:
		if typeof(req) != TYPE_DICTIONARY:
			continue
		if str(req.get("id", "")) == request_or_user_id or str(req.get("from_character_id", "")) == request_or_user_id:
			return await decline_friend(req)
	for req in outgoing_requests:
		if typeof(req) != TYPE_DICTIONARY:
			continue
		if str(req.get("id", "")) == request_or_user_id or str(req.get("to_character_id", "")) == request_or_user_id:
			return await decline_friend(req)
	return await decline_friend({"id": request_or_user_id})


func cancel_friend_request(request: Dictionary) -> Dictionary:
	return await decline_friend(request)


func remove_friend(other_id: String) -> Dictionary:
	if other_id.is_empty():
		return {"ok": false, "error": "Missing id"}
	_set_mutating(true)
	var res: Dictionary = await GameApiClient.invoke("RemoveFriend", {"character_id": other_id})
	_set_mutating(false)
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "remove failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data := _node_data(res)
	if typeof(data.get("state", {})) == TYPE_DICTIONARY:
		_apply_social_state(data["state"])
	friend_removed.emit()
	return {"ok": true, "error": "", "data": data}


func friend_other_id(friendship: Dictionary) -> String:
	var mine := char_id()
	var parts: Variant = friendship.get("participant_ids", [])
	if typeof(parts) == TYPE_ARRAY:
		for pid in parts:
			if str(pid) != mine:
				return str(pid)
	return str(friendship.get("user_id", friendship.get("id", "")))


# ── Blocks (Node BlockPlayer RPCs) ────────────────────────────

func load_blocks() -> Array:
	var res: Dictionary = await GameApiClient.invoke("GetSocialState", {})
	if bool(res.get("ok", false)):
		var data := _node_data(res)
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
	var res: Dictionary = await GameApiClient.invoke("BlockPlayer", {"character_id": other_id})
	_set_mutating(false)
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "block failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data := _node_data(res)
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
	var res: Dictionary = await GameApiClient.invoke("UnblockPlayer", {"character_id": other_id})
	_set_mutating(false)
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "unblock failed"))
		social_error.emit(err)
		return {"ok": false, "error": err}
	var data := _node_data(res)
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
	var res: Dictionary = await GameApiClient.invoke("EnsureGuildChallenge", {})
	if not bool(res.get("ok", false)):
		return {"ok": false, "error": str(res.get("error", "EnsureGuildChallenge failed"))}
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	if typeof(data.get("challenge", null)) == TYPE_DICTIONARY:
		guild_challenge = data.challenge
	if typeof(data.get("guild", null)) == TYPE_DICTIONARY:
		my_guild = data.guild
		guild_changed.emit()
	return {"ok": true, "challenge": guild_challenge}


func add_challenge_progress(_amount: int = 1) -> Dictionary:
	# Progress is applied server-side via ContributeGuildMission / ContributeGuildArenaWin.
	# Kept as a refresh helper for callers that still await this API.
	await ensure_guild_challenge()
	if guild_challenge.is_empty():
		return {"ok": false, "error": "No active challenge"}
	return {
		"ok": true,
		"completed": str(guild_challenge.get("status", "")) == "completed",
		"challenge": guild_challenge,
		"reward_stardust": 0,
	}


func _apply_guild_xp(_xp_amount: int) -> void:
	# Guild XP is applied only by Node contribute RPCs.
	await load_my_guild()


## After a successful mission claim — mirrors guildUtils.contributeMission.
func contribute_mission(mission: Dictionary = {}, gains: Dictionary = {}) -> void:
	if my_membership.is_empty():
		await load_my_guild()
	if my_membership.is_empty() or my_guild.is_empty():
		return
	var res: Dictionary = await GameApiClient.invoke("ContributeGuildMission", {
		"mission": {
			"name": str(mission.get("name", "a mission")),
			"location": str(mission.get("location", "?")),
		},
		"gains": {
			"stardust": int(gains.get("stardust", 0)),
			"experience": int(gains.get("experience", 0)),
		},
	})
	if bool(res.get("ok", false)) and typeof(res.get("data", null)) == TYPE_DICTIONARY:
		var data: Dictionary = res.data
		if typeof(data.get("guild", null)) == TYPE_DICTIONARY:
			my_guild = data.guild
		if typeof(data.get("membership", null)) == TYPE_DICTIONARY:
			my_membership = data.membership
		if typeof(data.get("challenge", null)) == TYPE_DICTIONARY:
			guild_challenge = data.challenge
		guild_changed.emit()
	else:
		await load_my_guild()


## After an arena win — mirrors guildUtils.contributeArenaWin.
func contribute_arena_win() -> void:
	if my_membership.is_empty():
		await load_my_guild()
	if my_membership.is_empty() or my_guild.is_empty():
		return
	var res: Dictionary = await GameApiClient.invoke("ContributeGuildArenaWin", {})
	if bool(res.get("ok", false)) and typeof(res.get("data", null)) == TYPE_DICTIONARY:
		var data: Dictionary = res.data
		if typeof(data.get("guild", null)) == TYPE_DICTIONARY:
			my_guild = data.guild
		if typeof(data.get("challenge", null)) == TYPE_DICTIONARY:
			guild_challenge = data.challenge
		guild_changed.emit()
	else:
		await load_my_guild()


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
	var res: Dictionary = await GameApiClient.invoke("UpdateGuildSettings", {
		"settings": {"recruiting": open},
	})
	if bool(res.get("ok", false)) and typeof(res.get("data", null)) == TYPE_DICTIONARY:
		var data: Dictionary = res.data
		if typeof(data.get("guild", null)) == TYPE_DICTIONARY:
			my_guild = data.guild
			guild_changed.emit()
			return {"ok": true, "data": my_guild}
	return {"ok": false, "error": str(res.get("error", "UpdateGuildSettings failed"))}


func set_guild_public_listing(visible: bool) -> Dictionary:
	if not can_manage_guild() or my_guild.is_empty():
		return {"ok": false, "error": "Only the guild leader can change listing"}
	var res: Dictionary = await GameApiClient.invoke("UpdateGuildSettings", {
		"settings": {"public_listing": visible},
	})
	if bool(res.get("ok", false)) and typeof(res.get("data", null)) == TYPE_DICTIONARY:
		var data: Dictionary = res.data
		if typeof(data.get("guild", null)) == TYPE_DICTIONARY:
			my_guild = data.guild
			guild_changed.emit()
			return {"ok": true, "data": my_guild}
	return {"ok": false, "error": str(res.get("error", "UpdateGuildSettings failed"))}


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
		await GameApiClient.invoke("CreateNotification", {
			"owner_id": rid,
			"type": "mail",
			"title": str(me.get("name", "")),
			"body": "wants to join %s" % gname,
		})
	return {"ok": true}


func invite_to_guild(target: Dictionary) -> Dictionary:
	if not can_invite_to_guild() or my_guild.is_empty():
		return {"ok": false, "error": "Only officers/leaders can invite"}
	var tid := str(target.get("id", ""))
	if tid.is_empty():
		return {"ok": false, "error": "Missing target"}
	var res: Dictionary = await GameApiClient.invoke("InviteGuildMember", {"character_id": tid})
	if not bool(res.get("ok", false)):
		return {"ok": false, "error": str(res.get("error", "Invite failed"))}
	return {"ok": true, "mail": _node_data(res).get("mail", {})}


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
	if guild_id.is_empty():
		return {"ok": false, "error": "Missing guild"}
	var res: Dictionary = await GameApiClient.invoke("JoinGuild", {"guild_id": guild_id})
	if not bool(res.get("ok", false)):
		return {"ok": false, "error": str(res.get("error", "JoinGuild failed"))}
	await load_my_guild()
	return {"ok": true}


func _join_character_into_guild(character: Dictionary, guild_id: String) -> Dictionary:
	## Only the active character can join via JoinGuild (server uses session character).
	if str(character.get("id", "")) != char_id():
		return {"ok": false, "error": "Can only join with active character"}
	return await join_guild(guild_id)


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
	var res: Dictionary = await GameApiClient.invoke("GetPublicProfile", {"character_id": character_id})
	if not bool(res.get("ok", false)):
		return {"ok": false, "error": str(res.get("error", "Character not found"))}
	var data := _node_data(res)
	var profile: Dictionary = data.get("profile", {}) if typeof(data.get("profile", {})) == TYPE_DICTIONARY else {}
	var guild_tag := ""
	var guild: Variant = profile.get("guild", null)
	if typeof(guild) == TYPE_DICTIONARY:
		guild_tag = str(guild.get("tag", ""))
	var presence: Dictionary = profile.get("presence", {}) if typeof(profile.get("presence", {})) == TYPE_DICTIONARY else {}
	var statistics: Dictionary = profile.get("statistics", {}) if typeof(profile.get("statistics", {})) == TYPE_DICTIONARY else {}
	return {
		"ok": true,
		"character": profile,
		"profile": profile,
		"equipped": [],
		"career": statistics,
		"guild_tag": guild_tag,
		"presence": presence,
	}


func leave_guild() -> Dictionary:
	if my_membership.is_empty():
		return {"ok": false, "error": "Not in a guild"}
	var res: Dictionary = await GameApiClient.invoke("LeaveGuild", {})
	if not bool(res.get("ok", false)):
		return {"ok": false, "error": str(res.get("error", "LeaveGuild failed"))}
	await load_my_guild()
	var data := _node_data(res)
	return {"ok": true, "guild_deleted": bool(data.get("guildDeleted", false))}


func guild_tag_label() -> String:
	var tag := str(my_guild.get("tag", ""))
	if tag.is_empty() or tag == "<null>":
		return ""
	return "[%s]" % tag if not tag.begins_with("[") else tag
