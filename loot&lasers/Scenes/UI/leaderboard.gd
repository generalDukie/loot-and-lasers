extends Control
## Galactic Rankings — mirrors web LeaderboardPage (podium 2·1·3 · rank rows · challenge).

const MEDAL := [Color("#FFD700"), Color("#C0C0C0"), Color("#CD7F32")]
## Visual podium column heights for order [2nd, 1st, 3rd] — web h-24 / h-36 / h-20.
const PODIUM_H := [96.0, 144.0, 80.0]
const GUILD_PAGE := 50
const MODE_CHARACTER := "character"
const MODE_GUILD := "guild"

var _status: Label
var _subtitle: Label
var _podium: HBoxContainer
var _list: VBoxContainer
var _scroll: ScrollContainer
var _you_bar: PanelContainer
var _tab_buttons: Array[Button] = []
var _mode := MODE_CHARACTER
var _busy := false
var _refresh_busy := false
var _refresh_generation := 0
var _challenging_id := ""
var _preview_cache: Dictionary = {} # character_id -> preview dict
var _char_cache: Dictionary = {}
var _guild_cache: Dictionary = {}
var _guild_rows: Array = []
var _guild_offset := 0
var _guild_has_more := false
var _guild_loading_more := false


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	await _refresh()


func on_shell_reshow() -> void:
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

	var title_center := CenterContainer.new()
	title_center.add_child(UiIcon.make_title_row("crown", "Galactic Rankings", ClientUi.TEXT, 29, 28.0))
	head.add_child(title_center)

	var sub := Label.new()
	sub.text = "Ranked by arena rating · Challenge any eligible rival"
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", 19)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(sub)
	head.add_child(sub)
	_subtitle = sub

	_status = ClientUi.make_status()
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(_status)

	root.add_child(_make_tab_bar())

	# Podium — items_end aligned (shorter pillars sit lower)
	_podium = HBoxContainer.new()
	_podium.alignment = BoxContainer.ALIGNMENT_CENTER
	_podium.add_theme_constant_override("separation", 18)
	_podium.custom_minimum_size.y = 293
	TutorialManager.tag_target(_podium, "ranks-board")
	root.add_child(_podium)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(scroll)
	_scroll = scroll
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 8)
	TutorialManager.tag_target(_list, "ranks-board")
	scroll.add_child(_list)
	scroll.get_v_scroll_bar().changed.connect(_on_scroll_changed)

	_you_bar = PanelContainer.new()
	_you_bar.visible = false
	_you_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_you_bar.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(ClientUi.GOLD, 0.10), Color(ClientUi.GOLD, 0.45), 10, 1
	))
	root.add_child(_you_bar)


func _make_tab_bar() -> CenterContainer:
	var wrap := CenterContainer.new()
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 8)
	wrap.add_child(tabs)
	_tab_buttons.clear()
	for spec in [
		{"id": MODE_CHARACTER, "label": "CHARACTER RANKING", "icon": "crown", "tint": ClientUi.GOLD},
		{"id": MODE_GUILD, "label": "GUILD RANKING", "icon": "users", "tint": ClientUi.CYAN},
	]:
		var b := Button.new()
		b.text = str(spec["label"])
		b.focus_mode = Control.FOCUS_NONE
		b.custom_minimum_size = Vector2(220, 40)
		b.add_theme_font_size_override("font_size", 15)
		ClientUi.apply_display_font(b)
		UiIcon.apply_leading_icon(b, str(spec["icon"]), spec["tint"], 16.0)
		b.set_meta("tab_id", spec["id"])
		b.set_meta("tint", spec["tint"])
		b.pressed.connect(_select_tab.bind(str(spec["id"])))
		tabs.add_child(b)
		_tab_buttons.append(b)
	_style_tabs()
	return wrap


func _tab_flat(bg: Color, border: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(1)
	s.set_corner_radius_all(10)
	s.content_margin_left = 14
	s.content_margin_right = 14
	s.content_margin_top = 8
	s.content_margin_bottom = 8
	return s


func _style_tabs() -> void:
	for b in _tab_buttons:
		var tid := str(b.get_meta("tab_id", ""))
		var tint: Color = b.get_meta("tint", ClientUi.CYAN)
		var active := tid == _mode
		if active:
			b.add_theme_stylebox_override("normal", _tab_flat(Color(tint, 0.16), Color(tint, 0.75)))
			b.add_theme_stylebox_override("hover", _tab_flat(Color(tint, 0.22), Color(tint, 0.9)))
			b.add_theme_stylebox_override("pressed", _tab_flat(Color(tint, 0.14), Color(tint, 0.65)))
			b.add_theme_color_override("font_color", tint.lightened(0.12))
			b.add_theme_color_override("font_hover_color", tint.lightened(0.25))
			UiIcon.apply_button_icon_colors(b, tint.lightened(0.12))
		else:
			b.add_theme_stylebox_override("normal", _tab_flat(Color(0.06, 0.08, 0.12, 0.45), Color(0.4, 0.45, 0.55, 0.35)))
			b.add_theme_stylebox_override("hover", _tab_flat(Color(0.1, 0.12, 0.16, 0.75), Color(0.5, 0.55, 0.65, 0.5)))
			b.add_theme_stylebox_override("pressed", _tab_flat(Color(0.08, 0.1, 0.14, 0.6), Color(0.45, 0.5, 0.6, 0.45)))
			b.add_theme_color_override("font_color", ClientUi.MUTED)
			b.add_theme_color_override("font_hover_color", ClientUi.TEXT)
			UiIcon.apply_button_icon_colors(b, ClientUi.MUTED)


func _select_tab(id: String) -> void:
	if id == _mode:
		return
	_mode = id
	_style_tabs()
	_apply_subtitle()
	await _refresh()


func _apply_subtitle() -> void:
	if _subtitle == null:
		return
	if _mode == MODE_GUILD:
		_subtitle.text = "Ranked by guild level · Ties broken by XP, then members"
	else:
		_subtitle.text = "Ranked by arena rating · Challenge any eligible rival"


func _refresh() -> void:
	_refresh_generation += 1
	var refresh_token := _refresh_generation
	if _mode == MODE_GUILD:
		await _refresh_guild(refresh_token)
	else:
		await _refresh_character(refresh_token)


func _refresh_is_current(refresh_token: int, expected_mode: String) -> bool:
	return refresh_token == _refresh_generation and _mode == expected_mode


func _clear_board() -> void:
	for c in _list.get_children():
		c.queue_free()
	for c in _podium.get_children():
		c.queue_free()
	_hide_you_bar()


func _refresh_character(refresh_token: int) -> void:
	_refresh_busy = true
	_set_status("Loading ladder…", ClientUi.MUTED)
	_clear_board()
	var bundle := await _load_character_refresh_bundle()
	if not _refresh_is_current(refresh_token, MODE_CHARACTER):
		return
	_refresh_busy = false
	var board: Dictionary = bundle.get("board", {})
	if not bool(board.get("ok", false)):
		_set_status(str(board.get("error", "Failed to load leaderboard")), ClientUi.DANGER)
		return
	var data: Dictionary = board.get("data", {}) if typeof(board.get("data", null)) == TYPE_DICTIONARY else {}
	_char_cache = data
	_render_character(data, true)


func _load_character_refresh_bundle() -> Dictionary:
	return {"board": await ArenaManager.load_rankings()}


func _normalize_char_rows(data: Dictionary) -> Array:
	var raw: Array = data.get("rankings", []) if typeof(data.get("rankings", null)) == TYPE_ARRAY else []
	var rows: Array = []
	for row in raw:
		if typeof(row) != TYPE_DICTIONARY:
			continue
		var r: Dictionary = row
		if str(r.get("id", "")).is_empty() and not str(r.get("character_id", "")).is_empty():
			r["id"] = r["character_id"]
		rows.append(r)
	return rows


func _render_character(data: Dictionary, _animate_podium: bool) -> void:
	var rows: Array = _normalize_char_rows(data)
	if rows.is_empty():
		_set_status("No commanders ranked yet.", ClientUi.MUTED)
		_hide_you_bar()
		return
	_set_status("", ClientUi.MUTED)
	_build_podium(rows, false)
	_build_list(rows)
	_show_character_you_bar(data, rows)


func _refresh_guild(refresh_token: int, append: bool = false) -> void:
	if not _refresh_is_current(refresh_token, MODE_GUILD):
		return
	if append:
		if _guild_loading_more or not _guild_has_more:
			return
		_guild_loading_more = true
		_set_status("Loading more guilds…", ClientUi.MUTED)
		var more: Dictionary = await SocialManager.load_guild_rankings(GUILD_PAGE, _guild_offset, false)
		if not _refresh_is_current(refresh_token, MODE_GUILD):
			return
		_guild_loading_more = false
		if not bool(more.get("ok", false)):
			_set_status(str(more.get("error", "Failed to load guild rankings")), ClientUi.DANGER)
			return
		var more_data: Dictionary = more.get("data", {}) if typeof(more.get("data", null)) == TYPE_DICTIONARY else {}
		_append_guild_page(more_data)
		return
	_refresh_busy = true
	_guild_loading_more = false
	_set_status("Loading guild rankings…", ClientUi.MUTED)
	_clear_board()
	_guild_rows.clear()
	_guild_offset = 0
	var board: Dictionary = await SocialManager.load_guild_rankings(GUILD_PAGE, 0, true)
	if not _refresh_is_current(refresh_token, MODE_GUILD):
		return
	_refresh_busy = false
	if not bool(board.get("ok", false)):
		_set_status(str(board.get("error", "Failed to load guild rankings")), ClientUi.DANGER)
		return
	var data: Dictionary = board.get("data", {}) if typeof(board.get("data", null)) == TYPE_DICTIONARY else {}
	_guild_cache = data
	_render_guild(data, true)


func _render_guild(data: Dictionary, reset: bool) -> void:
	if reset:
		_guild_rows.clear()
		_guild_offset = 0
		for c in _list.get_children():
			c.queue_free()
		for c in _podium.get_children():
			c.queue_free()
	_append_guild_page(data)


func _append_guild_page(data: Dictionary) -> void:
	var existing := _list.get_node_or_null("LoadMore")
	if existing:
		existing.queue_free()
	var raw: Array = data.get("rankings", []) if typeof(data.get("rankings", null)) == TYPE_ARRAY else []
	var page: Array = []
	for row in raw:
		if typeof(row) == TYPE_DICTIONARY:
			page.append(row)
	var was_empty := _guild_rows.is_empty()
	for r in page:
		_guild_rows.append(r)
	_guild_offset = int(data.get("offset", 0)) + int(data.get("limit", page.size()))
	_guild_has_more = bool(data.get("has_more", false))
	if _guild_rows.is_empty():
		_set_status("No guilds ranked yet.", ClientUi.MUTED)
		_hide_you_bar()
		return
	if was_empty:
		_build_podium(_guild_rows, true)
		_build_guild_list(_guild_rows)
	else:
		_build_guild_list_tail(page)
	_set_status("", ClientUi.MUTED)
	if not bool(data.get("in_guild", false)):
		_set_status("Join or create a guild to compete in the Guild Rankings.", ClientUi.MUTED)
	_show_guild_you_bar(data)
	_ensure_load_more_button()


func _on_scroll_changed() -> void:
	if _mode != MODE_GUILD or not _guild_has_more or _guild_loading_more or _refresh_busy or _busy:
		return
	if _scroll == null:
		return
	var bar := _scroll.get_v_scroll_bar()
	if bar.max_value <= 0.0:
		return
	if bar.value >= bar.max_value - bar.page - 48.0:
		_refresh_guild(_refresh_generation, true)


func _ensure_load_more_button() -> void:
	var existing := _list.get_node_or_null("LoadMore")
	if existing:
		existing.queue_free()
	if _mode != MODE_GUILD or not _guild_has_more:
		return
	var btn := Button.new()
	btn.name = "LoadMore"
	btn.text = "Load more guilds"
	btn.focus_mode = Control.FOCUS_NONE
	ClientUi.apply_ghost_button(btn)
	btn.pressed.connect(func() -> void: _refresh_guild(_refresh_generation, true))
	_list.add_child(btn)


func _guild_tag(c: Dictionary) -> String:
	return str(c.get("guild_tag", ""))


func _class_key(c: Dictionary) -> String:
	return str(c.get("class", ""))


func _build_podium(rows: Array, is_guild: bool) -> void:
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
			entry["c"],
			is_guild
		)
		col.add_child(card)
		card.modulate.a = 0.0
		card.position.y = 18.0
		var delay := 0.1 * float(entry["visual_i"])
		var tw := card.create_tween().set_parallel(true)
		tw.tween_property(card, "modulate:a", 1.0, 0.28).set_delay(delay)
		tw.tween_property(card, "position:y", 0.0, 0.36).set_delay(delay).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		_bob_emoji(card.get_node_or_null("Emoji"), float(entry["visual_i"]) * 0.2)


func _make_podium_card(medal_rank: int, visual_i: int, c: Dictionary, is_guild: bool = false) -> VBoxContainer:
	var wrap := VBoxContainer.new()
	wrap.custom_minimum_size.x = 149
	wrap.alignment = BoxContainer.ALIGNMENT_CENTER
	wrap.add_theme_constant_override("separation", 4)
	var me_id := str(GameManager.active_character.get("id", ""))
	if is_guild:
		if bool(c.get("is_self", false)):
			TutorialManager.tag_target(wrap, "ranks-you")
	elif str(c.get("id", "")) == me_id:
		TutorialManager.tag_target(wrap, "ranks-you")

	var medal: Color = MEDAL[medal_rank]
	var emoji: Control
	if is_guild:
		emoji = UiIcon.make("shield", medal, 52.0)
	else:
		emoji = ClassIcon.make(_class_key(c), ClassIcon.SIZE_PODIUM)
	emoji.name = "Emoji"
	wrap.add_child(emoji)

	var name_row := HBoxContainer.new()
	name_row.alignment = BoxContainer.ALIGNMENT_CENTER
	name_row.add_theme_constant_override("separation", 4)
	wrap.add_child(name_row)
	var name_l := Label.new()
	name_l.text = str(c.get("name", "?"))
	name_l.clip_text = true
	name_l.custom_minimum_size.x = 120
	name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_l.add_theme_font_size_override("font_size", 15)
	name_l.add_theme_color_override("font_color", medal)
	ClientUi.apply_display_font(name_l)
	name_row.add_child(name_l)
	if is_guild:
		var gtag := str(c.get("tag", c.get("emblem", "")))
		if not gtag.is_empty():
			var g := Label.new()
			g.text = "[%s]" % gtag
			g.add_theme_font_size_override("font_size", 16)
			g.add_theme_color_override("font_color", Color(ClientUi.CYAN, 0.9))
			ClientUi.apply_display_font(g)
			name_row.add_child(g)
	else:
		var gtag2 := _guild_tag(c)
		if not gtag2.is_empty():
			var g2 := Label.new()
			g2.text = "[%s]" % gtag2
			g2.add_theme_font_size_override("font_size", 16)
			g2.add_theme_color_override("font_color", Color(ClientUi.VIOLET, 0.85))
			ClientUi.apply_display_font(g2)
			name_row.add_child(g2)

	var meta := Label.new()
	if is_guild:
		meta.text = "Lv %s · %s" % [str(c.get("level", c.get("guild_level", 1))), str(c.get("member_count", 0))]
	else:
		meta.text = "%s · %sW" % [str(c.get("arena_rating", 1000)), str(c.get("arena_wins", 0))]
	meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	meta.add_theme_font_size_override("font_size", 17)
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
	num.add_theme_font_size_override("font_size", 29)
	num.add_theme_color_override("font_color", Color(0, 0, 0, 0.55))
	ClientUi.apply_display_font(num)
	pillar.add_child(num)

	# Whole podium entry opens profile (web motion.button).
	wrap.mouse_filter = Control.MOUSE_FILTER_STOP
	wrap.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var capt: Dictionary = c
	var guild_click := is_guild
	wrap.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			if guild_click:
				if bool(capt.get("is_self", false)):
					GameManager.go_guild()
			else:
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


func _build_guild_list(rows: Array) -> void:
	for i in range(3, rows.size()):
		var g: Dictionary = rows[i]
		_list.add_child(_make_guild_row(int(g.get("rank", i + 1)), g, bool(g.get("is_self", false))))


func _build_guild_list_tail(page: Array) -> void:
	for g in page:
		if typeof(g) != TYPE_DICTIONARY:
			continue
		var rank := int(g.get("rank", 0))
		if rank <= 3:
			continue
		_list.add_child(_make_guild_row(rank, g, bool(g.get("is_self", false))))


func _make_guild_row(rank: int, g: Dictionary, is_mine: bool) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if is_mine:
		panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(ClientUi.GOLD, 0.12), Color(ClientUi.GOLD, 0.50), 12, 1
		))
		TutorialManager.tag_target(panel, "ranks-you")
	else:
		panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.05, 0.06, 0.09, 0.72), Color(0.35, 0.40, 0.48, 0.40), 12, 1
		))

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)

	var id_row := HBoxContainer.new()
	id_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	id_row.add_theme_constant_override("separation", 10)
	id_row.mouse_filter = Control.MOUSE_FILTER_STOP
	if is_mine:
		id_row.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		id_row.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
				GameManager.go_guild()
		)
	row.add_child(id_row)

	var rank_lab := Label.new()
	rank_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rank_lab.text = str(rank)
	rank_lab.custom_minimum_size.x = 37
	rank_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rank_lab.add_theme_font_size_override("font_size", 19)
	rank_lab.add_theme_color_override("font_color", ClientUi.GOLD if is_mine else ClientUi.MUTED)
	ClientUi.apply_display_font(rank_lab)
	id_row.add_child(rank_lab)

	id_row.add_child(UiIcon.make("shield", ClientUi.CYAN if not is_mine else ClientUi.GOLD, 28.0))

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
	name_l.text = str(g.get("name", "?"))
	name_l.clip_text = true
	name_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_l.add_theme_font_size_override("font_size", 17)
	name_l.add_theme_color_override("font_color", ClientUi.GOLD if is_mine else ClientUi.TEXT)
	ClientUi.apply_display_font(name_l)
	name_row.add_child(name_l)
	var tag := str(g.get("tag", g.get("emblem", "")))
	if not tag.is_empty():
		var gchip := PanelContainer.new()
		gchip.mouse_filter = Control.MOUSE_FILTER_IGNORE
		gchip.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(ClientUi.CYAN, 0.08), Color(ClientUi.CYAN, 0.30), 4, 1
		))
		name_row.add_child(gchip)
		var gl := Label.new()
		gl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		gl.text = "[%s]" % tag
		gl.add_theme_font_size_override("font_size", 12)
		gl.add_theme_color_override("font_color", Color(ClientUi.CYAN, 0.9))
		ClientUi.apply_display_font(gl)
		gchip.add_child(gl)

	var leader := str(g.get("leader_name", ""))
	var detail := Label.new()
	detail.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if leader.is_empty():
		detail.text = "%s members" % str(g.get("member_count", 0))
	else:
		detail.text = "%s members · %s" % [str(g.get("member_count", 0)), leader]
	detail.add_theme_font_size_override("font_size", 16)
	detail.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(detail)
	mid.add_child(detail)

	var lvl := HBoxContainer.new()
	lvl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lvl.add_theme_constant_override("separation", 4)
	lvl.add_child(UiIcon.make("shield", ClientUi.GOLD, 16.0))
	var lvl_lab := Label.new()
	lvl_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lvl_lab.text = "Lv %s" % str(g.get("level", g.get("guild_level", 1)))
	lvl_lab.add_theme_font_size_override("font_size", 16)
	lvl_lab.add_theme_color_override("font_color", ClientUi.GOLD)
	ClientUi.apply_display_font(lvl_lab)
	lvl.add_child(lvl_lab)
	id_row.add_child(lvl)
	return panel


func _hide_you_bar() -> void:
	if _you_bar == null:
		return
	_you_bar.visible = false
	for c in _you_bar.get_children():
		c.queue_free()


func _fill_you_bar(text: String) -> void:
	_hide_you_bar()
	var lab := Label.new()
	lab.text = text
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.add_theme_font_size_override("font_size", 16)
	lab.add_theme_color_override("font_color", ClientUi.GOLD)
	ClientUi.apply_display_font(lab)
	var pad := MarginContainer.new()
	pad.add_theme_constant_override("margin_left", 12)
	pad.add_theme_constant_override("margin_right", 12)
	pad.add_theme_constant_override("margin_top", 8)
	pad.add_theme_constant_override("margin_bottom", 8)
	pad.add_child(lab)
	_you_bar.add_child(pad)
	_you_bar.visible = true


func _show_character_you_bar(data: Dictionary, rows: Array) -> void:
	var my_id := str(GameManager.active_character.get("id", ""))
	var my_rank := int(data.get("player_rank", 0))
	var visible := false
	for r in rows:
		if typeof(r) == TYPE_DICTIONARY and str(r.get("id", "")) == my_id:
			visible = true
			break
	if my_rank <= 0 or visible:
		_hide_you_bar()
		return
	_fill_you_bar("You — Rank #%s" % str(my_rank))


func _show_guild_you_bar(data: Dictionary) -> void:
	if not bool(data.get("in_guild", false)):
		_hide_you_bar()
		return
	var mine: Variant = data.get("your_guild", null)
	if typeof(mine) != TYPE_DICTIONARY:
		_hide_you_bar()
		return
	var gid := str(mine.get("guild_id", mine.get("id", "")))
	var rank := int(data.get("player_guild_rank", mine.get("rank", 0)))
	var visible := false
	for r in _guild_rows:
		if typeof(r) == TYPE_DICTIONARY and str(r.get("guild_id", "")) == gid:
			visible = true
			break
	if rank <= 0:
		_hide_you_bar()
		return
	if visible and rank <= _guild_rows.size() and rank <= 3:
		# Still show a compact reminder under podium/list for own guild.
		pass
	var gname := str(mine.get("name", "Your Guild"))
	var lvl := str(mine.get("level", mine.get("guild_level", 1)))
	_fill_you_bar("Your Guild — Rank #%s — Level %s  ·  %s" % [str(rank), lvl, gname])


func _make_row(rank: int, c: Dictionary, is_me: bool, my_account: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.09, 0.72), Color(0.35, 0.40, 0.48, 0.40), 12, 1
	))
	if is_me:
		TutorialManager.tag_target(panel, "ranks-you")

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
	rank_lab.custom_minimum_size.x = 37
	rank_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rank_lab.add_theme_font_size_override("font_size", 19)
	rank_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(rank_lab)
	id_row.add_child(rank_lab)

	var emoji := ClassIcon.make(_class_key(c), ClassIcon.SIZE_LEADERBOARD)
	emoji.mouse_filter = Control.MOUSE_FILTER_IGNORE
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
	name_l.add_theme_font_size_override("font_size", 17)
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
		g.add_theme_font_size_override("font_size", 12)
		g.add_theme_color_override("font_color", Color(ClientUi.VIOLET, 0.9))
		ClientUi.apply_display_font(g)
		gchip.add_child(g)

	var detail := Label.new()
	detail.name = "Detail"
	detail.mouse_filter = Control.MOUSE_FILTER_IGNORE
	detail.text = "%s · %s" % [str(c.get("race", "?")), str(c.get("class", "?"))]
	detail.add_theme_font_size_override("font_size", 17)
	detail.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(detail)
	mid.add_child(detail)

	var rating := HBoxContainer.new()
	rating.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rating.add_theme_constant_override("separation", 4)
	rating.add_child(UiIcon.make("trophy", ClientUi.CYAN, 16.0))
	var rating_lab := Label.new()
	rating_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rating_lab.text = str(c.get("arena_rating", 1000))
	rating_lab.add_theme_font_size_override("font_size", 16)
	rating_lab.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_display_font(rating_lab)
	rating.add_child(rating_lab)
	id_row.add_child(rating)

	var wins := HBoxContainer.new()
	wins.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wins.add_theme_constant_override("separation", 4)
	wins.add_child(UiIcon.make("swords", ClientUi.VIOLET, 16.0))
	var wins_lab := Label.new()
	wins_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wins_lab.text = str(c.get("arena_wins", 0))
	wins_lab.add_theme_font_size_override("font_size", 16)
	wins_lab.add_theme_color_override("font_color", ClientUi.VIOLET)
	ClientUi.apply_display_font(wins_lab)
	wins.add_child(wins_lab)
	id_row.add_child(wins)

	if not is_me:
		var same_account := str(c.get("created_by_id", "")) == my_account and not my_account.is_empty()
		var chal := Button.new()
		chal.text = "Challenge"
		chal.focus_mode = Control.FOCUS_NONE
		ClientUi.apply_ghost_button(chal)
		chal.add_theme_font_size_override("font_size", 13)
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
	var res: Dictionary = await GameApiClient.request(
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
	if _busy or _refresh_busy:
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
			detail.text = "%s · %s  · no rating on win" % [
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
		var code := str(res.get("code", ""))
		var err := str(res.get("error", "Challenge unavailable"))
		if code == "ARENA_BOARD_REFRESHED":
			_set_status("Challengers updated — pick again from Arena.", ClientUi.MUTED)
		else:
			_set_status(err, ClientUi.DANGER)
		if btn != null and is_instance_valid(btn):
			btn.text = "Challenge"
			btn.disabled = false
		return
	GameManager.go_arena_combat()


func _set_status(text: String, color: Color) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", color)
