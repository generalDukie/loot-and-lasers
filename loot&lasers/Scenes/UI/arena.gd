extends Control
## Arena lobby — mirrors web ArenaPage (stats frame · challenger cards · history).

const BOT_RAID_PROCESS_LIMIT: int = 2
const MATCH_HISTORY_TTL_HOURS := 24.0
const MINUTES_PER_HOUR := 60.0
const SECONDS_PER_MINUTE := 60.0
const MILLISECONDS_PER_SECOND := 1_000.0

var _status: Label
var _rating_label: Label
var _stat_wl: Label
var _stat_streak: Label
var _free_panel: PanelContainer
var _free_title: Label
var _free_count: Label
var _free_hint: Label
var _free_support: Label
var _free_segments: HBoxContainer
var _cooldown_banner: Label
var _cooldown_panel: PanelContainer
var _list: GridContainer
var _history_list: VBoxContainer
var _news_list: VBoxContainer
var _history_status: Label
var _news_status: Label
var _busy := false
var _was_on_cooldown := false
var _tick: Timer
var _revenge_busy_id := ""
var _view_rewards_btn: Button
var _reward_sheet_host: Control


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	if not ArenaManager.opponents_loaded.is_connected(_on_opponents_loaded):
		ArenaManager.opponents_loaded.connect(_on_opponents_loaded)
	if not TutorialManager.tutorial_changed.is_connected(_on_tutorial_lock_changed):
		TutorialManager.tutorial_changed.connect(_on_tutorial_lock_changed)
	if not TutorialManager.tutorial_finished.is_connected(_on_tutorial_lock_changed):
		TutorialManager.tutorial_finished.connect(_on_tutorial_lock_changed)
	if not CombatReturnManager.state_changed.is_connected(_on_combat_return_changed):
		CombatReturnManager.state_changed.connect(_on_combat_return_changed)
	await _boot()
	await ArenaManager.recover_orphan_presentation()
	_sync_view_rewards_cta()


func on_shell_reshow() -> void:
	await ArenaManager.recover_orphan_presentation()
	_update_lobby_chrome()
	_sync_view_rewards_cta()
	_set_status("Syncing challengers…")
	_busy = false
	await _resync_board()


func _on_opponents_loaded(_opponents: Array = []) -> void:
	if not is_inside_tree():
		return
	_populate_challengers()
	_update_lobby_chrome()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_update_lobby_chrome()


func _on_combat_return_changed() -> void:
	_sync_view_rewards_cta()


func _on_tutorial_lock_changed(_unused = null) -> void:
	if not is_inside_tree():
		return
	_populate_challengers()
	_populate_history()


func _boot() -> void:
	_set_status("Loading arena…")
	await ArenaManager.sync_day()
	# SyncArenaDay already returns and applies the current character + arena state.
	var raids: Dictionary = await ArenaManager.process_bot_raids(BOT_RAID_PROCESS_LIMIT)
	if not is_inside_tree() or not visible:
		return
	if raids.ok:
		for raid in raids.get("raids", []):
			if typeof(raid) != TYPE_DICTIONARY:
				continue
			var delta := int(raid.get("playerRatingDelta", 0))
			var bot_name := str(raid.get("botName", raid.get("opponentName", "Raid bot")))
			var held := bool(raid.get("playerWon", delta >= 0))
			ClientUi.show_toast(
				self,
				"Arena raid" if held else "Arena raid lost",
				"%s · rating %s%s" % [bot_name, "+" if delta >= 0 else "", delta]
			)
	# Always pull the board — never reuse a stale in-memory offer set across visits.
	var requests := AsyncGroup.new()
	requests.add(ArenaManager.load_equipped)
	requests.add(ArenaManager.load_opponents)
	await requests.wait()
	await ArenaManager.load_history()
	if not is_inside_tree() or not visible:
		return
	_was_on_cooldown = ArenaManager.cooldown_active()
	_set_status("")
	_populate()


func _resync_board() -> void:
	if _busy:
		return
	_busy = true
	await ArenaManager.load_opponents()
	_busy = false
	if not is_inside_tree() or not visible:
		return
	_populate()
	_update_lobby_chrome()


func _build() -> void:
	var backdrop := ArenaStageBackdrop.new()
	backdrop.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	backdrop.accent = Color("#FB7185")
	add_child(backdrop)
	add_child(ClientUi.make_page_bg(self, "combat"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	# Stats frame — mirrors Combat Colosseum panel
	var stats := PanelContainer.new()
	stats.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.055, 0.09, 0.97), Color(0.4, 0.45, 0.55, 0.55), 12, 2
	))
	root.add_child(stats)
	var stats_col := VBoxContainer.new()
	stats_col.add_theme_constant_override("separation", 10)
	stats.add_child(stats_col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	stats_col.add_child(head)

	var head_l := VBoxContainer.new()
	head_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_l.add_theme_constant_override("separation", 2)
	head.add_child(head_l)
	var eye := Label.new()
	eye.text = "COMBAT COLOSSEUM"
	eye.add_theme_font_size_override("font_size", 13)
	eye.add_theme_color_override("font_color", Color(ClientUi.CYAN_SOFT, 0.85))
	ClientUi.apply_display_font(eye)
	head_l.add_child(eye)
	head_l.add_child(UiIcon.make_title_row("swords", "Battle Arena", ClientUi.TEXT, 29, 28.0))

	var head_r := VBoxContainer.new()
	head_r.add_theme_constant_override("separation", 0)
	head.add_child(head_r)
	var rating_eye := Label.new()
	rating_eye.text = "RATING"
	rating_eye.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	rating_eye.add_theme_font_size_override("font_size", 12)
	rating_eye.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(rating_eye)
	head_r.add_child(rating_eye)
	_rating_label = Label.new()
	_rating_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_rating_label.add_theme_font_size_override("font_size", 37)
	_rating_label.add_theme_color_override("font_color", Color("#FBBF24"))
	ClientUi.apply_display_font(_rating_label)
	TutorialManager.tag_target(_rating_label, "arena-rating")
	head_r.add_child(_rating_label)

	var chips := GridContainer.new()
	chips.columns = 2
	chips.add_theme_constant_override("h_separation", 8)
	chips.add_theme_constant_override("v_separation", 6)
	stats_col.add_child(chips)
	_stat_wl = _add_stat_chip(chips, "swords", "W / L", Color("#60A5FA"))
	_stat_streak = _add_stat_chip(chips, "flame", "STREAK", Color("#FB7185"))

	_free_panel = _build_free_battles_panel()
	TutorialManager.tag_target(_free_panel, "arena-free")
	root.add_child(_free_panel)

	_status = ClientUi.make_status()
	_status.visible = false
	root.add_child(_status)

	_view_rewards_btn = Button.new()
	_view_rewards_btn.text = "VIEW REWARDS"
	_view_rewards_btn.visible = false
	_view_rewards_btn.custom_minimum_size.y = 52
	ClientUi.apply_primary_button(_view_rewards_btn)
	_view_rewards_btn.pressed.connect(_on_view_rewards)
	root.add_child(_view_rewards_btn)

	# Single-viewport composition: challengers + paid note + history/news.
	var body := VBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 10)
	root.add_child(body)

	var opponent_area := VBoxContainer.new()
	opponent_area.add_theme_constant_override("separation", 8)
	opponent_area.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	opponent_area.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	body.add_child(opponent_area)

	var challengers_row := HBoxContainer.new()
	challengers_row.add_theme_constant_override("separation", 8)
	opponent_area.add_child(challengers_row)
	var ch_lab := Label.new()
	ch_lab.text = "CHALLENGERS"
	ch_lab.add_theme_font_size_override("font_size", 18)
	ch_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(ch_lab)
	challengers_row.add_child(ch_lab)

	# Compact cooldown chip in the header row (web slim banner) — does not steal card height.
	_cooldown_panel = PanelContainer.new()
	_cooldown_panel.visible = false
	_cooldown_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.14, 0.09, 0.04, 0.92), Color(ClientUi.WARNING, 0.55), 6, 1
	))
	challengers_row.add_child(_cooldown_panel)
	var cd_pad := MarginContainer.new()
	cd_pad.add_theme_constant_override("margin_left", 8)
	cd_pad.add_theme_constant_override("margin_right", 8)
	cd_pad.add_theme_constant_override("margin_top", 2)
	cd_pad.add_theme_constant_override("margin_bottom", 2)
	_cooldown_panel.add_child(cd_pad)
	var cd_row := HBoxContainer.new()
	cd_row.add_theme_constant_override("separation", 6)
	cd_pad.add_child(cd_row)
	cd_row.add_child(UiIcon.make("timer", Color(1.0, 0.88, 0.55), 14.0))
	_cooldown_banner = Label.new()
	_cooldown_banner.add_theme_font_size_override("font_size", 13)
	_cooldown_banner.add_theme_color_override("font_color", Color(1.0, 0.88, 0.55))
	ClientUi.apply_display_font(_cooldown_banner)
	cd_row.add_child(_cooldown_banner)

	var cd_spacer := Control.new()
	cd_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	challengers_row.add_child(cd_spacer)

	# Challenger cards keep natural height; leftover viewport goes to history/news
	# so the free-battles banner sits tighter under the opponents.
	_list = GridContainer.new()
	_list.columns = 3
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_list.add_theme_constant_override("h_separation", 10)
	_list.add_theme_constant_override("v_separation", 10)
	# Tutorial undims the three opponent cards only — not CHALLENGERS chrome.
	TutorialManager.tag_target(_list, "arena-contenders")
	opponent_area.add_child(_list)

	# Twin panes absorb remaining height (fills dead space under the arena board).
	var bottom := HBoxContainer.new()
	bottom.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bottom.size_flags_vertical = Control.SIZE_EXPAND_FILL
	bottom.size_flags_stretch_ratio = 1.0
	bottom.add_theme_constant_override("separation", 10)
	body.add_child(bottom)

	var hist_panel := PanelContainer.new()
	hist_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hist_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	hist_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.05, 0.08, 0.95), Color(0.55, 0.3, 0.35, 0.4), 10, 1
	))
	bottom.add_child(hist_panel)
	var hist_col := VBoxContainer.new()
	hist_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hist_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	hist_col.add_theme_constant_override("separation", 6)
	hist_panel.add_child(hist_col)

	var hist_header := Label.new()
	hist_header.text = "MATCH HISTORY"
	hist_header.add_theme_font_size_override("font_size", 16)
	hist_header.add_theme_color_override("font_color", Color(0.95, 0.65, 0.72))
	ClientUi.apply_display_font(hist_header)
	hist_col.add_child(hist_header)

	_history_status = Label.new()
	_history_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_history_status.add_theme_font_size_override("font_size", 19)
	_history_status.add_theme_color_override("font_color", ClientUi.MUTED)
	hist_col.add_child(_history_status)

	var hist_scroll := ScrollContainer.new()
	hist_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hist_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	hist_col.add_child(hist_scroll)
	_history_list = VBoxContainer.new()
	_history_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_history_list.add_theme_constant_override("separation", 6)
	hist_scroll.add_child(_history_list)

	var news_panel := PanelContainer.new()
	news_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	news_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	news_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.09, 0.95), Color(ClientUi.CYAN, 0.35), 10, 1
	))
	bottom.add_child(news_panel)
	var news_col := VBoxContainer.new()
	news_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	news_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	news_col.add_theme_constant_override("separation", 6)
	news_panel.add_child(news_col)
	var news_header := Label.new()
	news_header.text = "GALAXY NEWS"
	news_header.add_theme_font_size_override("font_size", 16)
	news_header.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(news_header)
	news_col.add_child(news_header)
	_news_status = Label.new()
	_news_status.add_theme_font_size_override("font_size", 19)
	_news_status.add_theme_color_override("font_color", ClientUi.MUTED)
	news_col.add_child(_news_status)
	var news_scroll := ScrollContainer.new()
	news_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	news_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	news_col.add_child(news_scroll)
	_news_list = VBoxContainer.new()
	_news_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_news_list.add_theme_constant_override("separation", 6)
	news_scroll.add_child(_news_list)

	_tick = Timer.new()
	_tick.wait_time = 1.0
	_tick.timeout.connect(_on_tick)
	add_child(_tick)
	_tick.start()

	_reward_sheet_host = Control.new()
	_reward_sheet_host.visible = false
	_reward_sheet_host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_reward_sheet_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_reward_sheet_host.z_index = 80
	add_child(_reward_sheet_host)


func _sync_view_rewards_cta() -> void:
	if not is_instance_valid(_view_rewards_btn):
		return
	var show := CombatReturnManager.is_for_kind("arena")
	_view_rewards_btn.visible = show
	if show:
		var settling := CombatReturnManager.state == CombatReturnManager.STATE_SETTLING
		_view_rewards_btn.disabled = settling or _busy
		_view_rewards_btn.text = "SETTLING…" if settling else "VIEW REWARDS"


func _on_view_rewards() -> void:
	if _busy:
		return
	_busy = true
	_view_rewards_btn.disabled = true
	await CombatReturnManager.present_rewards(_reward_sheet_host)
	_busy = false
	_sync_view_rewards_cta()


func _apply_market_action_button(btn: Button, accent: Color) -> void:
	ClientUi.apply_dark_outline_button(btn, accent)
	btn.text = ""
	btn.icon = null


func _fight_btn_label(text: String, color: Color, font_size: int = 13) -> Label:
	var lab := Label.new()
	lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lab.text = text
	lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lab.add_theme_font_size_override("font_size", font_size)
	lab.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(lab)
	return lab


func _fill_fight_button(btn: Button, skip_cooldown: bool) -> void:
	var accent := CurrencyIcon.NOVA_GOLD if skip_cooldown else ClientUi.CYAN
	_apply_market_action_button(btn, accent)
	var pad := MarginContainer.new()
	pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pad.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pad.add_theme_constant_override("margin_left", 0)
	pad.add_theme_constant_override("margin_right", 0)
	btn.add_child(pad)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 4)
	pad.add_child(row)
	if skip_cooldown:
		row.add_child(_fight_btn_label("SKIP & FIGHT", Color.WHITE, 16))
		var cost_cluster := HBoxContainer.new()
		cost_cluster.mouse_filter = Control.MOUSE_FILTER_IGNORE
		cost_cluster.alignment = BoxContainer.ALIGNMENT_CENTER
		cost_cluster.add_theme_constant_override("separation", 2)
		var glyph := CurrencyIcon.make("nova", 18.0)
		glyph.mouse_filter = Control.MOUSE_FILTER_IGNORE
		cost_cluster.add_child(glyph)
		cost_cluster.add_child(_fight_btn_label(NumberDisplay.nova(ArenaRules.SKIP_COST), accent, 16))
		row.add_child(cost_cluster)
		return
	var swords := UiIcon.make("swords", accent, 18.0)
	swords.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(swords)
	row.add_child(_fight_btn_label("CHALLENGE", accent))


func _add_stat_chip(parent: GridContainer, icon: String, label: String, color: Color) -> Label:
	var wrap := _add_stat_chip_wrap(parent, icon, label, color)
	return wrap["value"]


func _build_free_battles_panel() -> PanelContainer:
	## Primary daily free-battle status — mirrors web FreeBattlesStatus.
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.07, 0.06, 0.04, 0.97), Color("#FBBF24", 0.55), 12, 2
	))
	var pad := MarginContainer.new()
	pad.add_theme_constant_override("margin_left", 14)
	pad.add_theme_constant_override("margin_right", 14)
	pad.add_theme_constant_override("margin_top", 12)
	pad.add_theme_constant_override("margin_bottom", 12)
	panel.add_child(pad)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	pad.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 10)
	col.add_child(head)

	var icon_box := PanelContainer.new()
	icon_box.custom_minimum_size = Vector2(44, 44)
	icon_box.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color("#FBBF24", 0.16), Color("#FBBF24", 0.45), 8, 1
	))
	head.add_child(icon_box)
	var icon_wrap := CenterContainer.new()
	icon_wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	icon_box.add_child(icon_wrap)
	icon_wrap.add_child(UiIcon.make("swords", Color("#FBBF24"), 22.0))

	var head_l := VBoxContainer.new()
	head_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_l.add_theme_constant_override("separation", 2)
	head.add_child(head_l)
	_free_title = Label.new()
	_free_title.text = "FREE ARENA BATTLES"
	_free_title.add_theme_font_size_override("font_size", 13)
	_free_title.add_theme_color_override("font_color", Color("#FBBF24"))
	ClientUi.apply_display_font(_free_title)
	head_l.add_child(_free_title)
	_free_count = Label.new()
	_free_count.add_theme_font_size_override("font_size", 28)
	_free_count.add_theme_color_override("font_color", Color("#FBBF24"))
	ClientUi.apply_display_font(_free_count)
	head_l.add_child(_free_count)

	_free_hint = Label.new()
	_free_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_free_hint.add_theme_font_size_override("font_size", 17)
	_free_hint.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_free_hint)
	head.add_child(_free_hint)

	_free_segments = HBoxContainer.new()
	_free_segments.add_theme_constant_override("separation", 4)
	col.add_child(_free_segments)
	for _i in ArenaRules.DAILY_FREE_BATTLES:
		var seg := ColorRect.new()
		seg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		seg.custom_minimum_size = Vector2(0, 10)
		seg.color = Color("#FBBF24")
		_free_segments.add_child(seg)

	_free_support = Label.new()
	_free_support.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_free_support.add_theme_font_size_override("font_size", 17)
	_free_support.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_free_support)
	col.add_child(_free_support)
	return panel


func _add_stat_chip_wrap(parent: GridContainer, icon: String, label: String, color: Color) -> Dictionary:
	## Web Stat chip: icon box + label/value/hint
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.05, 0.08, 0.9), Color(0.35, 0.4, 0.5, 0.45), 8, 1
	))
	parent.add_child(panel)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)

	var icon_box := PanelContainer.new()
	icon_box.custom_minimum_size = Vector2(37, 37)
	icon_box.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(color.r, color.g, color.b, 0.13), Color(color.r, color.g, color.b, 0.35), 6, 1
	))
	row.add_child(icon_box)
	var icon_wrap := CenterContainer.new()
	icon_wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	icon_box.add_child(icon_wrap)
	if CurrencyIcon.is_asset_glyph(icon):
		icon_wrap.add_child(UiIcon.make(icon, color, 16.0))
	else:
		var icon_lab := Label.new()
		icon_lab.text = icon
		icon_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		icon_lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		icon_lab.add_theme_font_size_override("font_size", 16)
		icon_lab.add_theme_color_override("font_color", color)
		icon_wrap.add_child(icon_lab)

	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 0)
	row.add_child(col)
	var lab := Label.new()
	lab.text = label
	lab.add_theme_font_size_override("font_size", 12)
	lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(lab)
	col.add_child(lab)
	var val := Label.new()
	val.add_theme_font_size_override("font_size", 19)
	val.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(val)
	col.add_child(val)
	var hint := Label.new()
	hint.add_theme_font_size_override("font_size", 16)
	hint.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.85))
	hint.visible = false
	col.add_child(hint)
	return {"value": val, "hint": hint}


func _on_tick() -> void:
	_update_lobby_chrome()
	var on_cd := ArenaManager.cooldown_active()
	if on_cd != _was_on_cooldown:
		_was_on_cooldown = on_cd
		# Rebuild costs / skip labels only — not while a challenge prepare is in flight.
		if not _busy and not ArenaManager.is_battling():
			_populate_challengers()
	if _busy or ArenaManager.is_battling():
		return
	if ArenaManager.board_expired():
		_busy = true
		var before_ids: PackedStringArray = []
		for o in ArenaManager.opponents:
			if typeof(o) == TYPE_DICTIONARY:
				before_ids.append(str(o.get("offer_id", "")))
		await ArenaManager.load_opponents()
		_busy = false
		if not is_inside_tree() or not visible:
			return
		_populate_challengers()
		_update_lobby_chrome()
		var changed := before_ids.size() != ArenaManager.opponents.size()
		if not changed:
			for o2 in ArenaManager.opponents:
				if typeof(o2) != TYPE_DICTIONARY:
					continue
				if not before_ids.has(str(o2.get("offer_id", ""))):
					changed = true
					break
		if changed:
			_set_status("Challengers updated — pick again.")


func _populate() -> void:
	_update_lobby_chrome()
	_populate_challengers()
	_populate_history()
	await _populate_news()


func _populate_news() -> void:
	for c in _news_list.get_children():
		c.queue_free()
	var res: Dictionary = await GameApiClient.request(
		"GET", "/api/entities/GalaxyNews?sort=-created_date&limit=40", null, true
	)
	if not res.ok:
		_news_status.text = "The galaxy is quiet... for now."
		_news_status.visible = true
		return
	var rows: Array = res.data if typeof(res.data) == TYPE_ARRAY else []
	var now_ms := Time.get_unix_time_from_system() * MILLISECONDS_PER_SECOND
	var ttl_ms := (
		MATCH_HISTORY_TTL_HOURS
		* MINUTES_PER_HOUR
		* SECONDS_PER_MINUTE
		* MILLISECONDS_PER_SECOND
	)
	var shown := 0
	for n in rows:
		if typeof(n) != TYPE_DICTIONARY:
			continue
		var created := str(n.get("created_date", ""))
		if not created.is_empty():
			var s := created.replace("Z", "").replace("T", " ")
			if "." in s:
				s = s.get_slice(".", 0)
			var then_unix := Time.get_unix_time_from_datetime_string(s)
			if (
				then_unix > 0
				and (now_ms - then_unix * MILLISECONDS_PER_SECOND) >= ttl_ms
			):
				continue
		var row := PanelContainer.new()
		row.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.04, 0.05, 0.08, 0.85), Color(0.35, 0.4, 0.5, 0.35), 8, 1
		))
		_news_list.add_child(row)
		var lab := Label.new()
		lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		lab.text = str(n.get("message", ""))
		lab.add_theme_font_size_override("font_size", 19)
		lab.add_theme_color_override("font_color", ClientUi.TEXT)
		ClientUi.apply_body_font(lab)
		row.add_child(lab)
		shown += 1
		if shown >= 3:
			break
	_news_status.visible = shown == 0
	_news_status.text = "The galaxy is quiet... for now."


func _set_status(text: String) -> void:
	_status.text = text
	_status.visible = not text.is_empty()


func _populate_challengers() -> void:
	if _list == null:
		return
	while _list.get_child_count() > 0:
		var child := _list.get_child(_list.get_child_count() - 1)
		_list.remove_child(child)
		child.free()
	if ArenaManager.opponents.is_empty():
		_set_status("No challengers available right now.")
		return
	_set_status("")
	for opp in ArenaManager.opponents:
		if typeof(opp) == TYPE_DICTIONARY:
			_list.add_child(_make_card((opp as Dictionary).duplicate(true)))


func _populate_history() -> void:
	for c in _history_list.get_children():
		c.queue_free()
	var matches: Array = ArenaManager.match_history
	if matches.is_empty():
		_history_status.visible = true
		_history_status.text = "No fights yet — challenge someone and rivalries start here."
		return
	_history_status.visible = false
	_history_status.text = ""
	var shown := 0
	for m in matches:
		if typeof(m) != TYPE_DICTIONARY:
			continue
		_history_list.add_child(_make_history_row(m))
		shown += 1
		if shown >= 3:
			break


func _update_lobby_chrome() -> void:
	var c: Dictionary = GameManager.active_character
	var free_left := ArenaManager.free_battles_left
	var daily_max := ArenaRules.DAILY_FREE_BATTLES
	var reset_eta := ArenaRules.format_eta_short(ArenaRules.ms_until_et_midnight())

	_rating_label.text = NumberDisplay.quantity(c.get("arena_rating", 1000))
	_stat_wl.text = "%s / %s" % [NumberDisplay.quantity(c.get("arena_wins", 0)), NumberDisplay.quantity(c.get("arena_losses", 0))]
	_stat_streak.text = NumberDisplay.quantity(c.get("arena_streak", 0))
	_refresh_free_battles_panel(free_left, daily_max, reset_eta)

	if ArenaManager.cooldown_active():
		_cooldown_panel.visible = true
		_cooldown_banner.text = "Cooldown %s · skip %s Nova" % [
			ArenaRules.format_ms(ArenaManager.cooldown_remaining_ms()),
			NumberDisplay.nova(ArenaRules.SKIP_COST),
		]
	else:
		_cooldown_panel.visible = false


func _refresh_free_battles_panel(free_left: int, daily_max: int, reset_eta: String) -> void:
	if _free_panel == null:
		return
	var left := clampi(free_left, 0, daily_max)
	var depleted := left <= 0
	var final_one := left == 1
	var accent := Color("#64748B") if depleted else (Color("#F59E0B") if final_one else Color("#FBBF24"))

	_free_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.055, 0.08, 0.96) if depleted else Color(0.07, 0.06, 0.04, 0.97),
		Color(accent, 0.45 if depleted else 0.6),
		12,
		2
	))
	_free_title.add_theme_color_override("font_color", accent)
	_free_count.add_theme_color_override("font_color", Color("#CBD5E1") if depleted else accent)
	if depleted:
		_free_count.text = "FREE BATTLES USED FOR TODAY"
		_free_count.add_theme_font_size_override("font_size", 20)
		_free_support.text = "Daily free quota spent (%s/%s). Keep climbing with paid battles for %s Nova each — rating only." % [
			NumberDisplay.quantity(daily_max), NumberDisplay.quantity(daily_max), NumberDisplay.nova(ArenaRules.PAID_BATTLE_COST),
		]
	elif final_one:
		_free_count.text = "1 / %s  FINAL FREE BATTLE" % daily_max
		_free_count.add_theme_font_size_override("font_size", 26)
		_free_support.text = "Last free battle of the day — use it for ranking progress and rewards."
	else:
		_free_count.text = "%s / %s  REMAINING" % [str(left), str(daily_max)]
		_free_count.add_theme_font_size_override("font_size", 28)
		_free_support.text = "Use your free Arena battles each day to earn ranking progress and rewards."

	_free_hint.text = "Resets\n%s" % reset_eta

	var i := 0
	for child in _free_segments.get_children():
		if child is ColorRect:
			var filled := i < left
			(child as ColorRect).color = Color(accent, 1.0 if filled else 0.22) if not depleted else Color("#64748B", 0.28)
			i += 1


func _make_card(opp: Dictionary) -> PanelContainer:
	var is_bot := bool(opp.get("isBot", true))
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size = Vector2(267, 0)
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.07, 0.09, 0.97) if is_bot else Color(0.04, 0.09, 0.07, 0.97),
		Color(0.13, 0.83, 0.93, 0.55) if is_bot else Color(0.2, 0.83, 0.6, 0.6),
		12,
		2
	))

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	panel.add_child(col)

	# Portrait + level badge (web overlays the badge on the avatar foot).
	var portrait_wrap := CenterContainer.new()
	col.add_child(portrait_wrap)
	var stack := Control.new()
	stack.custom_minimum_size = Vector2(128, 133)
	portrait_wrap.add_child(stack)
	var pframe := PanelContainer.new()
	pframe.position = Vector2(4, 0)
	pframe.clip_contents = true
	pframe.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.03, 0.04, 0.07, 0.98),
		Color(0.13, 0.83, 0.93, 0.5) if is_bot else Color(0.2, 0.83, 0.6, 0.55),
		10,
		2
	))
	stack.add_child(pframe)
	var ppad := MarginContainer.new()
	for k in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		ppad.add_theme_constant_override(k, 4)
	pframe.add_child(ppad)
	ppad.add_child(AvatarRenderer.make_portrait(opp, 80.0))

	var badge := PanelContainer.new()
	badge.position = Vector2(32, 78)
	badge.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		ClientUi.CYAN, Color(0.05, 0.06, 0.09, 1.0), 10, 2
	))
	stack.add_child(badge)
	var lvl := Label.new()
	lvl.text = ClientUi.format_level(opp.get("level", 1))
	lvl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lvl.add_theme_font_size_override("font_size", 13)
	lvl.add_theme_color_override("font_color", Color(0.03, 0.07, 0.10))
	ClientUi.apply_display_font(lvl)
	badge.add_child(lvl)

	var kind := Label.new()
	kind.text = "SIMULANT" if is_bot else "REAL"
	kind.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	kind.add_theme_font_size_override("font_size", 12)
	kind.add_theme_color_override("font_color", Color("#67E8F9") if is_bot else Color("#6EE7B7"))
	ClientUi.apply_display_font(kind)
	col.add_child(kind)

	var title := Label.new()
	title.text = str(opp.get("name", "?"))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 19)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	col.add_child(title)

	var detail := Label.new()
	detail.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	detail.text = "%s · %s" % [str(opp.get("race", "?")), str(opp.get("class", "?"))]
	detail.add_theme_font_size_override("font_size", 19)
	detail.add_theme_color_override("font_color", ClientUi.MUTED)
	col.add_child(detail)

	# Always reserve this row so guild tags never push the challenge button down.
	var guild_lab := Label.new()
	guild_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	guild_lab.custom_minimum_size.y = 19
	guild_lab.add_theme_font_size_override("font_size", 17)
	guild_lab.add_theme_color_override("font_color", ClientUi.GOLD)
	ClientUi.apply_display_font(guild_lab)
	var guild_raw = opp.get("guild", null)
	if guild_raw != null and str(guild_raw) != "":
		guild_lab.text = str(guild_raw)
	else:
		guild_lab.text = " "
		guild_lab.modulate.a = 0.0
	col.add_child(guild_lab)

	var wins := int(opp.get("arena_wins", 0))
	var losses := int(opp.get("arena_losses", 0))
	var total_wl := wins + losses
	var win_rate_txt := "%s%%" % str(int(round(100.0 * float(wins) / float(total_wl)))) if total_wl > 0 else "W/L"

	var stats := GridContainer.new()
	stats.columns = 2
	stats.add_theme_constant_override("h_separation", 6)
	stats.add_theme_constant_override("v_separation", 4)
	col.add_child(stats)
	stats.add_child(_mini_stat("trophy", "RATING", str(opp.get("arena_rating", 1000)), Color("#FBBF24")))
	stats.add_child(_mini_stat("flame", win_rate_txt, "%s/%s" % [str(wins), str(losses)], Color("#FB7185"), true))

	var is_free := ArenaManager.free_battles_left > 0
	var preview := ArenaRules.preview_arena_match(GameManager.active_character, opp, is_free)
	var on_win: Dictionary = preview.get("onWin", {})
	var on_loss: Dictionary = preview.get("onLoss", {})

	var stake := PanelContainer.new()
	stake.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.03, 0.04, 0.06, 0.9), Color(0.35, 0.4, 0.5, 0.4), 8, 1
	))
	col.add_child(stake)
	var stake_col := VBoxContainer.new()
	stake_col.add_theme_constant_override("separation", 4)
	stake.add_child(stake_col)

	var stake_kind := Label.new()
	stake_kind.text = "FREE" if is_free else "RATING"
	stake_kind.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stake_kind.add_theme_font_size_override("font_size", 12)
	stake_kind.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(stake_kind)
	stake_col.add_child(stake_kind)

	var stake_row := HBoxContainer.new()
	stake_col.add_child(stake_row)
	var win_col := VBoxContainer.new()
	win_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stake_row.add_child(win_col)
	var win_lab := Label.new()
	win_lab.text = "WIN"
	win_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	win_lab.add_theme_font_size_override("font_size", 12)
	win_lab.add_theme_color_override("font_color", ClientUi.SUCCESS)
	ClientUi.apply_display_font(win_lab)
	win_col.add_child(win_lab)
	var win_val := Label.new()
	var wd := int(on_win.get("arena_rating_delta", 0))
	win_val.text = NumberDisplay.signed_quantity(wd)
	win_val.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	win_val.add_theme_font_size_override("font_size", 17)
	win_val.add_theme_color_override("font_color", Color("#6EE7B7"))
	ClientUi.apply_display_font(win_val)
	win_col.add_child(win_val)
	var win_loot := Label.new()
	if is_free:
		win_loot.text = "%s XP · %s Stardust" % [
			NumberDisplay.quantity(on_win.get("experience", 0)),
			NumberDisplay.quantity(on_win.get("stardust", 0)),
		]
	else:
		win_loot.text = "rating"
	win_loot.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	win_loot.add_theme_font_size_override("font_size", 12)
	win_loot.add_theme_color_override("font_color", ClientUi.MUTED)
	win_col.add_child(win_loot)

	var lose_col := VBoxContainer.new()
	lose_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stake_row.add_child(lose_col)
	var lose_lab := Label.new()
	lose_lab.text = "LOSE"
	lose_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lose_lab.add_theme_font_size_override("font_size", 12)
	lose_lab.add_theme_color_override("font_color", ClientUi.DANGER)
	ClientUi.apply_display_font(lose_lab)
	lose_col.add_child(lose_lab)
	var lose_val := Label.new()
	lose_val.text = NumberDisplay.signed_quantity(int(on_loss.get("arena_rating_delta", 0)))
	lose_val.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lose_val.add_theme_font_size_override("font_size", 17)
	lose_val.add_theme_color_override("font_color", Color("#FDA4AF"))
	ClientUi.apply_display_font(lose_val)
	lose_col.add_child(lose_val)
	var lose_sub := Label.new()
	lose_sub.text = "no loot" if is_free else "rating"
	lose_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lose_sub.add_theme_font_size_override("font_size", 12)
	lose_sub.add_theme_color_override("font_color", ClientUi.MUTED)
	lose_col.add_child(lose_sub)

	var fight := Button.new()
	fight.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	fight.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_fill_fight_button(fight, ArenaManager.cooldown_active())
	fight.pressed.connect(_on_challenge.bind(opp.duplicate(true)))
	TutorialManager.tag_target(fight, "arena-fight")
	if TutorialManager.blocks_arena_combat():
		fight.disabled = true
		fight.focus_mode = Control.FOCUS_NONE
		fight.tooltip_text = "Finish or skip the tutorial to fight in the Arena"
	col.add_child(fight)
	return panel


func _mini_stat(icon: String, label: String, value: String, color: Color, split_wl := false) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.03, 0.04, 0.06, 0.9), Color(0.35, 0.4, 0.5, 0.4), 6, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	panel.add_child(col)
	var ic_wrap := CenterContainer.new()
	ic_wrap.custom_minimum_size = Vector2(16, 16)
	col.add_child(ic_wrap)
	if CurrencyIcon.is_asset_glyph(icon):
		ic_wrap.add_child(UiIcon.make(icon, color, 13.0))
	else:
		var ic := Label.new()
		ic.text = icon
		ic.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		ic.add_theme_font_size_override("font_size", 13)
		ic.add_theme_color_override("font_color", color)
		ic_wrap.add_child(ic)
	if split_wl and "/" in value:
		var parts := value.split("/")
		var wl_row := HBoxContainer.new()
		wl_row.alignment = BoxContainer.ALIGNMENT_CENTER
		col.add_child(wl_row)
		var w := Label.new()
		w.text = parts[0]
		w.add_theme_font_size_override("font_size", 16)
		w.add_theme_color_override("font_color", Color("#4ADE80"))
		ClientUi.apply_display_font(w)
		wl_row.add_child(w)
		var slash := Label.new()
		slash.text = "/"
		slash.add_theme_font_size_override("font_size", 16)
		slash.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.5))
		wl_row.add_child(slash)
		var l := Label.new()
		l.text = parts[1] if parts.size() > 1 else "0"
		l.add_theme_font_size_override("font_size", 16)
		l.add_theme_color_override("font_color", Color("#F87171"))
		ClientUi.apply_display_font(l)
		wl_row.add_child(l)
	else:
		var v := Label.new()
		v.text = value
		v.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_theme_font_size_override("font_size", 16)
		v.add_theme_color_override("font_color", color)
		ClientUi.apply_display_font(v)
		col.add_child(v)
	var lab := Label.new()
	lab.text = label
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.add_theme_font_size_override("font_size", 11)
	lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(lab)
	col.add_child(lab)
	return panel


func _make_history_row(match: Dictionary) -> PanelContainer:
	var won := bool(match.get("won", false))
	var is_defense := bool(match.get("is_defense", false))
	var is_bot := bool(match.get("opponent_is_bot", true))
	var delta := int(match.get("rating_delta", 0))
	var mid := str(match.get("id", ""))

	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.08, 0.06, 0.96) if won else Color(0.09, 0.04, 0.06, 0.96),
		Color(0.3, 0.75, 0.5, 0.55) if won else Color(0.8, 0.35, 0.45, 0.55),
		10,
		1
	))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	panel.add_child(row)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 2)
	row.add_child(col)

	var title := Label.new()
	var badges: PackedStringArray = []
	if is_defense:
		badges.append("RAID")
	if not is_bot:
		badges.append("REAL")
	var badge_txt := (" · " + " · ".join(badges)) if badges.size() > 0 else ""
	title.text = "%s%s" % [str(match.get("opponent_name", "?")), badge_txt]
	title.add_theme_font_size_override("font_size", 19)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	col.add_child(title)

	var outcome := "Defense held" if (is_defense and won) else ("Raided" if is_defense else ("Victory" if won else "Defeat"))
	var delta_txt := NumberDisplay.signed_quantity(delta)
	var guild := str(match.get("opponent_guild", ""))
	var guild_bit := (" · %s" % guild) if not guild.is_empty() and guild != "<null>" else ""
	var detail := Label.new()
	detail.text = "%s · Lv %s%s · %s" % [outcome, ClientUi.format_level(match.get("opponent_level", 1)), guild_bit, delta_txt]
	detail.add_theme_font_size_override("font_size", 19)
	detail.add_theme_color_override("font_color", ClientUi.SUCCESS if delta >= 0 else ClientUi.DANGER)
	col.add_child(detail)

	var revenge := Button.new()
	revenge.text = "Revenge…" if _revenge_busy_id == mid else "REVENGE"
	revenge.disabled = _busy or (not _revenge_busy_id.is_empty() and _revenge_busy_id != mid)
	if TutorialManager.blocks_arena_combat():
		revenge.disabled = true
		revenge.tooltip_text = "Finish or skip the tutorial to fight in the Arena"
	ClientUi.apply_revenge_button(revenge)
	revenge.pressed.connect(func() -> void: _on_revenge(match))
	row.add_child(revenge)
	return panel


func _on_challenge(opp: Dictionary) -> void:
	if _busy:
		return
	if TutorialManager.blocks_arena_combat():
		Notify.blocked("Tutorial in progress", "Finish or skip the tutorial before fighting in the Arena.")
		return
	_busy = true
	# Lock skip intent from the button label state at press time so a mid-flight
	# board sync cannot drop us onto a bare CHALLENGE path.
	var skip := ArenaManager.cooldown_active()
	var prep: Dictionary = await ArenaManager.prepare_challenge(opp, skip)
	_busy = false
	if not prep.ok:
		_handle_prepare_fail(prep, "Cannot challenge")
		return
	GameManager.go_arena_combat()


func _on_revenge(match: Dictionary) -> void:
	if _busy:
		return
	if TutorialManager.blocks_arena_combat():
		Notify.blocked("Tutorial in progress", "Finish or skip the tutorial before fighting in the Arena.")
		return
	var mid := str(match.get("id", ""))
	_busy = true
	_revenge_busy_id = mid
	_populate_history()
	_set_status("Preparing revenge…")
	var prep: Dictionary = await ArenaManager.prepare_revenge(match)
	_revenge_busy_id = ""
	_busy = false
	if not prep.ok:
		_handle_prepare_fail(prep, "Cannot revenge")
		_populate_history()
		return
	GameManager.go_arena_combat()


func _handle_prepare_fail(prep: Dictionary, fallback: String) -> void:
	var code := str(prep.get("code", ""))
	var err := str(prep.get("error", fallback))
	if code == "ARENA_BOARD_REFRESHED" or err.to_lower().contains("pick again"):
		_populate_challengers()
		_update_lobby_chrome()
		_set_status("Challengers updated — pick again.")
		return
	var low := err.to_lower()
	if low.contains("failed") or low.contains("network") or low.contains("timeout"):
		_set_status(err)
	else:
		Notify.blocked(err)
		_set_status("")
	_update_lobby_chrome()
