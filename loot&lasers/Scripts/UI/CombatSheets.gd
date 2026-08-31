class_name CombatSheets
extends RefCounted
## Post-combat reward sheet + level-up celebration — mirrors web CombatComplete / LevelUp overlays.


## Build a painted reward sheet Control. Caller parents it and connects dismiss.
static func make_complete_sheet(summary: Dictionary, on_close: Callable) -> Control:
	var won := bool(summary.get("won", false))
	var mode := str(summary.get("mode", "arena"))
	var accent := Color("#FBBF24") if won else Color("#FB7185")

	# Use a plain Control root — PanelContainer fights absolute FULL_RECT children
	# and can eat button presses on the reward card.
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	root.z_index = 120
	root.add_to_group("post_combat_overlay")

	var scrim := ColorRect.new()
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scrim.color = Color(0.015, 0.018, 0.04, 0.82)
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	if not _tutorial_locks_report_actions():
		scrim.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and (ev as InputEventMouseButton).pressed:
				on_close.call()
		)
	root.add_child(scrim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(center)

	var action_n := 0
	for action in summary.get("actions", []):
		if typeof(action) == TYPE_DICTIONARY:
			action_n += 1
	var card := PanelContainer.new()
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	# Slightly wider when three equal footer actions (Cantina / Operative / Replay).
	card.custom_minimum_size = Vector2(640 if action_n >= 3 else 587, 0)
	card.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.045, 0.05, 0.085, 0.98), Color(accent, 0.65), 14, 2)
	)
	center.add_child(card)
	if mode == "arena":
		TutorialManager.tag_target(card, "arena-result")

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 12)
	card.add_child(col)

	var eyebrow := Label.new()
	eyebrow.text = "COMBAT REPORT"
	eyebrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	eyebrow.add_theme_font_size_override("font_size", 12)
	eyebrow.add_theme_color_override("font_color", Color(accent, 0.75))
	ClientUi.apply_display_font(eyebrow)
	col.add_child(eyebrow)

	var icon_host := CenterContainer.new()
	icon_host.custom_minimum_size = Vector2(40, 40)
	col.add_child(icon_host)
	icon_host.add_child(UiIcon.make(
		"diamond-fill" if won else "diamond",
		accent,
		37.0
	))

	var heading := Label.new()
	if mode == "dungeon":
		heading.text = "DUNGEON CLEAR" if won else "YOU FELL"
	elif mode == "mission":
		heading.text = "MISSION COMPLETE" if won else "MISSION FAILED"
	else:
		heading.text = "ARENA VICTORY" if won else "ARENA DEFEAT"
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.add_theme_font_size_override("font_size", 27)
	heading.add_theme_color_override("font_color", accent)
	ClientUi.apply_display_font(heading)
	col.add_child(heading)

	var title := str(summary.get("title", ""))
	if not title.is_empty():
		var tlab := Label.new()
		tlab.text = title
		tlab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		tlab.add_theme_font_size_override("font_size", 19)
		tlab.add_theme_color_override("font_color", ClientUi.TEXT)
		ClientUi.apply_display_font(tlab)
		col.add_child(tlab)

	var subtitle := str(summary.get("subtitle", ""))
	if not subtitle.is_empty():
		var slab := Label.new()
		slab.text = subtitle
		slab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		slab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		slab.add_theme_font_size_override("font_size", 18)
		slab.add_theme_color_override("font_color", ClientUi.MUTED)
		col.add_child(slab)

	var xp := int(summary.get("xp", 0))
	var stardust := int(summary.get("stardust", 0))
	if xp > 0 or summary.has("xp"):
		col.add_child(_reward_row_xp("+%s" % NumberDisplay.quantity(xp)))
	if stardust > 0 or summary.has("stardust"):
		col.add_child(_reward_row_stardust("+%s" % NumberDisplay.quantity(stardust)))
	if summary.has("rating_delta"):
		var delta := int(summary.get("rating_delta", 0))
		var dcol := Color("#FBBF24") if delta >= 0 else Color("#FB7185")
		var dtxt := NumberDisplay.signed_quantity(delta)
		col.add_child(_reward_row("ARENA RATING", dtxt, dcol, "trophy"))

	# Reward items (gear / stim / junk): glyph + name + rarity + type inline, full
	# stats via the shared backpack inspect popup on hover.
	var reward_items: Array = (
		summary.get("reward_items", [])
		if typeof(summary.get("reward_items", [])) == TYPE_ARRAY
		else []
	)
	if reward_items.is_empty():
		var single: Variant = summary.get("gear_item", null)
		if typeof(single) == TYPE_DICTIONARY and not (single as Dictionary).is_empty():
			reward_items = [single]
	var inspect: ItemInspectPopup = null
	if not reward_items.is_empty():
		inspect = ItemInspectPopup.new()
		root.add_child(inspect)
		# Draw above the reward card and confetti.
		inspect.z_index = 300
	for entry in reward_items:
		if typeof(entry) != TYPE_DICTIONARY or (entry as Dictionary).is_empty():
			continue
		col.add_child(_reward_item_pane(entry as Dictionary, inspect))

	var note := str(summary.get("note", ""))
	if not note.is_empty():
		var nlab := Label.new()
		nlab.text = note
		nlab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		nlab.add_theme_font_size_override("font_size", 18)
		nlab.add_theme_color_override("font_color", ClientUi.MUTED)
		col.add_child(nlab)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8 if action_n >= 3 else 10)
	col.add_child(actions)
	var primary_btn: Button = null
	var first_btn: Button = null
	for action in summary.get("actions", []):
		if typeof(action) != TYPE_DICTIONARY:
			continue
		var btn := Button.new()
		btn.text = str(action.get("label", "Continue"))
		btn.alignment = HORIZONTAL_ALIGNMENT_CENTER
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if bool(action.get("primary", true)):
			ClientUi.apply_primary_button(btn)
		else:
			ClientUi.apply_ghost_button(btn)
		if action_n >= 3:
			btn.add_theme_font_size_override("font_size", 15)
		var cb_var: Variant = action.get("callback", on_close)
		var cb: Callable = cb_var if cb_var is Callable else on_close
		btn.pressed.connect(func() -> void:
			if cb.is_valid():
				cb.call()
			else:
				on_close.call()
		)
		if _tutorial_locks_report_actions():
			_lock_report_action_button(btn)
		actions.add_child(btn)
		if first_btn == null:
			first_btn = btn
		if primary_btn == null and bool(action.get("primary", true)):
			primary_btn = btn

	if actions.get_child_count() == 0:
		var done := Button.new()
		done.text = "Continue"
		done.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_primary_button(done)
		done.pressed.connect(on_close)
		if _tutorial_locks_report_actions():
			_lock_report_action_button(done)
		actions.add_child(done)
		primary_btn = done
	elif primary_btn == null:
		primary_btn = first_btn

	# Entry pop — modulate only (scale breaks nested button hit-testing).
	card.modulate.a = 0.0
	var tween := card.create_tween()
	tween.tween_property(card, "modulate:a", 1.0, 0.18).set_ease(Tween.EASE_OUT)

	if won:
		_burst_confetti(root)

	_bind_enter_to_button(root, primary_btn)
	return root


static func make_level_up_sheet(
	from_level: int,
	to_level: int,
	character: Dictionary,
	on_close: Callable,
	attribute_awards: Array = []
) -> Control:
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	root.z_index = 130
	root.add_to_group("post_combat_overlay")

	var scrim := ColorRect.new()
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scrim.color = Color(0.02, 0.02, 0.06, 0.82)
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(scrim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(center)

	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(587, 0)
	card.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.05, 0.06, 0.1, 0.98), Color("#FBBF24", 0.65), 16, 2)
	)
	center.add_child(card)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	card.add_child(col)

	var spark := Label.new()
	spark.text = "LEVEL UP"
	spark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	spark.add_theme_font_size_override("font_size", 18)
	spark.add_theme_color_override("font_color", Color("#FBBF24"))
	ClientUi.apply_display_font(spark)
	col.add_child(spark)

	var levels := Label.new()
	levels.text = "%s  →  %s" % [from_level, to_level]
	levels.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	levels.add_theme_font_size_override("font_size", 48)
	levels.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(levels)
	col.add_child(levels)

	var name := Label.new()
	name.text = str(character.get("name", "Operative"))
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name.add_theme_font_size_override("font_size", 34)
	name.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(name)
	col.add_child(name)

	if not attribute_awards.is_empty():
		var awards_title := Label.new()
		awards_title.text = "Permanent attributes awarded"
		awards_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		awards_title.add_theme_font_size_override("font_size", 32)
		awards_title.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_display_font(awards_title)
		col.add_child(awards_title)
		var tallies := {}
		for entry in attribute_awards:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var stat := str(entry.get("stat", "")).strip_edges().to_lower()
			if stat.is_empty():
				continue
			tallies[stat] = int(tallies.get(stat, 0)) + 1
		var awards_col := VBoxContainer.new()
		awards_col.add_theme_constant_override("separation", 6)
		col.add_child(awards_col)
		var any_award := false
		for stat_key in ["strength", "agility", "intellect", "vitality", "luck"]:
			if not tallies.has(stat_key):
				continue
			any_award = true
			var award_line := Label.new()
			var label := str(StatsRules.ATTR_LABELS.get(stat_key, stat_key.capitalize()))
			award_line.text = "+%s %s" % [tallies[stat_key], label]
			award_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			award_line.add_theme_font_size_override("font_size", 36)
			award_line.add_theme_color_override("font_color", GameData.stat_color(stat_key))
			ClientUi.apply_display_font(award_line)
			awards_col.add_child(award_line)
		if not any_award:
			var fallback := Label.new()
			fallback.text = "%s permanent attributes" % attribute_awards.size()
			fallback.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			fallback.add_theme_font_size_override("font_size", 36)
			fallback.add_theme_color_override("font_color", Color("#FBBF24"))
			ClientUi.apply_display_font(fallback)
			awards_col.add_child(fallback)

	var confirm := Button.new()
	confirm.text = "Continue"
	confirm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(confirm)
	confirm.pressed.connect(on_close)
	if _tutorial_locks_report_actions():
		_lock_report_action_button(confirm)
	col.add_child(confirm)

	card.modulate.a = 0.0
	var tween := card.create_tween()
	tween.tween_property(card, "modulate:a", 1.0, 0.2).set_ease(Tween.EASE_OUT)
	_burst_confetti(root)
	var audio: Node = Engine.get_main_loop().root.get_node_or_null("/root/AudioManager")
	if audio != null:
		audio.call("play_ui", "levelup")
	_bind_enter_to_button(root, confirm)
	return root


static func pending_level_up(
	prev_character: Dictionary,
	next_character: Dictionary,
	progression: Dictionary = {}
) -> Dictionary:
	var from_l := int(prev_character.get("level", 1))
	var to_l := int(next_character.get("level", from_l))
	if typeof(progression) == TYPE_DICTIONARY and not progression.is_empty():
		from_l = int(progression.get("previous_level", from_l))
		to_l = int(progression.get("level", to_l))
	if to_l <= from_l:
		return {}
	var awards: Array = []
	if typeof(progression) == TYPE_DICTIONARY:
		var raw: Variant = progression.get("attribute_awards", [])
		if typeof(raw) == TYPE_ARRAY:
			awards = raw
	return {"from_level": from_l, "to_level": to_l, "attribute_awards": awards}


## Show combat-complete first; only after it closes, show level-up (never both).
## Navigation callbacks run after the full sequence (complete → optional level-up → done).
## Replay actions (`replay: true`) clear the sheet and call their callback without dismissing
## the combat overlay or re-running level-up.
static func present_complete_then_level_up(
	host: Control,
	summary: Dictionary,
	from_level: int,
	character: Dictionary,
	require_win_for_levelup: bool = true,
	allow_levelup: bool = true
) -> void:
	if host == null or not is_instance_valid(host):
		return
	var won := bool(summary.get("won", false))
	var to_level := int(character.get("level", from_level))
	var awards: Array = []
	var prog: Variant = summary.get("progression", {})
	if typeof(prog) == TYPE_DICTIONARY and not (prog as Dictionary).is_empty():
		from_level = int((prog as Dictionary).get("previous_level", from_level))
		to_level = int((prog as Dictionary).get("level", to_level))
		var raw_awards: Variant = (prog as Dictionary).get("attribute_awards", [])
		if typeof(raw_awards) == TYPE_ARRAY:
			awards = raw_awards
	elif typeof(summary.get("attribute_awards", null)) == TYPE_ARRAY:
		awards = summary.get("attribute_awards", [])
	var show_levelup := allow_levelup and to_level > from_level and (won or not require_win_for_levelup)
	var finished := {"done": false}

	var primary_nav := Callable()
	for action in summary.get("actions", []):
		if typeof(action) != TYPE_DICTIONARY:
			continue
		if bool(action.get("replay", false)):
			continue
		if bool(action.get("primary", true)) and action.get("callback") is Callable:
			primary_nav = action["callback"]
			break
	if not primary_nav.is_valid():
		for action in summary.get("actions", []):
			if typeof(action) != TYPE_DICTIONARY:
				continue
			if bool(action.get("replay", false)):
				continue
			if action.get("callback") is Callable:
				primary_nav = action["callback"]
				break

	var finish_sequence := func(nav: Callable) -> void:
		if finished["done"]:
			return
		finished["done"] = true
		_clear_sheet_host(host)
		if show_levelup:
			host.visible = true
			host.mouse_filter = Control.MOUSE_FILTER_STOP
			var captured_nav := nav
			var on_level_done := func() -> void:
				_clear_sheet_host(host)
				# Close combat overlay even if nav is a no-op (same underlying page).
				_dismiss_combat_overlay()
				if captured_nav.is_valid():
					captured_nav.call()
			host.add_child(make_level_up_sheet(from_level, to_level, character, on_level_done, awards))
		else:
			_dismiss_combat_overlay()
			if nav.is_valid():
				nav.call()

	var sequenced := summary.duplicate(true)
	var wrapped_actions: Array = []
	for action in summary.get("actions", []):
		if typeof(action) != TYPE_DICTIONARY:
			continue
		var a: Dictionary = (action as Dictionary).duplicate()
		var orig: Callable = a["callback"] if a.get("callback") is Callable else Callable()
		if bool(a.get("replay", false)):
			# Clear report only — stay on combat overlay for a re-watch.
			a["callback"] = func() -> void:
				_clear_sheet_host(host)
				if orig.is_valid():
					orig.call()
		else:
			# Bind so each button keeps its own nav target (GDScript loop capture).
			a["callback"] = finish_sequence.bind(orig)
		wrapped_actions.append(a)
	sequenced["actions"] = wrapped_actions

	_clear_sheet_host(host)
	host.visible = true
	host.mouse_filter = Control.MOUSE_FILTER_STOP
	host.add_child(make_complete_sheet(sequenced, finish_sequence.bind(primary_nav)))


static func _tutorial_locks_report_actions() -> bool:
	return TutorialManager.locks_post_combat_report_actions()


static func _bind_enter_to_button(host: Control, btn: Button) -> void:
	if host == null or btn == null:
		return
	var binder := ConfirmBinder.new(btn)
	host.add_child(binder)


class ConfirmBinder extends Node:
	var _btn: Button

	func _init(p_btn: Button = null) -> void:
		_btn = p_btn
		name = "ConfirmBinder"

	func _input(event: InputEvent) -> void:
		if not ClientUi.is_confirm_key(event):
			return
		var vp := get_viewport()
		if ClientUi.confirm_blocked_by_text_focus(vp):
			return
		ClientUi.try_activate_confirm_button(_btn, vp)


static func _lock_report_action_button(btn: Button) -> void:
	btn.disabled = true
	btn.focus_mode = Control.FOCUS_NONE
	btn.mouse_default_cursor_shape = Control.CURSOR_ARROW
	btn.modulate = Color(0.52, 0.54, 0.58, 0.82)
	btn.tooltip_text = "Use Operative in the side menu to continue"


static func _dismiss_combat_overlay() -> void:
	var gm: Node = Engine.get_main_loop().root.get_node_or_null("/root/GameManager")
	if gm != null and gm.has_method("close_overlay"):
		gm.call("close_overlay")


static func _clear_sheet_host(host: Control) -> void:
	if host == null or not is_instance_valid(host):
		return
	# Detach first so the next sheet never draws stacked with the previous.
	var kids := host.get_children()
	for child in kids:
		host.remove_child(child)
		child.queue_free()
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.visible = false


static func _reward_row(label: String, value: String, color: Color, icon: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.04, 0.05, 0.08, 0.95), Color(color, 0.4), 10, 1)
	)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	panel.add_child(row)
	if CurrencyIcon.is_asset_glyph(icon):
		row.add_child(UiIcon.make(icon, color, 24.0))
	else:
		var ic := Label.new()
		ic.text = icon
		ic.add_theme_font_size_override("font_size", 24)
		ic.add_theme_color_override("font_color", color)
		row.add_child(ic)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 0)
	row.add_child(col)
	var lab := Label.new()
	lab.text = label
	lab.add_theme_font_size_override("font_size", 17)
	lab.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(lab)
	col.add_child(lab)
	var val := Label.new()
	val.text = value
	val.add_theme_font_size_override("font_size", 21)
	val.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(val)
	col.add_child(val)
	return panel


static func _reward_row_stardust(value: String) -> PanelContainer:
	var color := GameData.STARDUST_COLOR
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.04, 0.05, 0.08, 0.95), Color(color, 0.45), 10, 1)
	)
	TutorialManager.tag_target(panel, "combat-reward-stardust")
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	panel.add_child(row)
	var ic := CurrencyIcon.make("stardust", 24.0)
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(ic)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 0)
	row.add_child(col)
	var lab := Label.new()
	lab.text = "STARDUST"
	lab.add_theme_font_size_override("font_size", 17)
	lab.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(lab)
	col.add_child(lab)
	var val := Label.new()
	val.text = value
	val.add_theme_font_size_override("font_size", 21)
	val.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(val)
	col.add_child(val)
	return panel


static func _reward_row_xp(value: String) -> PanelContainer:
	var border := ClientUi.BRAND_GRAD_CYAN
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.04, 0.05, 0.08, 0.95), Color(border, 0.5), 10, 1)
	)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	panel.add_child(row)
	row.add_child(BrandGradientTitle.make("XP", 24, false, true))
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 2)
	row.add_child(col)
	col.add_child(BrandGradientTitle.make("EXPERIENCE", 13, false))
	col.add_child(BrandGradientTitle.make(value, 21, false))
	return panel


## Reward item pane: gear glyph + name + rarity + type inline; hover opens the
## shared backpack inspect popup (read-only absolute stats).
static func _reward_item_pane(item: Dictionary, inspect: ItemInspectPopup) -> PanelContainer:
	var rarity := str(item.get("rarity", "common"))
	var tint := ClientUi.rarity_color(rarity)
	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.04, 0.05, 0.08, 0.95), Color(tint, 0.5), 10, 1)
	)
	if str(item.get("type", "")) == "helmet":
		TutorialManager.tag_target(panel, "combat-reward-helmet")

	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 10)
	panel.add_child(row)

	var box := 40.0
	var icon_panel := PanelContainer.new()
	icon_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_panel.custom_minimum_size = Vector2(box, box)
	var icon_sb := StyleBoxFlat.new()
	icon_sb.bg_color = Color(tint, 0.14)
	icon_sb.border_color = Color(tint, 0.6)
	icon_sb.set_border_width_all(1)
	icon_sb.set_corner_radius_all(8)
	icon_panel.add_theme_stylebox_override("panel", icon_sb)
	var icon_center := CenterContainer.new()
	icon_center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_panel.add_child(icon_center)
	icon_center.add_child(GearIcon.make(item, box - 8.0))
	row.add_child(icon_panel)

	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	col.add_theme_constant_override("separation", 1)
	row.add_child(col)

	var name_lab := Label.new()
	name_lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_lab.text = str(item.get("name", "Item"))
	name_lab.add_theme_font_size_override("font_size", 18)
	name_lab.add_theme_color_override("font_color", tint.lightened(0.22))
	ClientUi.apply_display_font(name_lab)
	col.add_child(name_lab)

	var sub := Label.new()
	sub.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sub.text = "%s · %s" % [rarity.capitalize(), _reward_type_label(item)]
	sub.add_theme_font_size_override("font_size", 19)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(sub)
	col.add_child(sub)

	if inspect != null:
		var captured := item.duplicate(true)
		panel.mouse_entered.connect(
			func() -> void:
				if is_instance_valid(inspect):
					inspect.present(panel, captured, {"equipped_preview": true})
		)
		panel.mouse_exited.connect(
			func() -> void:
				if is_instance_valid(inspect):
					inspect.request_hide()
		)
	return panel


static func _reward_type_label(item: Dictionary) -> String:
	if InventoryRules.is_consumable(item):
		return "Stim"
	var t := str(item.get("type", ""))
	if t == "junk":
		return "Junk"
	var lbl := str(GameData.gear_type_label(t))
	return lbl if not lbl.is_empty() else "Item"


## Lightweight CPU confetti — no canvas-confetti dependency.
static func _burst_confetti(host: Control) -> void:
	if host == null or not is_instance_valid(host):
		return
	var layer := Control.new()
	layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.z_index = 200
	host.add_child(layer)
	var colors := [
		Color("#FBBF24"), Color("#F59E0B"), Color("#00E5FF"), Color("#FDE68A"),
		Color("#FB7185"), Color("#A78BFA"),
	]
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	for i in 48:
		var speck := ColorRect.new()
		speck.custom_minimum_size = Vector2(rng.randf_range(3, 7), rng.randf_range(4, 10))
		speck.size = speck.custom_minimum_size
		speck.color = colors[i % colors.size()]
		speck.mouse_filter = Control.MOUSE_FILTER_IGNORE
		layer.add_child(speck)
		var start := Vector2(host.size.x * 0.5 + rng.randf_range(-40, 40), host.size.y * 0.35)
		speck.position = start
		speck.rotation = rng.randf_range(-1.0, 1.0)
		var end := start + Vector2(rng.randf_range(-220, 220), rng.randf_range(80, 280))
		var tw := speck.create_tween().set_parallel(true)
		tw.tween_property(speck, "position", end, rng.randf_range(0.7, 1.2)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(speck, "modulate:a", 0.0, 0.9).set_delay(0.25)
		tw.tween_property(speck, "rotation", speck.rotation + rng.randf_range(-3, 3), 1.0)
	var cleanup := host.create_tween()
	cleanup.tween_interval(1.4)
	cleanup.tween_callback(layer.queue_free)
