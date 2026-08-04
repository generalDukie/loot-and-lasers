extends Control
## Progress — mirrors web AchievementsPage (progress panel · title pills · 2-col cards).

var _meta: Label
var _status: Label
var _list: VBoxContainer
var _category := "Combat"
var _busy := false


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	_busy = true
	_status.text = "Syncing…"
	await MissionManager.refresh_character()
	await ProgressManager.load_daily()
	var sync: Dictionary = await ProgressManager.sync_achievements()
	_busy = false
	if not sync.ok:
		_status.text = str(sync.get("error", "SyncAchievements failed"))
	else:
		_status.text = "Synced."
	_populate()
	ProgressManager.toast_newly_unlocked(self, sync.data if typeof(sync.get("data", {})) == TYPE_DICTIONARY else {})


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 20)
	margin.add_theme_constant_override("margin_top", 14)
	margin.add_theme_constant_override("margin_bottom", 14)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	var head := HBoxContainer.new()
	root.add_child(head)
	var title_row := UiIcon.make_title_row("trophy", "Achievements", ClientUi.TEXT, 32, 28.0)
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title_row)
	var daily := Button.new()
	daily.text = "Claim Daily"
	ClientUi.apply_ghost_button(daily)
	daily.pressed.connect(_on_claim_daily)
	head.add_child(daily)

	_meta = Label.new()
	_meta.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_meta.add_theme_font_size_override("font_size", 16)
	_meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_meta)
	root.add_child(_meta)

	_status = ClientUi.make_status()
	root.add_child(_status)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 10)
	scroll.add_child(_list)

	var back := Button.new()
	back.text = "Back to Hub"
	ClientUi.apply_shell_back(back, self)
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	root.add_child(back)


func _populate() -> void:
	for c in _list.get_children():
		c.queue_free()
	var ch: Dictionary = GameManager.active_character
	var d: Dictionary = ProgressManager.daily_progress
	var day := int(d.get("current_day", 1))
	var last := str(d.get("last_claim_date", "never"))
	var title := str(ch.get("active_title", ""))
	if title == "<null>":
		title = ""
	_meta.text = "%s · Lv %s · Daily day %s · last claim %s · title %s" % [
		str(ch.get("name", "?")), str(ch.get("level", 1)),
		str(day), last if not last.is_empty() else "never",
		title if not title.is_empty() else "(none)",
	]

	var unlocked_n := 0
	for entry in AchievementsCatalog.ENTRIES:
		if AchievementsCatalog.is_unlocked(entry, ch):
			unlocked_n += 1
	var total_n := AchievementsCatalog.ENTRIES.size()
	_list.add_child(_make_progress_panel(unlocked_n, total_n))

	_list.add_child(ClientUi.make_section_header("", "Titles", "Tap a title to equip it."))
	_list.add_child(_make_title_pills(ProgressManager.unlocked_titles(), title))

	var category_tabs := HBoxContainer.new()
	category_tabs.add_theme_constant_override("separation", 6)
	_list.add_child(category_tabs)
	for cat in AchievementsCatalog.CATEGORIES:
		var tab := Button.new()
		tab.text = str(cat)
		tab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if str(cat) == _category:
			ClientUi.apply_primary_button(tab)
		else:
			ClientUi.apply_ghost_button(tab)
		var selected := str(cat)
		tab.pressed.connect(func() -> void:
			_category = selected
			_populate()
		)
		category_tabs.add_child(tab)

	_list.add_child(ClientUi.make_section_header("", _category, ""))
	var grid := GridContainer.new()
	grid.columns = 3
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	_list.add_child(grid)
	for entry in AchievementsCatalog.ENTRIES:
		if str(entry.get("category", "")) != _category:
			continue
		grid.add_child(_make_achievement_row(entry, ch))


func _make_progress_panel(unlocked_n: int, total_n: int) -> PanelContainer:
	var pct := int(round(float(unlocked_n) / float(maxi(1, total_n)) * 100.0))
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.08, 0.1, 0.97), Color(ClientUi.GOLD, 0.5), 14, 2
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	panel.add_child(col)
	var head := Label.new()
	head.text = "PROGRESS  %s / %s · %s%%" % [unlocked_n, total_n, pct]
	head.add_theme_font_size_override("font_size", 19)
	head.add_theme_color_override("font_color", Color("#FDE68A"))
	ClientUi.apply_display_font(head)
	col.add_child(head)
	var bar := ProgressBar.new()
	bar.min_value = 0
	bar.max_value = maxi(1, total_n)
	bar.value = unlocked_n
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0, 16)
	ClientUi.apply_hp_bar(bar, ClientUi.GOLD)
	col.add_child(bar)
	return panel


func _make_title_pills(titles: Array, active: String) -> HFlowContainer:
	var flow := HFlowContainer.new()
	flow.add_theme_constant_override("h_separation", 6)
	flow.add_theme_constant_override("v_separation", 6)
	if titles.is_empty():
		var empty := Label.new()
		empty.text = "No titles unlocked yet."
		empty.add_theme_color_override("font_color", ClientUi.MUTED)
		flow.add_child(empty)
		return flow
	var clear := Button.new()
	clear.text = "None"
	if active.is_empty():
		ClientUi.apply_primary_button(clear)
	else:
		ClientUi.apply_ghost_button(clear)
	clear.pressed.connect(func() -> void: _on_set_title(""))
	flow.add_child(clear)
	for t in titles:
		var name := str(t)
		var btn := Button.new()
		btn.text = name
		if name == active:
			ClientUi.apply_primary_button(btn)
		else:
			ClientUi.apply_ghost_button(btn)
		btn.pressed.connect(func() -> void: _on_set_title(name))
		flow.add_child(btn)
	return flow


func _make_achievement_row(entry: Dictionary, ch: Dictionary) -> PanelContainer:
	var unlocked := AchievementsCatalog.is_unlocked(entry, ch)
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.09, 0.07, 0.96) if unlocked else Color(0.05, 0.06, 0.09, 0.95),
		Color(ClientUi.SUCCESS, 0.6) if unlocked else Color(0.35, 0.4, 0.5, 0.4),
		10,
		1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	panel.add_child(col)
	var title := Label.new()
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.text = "%s%s" % [str(entry.get("name", "?")), " · ✓" if unlocked else ""]
	title.add_theme_font_size_override("font_size", 17)
	title.add_theme_color_override("font_color", ClientUi.TEXT if unlocked else ClientUi.MUTED)
	ClientUi.apply_display_font(title)
	col.add_child(title)
	var desc := Label.new()
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.text = str(entry.get("desc", ""))
	desc.add_theme_font_size_override("font_size", 15)
	desc.add_theme_color_override("font_color", ClientUi.MUTED)
	col.add_child(desc)
	var p := AchievementsCatalog.progress(entry, ch)
	if not p.is_empty():
		var bar := ProgressBar.new()
		bar.min_value = 0
		bar.max_value = maxi(1, int(p.get("target", 1)))
		bar.value = mini(int(p.get("current", 0)), int(bar.max_value))
		bar.show_percentage = false
		bar.custom_minimum_size = Vector2(0, 11)
		ClientUi.apply_hp_bar(bar, ClientUi.SUCCESS if unlocked else ClientUi.CYAN)
		col.add_child(bar)
		var prog := Label.new()
		prog.text = "%s / %s" % [str(p.get("current", 0)), str(p.get("target", 0))]
		prog.add_theme_font_size_override("font_size", 13)
		prog.add_theme_color_override("font_color", ClientUi.MUTED)
		col.add_child(prog)
	return panel


func _on_claim_daily() -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Claiming daily…"
	var res: Dictionary = await ProgressManager.claim_daily()
	_busy = false
	if not res.ok:
		var err := str(res.get("error", "Daily claim failed"))
		if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
			err = str(res.data["error"])
		_status.text = err
		_populate()
		return
	_status.text = "Daily claimed."
	AudioManager.play_ui("claim")
	await MissionManager.refresh_character()
	var sync: Dictionary = await ProgressManager.sync_achievements()
	ProgressManager.toast_newly_unlocked(self, sync.data if typeof(sync.get("data", {})) == TYPE_DICTIONARY else {})
	_populate()


func _on_set_title(title: String) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Equipping title…"
	var res: Dictionary = await ProgressManager.sync_achievements(title)
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Title update failed"))
		return
	_status.text = "Title updated."
	_populate()
