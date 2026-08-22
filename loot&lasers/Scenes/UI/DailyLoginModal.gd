extends Control
## Daily Login Rewards modal — mirrors web DailyLoginModal.jsx.
## Server-authoritative claim via ProgressManager / ClaimDailyLogin.

signal closed
signal claimed(payload: Dictionary)

const MILLISECONDS_PER_SECOND := 1_000.0
const SECONDS_PER_MINUTE := 60
const MINUTES_PER_HOUR := 60
const CLAIM_SUCCESS_HOLD_SEC := 0.85

var _dim: ColorRect
var _panel: PanelContainer
var _title: Label
var _subtitle: Label
var _grid: GridContainer
var _countdown: Label
var _status: Label
var _claim_btn: Button
var _close_btn: Button
var _busy := false
var _state: Dictionary = {}
var _tick: Timer


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()
	_tick = Timer.new()
	_tick.wait_time = 1.0
	_tick.timeout.connect(_refresh_countdown)
	add_child(_tick)
	_tick.start()
	await _reload()


func _build() -> void:
	_dim = ColorRect.new()
	_dim.color = Color(0.02, 0.03, 0.06, 0.78)
	_dim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_dim.mouse_filter = Control.MOUSE_FILTER_STOP
	_dim.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			_close()
	)
	add_child(_dim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	_panel = PanelContainer.new()
	_panel.custom_minimum_size = Vector2(ClientUi.px(520), ClientUi.px(620))
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(ClientUi.PANEL, Color(ClientUi.CYAN, 0.35), ClientUi.px(14), 2)
	)
	center.add_child(_panel)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", ClientUi.px(18))
	margin.add_theme_constant_override("margin_right", ClientUi.px(18))
	margin.add_theme_constant_override("margin_top", ClientUi.px(16))
	margin.add_theme_constant_override("margin_bottom", ClientUi.px(16))
	_panel.add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", ClientUi.px(10))
	margin.add_child(root)

	var header := HBoxContainer.new()
	root.add_child(header)
	var head_left := VBoxContainer.new()
	head_left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(head_left)

	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", ClientUi.px(8))
	head_left.add_child(title_row)
	title_row.add_child(UiIcon.make("gift", ClientUi.GOLD, 26.0))
	_title = Label.new()
	_title.text = "Daily Login Rewards"
	ClientUi.apply_display_font(_title)
	_title.add_theme_font_size_override("font_size", 20)
	_title.add_theme_color_override("font_color", ClientUi.TEXT)
	title_row.add_child(_title)

	_subtitle = Label.new()
	_subtitle.text = "Stardust Voyage"
	ClientUi.apply_body_font(_subtitle)
	_subtitle.add_theme_font_size_override("font_size", 11)
	_subtitle.add_theme_color_override("font_color", ClientUi.MUTED)
	head_left.add_child(_subtitle)

	_close_btn = Button.new()
	_close_btn.flat = true
	_close_btn.custom_minimum_size = Vector2(ClientUi.px(32), ClientUi.px(32))
	_close_btn.icon = UiIcon.texture("x")
	_close_btn.expand_icon = true
	_close_btn.add_theme_constant_override("icon_max_width", 18)
	ClientUi.apply_ghost_button(_close_btn)
	UiIcon.apply_button_icon_colors(_close_btn, ClientUi.MUTED)
	_close_btn.pressed.connect(_close)
	header.add_child(_close_btn)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(scroll)

	_grid = GridContainer.new()
	_grid.columns = 5
	_grid.add_theme_constant_override("h_separation", ClientUi.px(6))
	_grid.add_theme_constant_override("v_separation", ClientUi.px(6))
	_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_grid)

	_countdown = Label.new()
	_countdown.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ClientUi.apply_body_font(_countdown)
	_countdown.add_theme_font_size_override("font_size", 11)
	_countdown.add_theme_color_override("font_color", ClientUi.MUTED)
	root.add_child(_countdown)

	_status = Label.new()
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	ClientUi.apply_body_font(_status)
	_status.add_theme_font_size_override("font_size", 12)
	_status.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	root.add_child(_status)

	_claim_btn = Button.new()
	_claim_btn.text = "Claim Today's Reward"
	_claim_btn.custom_minimum_size = Vector2(0, ClientUi.px(42))
	ClientUi.apply_primary_button(_claim_btn)
	_claim_btn.icon = UiIcon.texture("gift")
	_claim_btn.expand_icon = true
	_claim_btn.add_theme_constant_override("icon_max_width", 18)
	UiIcon.apply_button_icon_colors(_claim_btn, ClientUi.VOID)
	_claim_btn.pressed.connect(_on_claim)
	root.add_child(_claim_btn)

	var note := Label.new()
	note.text = "Missing a day doesn't reset your streak — continue from the next reward."
	note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	ClientUi.apply_body_font(note)
	note.add_theme_font_size_override("font_size", 10)
	note.add_theme_color_override("font_color", ClientUi.MUTED)
	root.add_child(note)


func _reload() -> void:
	if not is_inside_tree() or not is_instance_valid(_claim_btn):
		return
	_busy = true
	_claim_btn.disabled = true
	_status.text = "Loading…"
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	var res: Dictionary = await ProgressManager.load_daily_login_status()
	if not is_inside_tree() or not is_instance_valid(_claim_btn):
		return
	_busy = false
	if not bool(res.get("ok", false)):
		_status.text = str(res.get("error", "Could not load daily rewards"))
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_claim_btn.disabled = true
		_rebuild_grid_from_local()
		return
	var dl: Variant = res.get("daily_login", {})
	_state = dl if typeof(dl) == TYPE_DICTIONARY else {}
	if _state.is_empty():
		_rebuild_grid_from_local()
		_status.text = "Loaded local calendar — claim may be unavailable until the server responds."
		_status.add_theme_color_override("font_color", ClientUi.WARNING)
		return
	_apply_state()
	if bool(res.get("fallback", false)):
		_status.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)


func _rebuild_grid_from_local() -> void:
	_state = ProgressManager.build_local_daily_login_state()
	_apply_state()


func _apply_state() -> void:
	if not is_instance_valid(_subtitle) or not is_instance_valid(_claim_btn):
		return
	var theme_name := str(_state.get("cycleTheme", _state.get("cycle_theme", "Stardust Voyage")))
	var streak := int(_state.get("streakCount", 0))
	_subtitle.text = "%s · Streak: %s day%s" % [theme_name, streak, "" if streak == 1 else "s"]
	_rebuild_grid()
	_refresh_countdown()
	var can_claim := bool(_state.get("canClaimToday", false))
	if can_claim:
		var day := int(_state.get("currentDay", 1))
		_claim_btn.text = "Claim Today's Reward"
		_claim_btn.disabled = _busy
		_status.text = "Day %s is ready to claim." % day
		_status.add_theme_color_override("font_color", ClientUi.GOLD)
	else:
		_claim_btn.text = "Claimed"
		_claim_btn.disabled = true
		_status.text = "Today's reward has already been claimed."
		_status.add_theme_color_override("font_color", ClientUi.SUCCESS)


func _rebuild_grid() -> void:
	if not is_instance_valid(_grid):
		return
	for c in _grid.get_children():
		c.queue_free()
	var rows: Array = _state.get("rewards", []) if typeof(_state.get("rewards", [])) == TYPE_ARRAY else []
	if rows.is_empty():
		for entry in DailyLoginCatalog.ENTRIES:
			rows.append({
				"day": int(entry.day),
				"status": "locked",
				"rewards": entry.rewards,
				"label": DailyLoginCatalog.reward_label(entry.rewards),
			})
	for row in rows:
		if typeof(row) != TYPE_DICTIONARY:
			continue
		_grid.add_child(_make_day_card(row))


func _make_day_card(row: Dictionary) -> Control:
	var day := int(row.get("day", 0))
	var status := str(row.get("status", "locked"))
	var rewards: Dictionary = row.get("rewards", {}) if typeof(row.get("rewards", {})) == TYPE_DICTIONARY else {}
	if rewards.is_empty() and day >= 1 and day <= DailyLoginCatalog.ENTRIES.size():
		rewards = DailyLoginCatalog.ENTRIES[day - 1].get("rewards", {})
	var label := str(row.get("label", DailyLoginCatalog.reward_label(rewards)))
	var accent := DailyLoginCatalog.reward_accent(rewards)
	var border := Color(ClientUi.MUTED, 0.25)
	var bg := Color(ClientUi.PANEL_DEEP.r, ClientUi.PANEL_DEEP.g, ClientUi.PANEL_DEEP.b, 0.9)
	if status == "claimed":
		border = Color(ClientUi.SUCCESS, 0.45)
		bg = Color(ClientUi.SUCCESS.r, ClientUi.SUCCESS.g, ClientUi.SUCCESS.b, 0.12)
	elif status == "available":
		border = Color(ClientUi.GOLD, 0.7)
		bg = Color(ClientUi.GOLD.r, ClientUi.GOLD.g, ClientUi.GOLD.b, 0.12)
		accent = ClientUi.GOLD
	else:
		bg = Color(bg.r, bg.g, bg.b, 0.55)

	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(ClientUi.px(88), ClientUi.px(88))
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(bg, border, ClientUi.px(8), 1))
	if status == "locked":
		card.modulate = Color(1, 1, 1, 0.55)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", ClientUi.px(2))
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	card.add_child(vb)

	var day_lbl := Label.new()
	day_lbl.text = "D%s" % day
	day_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ClientUi.apply_body_font(day_lbl)
	day_lbl.add_theme_font_size_override("font_size", 9)
	day_lbl.add_theme_color_override("font_color", ClientUi.MUTED)
	vb.add_child(day_lbl)

	var icon_id := DailyLoginCatalog.reward_icon_id(rewards)
	if icon_id == "nova" or icon_id == "stardust" or icon_id == "fuel":
		vb.add_child(CurrencyIcon.make(icon_id, 20.0))
	else:
		vb.add_child(UiIcon.make(icon_id, accent, 20.0))

	if int(rewards.get("experience", 0)) > 0 and status != "locked":
		vb.add_child(BrandGradientTitle.make(label, 8, true))
	else:
		var amt := Label.new()
		amt.text = label
		amt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		amt.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		ClientUi.apply_body_font(amt)
		amt.add_theme_font_size_override("font_size", 8)
		amt.add_theme_color_override(
			"font_color",
			GameData.STARDUST_COLOR if int(rewards.get("stardust", 0)) > 0 and status != "locked" else ClientUi.MUTED
		)
		vb.add_child(amt)

	if status == "claimed":
		var check := Label.new()
		check.text = "Claimed"
		check.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		ClientUi.apply_body_font(check)
		check.add_theme_font_size_override("font_size", 8)
		check.add_theme_color_override("font_color", ClientUi.SUCCESS)
		vb.add_child(check)
	elif status == "available":
		var ready := Label.new()
		ready.text = "Today"
		ready.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		ClientUi.apply_body_font(ready)
		ready.add_theme_font_size_override("font_size", 8)
		ready.add_theme_color_override("font_color", ClientUi.GOLD)
		vb.add_child(ready)
	elif status == "locked":
		vb.add_child(UiIcon.make("lock", ClientUi.MUTED, 12.0))

	return card


func _refresh_countdown() -> void:
	if not is_instance_valid(_countdown):
		return
	var ms: int = ProgressManager.ms_until_daily_reset_display()
	var total_s := maxi(0, int(ms / MILLISECONDS_PER_SECOND))
	var seconds_per_hour := SECONDS_PER_MINUTE * MINUTES_PER_HOUR
	var hh := total_s / seconds_per_hour
	var mm := (total_s % seconds_per_hour) / SECONDS_PER_MINUTE
	var ss := total_s % 60
	_countdown.text = "Next reward in %02d:%02d:%02d" % [hh, mm, ss]


func _on_claim() -> void:
	if _busy or not is_instance_valid(_claim_btn):
		return
	if not bool(_state.get("canClaimToday", false)):
		_status.text = "Today's reward has already been claimed."
		_status.add_theme_color_override("font_color", ClientUi.WARNING)
		return
	_busy = true
	_claim_btn.disabled = true
	_claim_btn.text = "Claiming…"
	_status.text = "Granting reward…"
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	var res: Dictionary = await ProgressManager.claim_daily()
	if not is_inside_tree() or not is_instance_valid(_claim_btn):
		return
	_busy = false
	if bool(res.get("already_claimed", false)) or int(res.get("status", 0)) == 409:
		_status.text = "Today's reward has already been claimed."
		_status.add_theme_color_override("font_color", ClientUi.WARNING)
		await _reload()
		return
	if not bool(res.get("ok", false)):
		var err := str(res.get("error", "Claim failed"))
		_status.text = err
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_claim_btn.disabled = false
		_claim_btn.text = "Claim Today's Reward"
		if InventoryManager.is_inventory_full_error(res):
			await InventoryManager.prompt_bag_pressure(self, "Free a backpack slot before claiming an item reward.")
		return

	var data: Dictionary = res.get("data", {}) if typeof(res.get("data", {})) == TYPE_DICTIONARY else {}
	var day := int(data.get("claimed_day", _state.get("currentDay", 1)))
	var rewards: Dictionary = data.get("rewards", {}) if typeof(data.get("rewards", {})) == TYPE_DICTIONARY else {}
	var label := DailyLoginCatalog.reward_label(rewards)
	_status.text = "Daily reward claimed! Day %s — %s" % [day, label]
	_status.add_theme_color_override("font_color", ClientUi.SUCCESS)
	AudioManager.play_ui("claim")
	ClientUi.show_toast(self, "Daily reward claimed!", "Day %s · %s" % [day, label])
	claimed.emit(data)
	# Keep modal open briefly so the player sees confirmation, then refresh grid.
	await get_tree().create_timer(CLAIM_SUCCESS_HOLD_SEC).timeout
	if is_inside_tree():
		await _reload()


func _close() -> void:
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		_close()
		get_viewport().set_input_as_handled()
