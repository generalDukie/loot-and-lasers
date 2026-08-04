class_name ActiveEffectsBar
extends VBoxContainer
## Live stim + fuel-mount chips — mirrors web ActiveBuffsBar / ActiveEffectsPanel.

signal stim_removed

const STAT_COLORS := {
	"strength": Color("#F59E0B"),
	"agility": Color("#34D399"),
	"intellect": Color("#60A5FA"),
	"vitality": Color("#FB7185"),
	"luck": Color("#C084FC"),
	"all": Color("#FBBF24"),
}

const STAT_ICONS := {
	"strength": "⚔",
	"agility": "💨",
	"intellect": "🧠",
	"vitality": "❤",
	"luck": "🍀",
	"all": "✦",
}

## When true (Hero loadout rail), show STIMS / MOUNTS section labels + compact timers.
var side_sections := false
var _stamp := ""
var _removing := false


static func make(character: Dictionary = {}) -> ActiveEffectsBar:
	var bar := ActiveEffectsBar.new()
	if not character.is_empty():
		bar.refresh(character)
	return bar


func _ready() -> void:
	add_theme_constant_override("separation", 6)
	if get_child_count() == 0:
		refresh()
	var tick := Timer.new()
	tick.wait_time = 1.0
	tick.timeout.connect(func() -> void: refresh())
	add_child(tick)
	tick.start()


func refresh(character: Dictionary = {}) -> void:
	if not is_inside_tree():
		return
	var ch: Dictionary = character
	if ch.is_empty():
		var gm: Node = Engine.get_main_loop().root.get_node_or_null("/root/GameManager")
		if gm != null:
			ch = gm.get("active_character") as Dictionary
			if ch == null:
				ch = {}
	var buffs: Array = StatsRules.active_buffs(ch)
	var mounts: Array = ShipRules.active_fuel_mounts(ch)
	var next_stamp := _make_stamp(buffs, mounts)
	if next_stamp == _stamp and get_child_count() > 0:
		_refresh_timers_only(buffs, mounts)
		return
	_stamp = next_stamp
	for child in get_children():
		if child is Timer:
			continue
		child.queue_free()
	if not side_sections:
		visible = not buffs.is_empty() or not mounts.is_empty()
		if not visible:
			return
		var flow := HFlowContainer.new()
		flow.add_theme_constant_override("h_separation", 6)
		flow.add_theme_constant_override("v_separation", 6)
		add_child(flow)
		for b in buffs:
			if typeof(b) == TYPE_DICTIONARY:
				flow.add_child(_buff_chip(b))
		for m in mounts:
			if typeof(m) == TYPE_DICTIONARY:
				flow.add_child(_mount_chip(m))
		return

	# Hero side rail: always visible with labeled compact timer sections.
	visible = true
	add_child(_section_label("STIMS"))
	if buffs.is_empty():
		add_child(_empty_hint("No active stims"))
	else:
		for b in buffs:
			if typeof(b) == TYPE_DICTIONARY:
				add_child(_buff_chip_compact(b))
	add_child(_section_label("MOUNTS / FUEL"))
	if mounts.is_empty():
		add_child(_empty_hint("No fuel mounts"))
	else:
		for m in mounts:
			if typeof(m) == TYPE_DICTIONARY:
				add_child(_mount_chip_compact(m))


func _make_stamp(buffs: Array, mounts: Array) -> String:
	var parts: PackedStringArray = []
	for b in buffs:
		if typeof(b) != TYPE_DICTIONARY:
			continue
		parts.append("%s:%s:%s" % [b.get("stat", ""), b.get("mult", ""), b.get("expires_at", "")])
	for m in mounts:
		if typeof(m) != TYPE_DICTIONARY:
			continue
		parts.append("m:%s:%s:%s" % [m.get("name", ""), m.get("speed", ""), m.get("expires_at", "")])
	parts.append("side=%s" % side_sections)
	return "|".join(parts)


func _refresh_timers_only(buffs: Array, mounts: Array) -> void:
	var timers: Array = []
	_collect_timer_labels(self, timers)
	var i := 0
	for b in buffs:
		if typeof(b) != TYPE_DICTIONARY:
			continue
		if i >= timers.size():
			return
		var lab: Label = timers[i]
		i += 1
		if lab == null or not is_instance_valid(lab):
			continue
		var remain := format_remaining(str(b.get("expires_at", "")))
		var compact := bool(lab.get_meta("effect_compact", false))
		if compact:
			var pct := int(lab.get_meta("effect_pct", 0))
			lab.text = "+%s%% · %s" % [pct, format_remaining_compact(str(b.get("expires_at", "")))]
		else:
			lab.text = remain
		var panel := _timer_panel(lab)
		if panel != null:
			var pct2 := int(round(float(b.get("mult", 0)) * 100.0))
			panel.tooltip_text = "%s · +%s%% · expires in %s" % [
				str(b.get("name", "Stim")), pct2, remain,
			]
	for m in mounts:
		if typeof(m) != TYPE_DICTIONARY:
			continue
		if i >= timers.size():
			return
		var lab2: Label = timers[i]
		i += 1
		if lab2 == null or not is_instance_valid(lab2):
			continue
		var remain2 := format_remaining(str(m.get("expires_at", "")))
		var compact2 := bool(lab2.get_meta("effect_compact", false))
		if compact2:
			var spd := int(lab2.get_meta("effect_pct", 0))
			lab2.text = "−%s%% · %s" % [spd, format_remaining_compact(str(m.get("expires_at", "")))]
		else:
			lab2.text = remain2
		var panel2 := _timer_panel(lab2)
		if panel2 != null:
			panel2.tooltip_text = "%s · expires in %s" % [str(m.get("name", "Mount")), remain2]


func _timer_panel(lab: Label) -> Control:
	var n: Node = lab.get_parent()
	while n != null:
		if n is PanelContainer:
			return n as Control
		n = n.get_parent()
	return null


func _collect_timer_labels(node: Node, out: Array) -> void:
	for child in node.get_children():
		if child is Timer:
			continue
		if child is Label and bool(child.get_meta("effect_timer", false)):
			out.append(child)
		else:
			_collect_timer_labels(child, out)


func _section_label(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.add_theme_font_size_override("font_size", 13)
	lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(lab)
	return lab


func _empty_hint(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lab.add_theme_font_size_override("font_size", 13)
	lab.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.55))
	ClientUi.apply_body_font(lab)
	return lab


static func format_remaining(expires_at: String) -> String:
	var exp := StatsRules.parse_iso_unix(expires_at)
	var left := maxi(0, exp - int(Time.get_unix_time_from_system()))
	var h := int(left / 3600)
	var m := int((left % 3600) / 60)
	var s := left % 60
	if h > 0:
		return "%sh %sm" % [h, m]
	if m > 0:
		return "%sm %ss" % [m, s]
	return "%ss" % s


static func format_remaining_compact(expires_at: String) -> String:
	var exp := StatsRules.parse_iso_unix(expires_at)
	var left := maxi(0, exp - int(Time.get_unix_time_from_system()))
	var h := int(left / 3600)
	var m := int((left % 3600) / 60)
	var s := left % 60
	if h > 0:
		return "%d:%02d:%02d" % [h, m, s]
	return "%02d:%02d" % [m, s]


## Compact Hero-rail chip: "+15% · 04:32" (+ remove). Full detail in tooltip.
func _buff_chip_compact(buff: Dictionary) -> PanelContainer:
	var stat := str(buff.get("stat", "all"))
	var color: Color = STAT_COLORS.get(stat, STAT_COLORS["all"])
	var pct := int(round(float(buff.get("mult", 0)) * 100.0))
	var remain_full := format_remaining(str(buff.get("expires_at", "")))
	var remain := format_remaining_compact(str(buff.get("expires_at", "")))
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(color, 0.12), Color(color, 0.45), 6, 1)
	)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	panel.add_child(row)
	var head := Label.new()
	head.set_meta("effect_timer", true)
	head.set_meta("effect_compact", true)
	head.set_meta("effect_pct", pct)
	head.text = "+%s%% · %s" % [pct, remain]
	head.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_theme_font_size_override("font_size", 14)
	head.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(head)
	row.add_child(head)
	var remove_btn := Button.new()
	remove_btn.text = "×"
	remove_btn.tooltip_text = "Remove Stim"
	remove_btn.custom_minimum_size = Vector2(24, 24)
	remove_btn.pressed.connect(func() -> void: _request_remove_stim(buff))
	row.add_child(remove_btn)
	var icon_stat := str(STAT_ICONS.get(stat, "✦"))
	var label := "ALL" if stat == "all" else "%s %s" % [icon_stat, stat]
	panel.tooltip_text = "%s · +%s%% %s · expires in %s" % [
		str(buff.get("name", "Stim")), pct, label, remain_full,
	]
	panel.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT:
			_request_remove_stim(buff)
	)
	return panel


func _mount_chip_compact(mount: Dictionary) -> PanelContainer:
	var color := Color("#FBBF24")
	var spd := int(round(float(mount.get("speed", 0)) * 100.0))
	var remain_full := format_remaining(str(mount.get("expires_at", "")))
	var remain := format_remaining_compact(str(mount.get("expires_at", "")))
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(color, 0.1), Color(color, 0.45), 6, 1)
	)
	var head := Label.new()
	head.set_meta("effect_timer", true)
	head.set_meta("effect_compact", true)
	head.set_meta("effect_pct", spd)
	head.text = "−%s%% · %s" % [spd, remain]
	head.add_theme_font_size_override("font_size", 14)
	head.add_theme_color_override("font_color", Color("#FDE68A"))
	ClientUi.apply_display_font(head)
	panel.add_child(head)
	panel.tooltip_text = "%s · −%s%% mission time · expires in %s" % [
		str(mount.get("name", "Mount")), spd, remain_full,
	]
	return panel


func _buff_chip(buff: Dictionary) -> PanelContainer:
	var stat := str(buff.get("stat", "all"))
	var color: Color = STAT_COLORS.get(stat, STAT_COLORS["all"])
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(color, 0.12), Color(color, 0.45), 8, 1)
	)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 1)
	panel.add_child(col)
	var head_row := HBoxContainer.new()
	head_row.add_theme_constant_override("separation", 4)
	col.add_child(head_row)
	var head := Label.new()
	var icon_stat := str(STAT_ICONS.get(stat, "✦"))
	var label := "ALL" if stat == "all" else "%s %s" % [icon_stat, stat]
	var rarity := str(buff.get("rarity", "")).capitalize()
	var pct := int(round(float(buff.get("mult", 0)) * 100.0))
	if rarity.is_empty():
		head.text = "⚗ +%s%% %s" % [pct, label]
	else:
		head.text = "⚗ %s +%s%% %s" % [rarity, pct, label]
	head.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	head.add_theme_font_size_override("font_size", 15)
	head.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(head)
	head_row.add_child(head)
	var remove_btn := Button.new()
	remove_btn.text = "×"
	remove_btn.tooltip_text = "Remove Stim"
	remove_btn.custom_minimum_size = Vector2(28, 28)
	remove_btn.pressed.connect(func() -> void: _request_remove_stim(buff))
	head_row.add_child(remove_btn)
	var sub := Label.new()
	sub.text = str(buff.get("name", "Stim"))
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.add_theme_font_size_override("font_size", 12)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	col.add_child(sub)
	var timer := Label.new()
	timer.set_meta("effect_timer", true)
	timer.text = format_remaining(str(buff.get("expires_at", "")))
	timer.add_theme_font_size_override("font_size", 16)
	timer.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(timer)
	col.add_child(timer)
	panel.tooltip_text = "%s · +%s%% · expires in %s" % [str(buff.get("name", "Stim")), pct, timer.text]
	panel.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT:
			_request_remove_stim(buff)
	)
	return panel


func _overlay_host() -> Node:
	var tree := get_tree()
	if tree == null:
		return self
	var shell := tree.get_first_node_in_group("game_shell")
	if shell != null and is_instance_valid(shell):
		return shell
	if tree.current_scene != null:
		return tree.current_scene
	return self


func _request_remove_stim(buff: Dictionary) -> void:
	if _removing:
		return
	var stim_name := str(buff.get("name", "Stim"))
	var host := _overlay_host()
	var sheet := ClientUi.make_confirm_sheet(
		"ACTIVE STIM",
		"REMOVE STIM?",
		"Remove %s? Remaining duration will be discarded and the Stim will not be returned." % stim_name,
		func() -> void: _do_remove_stim(buff),
		Callable(),
		"Remove",
		"Cancel",
		ClientUi.DANGER,
		true
	)
	host.add_child(sheet)


func _do_remove_stim(buff: Dictionary) -> void:
	if _removing:
		return
	_removing = true
	var auth: Node = Engine.get_main_loop().root.get_node_or_null("/root/AuthManager")
	if auth == null:
		_removing = false
		return
	var res: Dictionary = await auth.dismiss_active_buff(
		str(buff.get("stat", "")),
		str(buff.get("expires_at", "")),
		str(buff.get("name", ""))
	)
	_removing = false
	_stamp = ""
	refresh()
	stim_removed.emit()
	if not res.get("ok", false):
		push_warning("DismissActiveBuff failed: %s" % str(res.get("error", "")))


func _mount_chip(mount: Dictionary) -> PanelContainer:
	var color := Color("#FBBF24")
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(color, 0.1), Color(color, 0.45), 8, 1)
	)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 1)
	panel.add_child(col)
	var head := Label.new()
	head.text = "🚀 −%s%% Mission Time" % int(round(float(mount.get("speed", 0)) * 100.0))
	head.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	head.add_theme_font_size_override("font_size", 15)
	head.add_theme_color_override("font_color", Color("#FDE68A"))
	ClientUi.apply_display_font(head)
	col.add_child(head)
	var sub := Label.new()
	sub.text = str(mount.get("name", "Fuel Mount"))
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.add_theme_font_size_override("font_size", 12)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	col.add_child(sub)
	var timer := Label.new()
	timer.set_meta("effect_timer", true)
	timer.text = format_remaining(str(mount.get("expires_at", "")))
	timer.add_theme_font_size_override("font_size", 16)
	timer.add_theme_color_override("font_color", Color("#FBBF24", 0.9))
	ClientUi.apply_display_font(timer)
	col.add_child(timer)
	panel.tooltip_text = "%s · expires in %s" % [str(mount.get("name", "Mount")), timer.text]
	return panel
