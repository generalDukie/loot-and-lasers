extends Control
## Galactic Rankings — mirrors web LeaderboardPage (podium 2·1·3 · rank rows · challenge).

const MEDAL := [Color("#FFD700"), Color("#C0C0C0"), Color("#CD7F32")]
## Visual podium column heights for order [2nd, 1st, 3rd] — web h-24 / h-36 / h-20.
const PODIUM_H := [96.0, 144.0, 80.0]

var _status: Label
var _podium: HBoxContainer
var _list: VBoxContainer
var _busy := false
var _challenging_id := ""
var _guild_by_char: Dictionary = {} # character_id -> guild tag
var _preview_cache: Dictionary = {} # character_id -> preview dict


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	await _refresh()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "combat"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 14)
	margin.add_child(root)

	# Header — web centered Crown + Galactic Rankings
	var head := VBoxContainer.new()
	head.add_theme_constant_override("separation", 4)
	root.add_child(head)

	var title := Label.new()
	title.text = "👑  Galactic Rankings"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	head.add_child(title)

	var sub := Label.new()
	sub.text = "Ranked by arena rating · Challenge any eligible rival"
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", 11)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(sub)
	head.add_child(sub)

	_status = ClientUi.make_status()
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(_status)

	# Podium — items_end aligned (shorter pillars sit lower)
	_podium = HBoxContainer.new()
	_podium.alignment = BoxContainer.ALIGNMENT_CENTER
	_podium.add_theme_constant_override("separation", 18)
	_podium.custom_minimum_size.y = 220
	root.add_child(_podium)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 8)
	scroll.add_child(_list)


func _refresh() -> void:
	if _busy:
		return
	_busy = true
	_set_status("Loading ladder…", ClientUi.MUTED)
	for c in _list.get_children():
		c.queue_free()
	for c in _podium.get_children():
		c.queue_free()

	await _load_guild_tags()

	var res: Dictionary = await ApiClient.request(
		"GET",
		"/api/entities/Character?sort=-arena_rating&limit=100",
		null,
		true
	)
	_busy = false
	if not res.ok or typeof(res.data) != TYPE_ARRAY:
		_set_status(str(res.get("error", "Failed to load leaderboard")), ClientUi.DANGER)
		return

	var rows: Array = []
	for row in res.data:
		if typeof(row) == TYPE_DICTIONARY:
			rows.append(row)
	# Stable secondary sort by wins (web: rating then wins).
	rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var ra := int(a.get("arena_rating", 1000))
		var rb := int(b.get("arena_rating", 1000))
		if ra != rb:
			return ra > rb
		return int(a.get("arena_wins", 0)) > int(b.get("arena_wins", 0))
	)

	if rows.is_empty():
		_set_status("No commanders ranked yet.", ClientUi.MUTED)
		return

	_set_status("", ClientUi.MUTED)
	_build_podium(rows)
	_build_list(rows)


func _load_guild_tags() -> void:
	_guild_by_char.clear()
	var guilds_res: Dictionary = await ApiClient.request(
		"GET", "/api/entities/Guild?limit=200", null, true
	)
	var members_res: Dictionary = await ApiClient.request(
		"GET", "/api/entities/GuildMember?limit=500", null, true
	)
	var tag_by_gid: Dictionary = {}
	if guilds_res.ok and typeof(guilds_res.data) == TYPE_ARRAY:
		for g in guilds_res.data:
			if typeof(g) != TYPE_DICTIONARY:
				continue
			var gid := str(g.get("id", ""))
			if gid.is_empty():
				continue
			var tag := str(g.get("tag", ""))
			if tag.is_empty():
				tag = str(g.get("name", ""))
			tag_by_gid[gid] = tag
	if members_res.ok and typeof(members_res.data) == TYPE_ARRAY:
		for m in members_res.data:
			if typeof(m) != TYPE_DICTIONARY:
				continue
			var cid := str(m.get("character_id", ""))
			var gid := str(m.get("guild_id", ""))
			if cid.is_empty() or gid.is_empty():
				continue
			_guild_by_char[cid] = str(tag_by_gid.get(gid, ""))


func _guild_tag(c: Dictionary) -> String:
	return str(_guild_by_char.get(str(c.get("id", "")), ""))


func _race_emoji(c: Dictionary) -> String:
	var race := str(c.get("race", ""))
	var info: Dictionary = GameData.RACE_CATALOG.get(race, {})
	return str(info.get("emoji", "🛸"))


func _build_podium(rows: Array) -> void:
	var top3: Array = []
	for i in mini(3, rows.size()):
		top3.append(rows[i])
	# Visual order: 2nd | 1st | 3rd
	var visual: Array = []
	if top3.size() >= 2:
		visual.append({"visual_i": 0, "rank": 1, "c": top3[1]}) # silver left
	if top3.size() >= 1:
		visual.append({"visual_i": 1, "rank": 0, "c": top3[0]}) # gold center
	if top3.size() >= 3:
		visual.append({"visual_i": 2, "rank": 2, "c": top3[2]}) # bronze right

	# Align bottoms: wrap each column in a VBox that expands and pushes content down.
	for entry in visual:
		var col := VBoxContainer.new()
		col.size_flags_vertical = Control.SIZE_EXPAND_FILL
		col.alignment = BoxContainer.ALIGNMENT_END
		col.add_theme_constant_override("separation", 0)
		_podium.add_child(col)
		var card := _make_podium_card(
			int(entry["rank"]),
			int(entry["visual_i"]),
			entry["c"]
		)
		col.add_child(card)
		card.modulate.a = 0.0
		card.position.y = 18.0
		var delay := 0.1 * float(entry["visual_i"])
		var tw := card.create_tween().set_parallel(true)
		tw.tween_property(card, "modulate:a", 1.0, 0.28).set_delay(delay)
		tw.tween_property(card, "position:y", 0.0, 0.36).set_delay(delay).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		_bob_emoji(card.get_node_or_null("Emoji"), float(entry["visual_i"]) * 0.2)


func _make_podium_card(medal_rank: int, visual_i: int, c: Dictionary) -> VBoxContainer:
	var wrap := VBoxContainer.new()
	wrap.custom_minimum_size.x = 112
	wrap.alignment = BoxContainer.ALIGNMENT_CENTER
	wrap.add_theme_constant_override("separation", 4)

	var medal: Color = MEDAL[medal_rank]
	var emoji := Label.new()
	emoji.name = "Emoji"
	emoji.text = _race_emoji(c)
	emoji.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	emoji.add_theme_font_size_override("font_size", 32)
	emoji.add_theme_color_override("font_shadow_color", Color(medal, 0.75))
	emoji.add_theme_constant_override("shadow_offset_x", 0)
	emoji.add_theme_constant_override("shadow_offset_y", 0)
	emoji.add_theme_constant_override("shadow_outline_size", 6)
	wrap.add_child(emoji)

	var name_row := HBoxContainer.new()
	name_row.alignment = BoxContainer.ALIGNMENT_CENTER
	name_row.add_theme_constant_override("separation", 4)
	wrap.add_child(name_row)
	var name_l := Label.new()
	name_l.text = str(c.get("name", "?"))
	name_l.clip_text = true
	name_l.custom_minimum_size.x = 90
	name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_l.add_theme_font_size_override("font_size", 11)
	name_l.add_theme_color_override("font_color", medal)
	ClientUi.apply_display_font(name_l)
	name_row.add_child(name_l)
	var gtag := _guild_tag(c)
	if not gtag.is_empty():
		var g := Label.new()
		g.text = "[%s]" % gtag
		g.add_theme_font_size_override("font_size", 9)
		g.add_theme_color_override("font_color", Color(ClientUi.VIOLET, 0.85))
		ClientUi.apply_display_font(g)
		name_row.add_child(g)

	var meta := Label.new()
	meta.text = "%s · %sW" % [str(c.get("arena_rating", 1000)), str(c.get("arena_wins", 0))]
	meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	meta.add_theme_font_size_override("font_size", 10)
	meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(meta)
	wrap.add_child(meta)

	var pillar := PanelContainer.new()
	pillar.custom_minimum_size = Vector2(112, PODIUM_H[visual_i])
	pillar.add_theme_stylebox_override("panel", _pillar_style(medal))
	wrap.add_child(pillar)
	var num := Label.new()
	num.text = str(medal_rank + 1)
	num.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	num.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	num.add_theme_font_size_override("font_size", 22)
	num.add_theme_color_override("font_color", Color(0, 0, 0, 0.55))
	ClientUi.apply_display_font(num)
	pillar.add_child(num)

	# Whole podium entry opens profile (web motion.button).
	wrap.mouse_filter = Control.MOUSE_FILTER_STOP
	wrap.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var capt: Dictionary = c
	wrap.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			GameManager.go_public_profile(capt)
	)
	return wrap


func _pillar_style(medal: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = medal.lerp(Color(medal, 0.2), 0.35)
	s.border_color = Color(medal, 0.55)
	s.border_width_top = 0
	s.border_width_left = 0
	s.border_width_right = 0
	s.border_width_bottom = 0
	s.corner_radius_top_left = 12
	s.corner_radius_top_right = 12
	s.corner_radius_bottom_left = 0
	s.corner_radius_bottom_right = 0
	s.content_margin_top = 8
	s.shadow_color = Color(medal, 0.4)
	s.shadow_size = 12
	s.shadow_offset = Vector2(0, 2)
	return s


func _bob_emoji(node: Control, delay: float) -> void:
	if node == null or not is_instance_valid(node):
		return
	await get_tree().create_timer(delay).timeout
	if not is_instance_valid(node):
		return
	var tw := node.create_tween().set_loops()
	tw.tween_property(node, "position:y", -5.0, 1.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(node, "position:y", 0.0, 1.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


func _build_list(rows: Array) -> void:
	var my_id := str(GameManager.active_character.get("id", ""))
	var my_account := str(AuthManager.user.get("id", ""))
	for i in range(3, rows.size()):
		var c: Dictionary = rows[i]
		var rank := i + 1
		_list.add_child(_make_row(rank, c, str(c.get("id", "")) == my_id, my_account))


func _make_row(rank: int, c: Dictionary, is_me: bool, my_account: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.09, 0.72), Color(0.35, 0.40, 0.48, 0.40), 12, 1
	))

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)

	# Clickable identity — web left button region.
	var id_row := HBoxContainer.new()
	id_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	id_row.add_theme_constant_override("separation", 10)
	id_row.mouse_filter = Control.MOUSE_FILTER_STOP
	id_row.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var capt: Dictionary = c
	var oid := str(c.get("id", ""))
	id_row.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			GameManager.go_public_profile(capt)
	)
	id_row.mouse_entered.connect(func() -> void: _prefetch_preview(oid))
	row.add_child(id_row)

	var rank_lab := Label.new()
	rank_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rank_lab.text = str(rank)
	rank_lab.custom_minimum_size.x = 28
	rank_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rank_lab.add_theme_font_size_override("font_size", 13)
	rank_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(rank_lab)
	id_row.add_child(rank_lab)

	var emoji := Label.new()
	emoji.mouse_filter = Control.MOUSE_FILTER_IGNORE
	emoji.text = _race_emoji(c)
	emoji.add_theme_font_size_override("font_size", 22)
	id_row.add_child(emoji)

	var mid := VBoxContainer.new()
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid.add_theme_constant_override("separation", 1)
	id_row.add_child(mid)

	var name_row := HBoxContainer.new()
	name_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_row.add_theme_constant_override("separation", 6)
	mid.add_child(name_row)
	var name_l := Label.new()
	name_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_l.text = str(c.get("name", "?"))
	name_l.clip_text = true
	name_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_l.add_theme_font_size_override("font_size", 13)
	name_l.add_theme_color_override("font_color", ClientUi.GOLD if is_me else ClientUi.TEXT)
	ClientUi.apply_display_font(name_l)
	name_row.add_child(name_l)
	var gtag := _guild_tag(c)
	if not gtag.is_empty():
		var gchip := PanelContainer.new()
		gchip.mouse_filter = Control.MOUSE_FILTER_IGNORE
		gchip.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(ClientUi.VIOLET, 0.08), Color(ClientUi.VIOLET, 0.30), 4, 1
		))
		name_row.add_child(gchip)
		var g := Label.new()
		g.mouse_filter = Control.MOUSE_FILTER_IGNORE
		g.text = "[%s]" % gtag
		g.add_theme_font_size_override("font_size", 9)
		g.add_theme_color_override("font_color", Color(ClientUi.VIOLET, 0.9))
		ClientUi.apply_display_font(g)
		gchip.add_child(g)

	var detail := Label.new()
	detail.name = "Detail"
	detail.mouse_filter = Control.MOUSE_FILTER_IGNORE
	detail.text = "%s · %s" % [str(c.get("race", "?")), str(c.get("class", "?"))]
	detail.add_theme_font_size_override("font_size", 10)
	detail.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(detail)
	mid.add_child(detail)

	var rating := Label.new()
	rating.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rating.text = "🏆  %s" % str(c.get("arena_rating", 1000))
	rating.add_theme_font_size_override("font_size", 12)
	rating.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_display_font(rating)
	id_row.add_child(rating)

	var wins := Label.new()
	wins.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wins.text = "⚔  %s" % str(c.get("arena_wins", 0))
	wins.add_theme_font_size_override("font_size", 12)
	wins.add_theme_color_override("font_color", ClientUi.VIOLET)
	ClientUi.apply_display_font(wins)
	id_row.add_child(wins)

	if not is_me:
		var same_account := str(c.get("created_by_id", "")) == my_account and not my_account.is_empty()
		var chal := Button.new()
		chal.text = "Challenge"
		chal.focus_mode = Control.FOCUS_NONE
		ClientUi.apply_ghost_button(chal)
		chal.add_theme_font_size_override("font_size", 10)
		chal.add_theme_color_override("font_color", ClientUi.CYAN)
		chal.add_theme_color_override("font_hover_color", ClientUi.CYAN_SOFT)
		chal.disabled = same_account or _challenging_id == oid
		chal.tooltip_text = "Same account" if same_account else "Challenge"
		chal.mouse_entered.connect(func() -> void: _prefetch_preview(oid))
		if not same_account:
			chal.pressed.connect(func() -> void: _on_challenge(capt, chal, detail))
		row.add_child(chal)

	return panel


func _prefetch_preview(opponent_id: String) -> void:
	if opponent_id.is_empty() or _preview_cache.has(opponent_id):
		return
	var me := str(GameManager.active_character.get("id", ""))
	if me.is_empty() or me == opponent_id:
		return
	var res: Dictionary = await ApiClient.request(
		"POST", "/api/arena/challenges/preview",
		{
			"challengerCharacterId": me,
			"opponentCharacterId": opponent_id,
			"challengeType": "leaderboard_direct",
		},
		true
	)
	if res.ok and typeof(res.data) == TYPE_DICTIONARY:
		_preview_cache[opponent_id] = res.data


func _confirm_async(title: String, text: String) -> bool:
	var dialog := ConfirmationDialog.new()
	dialog.title = title
	dialog.dialog_text = text
	dialog.ok_button_text = "Continue"
	dialog.cancel_button_text = "Cancel"
	add_child(dialog)
	var result := {"ok": false, "done": false}
	dialog.confirmed.connect(func() -> void:
		result.ok = true
		result.done = true
	)
	dialog.canceled.connect(func() -> void:
		result.ok = false
		result.done = true
	)
	dialog.close_requested.connect(func() -> void:
		result.ok = false
		result.done = true
	)
	dialog.popup_centered()
	while not result.done:
		await get_tree().process_frame
	dialog.queue_free()
	return bool(result.ok)


func _on_challenge(c: Dictionary, btn: Button = null, detail: Label = null) -> void:
	if _busy:
		return
	var oid := str(c.get("id", ""))
	_busy = true
	_challenging_id = oid
	if btn != null and is_instance_valid(btn):
		btn.text = "…"
		btn.disabled = true
	_set_status("Checking challenge vs %s…" % str(c.get("name", "?")), ClientUi.MUTED)

	var preview: Dictionary = _preview_cache.get(oid, {})
	if preview.is_empty():
		await _prefetch_preview(oid)
		preview = _preview_cache.get(oid, {})

	if preview.is_empty():
		_busy = false
		_challenging_id = ""
		_set_status("Challenge preview failed", ClientUi.DANGER)
		if btn != null and is_instance_valid(btn):
			btn.text = "Challenge"
			btn.disabled = false
		return

	if preview.get("challengeAllowed") == false:
		_busy = false
		_challenging_id = ""
		_set_status(str(preview.get("error", "Challenge unavailable")), ClientUi.DANGER)
		if btn != null and is_instance_valid(btn):
			btn.text = "Challenge"
			btn.disabled = false
		return

	var warn := str(preview.get("warningCode", ""))
	if warn == "OPPONENT_TOO_LOW_FOR_RATING_GAIN":
		if detail != null and is_instance_valid(detail):
			detail.text = "%s · %s  ⚠ no rating on win" % [
				str(c.get("race", "?")), str(c.get("class", "?"))
			]
			detail.add_theme_color_override("font_color", Color("#FBBF24"))
		var ok := await _confirm_async(
			"Low-rated opponent",
			"This opponent is far below your rating (%s vs %s).\n\nVictory awards no ranking points. You still risk %s rating on a loss.\n\nContinue?" % [
				str(preview.get("challengerRating", "?")),
				str(preview.get("opponentRating", "?")),
				str(absi(int(preview.get("estimatedLossChange", 0)))),
			]
		)
		if not ok:
			_busy = false
			_challenging_id = ""
			if btn != null and is_instance_valid(btn):
				btn.text = "Challenge"
				btn.disabled = false
			_set_status("", ClientUi.MUTED)
			return
	elif warn == "ARENA_REPEAT_OPPONENT_NO_RATING":
		var ok2 := await _confirm_async(
			"Repeat opponent",
			"You have already earned rating against this account today. Further wins award no ranking points. Continue?"
		)
		if not ok2:
			_busy = false
			_challenging_id = ""
			if btn != null and is_instance_valid(btn):
				btn.text = "Challenge"
				btn.disabled = false
			_set_status("", ClientUi.MUTED)
			return
	elif warn == "ARENA_REPEAT_OPPONENT_REDUCED_REWARD":
		_set_status(
			"Reduced rating reward — Win ≈ +%s · Loss ≈ %s" % [
				str(preview.get("estimatedWinChange", "?")),
				str(preview.get("estimatedLossChange", "?")),
			],
			Color("#FBBF24")
		)

	_set_status("Opening challenge vs %s…" % str(c.get("name", "?")), ClientUi.MUTED)
	var res: Dictionary = await ArenaManager.start_direct_challenge(oid)
	_busy = false
	_challenging_id = ""
	if not res.get("ok", false):
		_set_status(str(res.get("error", "Challenge unavailable")), ClientUi.DANGER)
		if btn != null and is_instance_valid(btn):
			btn.text = "Challenge"
			btn.disabled = false
		return
	GameManager.go_arena_combat()


func _set_status(text: String, color: Color) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", color)
