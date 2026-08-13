class_name InventoryFullSheet
extends Control
## Painted inventory-pressure sheet — mirrors web InventoryFullModal (dissolve bag / pending loot).

signal finished(action: String)

const AMBER := Color("#FBBF24")
const ACCENT := Color("#C084FC")

var _reason := ""
var _busy := false
var _bag_lab: Label
var _sub_lab: Label
var _pending_box: VBoxContainer
var _spare_box: VBoxContainer
var _empty_lab: Label
var _junk_btn: Button
var _claim_hint: Label


func run(reason: String) -> String:
	_reason = reason
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = 130
	_build()
	await _reload()
	if _is_cleared():
		return "ready"
	var action: String = await finished
	return action if not action.is_empty() else "cancel"


func _build() -> void:
	var scrim := ColorRect.new()
	scrim.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	scrim.color = Color(0.015, 0.018, 0.04, 0.85)
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(scrim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	var card := PanelContainer.new()
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	card.custom_minimum_size = Vector2(613, 0)
	card.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.045, 0.05, 0.085, 0.98), Color(AMBER, 0.65), 14, 2)
	)
	center.add_child(card)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 18)
	margin.add_theme_constant_override("margin_right", 18)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 16)
	card.add_child(margin)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	margin.add_child(col)

	var eyebrow := Label.new()
	eyebrow.text = "BAG PRESSURE"
	eyebrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	eyebrow.add_theme_font_size_override("font_size", 12)
	eyebrow.add_theme_color_override("font_color", Color(AMBER, 0.75))
	ClientUi.apply_display_font(eyebrow)
	col.add_child(eyebrow)

	var title := Label.new()
	title.text = "INVENTORY FULL"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 27)
	title.add_theme_color_override("font_color", AMBER)
	ClientUi.apply_display_font(title)
	col.add_child(title)

	_sub_lab = Label.new()
	_sub_lab.text = _reason
	_sub_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_sub_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sub_lab.add_theme_font_size_override("font_size", ClientUi.BODY_FS)
	_sub_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_sub_lab)
	col.add_child(_sub_lab)

	_bag_lab = Label.new()
	_bag_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_bag_lab.add_theme_font_size_override("font_size", ClientUi.BODY_FS)
	_bag_lab.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(_bag_lab)
	col.add_child(_bag_lab)

	_claim_hint = Label.new()
	_claim_hint.visible = false
	_claim_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_claim_hint.add_theme_font_size_override("font_size", ClientUi.HINT_FS)
	_claim_hint.add_theme_color_override("font_color", ClientUi.GOLD)
	ClientUi.apply_display_font(_claim_hint)
	col.add_child(_claim_hint)

	_pending_box = VBoxContainer.new()
	_pending_box.add_theme_constant_override("separation", 6)
	col.add_child(_pending_box)

	var spare_head := Label.new()
	spare_head.text = "DISSOLVE FROM BAG"
	spare_head.add_theme_font_size_override("font_size", 17)
	spare_head.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(spare_head)
	col.add_child(spare_head)

	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(0, 240)
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)

	_spare_box = VBoxContainer.new()
	_spare_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_spare_box.add_theme_constant_override("separation", 6)
	scroll.add_child(_spare_box)

	_empty_lab = Label.new()
	_empty_lab.text = "No dissolvable bag items. Dissolve the new find above, or unlock a locked item."
	_empty_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_empty_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_empty_lab.add_theme_font_size_override("font_size", ClientUi.BODY_FS)
	_empty_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	_empty_lab.visible = false
	col.add_child(_empty_lab)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	col.add_child(actions)

	var cancel := Button.new()
	cancel.text = "Cancel"
	cancel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_ghost_button(cancel)
	cancel.pressed.connect(func() -> void: _finish("cancel"))
	actions.add_child(cancel)

	_junk_btn = Button.new()
	_junk_btn.text = "Dissolve Junk"
	_junk_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_accent_chip_button(_junk_btn)
	_junk_btn.pressed.connect(_on_dissolve_junk)
	actions.add_child(_junk_btn)

	var inv := Button.new()
	inv.text = "Open Operative"
	inv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(inv)
	inv.pressed.connect(func() -> void:
		GameManager.go_stats()
		_finish("inventory")
	)
	actions.add_child(inv)

	card.modulate.a = 0.0
	var tw := card.create_tween()
	tw.tween_property(card, "modulate:a", 1.0, 0.18).set_ease(Tween.EASE_OUT)


func _finish(action: String) -> void:
	finished.emit(action)


func _is_cleared() -> bool:
	var bag_n := InventoryRules.bag_occupancy(_cached_items())
	var cap := InventoryManager.bag_cap()
	if bag_n >= cap:
		return false
	return InventoryManager.pending_loot.is_empty()


var _items_cache: Array = []


func _cached_items() -> Array:
	return _items_cache


func _reload() -> void:
	await InventoryManager.list_pending_loot()
	var items_res: Dictionary = await AuthManager.list_items()
	_items_cache = items_res.data if items_res.ok and typeof(items_res.data) == TYPE_ARRAY else []
	_rebuild_rows()


func _rebuild_rows() -> void:
	for c in _pending_box.get_children():
		c.queue_free()
	for c in _spare_box.get_children():
		c.queue_free()

	var bag_n := InventoryRules.bag_occupancy(_items_cache)
	var cap := InventoryManager.bag_cap()
	_bag_lab.text = "Bag %s / %s" % [bag_n, cap]
	if bag_n < cap and not InventoryManager.pending_loot.is_empty():
		_claim_hint.visible = true
		_claim_hint.text = "Slot free — claiming pending loot…"
	else:
		_claim_hint.visible = false

	var pending_shown := false
	if not InventoryManager.pending_loot.is_empty():
		var entry: Variant = InventoryManager.pending_loot[0]
		if typeof(entry) == TYPE_DICTIONARY:
			var pid := str(entry.get("id", ""))
			var item: Variant = entry.get("item", {})
			if typeof(item) == TYPE_DICTIONARY:
				_pending_box.add_child(_make_section_label("NEW LOOT — CLAIM OR DISSOLVE"))
				_pending_box.add_child(_make_item_row(item, true, pid))
				pending_shown = true

	if not pending_shown and not _reason.is_empty():
		_sub_lab.text = _reason
	elif pending_shown:
		_sub_lab.text = "Dissolve something in your bag to claim the new item, or dissolve the new find itself."

	var spare: Array = []
	for it in _items_cache:
		if typeof(it) != TYPE_DICTIONARY:
			continue
		if bool(it.get("is_equipped", false)) or bool(it.get("locked", false)):
			continue
		spare.append(it)

	_empty_lab.visible = spare.is_empty()
	for it in spare:
		_spare_box.add_child(_make_item_row(it, false, ""))

	var junk_ids: Array = InventoryRules.list_junk_ids(_items_cache)
	_junk_btn.disabled = _busy or junk_ids.is_empty()
	_junk_btn.text = "Dissolve Junk (%s)" % junk_ids.size() if not junk_ids.is_empty() else "Dissolve Junk"


func _make_section_label(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.add_theme_font_size_override("font_size", 17)
	lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(lab)
	return lab


func _make_item_row(item: Dictionary, is_pending: bool, pending_id: String) -> PanelContainer:
	var rarity := str(item.get("rarity", "common"))
	var tint := ClientUi.rarity_color(rarity)
	var row := PanelContainer.new()
	row.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(tint.r, tint.g, tint.b, 0.08), Color(tint, 0.35), 10, 1)
	)

	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	row.add_child(h)

	var meta := VBoxContainer.new()
	meta.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	meta.add_theme_constant_override("separation", 2)
	h.add_child(meta)

	var name_lab := Label.new()
	name_lab.text = str(item.get("name", "Item"))
	name_lab.clip_text = true
	name_lab.add_theme_font_size_override("font_size", 19)
	name_lab.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(name_lab)
	meta.add_child(name_lab)

	var detail := Label.new()
	var stardust := InventoryRules.estimate_sell_value(item)
	detail.text = "%s · %s · %s Stardust" % [
		rarity.capitalize(),
		GameData.gear_type_label(str(item.get("type", ""))),
		stardust,
	]
	detail.add_theme_font_size_override("font_size", ClientUi.META_FS)

	if is_pending:
		var badge := Label.new()
		badge.text = "NEW"
		badge.add_theme_font_size_override("font_size", 16)
		badge.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
		ClientUi.apply_display_font(badge)
		h.add_child(badge)

		var bag_n := InventoryRules.bag_occupancy(_items_cache)
		var cap := InventoryManager.bag_cap()
		if bag_n < cap and not pending_id.is_empty():
			var claim := Button.new()
			claim.text = "Claim"
			ClientUi.apply_primary_button(claim)
			claim.disabled = _busy
			claim.pressed.connect(func() -> void: _on_claim_pending(pending_id))
			h.add_child(claim)

	var dissolve := Button.new()
	dissolve.text = "Dissolve"
	ClientUi.apply_tinted_painted_button(dissolve, ACCENT)
	dissolve.disabled = _busy
	if is_pending:
		dissolve.pressed.connect(func() -> void: _on_dissolve_pending(pending_id, item))
	else:
		var iid := str(item.get("id", ""))
		dissolve.pressed.connect(func() -> void: _on_dissolve_bag(iid, item))
	h.add_child(dissolve)

	return row


func _on_dissolve_bag(item_id: String, item: Dictionary) -> void:
	if _busy or item_id.is_empty():
		return
	_busy = true
	var res: Dictionary = await InventoryManager.dissolve_item(item_id, false)
	_busy = false
	if not res.ok:
		_sub_lab.text = str(res.get("error", "Dissolve failed"))
		_sub_lab.add_theme_color_override("font_color", ClientUi.DANGER)
		await _reload()
		return
	_sub_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	_sub_lab.text = "Dissolved %s — +%s stardust. Claim the new loot when ready." % [
		str(item.get("name", "item")),
		InventoryRules.estimate_sell_value(item),
	]
	await _reload()
	if _is_cleared():
		_finish("dissolved")


func _on_dissolve_pending(pending_id: String, item: Dictionary) -> void:
	if _busy or pending_id.is_empty():
		return
	_busy = true
	var res: Dictionary = await InventoryManager.dissolve_pending(pending_id)
	_busy = false
	if not res.ok:
		_sub_lab.text = str(res.get("error", "Dissolve failed"))
		_sub_lab.add_theme_color_override("font_color", ClientUi.DANGER)
		await _reload()
		return
	_sub_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	_sub_lab.text = "Dissolved %s into stardust" % str(item.get("name", "loot"))
	await _reload()
	if InventoryManager.pending_loot.is_empty():
		_finish("dissolved")
	else:
		_sub_lab.text = "Dissolved. %s more overflow item(s) waiting — claim or dissolve." % InventoryManager.pending_loot.size()


func _on_claim_pending(pending_id: String) -> void:
	if _busy or pending_id.is_empty():
		return
	_busy = true
	var res: Dictionary = await InventoryManager.accept_pending(pending_id)
	_busy = false
	if not res.ok:
		_sub_lab.text = str(res.get("error", "Claim failed"))
		_sub_lab.add_theme_color_override("font_color", ClientUi.DANGER)
		await _reload()
		return
	await _reload()
	if _is_cleared():
		_finish("dissolved")


func _on_dissolve_junk() -> void:
	if _busy:
		return
	var junk: Array = InventoryRules.list_junk_ids(_items_cache)
	if junk.is_empty():
		return
	_busy = true
	var res: Dictionary = await InventoryManager.dissolve_junk(junk, false)
	_busy = false
	if not res.ok:
		_sub_lab.text = str(res.get("error", "Dissolve junk failed"))
		_sub_lab.add_theme_color_override("font_color", ClientUi.DANGER)
		await _reload()
		return
	_sub_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	_sub_lab.text = "Junk dissolved — claim pending loot or continue."
	await _reload()
	if _is_cleared():
		_finish("dissolved")
