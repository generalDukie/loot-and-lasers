extends Control
## Inventory — paper-doll loadout, equip compare, lock, stims, dissolve, pending loot.

const FRAME_SLOTS: Array = [
	{"type": "weapon", "label": "Weapon"},
	{"type": "helmet", "label": "Helmet"},
	{"type": "neck", "label": "Neck"},
	{"type": "armor", "label": "Armor"},
	{"type": "_portrait", "label": ""},
	{"type": "ship_module", "label": "Ship"},
	{"type": "boots", "label": "Boots"},
	{"type": "legs", "label": "Legs"},
	{"type": "accessory", "label": "Ring"},
]

var _header: Label
var _effects: ActiveEffectsBar
var _status: Label
var _compare: Label
var _compare_panel: PanelContainer
var _doll: GridContainer
var _list: VBoxContainer
var _bag_scroll: ScrollContainer
var _busy := false
var _items: Array = []
var _selected_id := ""


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _refresh()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_bottom", 10)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	root.add_child(ClientUi.make_section_header("LOADOUT", "INVENTORY", "Drag between doll and bag · double-click to unequip"))
	_header = ClientUi.make_status()
	_header.add_theme_color_override("font_color", ClientUi.MUTED)
	root.add_child(_header)

	_effects = ActiveEffectsBar.make()
	root.add_child(_effects)

	var loadout_row := HBoxContainer.new()
	loadout_row.add_theme_constant_override("separation", 12)
	root.add_child(loadout_row)
	_doll = GridContainer.new()
	_doll.columns = 3
	_doll.add_theme_constant_override("h_separation", 8)
	_doll.add_theme_constant_override("v_separation", 8)
	loadout_row.add_child(_doll)

	_compare_panel = PanelContainer.new()
	_compare_panel.visible = false
	_compare_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_compare_panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.055, 0.07, 0.12, 0.97), Color(ClientUi.GOLD, 0.8))
	)
	loadout_row.add_child(_compare_panel)
	_compare = Label.new()
	_compare.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_compare.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_compare.add_theme_font_size_override("font_size", 17)
	_compare.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(_compare)
	_compare_panel.add_child(_compare)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	root.add_child(actions)

	var junk_btn := Button.new()
	junk_btn.text = "Dissolve Junk"
	junk_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_ghost_button(junk_btn)
	junk_btn.pressed.connect(_on_dissolve_junk)
	actions.add_child(junk_btn)

	var claim_btn := Button.new()
	claim_btn.text = "Claim Pending"
	claim_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_ghost_button(claim_btn)
	claim_btn.pressed.connect(_on_claim_pending)
	actions.add_child(claim_btn)

	_bag_scroll = ScrollContainer.new()
	_bag_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_bag_scroll.set_drag_forwarding(_bag_drag_get, _bag_drag_can_drop, _bag_drag_drop)
	root.add_child(_bag_scroll)

	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 8)
	_bag_scroll.add_child(_list)

	_status = ClientUi.make_status()
	root.add_child(_status)

	var nav := HBoxContainer.new()
	nav.add_theme_constant_override("separation", 10)
	root.add_child(nav)

	var refresh_btn := Button.new()
	refresh_btn.text = "Refresh"
	ClientUi.apply_ghost_button(refresh_btn)
	refresh_btn.pressed.connect(_refresh)
	nav.add_child(refresh_btn)

	var stats_btn := Button.new()
	stats_btn.text = "Stats"
	ClientUi.apply_ghost_button(stats_btn)
	stats_btn.pressed.connect(func() -> void: GameManager.go_stats())
	nav.add_child(stats_btn)

	var hub_btn := Button.new()
	hub_btn.text = "Hub"
	hub_btn.visible = not ClientUi.is_under_shell(self)
	hub_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(hub_btn)
	hub_btn.pressed.connect(func() -> void: GameManager.go_hub())
	nav.add_child(hub_btn)


func _refresh() -> void:
	if _busy:
		return
	_busy = true
	_status.add_theme_color_override("font_color", Color(0.65, 0.75, 0.85))
	_status.text = "Loading…"
	for child in _list.get_children():
		child.queue_free()
	for child in _doll.get_children():
		child.queue_free()

	await MissionManager.refresh_character()
	await InventoryManager.list_pending_loot()
	var ch: Dictionary = GameManager.active_character
	var res: Dictionary = await AuthManager.list_items()
	_busy = false
	if not res.ok:
		_status.add_theme_color_override("font_color", Color(1.0, 0.55, 0.45))
		_status.text = str(res.get("error", "Could not load inventory"))
		return

	_items = res.data if typeof(res.data) == TYPE_ARRAY else []
	var bag_n := InventoryRules.bag_occupancy(_items)
	var cap := InventoryRules.bag_cap(ch)
	_header.text = "%s · Lv %s · Bag %s/%s · Power %s · ✦ %s" % [
		LegacyName.full_name(ch), str(ch.get("level", 1)), bag_n, cap,
		str(StatsRules.combat_power(ch, _equipped_items())), str(ch.get("stardust", 0)),
	]
	_update_buffs(ch)
	_rebuild_doll(ch)

	var bag: Array = []
	var stims: Array = []
	var other: Array = []
	for it in _items:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if bool(it.get("is_equipped", false)):
			continue
		elif InventoryRules.is_consumable(it):
			stims.append(it)
		elif InventoryRules.is_equippable(str(it.get("type", ""))):
			bag.append(it)
		else:
			other.append(it)

	var pending: Array = InventoryManager.pending_loot
	_status.text = "%s eq · %s gear · %s stims · %s pending" % [
		_equipped_items().size(), bag.size(), stims.size(), pending.size(),
	]

	if not pending.is_empty():
		_list.add_child(_section("PENDING LOOT"))
		for p in pending:
			if typeof(p) == TYPE_DICTIONARY:
				_list.add_child(_make_pending_row(p))

	if not bag.is_empty():
		_list.add_child(_section("BAG (GEAR) — drag onto a slot · tap Compare"))
		for it in bag:
			_list.add_child(_make_row(it, false))
	else:
		var empty_hint := Label.new()
		empty_hint.text = "Bag empty — drop equipped gear here to unequip"
		empty_hint.add_theme_font_size_override("font_size", 16)
		empty_hint.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(empty_hint)
		empty_hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_list.add_child(empty_hint)
	if not stims.is_empty():
		_list.add_child(_section("STIMS"))
		for it in stims:
			_list.add_child(_make_row(it, false))
	if not other.is_empty():
		_list.add_child(_section("MATERIALS / OTHER"))
		for it in other:
			_list.add_child(_make_row(it, false))

	if _items.is_empty() and pending.is_empty():
		_status.text = "Bag empty — run missions or open the shop."
	_update_compare()


func _equipped_items() -> Array:
	var out: Array = []
	for it in _items:
		if typeof(it) == TYPE_DICTIONARY and bool(it.get("is_equipped", false)):
			out.append(it)
	return out


func _rebuild_doll(ch: Dictionary) -> void:
	for slot in FRAME_SLOTS:
		var stype := str(slot.get("type", ""))
		if stype == "_portrait":
			var wrap := PanelContainer.new()
			wrap.custom_minimum_size = Vector2(149, 149)
			wrap.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
				Color(0.07, 0.09, 0.14, 1.0), Color(ClientUi.CYAN, 0.8)
			))
			var center := CenterContainer.new()
			wrap.add_child(center)
			center.add_child(AvatarRenderer.make_portrait(ch, 94.0))
			_doll.add_child(wrap)
			continue
		var worn := InventoryRules.find_equipped_of_type(_items, stype)
		_doll.add_child(_make_slot_chip(stype, str(slot.get("label", stype)), worn))


func _make_slot_chip(slot_type: String, label: String, worn: Dictionary) -> PanelContainer:
	var filled := not worn.is_empty()
	var item_id := str(worn.get("id", "")) if filled else ""
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(139, 139)
	panel.tooltip_text = (
		"%s — drag to bag to unequip · double-click to unequip" % str(worn.get("name", "Item"))
		if filled
		else "%s — drop matching gear here to equip" % label
	)
	var rarity_tint := ClientUi.rarity_color(str(worn.get("rarity", ""))) if filled else Color(0.3, 0.35, 0.45)
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.09, 0.12, 0.18, 1.0) if filled else Color(0.06, 0.07, 0.1, 1.0),
		Color(rarity_tint, 0.9) if filled else Color(rarity_tint, 0.6)
	))
	ClientUi.apply_interaction_motion(panel, 1.018 if filled else 1.008)
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_theme_constant_override("separation", 2)
	panel.add_child(col)
	var lab := Label.new()
	lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lab.text = label.to_upper()
	lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lab.add_theme_font_size_override("font_size", 12)
	lab.add_theme_color_override("font_color", Color(0.55, 0.7, 0.85))
	ClientUi.apply_display_font(lab)
	col.add_child(lab)
	var icon_row := CenterContainer.new()
	icon_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_row.custom_minimum_size = Vector2(0, 64)
	col.add_child(icon_row)
	if filled:
		icon_row.add_child(GearIcon.make(worn, 44.0))
	else:
		var empty_mark := Label.new()
		empty_mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		empty_mark.text = "＋"
		empty_mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty_mark.add_theme_font_size_override("font_size", 24)
		empty_mark.add_theme_color_override("font_color", Color(0.35, 0.4, 0.48))
		icon_row.add_child(empty_mark)
	var name_l := Label.new()
	name_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name_l.text = str(worn.get("name", "—")) if filled else "empty"
	name_l.add_theme_font_size_override("font_size", 13)
	name_l.add_theme_color_override("font_color", Color(0.9, 0.95, 1.0) if filled else Color(0.4, 0.45, 0.5))
	ClientUi.apply_body_font(name_l)
	col.add_child(name_l)
	if filled:
		var meta := Label.new()
		meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
		meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		meta.text = "%s · P%s" % [
			str(worn.get("rarity", "?")),
			str(InventoryRules.class_power_rating(worn, str(GameManager.active_character.get("class", "Vanguard")))),
		]
		meta.add_theme_font_size_override("font_size", 12)
		meta.add_theme_color_override("font_color", rarity_tint.lightened(0.2))
		col.add_child(meta)

	panel.set_drag_forwarding(
		func(_at: Vector2) -> Variant:
			return _make_item_drag(panel, worn, "equip") if filled else null,
		func(_at: Vector2, data: Variant) -> bool:
			return _can_drop_on_equip_slot(slot_type, data),
		func(_at: Vector2, data: Variant) -> void:
			_drop_on_equip_slot(slot_type, data)
	)
	if filled and not item_id.is_empty():
		panel.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton:
				var mb := ev as InputEventMouseButton
				if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT and mb.double_click:
					_on_unequip(item_id)
					panel.accept_event()
		)
	return panel


func _update_buffs(ch: Dictionary) -> void:
	if _effects:
		_effects.refresh(ch)


func _section(text: String) -> Control:
	var wrap := ClientUi.make_section_header("", text, "")
	_ignore_mouse_tree(wrap)
	return wrap


func _ignore_mouse_tree(node: Node) -> void:
	if node is Control:
		(node as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	for child in node.get_children():
		_ignore_mouse_tree(child)


func _make_pending_row(pending: Dictionary) -> PanelContainer:
	var item: Dictionary = {}
	var raw: Variant = pending.get("item", {})
	if typeof(raw) == TYPE_DICTIONARY:
		item = raw
	var pid := str(pending.get("id", ""))
	var panel := PanelContainer.new()
	var rarity_tint := ClientUi.rarity_color(str(item.get("rarity", "")))
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.12, 0.08, 0.06, 0.98), Color(rarity_tint, 0.9), 10, 2
	))
	panel.set_drag_forwarding(
		func(_at: Vector2) -> Variant: return null,
		func(_at: Vector2, data: Variant) -> bool: return _can_drop_on_bag(data),
		func(_at: Vector2, data: Variant) -> void: _drop_on_bag(data)
	)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 10)
	panel.add_child(row)
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(col)
	var title := Label.new()
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.text = str(item.get("name", "Pending item"))
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", rarity_tint.lightened(0.18))
	col.add_child(title)
	var meta := Label.new()
	meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meta.text = "%s · %s · est dissolve %s SD" % [
		str(item.get("type", "?")), str(item.get("rarity", "?")),
		str(InventoryRules.estimate_sell_value(item)),
	]
	meta.add_theme_font_size_override("font_size", 16)
	meta.add_theme_color_override("font_color", Color(0.75, 0.8, 0.85))
	col.add_child(meta)
	var claim := Button.new()
	claim.text = "Claim"
	ClientUi.apply_primary_button(claim)
	claim.pressed.connect(func() -> void: _on_accept_pending(pid))
	row.add_child(claim)
	var diss := Button.new()
	diss.text = "Dissolve"
	ClientUi.apply_ghost_button(diss)
	diss.pressed.connect(func() -> void: _on_dissolve_pending(pid))
	row.add_child(diss)
	return panel


func _make_row(item: Dictionary, is_equipped: bool) -> PanelContainer:
	var is_new := str(item.get("id", "")) in GameManager.recent_loot_ids
	var selected := str(item.get("id", "")) == _selected_id
	var rarity_tint := ClientUi.rarity_color(str(item.get("rarity", "")))
	var border := Color(0.35, 0.9, 0.55, 0.95) if is_new else Color(rarity_tint, 0.86)
	if selected:
		border = Color(1.0, 0.85, 0.35, 0.95)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(
			Color(0.09, 0.11, 0.16, 0.98),
			border,
			10,
			2 if selected or is_new else 1
		)
	)
	ClientUi.apply_interaction_motion(panel, 1.006)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 10)
	panel.add_child(row)
	row.add_child(GearIcon.make(item, 44.0))
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(col)
	var title := Label.new()
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.text = ("%s%s" % ["NEW · " if is_new else "", str(item.get("name", "Item"))])
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", rarity_tint.lightened(0.2))
	col.add_child(title)

	var class_key := str(GameManager.active_character.get("class", "Vanguard"))
	var meta := Label.new()
	meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if InventoryRules.is_consumable(item):
		var cons: Dictionary = item.get("consumable", {}) if typeof(item.get("consumable", {})) == TYPE_DICTIONARY else {}
		meta.text = "stim · %s +%s%% · %sh" % [
			str(cons.get("stat", "?")),
			str(int(round(float(cons.get("mult", 0)) * 100.0))),
			str(cons.get("duration_hours", "?")),
		]
	else:
		meta.text = "%s · %s · P%s · sell ~%s" % [
			str(item.get("type", "?")), str(item.get("rarity", "?")),
			str(InventoryRules.class_power_rating(item, class_key)),
			str(InventoryRules.estimate_sell_value(item)),
		]
	meta.add_theme_font_size_override("font_size", 16)
	meta.add_theme_color_override("font_color", Color(0.65, 0.75, 0.85))
	col.add_child(meta)

	var item_id := str(item.get("id", ""))
	var item_type := str(item.get("type", ""))
	var locked := bool(item.get("locked", false))
	var can_drag_equip := (
		InventoryRules.is_equippable(item_type) and not item_id.is_empty() and not is_equipped
	)
	if can_drag_equip:
		panel.tooltip_text = "Drag onto the matching loadout slot to equip"

	# Bag rows accept equipped gear drops (unequip) and start drags for bag gear.
	panel.set_drag_forwarding(
		func(_at: Vector2) -> Variant:
			return _make_item_drag(panel, item, "bag") if can_drag_equip else null,
		func(_at: Vector2, data: Variant) -> bool:
			return _can_drop_on_bag(data),
		func(_at: Vector2, data: Variant) -> void:
			_drop_on_bag(data)
	)

	if InventoryRules.is_equippable(item_type) and not item_id.is_empty() and not is_equipped:
		var sel := Button.new()
		sel.text = "Compare"
		ClientUi.apply_ghost_button(sel)
		sel.pressed.connect(func() -> void:
			_selected_id = item_id
			_update_compare()
			_refresh()
		)
		row.add_child(sel)

	if InventoryRules.is_consumable(item) and not item_id.is_empty():
		var use_btn := Button.new()
		use_btn.text = "Use"
		ClientUi.apply_primary_button(use_btn)
		use_btn.pressed.connect(func() -> void: _on_use(item_id, str(item.get("name", "Stim"))))
		row.add_child(use_btn)
	elif InventoryRules.is_equippable(item_type) and not item_id.is_empty():
		var action := Button.new()
		if is_equipped:
			action.text = "Unequip"
			ClientUi.apply_ghost_button(action)
			action.pressed.connect(func() -> void: _on_unequip(item_id))
		else:
			var swap := InventoryRules.find_equipped_of_type(_items, item_type)
			action.text = "Swap" if not swap.is_empty() else "Equip"
			ClientUi.apply_primary_button(action)
			action.pressed.connect(func() -> void: _on_equip(item_id))
		row.add_child(action)

	if not item_id.is_empty():
		var lock_btn := Button.new()
		lock_btn.text = "Unlock" if locked else "Lock"
		ClientUi.apply_ghost_button(lock_btn)
		lock_btn.pressed.connect(func() -> void: _on_toggle_lock(item_id, not locked))
		row.add_child(lock_btn)

	if not locked and not item_id.is_empty():
		var diss := Button.new()
		diss.text = "Dissolve"
		ClientUi.apply_ghost_button(diss)
		diss.pressed.connect(func() -> void: _on_dissolve(item_id))
		row.add_child(diss)
	return panel


func _make_item_drag(host: Control, item: Dictionary, from: String) -> Variant:
	if item.is_empty() or host == null:
		return null
	var item_id := str(item.get("id", ""))
	if item_id.is_empty():
		return null
	var preview := GearIcon.make(item, 48.0)
	host.set_drag_preview(preview)
	return {
		"item_id": item_id,
		"from": from,
		"type": str(item.get("type", "")),
	}


func _bag_drag_get(_at: Vector2) -> Variant:
	return null


func _bag_drag_can_drop(_at: Vector2, data: Variant) -> bool:
	return _can_drop_on_bag(data)


func _bag_drag_drop(_at: Vector2, data: Variant) -> void:
	_drop_on_bag(data)


func _can_drop_on_bag(data: Variant) -> bool:
	return typeof(data) == TYPE_DICTIONARY and str(data.get("from", "")) == "equip"


func _drop_on_bag(data: Variant) -> void:
	if not _can_drop_on_bag(data):
		return
	var item_id := str(data.get("item_id", ""))
	if not item_id.is_empty():
		_on_unequip(item_id)


func _can_drop_on_equip_slot(slot_type: String, data: Variant) -> bool:
	if typeof(data) != TYPE_DICTIONARY:
		return false
	if str(data.get("from", "")) != "bag":
		return false
	return str(data.get("type", "")) == slot_type


func _drop_on_equip_slot(slot_type: String, data: Variant) -> void:
	if not _can_drop_on_equip_slot(slot_type, data):
		return
	var item_id := str(data.get("item_id", ""))
	if not item_id.is_empty():
		_on_equip(item_id)


func _update_compare() -> void:
	if _selected_id.is_empty():
		_compare_panel.visible = false
		return
	var cand := InventoryRules.find_by_id(_items, _selected_id)
	if cand.is_empty():
		_compare_panel.visible = false
		return
	var class_key := str(GameManager.active_character.get("class", "Vanguard"))
	var worn := InventoryRules.find_equipped_of_type(_items, str(cand.get("type", "")))
	var my_p := InventoryRules.class_power_rating(cand, class_key)
	var eq_p := InventoryRules.class_power_rating(worn, class_key) if not worn.is_empty() else 0
	var delta := my_p - eq_p
	var verdict := "NEW SLOT"
	if not worn.is_empty():
		if delta > 0:
			verdict = "UPGRADE (+%s)" % delta
		elif delta < 0:
			verdict = "DOWNGRADE (%s)" % delta
		else:
			verdict = "EVEN"
	var lines: PackedStringArray = ["COMPARE · %s · %s" % [str(cand.get("name", "?")), verdict]]
	if not worn.is_empty():
		lines.append("vs %s (P%s)" % [str(worn.get("name", "?")), str(eq_p)])
	for row in InventoryRules.compare_lines(cand, worn):
		var d: int = int(row.get("delta", 0))
		var sign := "+" if d > 0 else ""
		lines.append("%s %s%s (%s → %s)" % [
			str(row.get("stat", "?")).substr(0, 3).to_upper(), sign, str(d),
			str(row.get("old", 0)), str(row.get("new", 0)),
		])
	_compare.text = "\n".join(lines)
	var tint := ClientUi.rarity_color(str(cand.get("rarity", "")))
	_compare_panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.055, 0.07, 0.12, 0.97), Color(tint, 0.9))
	)
	_compare.add_theme_color_override("font_color", tint.lightened(0.24))
	var was_hidden := not _compare_panel.visible
	_compare_panel.visible = true
	if was_hidden:
		_compare_panel.modulate.a = 0.0
		_compare_panel.scale = Vector2(0.985, 0.985)
		_compare_panel.pivot_offset = _compare_panel.size * 0.5
		var reveal := _compare_panel.create_tween().set_parallel(true)
		reveal.tween_property(_compare_panel, "modulate:a", 1.0, 0.16)
		reveal.tween_property(_compare_panel, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _on_toggle_lock(item_id: String, locked: bool) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Updating lock…"
	var res: Dictionary = await InventoryManager.set_locked(item_id, locked)
	_busy = false
	if not res.ok:
		_fail(str(res.get("error", "Lock failed")))
		return
	_ok("Item %s." % ("locked" if locked else "unlocked"))
	await _refresh()


func _on_use(item_id: String, item_name: String) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Using %s…" % item_name
	var res: Dictionary = await AuthManager.use_consumable(item_id)
	_busy = false
	if not res.ok:
		_fail(str(res.get("error", "Use failed")))
		return
	_ok("Used %s." % item_name)
	AudioManager.play_ui("stim")
	await _refresh()


func _on_equip(item_id: String) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Equipping…"
	var res: Dictionary = await AuthManager.equip_item(item_id)
	_busy = false
	if not res.ok:
		_fail(str(res.get("error", "Equip failed")))
		return
	_ok("Equipped.")
	_selected_id = ""
	AudioManager.play_ui("equip")
	await _refresh()


func _on_unequip(item_id: String) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Unequipping…"
	var res: Dictionary = await AuthManager.unequip_item(item_id)
	_busy = false
	if not res.ok:
		var err := str(res.get("error", "Unequip failed"))
		_fail(err)
		if err.to_lower().contains("inventory full"):
			await InventoryManager.prompt_bag_pressure(self, "Free a bag slot before unequipping.")
			await _refresh()
		return
	_ok("Unequipped.")
	await _refresh()


func _on_dissolve(item_id: String) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Dissolving…"
	var res: Dictionary = await InventoryManager.dissolve_item(item_id)
	_busy = false
	if not res.ok:
		_fail(_err(res))
		return
	var gained := 0
	if typeof(res.data) == TYPE_DICTIONARY:
		gained = int(res.data.get("stardust_gained", 0))
	_ok("Dissolved (+%s SD)." % gained)
	AudioManager.play_ui("dissolve")
	await _refresh()


func _on_dissolve_junk() -> void:
	if _busy:
		return
	var ids: Array = InventoryRules.list_junk_ids(_items)
	if ids.is_empty():
		_status.text = "No junk to dissolve."
		return
	_busy = true
	_status.text = "Dissolving %s junk…" % ids.size()
	var res: Dictionary = await InventoryManager.dissolve_junk(ids)
	_busy = false
	if not res.ok:
		_fail(_err(res))
		return
	var gained := 0
	if typeof(res.data) == TYPE_DICTIONARY:
		gained = int(res.data.get("stardust_gained", 0))
	_ok("Dissolved junk (+%s SD)." % gained)
	AudioManager.play_ui("dissolve")
	await _refresh()


func _on_claim_pending() -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Claiming pending…"
	var res: Dictionary = await InventoryManager.try_claim_pending()
	_busy = false
	if not res.ok:
		_fail(str(res.get("error", "Claim failed")))
		return
	if bool(res.get("claimed", false)):
		_ok("Pending loot claimed.")
	else:
		_status.text = str(res.get("reason", "Nothing to claim / bag full."))
	await _refresh()


func _on_accept_pending(pid: String) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Accepting…"
	var res: Dictionary = await InventoryManager.accept_pending(pid)
	_busy = false
	if not res.ok:
		_fail(_err(res))
		return
	_ok("Pending loot accepted.")
	await _refresh()


func _on_dissolve_pending(pid: String) -> void:
	if _busy:
		return
	_busy = true
	_status.text = "Dissolving pending…"
	var res: Dictionary = await InventoryManager.dissolve_pending(pid)
	_busy = false
	if not res.ok:
		_fail(_err(res))
		return
	_ok("Pending dissolved.")
	AudioManager.play_ui("dissolve")
	await _refresh()


func _ok(msg: String) -> void:
	_status.add_theme_color_override("font_color", Color(0.55, 0.9, 0.7))
	_status.text = msg


func _fail(msg: String) -> void:
	_status.add_theme_color_override("font_color", Color(1.0, 0.55, 0.45))
	_status.text = msg


func _err(res: Dictionary) -> String:
	if typeof(res.data) == TYPE_DICTIONARY and res.data.has("error"):
		return str(res.data.get("error"))
	return str(res.get("error", "Request failed"))
