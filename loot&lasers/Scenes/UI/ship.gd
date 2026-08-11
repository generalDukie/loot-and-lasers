extends Control
## Ship Hangar — mirrors web ShipPage (header · hero · fleet · loadout · fuel mounts).

const FUEL_COLOR := Color("#39FF14")
const STARDUST_COLOR := Color("#E879F9")
const NOVA_COLOR := Color("#FFD700")

const HULL_THEME := {
	"scout": {"accent": Color("#38BDF8"), "bay": Color(0.043, 0.071, 0.125), "glow": Color(0.22, 0.74, 0.97, 0.45)},
	"frigate": {"accent": Color("#F59E0B"), "bay": Color(0.102, 0.071, 0.031), "glow": Color(0.96, 0.62, 0.04, 0.4)},
	"cruiser": {"accent": Color("#34D399"), "bay": Color(0.024, 0.094, 0.086), "glow": Color(0.2, 0.83, 0.6, 0.4)},
	"dreadnought": {"accent": Color("#C084FC"), "bay": Color(0.078, 0.031, 0.11), "glow": Color(0.75, 0.52, 0.99, 0.45)},
}

var _status: Label
var _list: VBoxContainer
var _currency_row: HBoxContainer
var _busy := false
var _edit_ship := "scout"
var _fuel_open := false


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	await _boot()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_populate()


func _boot() -> void:
	_status.visible = true
	_status.text = "Loading hangar…"
	await ShipManager.refresh()
	var mil: Dictionary = await ShipManager.claim_scout_milestone()
	if mil.ok:
		_status.text = "Scout bay tuned — free Reinforced Fuel Tank T1 installed."
	else:
		_status.text = ""
		_status.visible = false
	_edit_ship = ShipRules.active_ship_id(GameManager.active_character)
	_populate()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 12)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_bottom", 10)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	root.add_child(header)

	var head_col := VBoxContainer.new()
	head_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_col.add_theme_constant_override("separation", 2)
	header.add_child(head_col)

	var eyebrow := Label.new()
	eyebrow.text = "DOCKING BAY"
	eyebrow.add_theme_font_size_override("font_size", 12)
	eyebrow.add_theme_color_override("font_color", Color(ClientUi.CYAN, 0.8))
	ClientUi.apply_display_font(eyebrow)
	head_col.add_child(eyebrow)

	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", 10)
	head_col.add_child(title_row)
	var icon_wrap := PanelContainer.new()
	icon_wrap.custom_minimum_size = Vector2(48, 48)
	icon_wrap.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(ClientUi.CYAN, 0.15), Color(ClientUi.CYAN, 0.35), 10, 1
	))
	title_row.add_child(icon_wrap)
	var icon_center := CenterContainer.new()
	icon_wrap.add_child(icon_center)
	icon_center.add_child(UiIcon.make("rocket", ClientUi.CYAN, 24.0))
	var title := Label.new()
	title.text = "Ship Hangar"
	title.add_theme_font_size_override("font_size", 35)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	title_row.add_child(title)

	_currency_row = HBoxContainer.new()
	_currency_row.add_theme_constant_override("separation", 8)
	_currency_row.size_flags_vertical = Control.SIZE_SHRINK_END
	header.add_child(_currency_row)

	_status = ClientUi.make_status()
	_status.visible = false
	root.add_child(_status)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 22)
	scroll.add_child(_list)


func _theme_for(ship_id: String) -> Dictionary:
	return HULL_THEME.get(ship_id, HULL_THEME["scout"])


func _populate() -> void:
	for c in _list.get_children():
		c.queue_free()
	var ch: Dictionary = GameManager.active_character
	var active := ShipRules.active_ship_id(ch)
	if not ShipRules.owns_ship(ch, _edit_ship):
		_edit_ship = active

	for child in _currency_row.get_children():
		child.queue_free()
	_currency_row.add_child(ClientUi.make_currency_chip(
		"✦",
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST),
		STARDUST_COLOR
	))
	_currency_row.add_child(ClientUi.make_currency_chip(
		"nova",
		CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA),
		NOVA_COLOR
	))

	_list.add_child(_make_hero(ch, active))

	# Fleet — full-width 2-col like web
	var fleet_sec := VBoxContainer.new()
	fleet_sec.add_theme_constant_override("separation", 10)
	_list.add_child(fleet_sec)
	fleet_sec.add_child(ClientUi.make_section_header(
		"Fleet",
		"Starships",
		"Preview locked bays, buy hulls, and keep flying your current vessel while you outfit the next."
	))
	var fleet := GridContainer.new()
	fleet.columns = 2
	fleet.add_theme_constant_override("h_separation", 10)
	fleet.add_theme_constant_override("v_separation", 10)
	fleet.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	fleet_sec.add_child(fleet)
	for sid in ShipRules.SHIP_ORDER:
		fleet.add_child(_make_hull_card(sid))

	# Loadout
	var edit_info: Dictionary = ShipRules.SHIP_TYPES.get(_edit_ship, {})
	var active_info: Dictionary = ShipRules.SHIP_TYPES.get(active, {})
	var edit_name := str(edit_info.get("name", _edit_ship))
	var active_name := str(active_info.get("name", active))
	var loadout_hint := "Permanent mods for the selected hull. Higher hulls cost more and hit ~8% harder per tier."
	if _edit_ship != active:
		loadout_hint = "Outfitting %s while flying %s. Activate when ready." % [edit_name, active_name]

	var loadout_sec := VBoxContainer.new()
	loadout_sec.add_theme_constant_override("separation", 10)
	_list.add_child(loadout_sec)

	var loadout_head := HBoxContainer.new()
	loadout_head.add_theme_constant_override("separation", 10)
	loadout_sec.add_child(loadout_head)
	var head_left := ClientUi.make_section_header("Loadout", "Upgrades · %s" % edit_name, loadout_hint)
	head_left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	loadout_head.add_child(head_left)

	var owned: Array = ShipRules.owned_ships(ch)
	if owned.size() > 1:
		var chips := HFlowContainer.new()
		chips.add_theme_constant_override("h_separation", 6)
		chips.add_theme_constant_override("v_separation", 4)
		loadout_head.add_child(chips)
		for sid in owned:
			chips.add_child(_make_edit_chip(str(sid), active))

	var edit_theme: Dictionary = _theme_for(_edit_ship)
	var accent: Color = edit_theme["accent"]
	var mod_wrap := PanelContainer.new()
	mod_wrap.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(accent, 0.06).lerp(Color(0, 0, 0, 0.35), 0.55),
		Color(accent, 0.22),
		16,
		1
	))
	loadout_sec.add_child(mod_wrap)
	var mod_grid := GridContainer.new()
	mod_grid.columns = 2
	mod_grid.add_theme_constant_override("h_separation", 10)
	mod_grid.add_theme_constant_override("v_separation", 10)
	mod_wrap.add_child(mod_grid)
	for cat in ShipRules.MOD_ORDER:
		mod_grid.add_child(_make_mod_card(cat, accent))

	_list.add_child(_make_fuel_section(ch))


func _make_edit_chip(ship_id: String, active_id: String) -> Button:
	var info: Dictionary = ShipRules.SHIP_TYPES.get(ship_id, {})
	var theme: Dictionary = _theme_for(ship_id)
	var accent: Color = theme["accent"]
	var selected := ship_id == _edit_ship
	var btn := Button.new()
	var parts := str(info.get("name", ship_id)).split(" ")
	var short := parts[parts.size() - 1] if parts.size() > 0 else ship_id
	btn.text = "%s%s" % [short, " · fly" if ship_id == active_id else ""]
	btn.add_theme_font_size_override("font_size", 13)
	ClientUi.apply_display_font(btn)
	if selected:
		btn.add_theme_stylebox_override("normal", ClientUi.painted_panel_style(
			Color(accent, 0.18), Color(accent, 0.55), 12, 1
		))
		btn.add_theme_color_override("font_color", accent)
	else:
		ClientUi.apply_ghost_button(btn)
	UiIcon.apply_leading_icon(
		btn,
		str(info.get("emoji", "rocket")),
		accent if selected else ClientUi.MUTED,
		14
	)
	btn.pressed.connect(func() -> void:
		_edit_ship = ship_id
		_populate()
	)
	return btn


func _make_hero(ch: Dictionary, active: String) -> PanelContainer:
	var info: Dictionary = ShipRules.SHIP_TYPES.get(active, {})
	var theme: Dictionary = _theme_for(active)
	var accent: Color = theme["accent"]
	var bay: Color = theme["bay"]

	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(0, 320)
	panel.clip_contents = true
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		bay, Color(0.35, 0.4, 0.5, 0.45), 16, 1
	))

	var stack := Control.new()
	stack.custom_minimum_size = Vector2(0, 320)
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_child(stack)

	# Atmosphere glow
	var glow := ColorRect.new()
	glow.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	glow.color = Color(theme["glow"] as Color)
	glow.color.a = 0.18
	stack.add_child(glow)

	var body := MarginContainer.new()
	body.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	body.add_theme_constant_override("margin_left", 18)
	body.add_theme_constant_override("margin_right", 18)
	body.add_theme_constant_override("margin_top", 16)
	body.add_theme_constant_override("margin_bottom", 16)
	stack.add_child(body)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 18)
	body.add_child(row)

	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_SHRINK_END
	col.add_theme_constant_override("separation", 4)
	row.add_child(col)

	var active_lab := Label.new()
	active_lab.text = "ACTIVE VESSEL"
	active_lab.add_theme_font_size_override("font_size", 13)
	active_lab.add_theme_color_override("font_color", accent)
	ClientUi.apply_display_font(active_lab)
	col.add_child(active_lab)

	var name_lab := Label.new()
	name_lab.text = str(info.get("name", active))
	name_lab.add_theme_font_size_override("font_size", 35)
	name_lab.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(name_lab)
	col.add_child(name_lab)

	var inherent := ShipRules.inherent_label(info)
	if not inherent.is_empty():
		var inh := Label.new()
		inh.text = inherent
		inh.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		inh.add_theme_font_size_override("font_size", 15)
		inh.add_theme_color_override("font_color", accent)
		ClientUi.apply_body_font(inh)
		col.add_child(inh)

	var mods_n := 0
	for cat in ShipRules.MOD_ORDER:
		mods_n += ShipRules.installed_tier_count(ch, cat, active)
	var meta := Label.new()
	meta.text = "%s mod%s installed on this hull" % [str(mods_n), "" if mods_n == 1 else "s"]
	meta.add_theme_font_size_override("font_size", 16)
	meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(meta)
	col.add_child(meta)

	var fuel: float = float(CurrencyManager.get_balance(CurrencyManager.CURRENCY_FUEL))
	var max_fuel := maxi(1, int(ch.get("max_fuel", ShipRules.FUEL_MAX_BASE)))
	var fuel_row := HBoxContainer.new()
	fuel_row.add_theme_constant_override("separation", 8)
	col.add_child(fuel_row)
	var fuel_bar := ProgressBar.new()
	fuel_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	fuel_bar.min_value = 0
	fuel_bar.max_value = max_fuel
	fuel_bar.value = fuel
	fuel_bar.show_percentage = false
	fuel_bar.custom_minimum_size = Vector2(0, 11)
	ClientUi.apply_hp_bar(fuel_bar, FUEL_COLOR)
	fuel_row.add_child(fuel_bar)
	var fuel_lab := Label.new()
	fuel_lab.text = "%s/%s ⛽" % [str(fuel), str(max_fuel)]
	fuel_lab.add_theme_font_size_override("font_size", 13)
	fuel_lab.add_theme_color_override("font_color", FUEL_COLOR)
	ClientUi.apply_display_font(fuel_lab)
	fuel_row.add_child(fuel_lab)

	var bonus_row := HFlowContainer.new()
	bonus_row.add_theme_constant_override("h_separation", 6)
	bonus_row.add_theme_constant_override("v_separation", 4)
	col.add_child(bonus_row)
	for chip in _bonus_chips(ch, accent):
		bonus_row.add_child(chip)

	var sil_wrap := CenterContainer.new()
	sil_wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sil_wrap.size_flags_stretch_ratio = 0.95
	row.add_child(sil_wrap)
	var sil_host := Control.new()
	sil_host.custom_minimum_size = Vector2(347, 160)
	sil_wrap.add_child(sil_host)
	var sil := _HullSilhouette.new()
	sil.ship_id = active
	sil.accent = accent
	sil.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	sil_host.add_child(sil)
	# Gentle bob like web (offset host, not layout-managed child)
	var bob := sil_host.create_tween().set_loops()
	bob.tween_property(sil_host, "position:y", -6.0, 2.1).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	bob.tween_property(sil_host, "position:y", 0.0, 2.1).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	return panel


func _bonus_chips(ch: Dictionary, accent: Color) -> Array:
	var out: Array = []
	var max_fuel := int(ch.get("max_fuel", ShipRules.FUEL_MAX_BASE))
	var bag := InventoryRules.bag_cap(ch)
	var stardust_pct := int(round(ShipRules.mod_effect_total(ch, "mission_stardust_mult") * 100.0))
	var xp_pct := int(round(ShipRules.mod_effect_total(ch, "mission_xp_mult") * 100.0))
	var fuel_save := int(round(ShipRules.mod_effect_total(ch, "fuel_cost_reduction")))
	var time_pct := int(round(ShipRules.mod_effect_total(ch, "mission_duration_reduction") * 100.0))
	var entries: Array = [
		{"label": "Max Fuel", "value": str(max_fuel), "show": max_fuel > ShipRules.FUEL_MAX_BASE},
		{"label": "Stardust", "value": "+%s%%" % stardust_pct, "show": stardust_pct > 0},
		{"label": "XP", "value": "+%s%%" % xp_pct, "show": xp_pct > 0},
		{"label": "Fuel Cost", "value": "-%s" % fuel_save, "show": fuel_save > 0},
		{"label": "Time", "value": "-%s%%" % time_pct, "show": time_pct > 0},
		{"label": "Inventory", "value": str(bag), "show": bag > InventoryRules.BAG_CAP_DEFAULT},
	]
	for e in entries:
		if not bool(e["show"]):
			continue
		var chip := PanelContainer.new()
		chip.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(accent, 0.12), Color(accent, 0.4), 10, 1
		))
		var lab := Label.new()
		lab.text = "%s %s" % [str(e["label"]), str(e["value"])]
		lab.add_theme_font_size_override("font_size", 13)
		lab.add_theme_color_override("font_color", accent)
		ClientUi.apply_display_font(lab)
		chip.add_child(lab)
		out.append(chip)
	return out


func _make_hull_card(ship_id: String) -> PanelContainer:
	var ch: Dictionary = GameManager.active_character
	var info: Dictionary = ShipRules.SHIP_TYPES.get(ship_id, {})
	var owned := ShipRules.owns_ship(ch, ship_id)
	var active := ShipRules.active_ship_id(ch) == ship_id
	var level := int(ch.get("level", 1))
	var unlock := int(info.get("unlock_level", 1))
	var unlocked := level >= unlock
	var locked := not owned and not unlocked
	var theme: Dictionary = _theme_for(ship_id)
	var accent: Color = theme["accent"]
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.09, 0.92),
		Color(ClientUi.CYAN, 0.55) if active else (Color(0.3, 0.32, 0.38, 0.35) if locked else Color(0.4, 0.45, 0.55, 0.4)),
		14,
		2 if active else 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	panel.add_child(col)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 10)
	col.add_child(top)

	var thumb := PanelContainer.new()
	thumb.custom_minimum_size = Vector2(75, 53)
	thumb.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0, 0, 0, 0.4) if locked else Color(ClientUi.CYAN, 0.1),
		Color(1, 1, 1, 0.1) if locked else Color(ClientUi.CYAN, 0.25),
		10,
		1
	))
	top.add_child(thumb)
	var sil := _HullSilhouette.new()
	sil.ship_id = ship_id
	sil.accent = accent
	sil.ghost = locked
	sil.custom_minimum_size = Vector2(64, 37)
	thumb.add_child(sil)

	var title_col := VBoxContainer.new()
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_col.add_theme_constant_override("separation", 1)
	top.add_child(title_col)
	var title := Label.new()
	title.text = str(info.get("name", ship_id))
	title.add_theme_font_size_override("font_size", 19)
	title.add_theme_color_override("font_color", Color(ClientUi.TEXT, 0.85) if locked else ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	title_col.add_child(title)
	var inherent := ShipRules.inherent_label(info)
	if not inherent.is_empty():
		var inh := Label.new()
		inh.text = ("Teaser · %s" % inherent) if locked else inherent
		inh.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		inh.add_theme_font_size_override("font_size", 13)
		inh.add_theme_color_override("font_color", Color(accent, 0.7) if locked else accent)
		ClientUi.apply_body_font(inh)
		title_col.add_child(inh)

	if ship_id == "scout":
		var mile: Dictionary = ShipRules.scout_milestone_status(ch)
		var mile_lab := Label.new()
		mile_lab.add_theme_font_size_override("font_size", 12)
		ClientUi.apply_body_font(mile_lab)
		if bool(mile.get("claimed", false)):
			mile_lab.text = "Bay tuned · free Fuel Tank T1"
			mile_lab.add_theme_color_override("font_color", FUEL_COLOR)
		elif not bool(mile.get("eligible", false)):
			mile_lab.text = "Scout tune at Lv %s (%s left)" % [
				ClientUi.format_level(mile.get("level", 20)),
				str(maxi(0, int(mile.get("level", 20)) - level)),
			]
			mile_lab.add_theme_color_override("font_color", ClientUi.MUTED)
		else:
			mile_lab.text = ""
		if not mile_lab.text.is_empty():
			title_col.add_child(mile_lab)

	if active:
		var badge := Label.new()
		badge.text = "ACTIVE"
		badge.add_theme_font_size_override("font_size", 13)
		badge.add_theme_color_override("font_color", ClientUi.CYAN)
		ClientUi.apply_display_font(badge)
		top.add_child(badge)
	elif locked:
		var badge2 := HBoxContainer.new()
		badge2.add_theme_constant_override("separation", 4)
		badge2.alignment = BoxContainer.ALIGNMENT_CENTER
		var lock_icon := UiIcon.make("lock", Color(ClientUi.MUTED), 14.0)
		badge2.add_child(lock_icon)
		var badge2_lab := Label.new()
		badge2_lab.text = "Lv %s" % unlock
		badge2_lab.add_theme_font_size_override("font_size", 13)
		badge2_lab.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_display_font(badge2_lab)
		badge2.add_child(badge2_lab)
		top.add_child(badge2)

	var desc := Label.new()
	desc.text = str(info.get("desc", ""))
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.add_theme_font_size_override("font_size", 16)
	desc.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.85) if locked else ClientUi.MUTED)
	ClientUi.apply_body_font(desc)
	col.add_child(desc)

	if locked and unlock > 1:
		var prog_row := HBoxContainer.new()
		col.add_child(prog_row)
		var left := Label.new()
		left.text = "Bay reserved"
		left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		left.add_theme_font_size_override("font_size", 12)
		left.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(left)
		prog_row.add_child(left)
		var right := Label.new()
		right.text = "%s / %s · %s lvl left" % [level, unlock, maxi(0, unlock - level)]
		right.add_theme_font_size_override("font_size", 12)
		right.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(right)
		prog_row.add_child(right)
		var prog := ProgressBar.new()
		prog.min_value = 0
		prog.max_value = unlock
		prog.value = mini(level, unlock)
		prog.show_percentage = false
		prog.custom_minimum_size = Vector2(0, 8)
		ClientUi.apply_hp_bar(prog, Color(accent, 0.85))
		col.add_child(prog)

	if owned:
		if active:
			var in_use := PanelContainer.new()
			in_use.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
				Color(ClientUi.CYAN, 0.1), Color(ClientUi.CYAN, 0.0), 10, 0
			))
			var iu := Label.new()
			iu.text = "✓  In Use"
			iu.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			iu.add_theme_font_size_override("font_size", 16)
			iu.add_theme_color_override("font_color", ClientUi.CYAN)
			ClientUi.apply_display_font(iu)
			in_use.add_child(iu)
			col.add_child(in_use)
		else:
			var act := Button.new()
			act.text = "✓  Activate"
			act.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			ClientUi.apply_primary_button(act)
			act.pressed.connect(func() -> void: _on_activate(ship_id))
			col.add_child(act)
	elif locked:
		pass
	else:
		var buy := Button.new()
		buy.text = "Buy · %s" % str(info.get("cost", 0))
		CurrencyIcon.apply_button_cost(buy, 16.0)
		buy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_primary_button(buy)
		buy.disabled = not CurrencyManager.can_afford(
			CurrencyManager.CURRENCY_NOVA,
			int(info.get("cost", 0))
		)
		buy.pressed.connect(func() -> void: _on_buy_ship(ship_id))
		col.add_child(buy)
	return panel


func _make_mod_card(category: String, accent: Color) -> PanelContainer:
	var ch: Dictionary = GameManager.active_character
	var cat: Dictionary = ShipRules.SHIP_MODS.get(category, {})
	var have := ShipRules.installed_tier_count(ch, category, _edit_ship)
	var tiers: Array = cat.get("tiers", [])
	var max_tiers := maxi(1, tiers.size())
	var next: Dictionary = ShipRules.next_mod_tier(ch, category, _edit_ship)
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.09, 0.9), Color(accent, 0.22), 14, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	panel.add_child(col)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 10)
	col.add_child(top)
	var icon_wrap := PanelContainer.new()
	icon_wrap.custom_minimum_size = Vector2(59, 59)
	icon_wrap.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(accent, 0.12), Color(accent, 0.3), 10, 1
	))
	top.add_child(icon_wrap)
	var icon_host := CenterContainer.new()
	icon_host.custom_minimum_size = Vector2(59, 59)
	icon_wrap.add_child(icon_host)
	CurrencyIcon.fill_glyph_host(icon_host, str(cat.get("emoji", "wrench")), 27, accent)
	var title_col := VBoxContainer.new()
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title_col)
	var title := Label.new()
	title.text = str(cat.get("name", category))
	title.add_theme_font_size_override("font_size", 17)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	title_col.add_child(title)
	var cat_lab := Label.new()
	cat_lab.text = str(cat.get("category", "")).to_upper()
	cat_lab.add_theme_font_size_override("font_size", 12)
	cat_lab.add_theme_color_override("font_color", accent)
	ClientUi.apply_display_font(cat_lab)
	title_col.add_child(cat_lab)
	var tier_badge := Label.new()
	tier_badge.text = "T%s/%s" % [str(have), str(max_tiers)]
	tier_badge.add_theme_font_size_override("font_size", 13)
	tier_badge.add_theme_color_override("font_color", accent)
	ClientUi.apply_display_font(tier_badge)
	top.add_child(tier_badge)

	var desc := Label.new()
	desc.text = str(cat.get("desc", ""))
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.add_theme_font_size_override("font_size", 15)
	desc.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(desc)
	col.add_child(desc)

	var segs := HBoxContainer.new()
	segs.add_theme_constant_override("separation", 3)
	col.add_child(segs)
	for i in range(max_tiers):
		var seg := ColorRect.new()
		seg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		seg.custom_minimum_size = Vector2(0, 7)
		seg.color = accent if i < have else Color(1, 1, 1, 0.08)
		segs.add_child(seg)

	if next.is_empty():
		var done := PanelContainer.new()
		done.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(accent, 0.1), Color(accent, 0.35), 10, 1
		))
		var done_lab := Label.new()
		done_lab.text = "✓  MAX"
		done_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		done_lab.add_theme_color_override("font_color", accent)
		ClientUi.apply_display_font(done_lab)
		done.add_child(done_lab)
		col.add_child(done)
	else:
		var next_box := PanelContainer.new()
		next_box.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0, 0, 0, 0.25), Color(1, 1, 1, 0.06), 8, 1
		))
		col.add_child(next_box)
		var next_col := VBoxContainer.new()
		next_col.add_theme_constant_override("separation", 2)
		next_box.add_child(next_col)
		var next_eye := Label.new()
		next_eye.text = "NEXT TIER"
		next_eye.add_theme_font_size_override("font_size", 12)
		next_eye.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_display_font(next_eye)
		next_col.add_child(next_eye)
		var next_lab := Label.new()
		next_lab.text = ShipRules.tier_effect_label(next, _edit_ship)
		next_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		next_lab.add_theme_font_size_override("font_size", 15)
		next_lab.add_theme_color_override("font_color", ClientUi.TEXT)
		ClientUi.apply_body_font(next_lab)
		next_col.add_child(next_lab)

		var cost := ShipRules.tier_cost(next, _edit_ship)
		var buy := Button.new()
		buy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if not CurrencyManager.can_afford(CurrencyManager.CURRENCY_STARDUST, cost):
			buy.text = "  %s ✦" % cost
			buy.icon = UiIcon.texture("lock")
			buy.expand_icon = true
			buy.alignment = HORIZONTAL_ALIGNMENT_CENTER
			buy.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
			buy.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
			buy.add_theme_constant_override("icon_max_width", 16)
			ClientUi.apply_ghost_button(buy)
			UiIcon.apply_button_icon_colors(buy, Color(ClientUi.MUTED))
			buy.disabled = true
		else:
			buy.text = "Install · %s ✦" % cost
			ClientUi.apply_primary_button(buy)
		buy.pressed.connect(func() -> void: _on_buy_mod(category, cost))
		col.add_child(buy)
	return panel


func _make_fuel_section(ch: Dictionary) -> PanelContainer:
	var mounts_active := not ShipRules.active_fuel_mounts(ch).is_empty()
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.96, 0.62, 0.04, 0.05),
		Color("#F59E0B", 0.18 if not _fuel_open else 0.35),
		14,
		1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	panel.add_child(col)

	var toggle := Button.new()
	toggle.alignment = HORIZONTAL_ALIGNMENT_LEFT
	var active_badge := " · active" if mounts_active else ""
	toggle.text = "⛽  Fuel Mounts%s\nTemporary mission speed — optional" % active_badge
	ClientUi.apply_ghost_button(toggle)
	toggle.add_theme_font_size_override("font_size", 16)
	toggle.pressed.connect(func() -> void:
		_fuel_open = not _fuel_open
		_populate()
	)
	col.add_child(toggle)

	if not _fuel_open:
		return panel

	var tip := Label.new()
	tip.text = "Temporary only — extends the timer (up to %s×). Speed does not stack; strongest mount wins." % ShipRules.MAX_FUEL_STACK
	tip.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tip.add_theme_font_size_override("font_size", 13)
	tip.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(tip)
	col.add_child(tip)

	var active_mounts: Array = ShipRules.active_fuel_mounts(ch)
	for am in active_mounts:
		if typeof(am) == TYPE_DICTIONARY:
			col.add_child(_make_active_mount_row(am))

	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	col.add_child(grid)
	for m in ShipRules.FUEL_MOUNTS:
		grid.add_child(_make_mount_card(m))
	return panel


func _make_active_mount_row(mount: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.12, 0.09, 0.04, 0.97), Color("#F3C969"), 10, 1)
	)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(col)
	var title := Label.new()
	title.text = "%s · −%s%% mission time" % [
		str(mount.get("name", "?")),
		str(int(round(float(mount.get("speed", 0)) * 100.0))),
	]
	title.add_theme_font_size_override("font_size", 17)
	title.add_theme_color_override("font_color", Color(1.0, 0.88, 0.55))
	ClientUi.apply_display_font(title)
	col.add_child(title)
	var detail := Label.new()
	var rem_s := _mount_remaining_seconds(str(mount.get("expires_at", "")))
	detail.text = "Expires in %s" % MissionBoard.format_duration(rem_s)
	detail.add_theme_font_size_override("font_size", 15)
	detail.add_theme_color_override("font_color", Color(0.75, 0.8, 0.7))
	col.add_child(detail)
	var dismiss := Button.new()
	dismiss.text = "Dismiss"
	ClientUi.apply_ghost_button(dismiss)
	var mid := int(mount.get("id", 0))
	var exp := str(mount.get("expires_at", ""))
	dismiss.pressed.connect(func() -> void: _on_dismiss_mount(mid, exp))
	row.add_child(dismiss)
	return panel


func _mount_remaining_seconds(expires_at: String) -> int:
	if expires_at.is_empty():
		return 0
	var cleaned := expires_at.strip_edges().replace("Z", "")
	if "." in cleaned:
		cleaned = cleaned.split(".")[0]
	var unix := int(Time.get_unix_time_from_datetime_string(cleaned))
	return maxi(0, unix - int(Time.get_unix_time_from_system()))


func _make_mount_card(mount: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.96, 0.62, 0.04, 0.05), Color("#F59E0B", 0.25), 10, 1
	))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	panel.add_child(row)
	var icon := Label.new()
	icon.text = "⛽"
	icon.add_theme_font_size_override("font_size", 24)
	row.add_child(icon)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(col)
	var title := Label.new()
	title.text = str(mount.get("name", "?"))
	title.add_theme_font_size_override("font_size", 16)
	ClientUi.apply_display_font(title)
	col.add_child(title)
	var detail := Label.new()
	var price := "%s ✦" % str(mount.get("stardust", 0))
	if int(mount.get("crystals", 0)) > 0:
		price += " + %s Nova" % str(mount.get("crystals", 0))
	detail.text = "+%s%% speed · %sh · %s" % [
		str(int(round(float(mount.get("speed", 0)) * 100.0))),
		str(mount.get("duration_hours", 1)),
		price,
	]
	detail.add_theme_font_size_override("font_size", 13)
	detail.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(detail)
	col.add_child(detail)
	var buy := Button.new()
	buy.text = "Buy"
	ClientUi.apply_primary_button(buy)
	var mid := int(mount.get("id", 0))
	buy.pressed.connect(func() -> void: _on_buy_mount(mid))
	row.add_child(buy)
	return panel


func _on_buy_ship(ship_id: String) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Buying hull…")
	var res: Dictionary = await ShipManager.buy_ship(ship_id)
	_busy = false
	if res.ok:
		_edit_ship = ship_id
	_finish(res, "Hull acquired — outfit below, then Activate when ready.")


func _on_activate(ship_id: String) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Activating…")
	var res: Dictionary = await ShipManager.activate_ship(ship_id)
	_busy = false
	if res.ok:
		_edit_ship = ship_id
	_finish(res, "Hull activated.")


func _on_buy_mod(category: String, cost: int) -> void:
	if _busy:
		return
	if not CurrencyManager.can_afford(CurrencyManager.CURRENCY_STARDUST, cost):
		Notify.blocked("Not enough Stardust", "Need %s ✦" % cost)
		return
	_busy = true
	_set_status("Installing mod…")
	var res: Dictionary = await ShipManager.buy_ship_mod(category, _edit_ship)
	_busy = false
	_finish(res, "Mod installed.")


func _on_buy_mount(mount_id: int) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Buying fuel mount…")
	var res: Dictionary = await ShipManager.buy_fuel_mount(mount_id)
	_busy = false
	_finish(res, "Fuel mount active.")


func _on_dismiss_mount(mount_id: int, expires_at: String) -> void:
	if _busy:
		return
	_busy = true
	_set_status("Dismissing mount…")
	var res: Dictionary = await ShipManager.dismiss_fuel_mount(mount_id, expires_at)
	_busy = false
	_finish(res, "Fuel mount dismissed.")


func _set_status(msg: String, danger := false) -> void:
	_status.visible = not msg.is_empty()
	_status.text = msg
	_status.add_theme_color_override(
		"font_color",
		Color(1.0, 0.55, 0.45) if danger else ClientUi.MUTED
	)


func _finish(res: Dictionary, ok_msg: String) -> void:
	if not res.ok:
		var err := str(res.get("error", "Failed"))
		if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
			err = str(res.data["error"])
		if Notify.is_player_fault(res):
			Notify.blocked(err)
		else:
			_set_status(err, true)
		return
	_set_status(ok_msg)
	_populate()


## Approximate web ShipHullPreview silhouettes (vector paths → Godot polygons).
class _HullSilhouette extends Control:
	var ship_id := "scout"
	var accent := Color("#38BDF8")
	var ghost := false

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		resized.connect(queue_redraw)

	func _draw() -> void:
		var a := Color(accent, 0.45 if ghost else 1.0)
		var body := Color(0.12, 0.16, 0.22, 0.95 if not ghost else 0.5)
		var w := size.x
		var h := size.y
		var ox := w * 0.06
		var oy := h * 0.22
		var sx := w * 0.88
		var sy := h * 0.56
		# Engine wash
		draw_circle(Vector2(ox + sx * 0.82, oy + sy * 0.55), sy * 0.35, Color(a, 0.22))
		var pts := PackedVector2Array()
		match ship_id:
			"frigate":
				pts = PackedVector2Array([
					Vector2(0.05, 0.62), Vector2(0.32, 0.28), Vector2(0.62, 0.22),
					Vector2(0.95, 0.42), Vector2(0.95, 0.62), Vector2(0.62, 0.78), Vector2(0.32, 0.72),
				])
			"cruiser":
				pts = PackedVector2Array([
					Vector2(0.02, 0.65), Vector2(0.25, 0.35), Vector2(0.55, 0.28),
					Vector2(0.95, 0.48), Vector2(0.95, 0.68), Vector2(0.55, 0.82), Vector2(0.25, 0.75),
				])
			"dreadnought":
				pts = PackedVector2Array([
					Vector2(0.02, 0.62), Vector2(0.22, 0.32), Vector2(0.45, 0.18),
					Vector2(0.78, 0.28), Vector2(0.98, 0.52), Vector2(0.98, 0.72),
					Vector2(0.78, 0.88), Vector2(0.45, 0.92), Vector2(0.22, 0.78),
				])
			_:
				pts = PackedVector2Array([
					Vector2(0.08, 0.58), Vector2(0.35, 0.28), Vector2(0.62, 0.32),
					Vector2(0.92, 0.48), Vector2(0.92, 0.62), Vector2(0.62, 0.72), Vector2(0.35, 0.68),
				])
		var mapped := PackedVector2Array()
		for p in pts:
			mapped.append(Vector2(ox + p.x * sx, oy + p.y * sy))
		draw_colored_polygon(mapped, body)
		draw_polyline(mapped + PackedVector2Array([mapped[0]]), a, 1.6, true)
		draw_circle(Vector2(ox + sx * 0.42, oy + sy * 0.48), maxf(2.0, sy * 0.08), Color(a, 0.7))
