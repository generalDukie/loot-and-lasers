class_name ActiveEffectsBar
extends VBoxContainer
## Live stim + fuel-mount chips — mirrors web ActiveBuffsBar / ActiveEffectsPanel.

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

## When true (Hero loadout rail), show STIMS / MOUNTS section labels + timers.
var side_sections := false


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
	var ch: Dictionary = character
	if ch.is_empty():
		var gm: Node = Engine.get_main_loop().root.get_node_or_null("/root/GameManager")
		if gm != null:
			ch = gm.get("active_character") as Dictionary
			if ch == null:
				ch = {}
	for child in get_children():
		if child is Timer:
			continue
		child.queue_free()
	var buffs: Array = StatsRules.active_buffs(ch)
	var mounts: Array = ShipRules.active_fuel_mounts(ch)
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

	# Hero side rail: always visible with labeled timer sections.
	visible = true
	add_child(_section_label("STIMS"))
	if buffs.is_empty():
		add_child(_empty_hint("No active stims"))
	else:
		for b in buffs:
			if typeof(b) == TYPE_DICTIONARY:
				add_child(_buff_chip(b))
	add_child(_section_label("MOUNTS / FUEL"))
	if mounts.is_empty():
		add_child(_empty_hint("No fuel mounts"))
	else:
		for m in mounts:
			if typeof(m) == TYPE_DICTIONARY:
				add_child(_mount_chip(m))


func _section_label(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.add_theme_font_size_override("font_size", 10)
	lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(lab)
	return lab


func _empty_hint(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lab.add_theme_font_size_override("font_size", 10)
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
	var head := Label.new()
	var icon_stat := str(STAT_ICONS.get(stat, "✦"))
	var label := "ALL" if stat == "all" else "%s %s" % [icon_stat, stat]
	head.text = "⚗ +%s%% %s" % [int(round(float(buff.get("mult", 0)) * 100.0)), label]
	head.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	head.add_theme_font_size_override("font_size", 11)
	head.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(head)
	col.add_child(head)
	var sub := Label.new()
	sub.text = str(buff.get("name", "Stim"))
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.add_theme_font_size_override("font_size", 9)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	col.add_child(sub)
	var timer := Label.new()
	timer.text = format_remaining(str(buff.get("expires_at", "")))
	timer.add_theme_font_size_override("font_size", 12)
	timer.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(timer)
	col.add_child(timer)
	panel.tooltip_text = "%s · expires in %s" % [str(buff.get("name", "Stim")), timer.text]
	return panel


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
	head.add_theme_font_size_override("font_size", 11)
	head.add_theme_color_override("font_color", Color("#FDE68A"))
	ClientUi.apply_display_font(head)
	col.add_child(head)
	var sub := Label.new()
	sub.text = str(mount.get("name", "Fuel Mount"))
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.add_theme_font_size_override("font_size", 9)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	col.add_child(sub)
	var timer := Label.new()
	timer.text = format_remaining(str(mount.get("expires_at", "")))
	timer.add_theme_font_size_override("font_size", 12)
	timer.add_theme_color_override("font_color", Color("#FBBF24", 0.9))
	ClientUi.apply_display_font(timer)
	col.add_child(timer)
	panel.tooltip_text = "%s · expires in %s" % [str(mount.get("name", "Mount")), timer.text]
	return panel
