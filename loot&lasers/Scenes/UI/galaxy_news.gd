extends Control
## Galaxy News feed — ArenaNewsFeed-style headlines.

var _status: Label
var _list: VBoxContainer


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	_status.text = "Loading news…"
	var res: Dictionary = await ApiClient.request(
		"GET", "/api/entities/GalaxyNews?sort=-created_date&limit=40", null, true
	)
	for c in _list.get_children():
		c.queue_free()
	if not res.ok:
		_status.text = str(res.get("error", "Failed"))
		return
	var rows: Array = res.data if typeof(res.data) == TYPE_ARRAY else []
	var recent: Array = []
	var all_rows: Array = []
	for n in rows:
		if typeof(n) != TYPE_DICTIONARY:
			continue
		all_rows.append(n)
		var age := _age_ms(str(n.get("created_date", "")))
		if age <= 24.0 * 3600.0 * 1000.0:
			recent.append(n)
	var show: Array = recent if not recent.is_empty() else all_rows
	for n in show:
		_list.add_child(_row(n))
	if show.is_empty():
		_list.add_child(_empty("The galaxy is quiet... for now."))
	_status.text = "%s headlines%s" % [
		show.size(),
		" (last 24h)" if not recent.is_empty() else "",
	]


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "void"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 18)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 12)
	margin.add_child(root)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 8)
	root.add_child(header)
	var title := Label.new()
	title.text = "📰  Galaxy News"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 27)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	header.add_child(title)
	var refresh := Button.new()
	refresh.text = "Refresh"
	ClientUi.apply_ghost_button(refresh)
	refresh.pressed.connect(_boot)
	header.add_child(refresh)

	_status = ClientUi.make_status()
	root.add_child(_status)

	var feed_panel := PanelContainer.new()
	feed_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	feed_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.08, 0.12, 0.96), Color(ClientUi.CYAN, 0.35), 12, 1
	))
	root.add_child(feed_panel)

	var feed_col := VBoxContainer.new()
	feed_col.add_theme_constant_override("separation", 10)
	feed_panel.add_child(feed_col)

	var feed_head := Label.new()
	feed_head.text = "GALAXY NEWS"
	feed_head.add_theme_font_size_override("font_size", 16)
	feed_head.add_theme_color_override("font_color", Color(ClientUi.CYAN, 0.9))
	ClientUi.apply_display_font(feed_head)
	feed_col.add_child(feed_head)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size = Vector2(0, 373)
	feed_col.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 6)
	scroll.add_child(_list)

	var back := Button.new()
	back.text = "Back to Hub"
	ClientUi.apply_shell_back(back, self)
	ClientUi.apply_ghost_button(back)
	back.pressed.connect(func() -> void: GameManager.go_hub())
	root.add_child(back)


func _row(n: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.05, 0.08, 0.72), Color(0.28, 0.36, 0.48, 0.4), 8, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 2)
	panel.add_child(col)

	var when := Label.new()
	when.text = _event_time(str(n.get("created_date", "")))
	when.add_theme_font_size_override("font_size", 13)
	when.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(when)
	col.add_child(when)

	var lab := Label.new()
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lab.text = str(n.get("message", ""))
	lab.add_theme_font_size_override("font_size", 15)
	lab.add_theme_color_override("font_color", Color(ClientUi.TEXT, 0.85))
	ClientUi.apply_body_font(lab)
	col.add_child(lab)
	return panel


func _empty(t: String) -> Label:
	var l := Label.new()
	l.text = t
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", 15)
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(l)
	return l


func _event_time(iso: String) -> String:
	if iso.is_empty():
		return ""
	var cleaned := iso.replace("Z", "").replace("z", "")
	var dict := Time.get_datetime_dict_from_datetime_string(cleaned, false)
	if dict.is_empty():
		return ""
	var months: Array[String] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
	var month: String = months[clampi(int(dict.get("month", 1)) - 1, 0, 11)]
	var hour := int(dict.get("hour", 0))
	var minute := int(dict.get("minute", 0))
	var ampm := "AM" if hour < 12 else "PM"
	var h12 := hour % 12
	if h12 == 0:
		h12 = 12
	return "%s %s, %s:%02d %s" % [month, dict.get("day", 1), h12, minute, ampm]


func _age_ms(iso: String) -> float:
	if iso.is_empty():
		return 0.0
	var cleaned := iso.replace("Z", "").replace("z", "")
	var dict := Time.get_datetime_dict_from_datetime_string(cleaned, false)
	if dict.is_empty():
		return 1.0e15
	var then_ms := float(Time.get_unix_time_from_datetime_dict(dict)) * 1000.0
	return maxf(0.0, Time.get_unix_time_from_system() * 1000.0 - then_ms)
