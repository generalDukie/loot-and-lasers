extends Control
## Character sheet — mirrors web CharacterPage (doll triad · backpack · attributes · vault).

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

## Hold-to-buy ramp — preload so the page compiles even before global class cache refresh.
const HoldRepeat := preload("res://Scripts/UI/HoldRepeatController.gd")

var _status: Label
var _list: VBoxContainer
var _hero_name: Label
var _hero_meta: Label
var _xp_bar: ProgressBar
var _xp_lab: Label
var _lore_lab: RichTextLabel
var _stims_lab: Label
var _stims_panel: PanelContainer
var _effects: ActiveEffectsBar
var _bio_field: LineEdit
var _bio_count: Label
var _bio_save: Button
var _doll: GridContainer
var _bag_grid: VBoxContainer
var _bag_count: Label
var _stardust_lab: Label
var _stardust_need: Label
var _attrs_panel: PanelContainer
var _attrs_col: VBoxContainer
var _vault_panel: PanelContainer
var _backpack: PanelContainer
var _combat_via: Label
var _combat_stim: Label
var _stat_rows: Dictionary = {}
var _combat_values: Dictionary = {}
var _hold = HoldRepeat.new()
var _hold_stat := ""
var _hold_queued := 0
var _hold_inflight := 0
var _hold_flushing := false
var _hold_purchases_at_flush := -1
var _busy := false
var _saved_bio := ""
var _operative_lab: Label
var _title_lab: Label
var _inspect: ItemInspectPopup
var _sheet_ready := false
var _doll_wrap: Control = null
var _slot_panels: Dictionary = {} # type -> PanelContainer
var _bag_slot_min_h := 56.0
var _equip_slot_size := 107.0
var _doll_scale_busy := false
var _doll_layout_lock := false

## Baseline 3×3 doll cell — grows to fill the loadout pane (never shrinks below this).
const EQUIP_SLOT_SIZE_MIN := 107.0
const EQUIP_SLOT_RADIUS := 10
const EQUIP_SLOT_BORDER := 2
const EQUIP_SLOT_PAD := 5
## Avatar fills the center cell content area (margins/borders reserved; badge overlays).
const PORTRAIT_FILL := 0.98
const EQUIP_ICON_SZ := 48.0
const EQUIP_LABEL_FS := 11
const EQUIP_NAME_FS := 12
const EQUIP_GRID_INSET := 8.0
const EQUIP_GRID_SEP := 8
const BAG_COLS := 5
## Backpack gear glyph — fraction of the middle band's shorter side (name/attrs unchanged).
const BAG_GEAR_ICON_FILL := 0.6
const ARMOR_STAT_LABEL := "Might Resistance"


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	clip_contents = true
	_build()
	_hold.stopped.connect(_on_hold_controller_stopped)
	StatsManager.character_changed.connect(_refresh_values)
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	var win := get_window()
	if win != null and not win.focus_exited.is_connected(_on_window_focus_out):
		win.focus_exited.connect(_on_window_focus_out)
	# Defer network boot so shell show_page can finish mounting/animating
	# without waiting on guild/stats requests (those used to freeze the rail).
	call_deferred("_start_boot")


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_refresh_values()


func _start_boot() -> void:
	if not is_inside_tree() or not is_instance_valid(self):
		return
	await _boot()


func _exit_tree() -> void:
	_stop_upgrade_hold(true)
	var win := get_window()
	if win != null and win.focus_exited.is_connected(_on_window_focus_out):
		win.focus_exited.disconnect(_on_window_focus_out)
	if StatsManager.character_changed.is_connected(_refresh_values):
		StatsManager.character_changed.disconnect(_refresh_values)


func _boot() -> void:
	_status.text = "Loading character sheet…"
	await SocialManager.load_my_guild()
	if not is_inside_tree() or not is_instance_valid(self):
		return
	var res: Dictionary = await StatsManager.refresh()
	if not is_inside_tree() or not is_instance_valid(self):
		return
	if not res.ok:
		_status.text = str(res.get("error", "Failed to load character"))
		return
	_populate()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_bottom", 10)
	add_child(margin)

	var root := VBoxContainer.new()
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 8)
	margin.add_child(root)

	# Web CharacterPage: left ~60% hero+bag, right ~40% attributes+vault.
	var columns := HBoxContainer.new()
	columns.size_flags_vertical = Control.SIZE_EXPAND_FILL
	columns.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_theme_constant_override("separation", 12)
	root.add_child(columns)

	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.size_flags_stretch_ratio = 1.0
	left.clip_contents = true
	left.add_theme_constant_override("separation", 8)
	columns.add_child(left)

	var right := VBoxContainer.new()
	right.custom_minimum_size.x = 427
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.size_flags_stretch_ratio = 0.66
	right.clip_contents = true
	right.add_theme_constant_override("separation", 6)
	columns.add_child(right)

	# —— CharacterHeader triad: lore | doll | stims/mounts ——
	# Loadout : backpack ≈ 1.2 : 1 (loadout ~20% taller). Both fill the left column
	# so backpack bottom stays flush with Cosmic Vault.
	var hero := PanelContainer.new()
	hero.size_flags_vertical = Control.SIZE_EXPAND_FILL
	hero.size_flags_stretch_ratio = 1.2
	hero.clip_contents = true
	hero.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.06, 0.1, 0.97), Color(ClientUi.CYAN, 0.45), 14, 2
	))
	left.add_child(hero)
	var hcol := VBoxContainer.new()
	hcol.size_flags_vertical = Control.SIZE_EXPAND_FILL
	hcol.add_theme_constant_override("separation", 8)
	hero.add_child(hcol)

	var triad := HBoxContainer.new()
	triad.size_flags_vertical = Control.SIZE_EXPAND_FILL
	triad.add_theme_constant_override("separation", 12)
	hcol.add_child(triad)

	# Lore rail — fill available triad height; scroll only when lore is genuinely long.
	var lore_panel := PanelContainer.new()
	lore_panel.custom_minimum_size = Vector2(293, 0)
	lore_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	lore_panel.clip_contents = true
	lore_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.03, 0.04, 0.07, 0.95), Color(0.4, 0.45, 0.55, 0.35), 10, 1
	))
	triad.add_child(lore_panel)
	var lore_outer := VBoxContainer.new()
	lore_outer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	lore_outer.add_theme_constant_override("separation", 6)
	lore_panel.add_child(lore_outer)
	var lore_eye := Label.new()
	lore_eye.text = "LORE"
	lore_eye.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	lore_eye.add_theme_font_size_override("font_size", 15)
	lore_eye.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(lore_eye)
	lore_outer.add_child(lore_eye)
	_lore_lab = RichTextLabel.new()
	_lore_lab.bbcode_enabled = true
	_lore_lab.fit_content = false
	_lore_lab.scroll_active = true
	_lore_lab.scroll_following = false
	_lore_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_lore_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_lore_lab.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_lore_lab.add_theme_font_size_override("normal_font_size", 16)
	_lore_lab.add_theme_font_size_override("bold_font_size", 17)
	_lore_lab.add_theme_color_override("default_color", Color(0.86, 0.91, 0.96))
	ClientUi.apply_body_font(_lore_lab)
	lore_outer.add_child(_lore_lab)

	# Center: EquippedFrame doll fills height; name / guild / XP pinned to pane bottom.
	var mid := VBoxContainer.new()
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mid.add_theme_constant_override("separation", 4)
	triad.add_child(mid)

	var doll_wrap := CenterContainer.new()
	doll_wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	doll_wrap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	doll_wrap.mouse_filter = Control.MOUSE_FILTER_STOP
	doll_wrap.set_drag_forwarding(_doll_drag_get, _doll_drag_can_drop, _doll_drag_drop)
	_doll_wrap = doll_wrap
	mid.add_child(doll_wrap)
	_doll = GridContainer.new()
	_doll.columns = 3
	_doll.add_theme_constant_override("h_separation", EQUIP_GRID_SEP)
	_doll.add_theme_constant_override("v_separation", EQUIP_GRID_SEP)
	_doll.mouse_filter = Control.MOUSE_FILTER_PASS
	doll_wrap.add_child(_doll)
	doll_wrap.resized.connect(_on_doll_wrap_resized)
	TutorialManager.tag_target(doll_wrap, "hero-doll")

	var identity := VBoxContainer.new()
	identity.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	identity.size_flags_vertical = Control.SIZE_SHRINK_END
	identity.add_theme_constant_override("separation", 2)
	mid.add_child(identity)

	_hero_name = Label.new()
	_hero_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hero_name.add_theme_font_size_override("font_size", 21)
	_hero_name.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(_hero_name)
	identity.add_child(_hero_name)

	_operative_lab = Label.new()
	_operative_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_operative_lab.add_theme_font_size_override("font_size", 12)
	_operative_lab.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.7))
	ClientUi.apply_body_font(_operative_lab)
	_operative_lab.visible = false
	identity.add_child(_operative_lab)

	_title_lab = Label.new()
	_title_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_lab.add_theme_font_size_override("font_size", 12)
	_title_lab.add_theme_color_override("font_color", Color("#FBBF24", 0.9))
	ClientUi.apply_display_font(_title_lab)
	_title_lab.visible = false
	identity.add_child(_title_lab)

	_hero_meta = Label.new()
	_hero_meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hero_meta.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hero_meta.add_theme_font_size_override("font_size", 12)
	_hero_meta.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_hero_meta)
	identity.add_child(_hero_meta)

	_xp_lab = Label.new()
	_xp_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_xp_lab.add_theme_font_size_override("font_size", 12)
	_xp_lab.add_theme_color_override("font_color", ClientUi.BRAND_GRAD_NEAR_WHITE)
	ClientUi.apply_display_font(_xp_lab)
	identity.add_child(_xp_lab)
	_xp_bar = ProgressBar.new()
	_xp_bar.min_value = 0
	_xp_bar.max_value = 100
	_xp_bar.show_percentage = false
	_xp_bar.custom_minimum_size = Vector2(0, 8)
	_xp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_xp_bar(_xp_bar)
	identity.add_child(_xp_bar)

	# Stims / fuel mounts rail — labeled timer sections.
	_stims_panel = PanelContainer.new()
	_stims_panel.custom_minimum_size = Vector2(176, 0)
	_stims_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_stims_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.03, 0.07, 0.06, 0.95), Color(ClientUi.SUCCESS, 0.4), 10, 1
	))
	TutorialManager.tag_target(_stims_panel, "hero-stims")
	triad.add_child(_stims_panel)
	var stim_col := VBoxContainer.new()
	stim_col.add_theme_constant_override("separation", 6)
	_stims_panel.add_child(stim_col)
	_stims_lab = Label.new()
	_stims_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_stims_lab.add_theme_font_size_override("font_size", 15)
	_stims_lab.add_theme_color_override("font_color", Color(0.75, 0.95, 0.8))
	ClientUi.apply_body_font(_stims_lab)
	_stims_lab.visible = false
	stim_col.add_child(_stims_lab)
	_effects = ActiveEffectsBar.make()
	_effects.side_sections = true
	_effects.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_effects.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	TutorialManager.tag_target(_effects, "hero-stims")
	stim_col.add_child(_effects)

	# Editable bio bar (web CharacterHeader).
	var bio_row := HBoxContainer.new()
	bio_row.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	bio_row.add_theme_constant_override("separation", 8)
	hcol.add_child(bio_row)
	_bio_field = ClientUi.make_field("Bio — visible to others…")
	_bio_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_bio_field.max_length = 280
	_bio_field.text_changed.connect(func(next: String) -> void:
		_bio_count.text = str(next.length())
		_bio_save.disabled = next == _saved_bio
	)
	bio_row.add_child(_bio_field)
	_bio_count = Label.new()
	_bio_count.custom_minimum_size.x = 37
	_bio_count.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_bio_count.add_theme_font_size_override("font_size", 12)
	_bio_count.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.55))
	ClientUi.apply_body_font(_bio_count)
	bio_row.add_child(_bio_count)
	_bio_save = Button.new()
	_bio_save.text = "Save"
	_bio_save.disabled = true
	ClientUi.apply_ghost_button(_bio_save)
	_bio_save.pressed.connect(_on_save_bio)
	bio_row.add_child(_bio_save)

	# Backpack shares leftover column height with loadout (ratio 1.0 vs 1.2).
	# Slots expand to fill the pane; bottom edge stays aligned with Cosmic Vault.
	_backpack = PanelContainer.new()
	_backpack.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_backpack.size_flags_stretch_ratio = 1.0
	_backpack.clip_contents = true
	TutorialManager.tag_target(_backpack, "hero-backpack")
	_backpack.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.07, 0.1, 0.94), Color(0.55, 0.39, 0.2, 0.45), 12, 1
	))
	left.add_child(_backpack)
	var bag_col := VBoxContainer.new()
	bag_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	bag_col.add_theme_constant_override("separation", 6)
	_backpack.add_child(bag_col)
	var bag_row := HBoxContainer.new()
	bag_row.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	bag_row.add_theme_constant_override("separation", 8)
	bag_col.add_child(bag_row)
	var bag_label := Label.new()
	bag_label.text = "BACKPACK"
	bag_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bag_label.add_theme_font_size_override("font_size", 13)
	bag_label.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(bag_label)
	bag_row.add_child(bag_label)
	_bag_count = Label.new()
	_bag_count.add_theme_font_size_override("font_size", 13)
	_bag_count.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(_bag_count)
	bag_row.add_child(_bag_count)
	_bag_grid = VBoxContainer.new()
	_bag_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_bag_grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_bag_grid.add_theme_constant_override("separation", 6)
	_bag_grid.set_drag_forwarding(_bag_drag_get, _bag_drag_can_drop, _bag_drag_drop)
	bag_col.add_child(_bag_grid)

	# Keep status inside the backpack so the pane's bottom stays flush with vault.
	_status = ClientUi.make_status()
	_status.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	bag_col.add_child(_status)

	# Right column: attrs expand; Cosmic Vault fixed at bottom (aligns with backpack).
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 10)
	right.add_child(_list)

	_inspect = ItemInspectPopup.new()
	add_child(_inspect)
	_inspect.action_pressed.connect(_on_inspect_action)


func _populate() -> void:
	if not is_inside_tree() or not is_instance_valid(self):
		return
	_sheet_ready = false
	_doll_layout_lock = true
	_update_hero()
	_rebuild_doll()
	_update_backpack()
	_stat_rows.clear()
	_combat_values.clear()
	_clear_container_children(_list)

	var c: Dictionary = GameManager.active_character
	var primary := StatsRules.primary_stat(str(c.get("class", "Vanguard")))

	# Web: single ATTRIBUTE UPGRADES card with embedded combat + vault below.
	_attrs_panel = PanelContainer.new()
	_attrs_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_attrs_panel.clip_contents = true
	TutorialManager.tag_target(_attrs_panel, "hero-attrs")
	_attrs_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.1, 0.96), Color(ClientUi.CYAN, 0.35), 14, 1
	))
	_list.add_child(_attrs_panel)
	_attrs_col = VBoxContainer.new()
	_attrs_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_attrs_col.add_theme_constant_override("separation", 8)
	_attrs_panel.add_child(_attrs_col)

	var head := HBoxContainer.new()
	head.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	head.add_theme_constant_override("separation", 8)
	_attrs_col.add_child(head)
	var head_copy := VBoxContainer.new()
	head_copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_copy.add_theme_constant_override("separation", 2)
	head.add_child(head_copy)
	var h2 := Label.new()
	h2.text = "✨  ATTRIBUTE UPGRADES"
	h2.add_theme_font_size_override("font_size", 19)
	h2.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(h2)
	head_copy.add_child(h2)
	var sub := Label.new()
	sub.text = "Spend stardust to permanently raise an attribute. Hold to keep buying."
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.add_theme_font_size_override("font_size", 14)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(sub)
	head_copy.add_child(sub)

	var sd_col := VBoxContainer.new()
	sd_col.add_theme_constant_override("separation", 0)
	head.add_child(sd_col)
	var sd_eye := Label.new()
	sd_eye.text = "YOUR STARDUST"
	sd_eye.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	sd_eye.add_theme_font_size_override("font_size", 12)
	sd_eye.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(sd_eye)
	sd_col.add_child(sd_eye)
	_stardust_lab = Label.new()
	_stardust_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_stardust_lab.add_theme_font_size_override("font_size", 21)
	_stardust_lab.add_theme_color_override("font_color", Color("#E879F9"))
	ClientUi.apply_display_font(_stardust_lab)
	sd_col.add_child(_stardust_lab)
	_stardust_need = Label.new()
	_stardust_need.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_stardust_need.add_theme_font_size_override("font_size", 12)
	_stardust_need.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_stardust_need)
	sd_col.add_child(_stardust_need)

	for stat in StatsRules.ATTR_KEYS:
		var row := _make_stat_row(stat, primary)
		row.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		_attrs_col.add_child(row)

	var divider := ColorRect.new()
	divider.custom_minimum_size.y = 1
	divider.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	divider.color = Color(1, 1, 1, 0.1)
	_attrs_col.add_child(divider)
	var combat := _make_combat_card()
	combat.size_flags_vertical = Control.SIZE_EXPAND_FILL
	combat.size_flags_stretch_ratio = 1.0
	_attrs_col.add_child(combat)

	_vault_panel = _make_vault_teaser(c)
	_vault_panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	TutorialManager.tag_target(_vault_panel, "hero-vault")
	_list.add_child(_vault_panel)

	_sheet_ready = true
	_refresh_values()
	_set_action_status("")
	_doll_layout_lock = false
	call_deferred("_sync_doll_scale")


## Live values only — never rebuilds rows, so a held button stays alive.
func _refresh_values() -> void:
	if not _sheet_ready or not is_inside_tree():
		return
	var c: Dictionary = GameManager.active_character
	if c.is_empty():
		return
	var eq: Array = StatsManager.equipped_items
	var display: Dictionary = StatsManager.display_totals(c, eq)
	var permanent: Dictionary = StatsManager.permanent_totals(c, eq)
	var naked: Dictionary = StatsManager.naked_totals(c)
	var derived: Dictionary = StatsManager.derived_stats(c, permanent)
	var stardust: int = int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
	var hold_extra := _hold_pending_count()
	var hold_cost := 0
	if not _hold_stat.is_empty() and hold_extra > 0:
		hold_cost = StatsRules.batch_cost(c, _hold_stat, hold_extra)
	var shown_dust := maxi(0, stardust - hold_cost)

	if is_instance_valid(_stardust_lab):
		_stardust_lab.text = "✦  %s" % _fmt_int(shown_dust)

	var cheapest := 999999999
	var can_buy_any := false
	for stat in StatsRules.ATTR_KEYS:
		var cost_i := StatsManager.next_cost(c, str(stat))
		cheapest = mini(cheapest, cost_i)
		if CurrencyManager.can_afford(CurrencyManager.CURRENCY_STARDUST, cost_i):
			can_buy_any = true

	if is_instance_valid(_stardust_need):
		_stardust_need.visible = not can_buy_any
		_stardust_need.text = "Need ✦%s+" % _fmt_int(cheapest)

	if is_instance_valid(_attrs_panel):
		_attrs_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.05, 0.06, 0.1, 0.96),
			Color(ClientUi.CYAN, 0.55) if can_buy_any else Color(1, 1, 1, 0.12),
			14,
			2 if can_buy_any else 1
		))

	for stat in _stat_rows:
		var row: Dictionary = _stat_rows[stat]
		if not row.has("value") or not is_instance_valid(row["value"]):
			continue
		var preview_n := _hold_pending_count(str(stat))
		var total := int(display.get(stat, 0)) + preview_n
		var bonus := int(display.get(stat, 0)) - int(naked.get(stat, 0))
		var cost := StatsRules.point_cost(StatsRules.purchase_count(c, str(stat)) + preview_n + 1)
		var affordable := shown_dust >= cost or (str(stat) == _hold_stat and _hold.is_active())

		var value_lab := row["value"] as Label
		value_lab.text = str(total)

		var bonus_lab := row["bonus"] as Label
		if bonus_lab != null and is_instance_valid(bonus_lab):
			if bonus > 0:
				bonus_lab.visible = true
				bonus_lab.text = "+%s" % bonus
			else:
				bonus_lab.visible = false

		var buy := row["buy"] as Button
		if buy != null and is_instance_valid(buy):
			buy.text = "Upgrade\n✦ %s" % _fmt_int(cost)
			buy.disabled = not affordable and not (str(stat) == _hold_stat and _hold.is_active())
			buy.modulate = Color(1.08, 1.12, 1.06) if str(stat) == _hold_stat and _hold.is_active() else Color.WHITE
			buy.add_theme_font_size_override("font_size", 17)
			buy.tooltip_text = (
				"Spend %s ✦ · hold to keep buying" % cost if affordable or (str(stat) == _hold_stat and _hold.is_active())
				else "Need %s ✦ for the next point" % cost
			)
		if row.has("panel") and is_instance_valid(row["panel"]):
			(row["panel"] as Control).tooltip_text = StatsRules.attribute_tooltip(str(stat), c, eq)

	_update_combat(derived, permanent, display)


func _update_hero() -> void:
	var c: Dictionary = GameManager.active_character
	# Everyday name on the hero gear pane; family mode adds "The X Family" beneath.
	_hero_name.text = LegacyName.full_name(c)
	var family_line := LegacyName.hero_family_line(c)
	_operative_lab.visible = not family_line.is_empty()
	_operative_lab.text = family_line

	var title := str(c.get("active_title", "")).strip_edges()
	_title_lab.visible = not title.is_empty() and title != "<null>"
	_title_lab.text = title

	var guild_tag := str(c.get("guild_tag", SocialManager.my_guild.get("tag", ""))).strip_edges()
	var guild_name := str(c.get("guild_name", SocialManager.my_guild.get("name", ""))).strip_edges()
	if not SocialManager.my_guild.is_empty() or not guild_tag.is_empty() or not guild_name.is_empty():
		if guild_tag.is_empty():
			guild_tag = str(SocialManager.my_guild.get("tag", ""))
		if guild_name.is_empty():
			guild_name = str(SocialManager.my_guild.get("name", ""))
		_hero_meta.text = "👥  [%s] %s" % [guild_tag, guild_name]
		_hero_meta.add_theme_color_override("font_color", ClientUi.VIOLET.lightened(0.2))
	else:
		_hero_meta.text = "No guild"
		_hero_meta.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.55))

	var xp := int(c.get("experience", 0))
	var xp_next := maxi(1, int(c.get("experience_to_next_level", 1)))
	_xp_lab.text = "XP  %s / %s" % [_fmt_int(xp), _fmt_int(xp_next)]
	_xp_bar.max_value = xp_next
	_xp_bar.value = mini(xp, xp_next)

	var race_name := str(c.get("race", ""))
	var class_name_key := str(c.get("class", ""))
	var race := GameData.race_info(race_name)
	var cls := GameData.class_info(class_name_key)
	var special_raw: Variant = cls.get("special", {})
	var special: Dictionary = special_raw if typeof(special_raw) == TYPE_DICTIONARY else {}
	# Structured like web CharacterHeader LORE rail (titles + body, scrollable).
	var lore_bb := "[color=#0DCADF][b]%s %s[/b][/color]\n%s" % [
		str(race.get("emoji", "")), race_name, str(race.get("lore", "")),
	]
	lore_bb += "\n\n[color=#A78BFA][b]%s[/b][/color]\n%s" % [
		class_name_key, str(cls.get("description", "")),
	]
	if not special.is_empty():
		lore_bb += "\n\n[color=#0DCADF][b]%s[/b][/color]\n%s" % [
			str(special.get("name", "")), str(special.get("effect", "")),
		]
	if is_instance_valid(_lore_lab):
		_lore_lab.text = lore_bb

	# Side rail owns empty-state copy via STIMS / MOUNTS section labels.
	_stims_lab.visible = false
	if _effects:
		_effects.refresh(c)

	_saved_bio = str(c.get("bio", c.get("backstory", "")))
	_bio_field.text = _saved_bio
	_bio_count.text = str(_saved_bio.length())
	_bio_save.disabled = true


func _on_save_bio() -> void:
	if _busy:
		return
	_busy = true
	_bio_save.disabled = true
	_status.text = "Saving bio…"
	var cid := str(GameManager.active_character.get("id", ""))
	var next_bio := _bio_field.text.substr(0, 280)
	var res: Dictionary = await AuthManager.patch_character(cid, {"bio": next_bio})
	_busy = false
	if not res.ok:
		_status.text = str(res.get("error", "Failed to save bio"))
		_bio_save.disabled = false
		return
	_saved_bio = next_bio
	GameManager.active_character["bio"] = next_bio
	_status.text = "Bio saved."
	_bio_save.disabled = true


func _equip_frame_style(bg: Color, border: Color) -> StyleBoxFlat:
	## Tight, uniform chrome for every doll cell — no painted-panel margins that inflate rows.
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(EQUIP_SLOT_BORDER)
	s.set_corner_radius_all(_equip_radius())
	s.content_margin_left = EQUIP_SLOT_PAD
	s.content_margin_right = EQUIP_SLOT_PAD
	s.content_margin_top = EQUIP_SLOT_PAD
	s.content_margin_bottom = EQUIP_SLOT_PAD
	return s


func _equip_cell_size() -> Vector2:
	return Vector2(_equip_slot_size, _equip_slot_size)


func _equip_scale() -> float:
	return _equip_slot_size / EQUIP_SLOT_SIZE_MIN


func _equip_radius() -> int:
	return clampi(int(round(float(EQUIP_SLOT_RADIUS) * _equip_scale())), EQUIP_SLOT_RADIUS, 16)


func _equip_icon_size() -> float:
	var chrome := float(EQUIP_SLOT_BORDER * 2 + EQUIP_SLOT_PAD * 2)
	var inner := _equip_slot_size - chrome
	var label_h := float(_equip_label_fs() + 4)
	var name_h := float(_equip_name_fs() + 4)
	return maxf(EQUIP_ICON_SZ, floorf(inner - label_h - name_h - 4.0))


func _equip_label_fs() -> int:
	return clampi(int(round(float(EQUIP_LABEL_FS) * _equip_scale())), EQUIP_LABEL_FS, 16)


func _equip_name_fs() -> int:
	return clampi(int(round(float(EQUIP_NAME_FS) * _equip_scale())), EQUIP_NAME_FS, 18)


func _portrait_draw_size() -> float:
	## Content box inside borders + pad, then fill most of it (badge overlays corner).
	var chrome := float(EQUIP_SLOT_BORDER * 2 + EQUIP_SLOT_PAD * 2)
	var inner := _equip_slot_size - chrome
	return maxf(64.0, floorf(inner * PORTRAIT_FILL))


func _on_doll_wrap_resized() -> void:
	if _doll_layout_lock or not _sheet_ready:
		return
	_sync_doll_scale()


func _sync_doll_scale() -> void:
	if _doll_layout_lock or _doll_scale_busy or _doll_wrap == null or not is_instance_valid(_doll_wrap):
		return
	var next := _compute_equip_slot_size()
	if absf(next - _equip_slot_size) < 2.0:
		return
	_doll_scale_busy = true
	_equip_slot_size = next
	if _doll != null and is_instance_valid(_doll) and _doll.get_child_count() > 0:
		_rebuild_doll()
	_doll_scale_busy = false


func _compute_equip_slot_size() -> float:
	if _doll_wrap == null or not is_instance_valid(_doll_wrap):
		return EQUIP_SLOT_SIZE_MIN
	var avail := _doll_wrap.size
	if avail.x < 32.0 or avail.y < 32.0:
		return maxf(EQUIP_SLOT_SIZE_MIN, _equip_slot_size)
	var sep := float(EQUIP_GRID_SEP)
	var max_w := (avail.x - EQUIP_GRID_INSET * 2.0 - sep * 2.0) / 3.0
	var max_h := (avail.y - EQUIP_GRID_INSET * 2.0 - sep * 2.0) / 3.0
	return maxf(EQUIP_SLOT_SIZE_MIN, floorf(minf(max_w, max_h)))


func _rebuild_doll() -> void:
	_hide_bag_inspect()
	_slot_panels.clear()
	_clear_slot_highlights()
	_clear_container_children(_doll)
	if not _doll_scale_busy:
		var fitted := _compute_equip_slot_size()
		if absf(fitted - _equip_slot_size) >= 2.0:
			_equip_slot_size = fitted
	var ch: Dictionary = GameManager.active_character
	var items: Array = StatsManager.all_items
	var cell := _equip_cell_size()
	var badge_sz := clampf(roundf(26.0 * _equip_scale()), 26.0, 40.0)
	var badge_fs := clampi(int(round(12.0 * _equip_scale())), 12, 16)
	for slot in FRAME_SLOTS:
		var stype := str(slot.get("type", ""))
		if stype == "_portrait":
			# Center cell: large avatar + corner level badge. Outer size matches equip tiles.
			var wrap := PanelContainer.new()
			wrap.custom_minimum_size = cell
			wrap.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			wrap.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			wrap.clip_contents = true
			wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
			wrap.add_theme_stylebox_override(
				"panel",
				_equip_frame_style(Color(0.07, 0.09, 0.14, 1.0), Color(ClientUi.CYAN, 0.85))
			)
			var host := Control.new()
			host.mouse_filter = Control.MOUSE_FILTER_IGNORE
			host.custom_minimum_size = Vector2.ZERO
			host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			host.size_flags_vertical = Control.SIZE_EXPAND_FILL
			wrap.add_child(host)

			var center := CenterContainer.new()
			center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			center.mouse_filter = Control.MOUSE_FILTER_IGNORE
			host.add_child(center)
			var portrait_sz := _portrait_draw_size()
			var portrait := AvatarRenderer.make_portrait(ch, portrait_sz)
			portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
			portrait.custom_minimum_size = Vector2(portrait_sz, portrait_sz)
			if portrait.has_method("set_active"):
				portrait.call("set_active", true)
			center.add_child(portrait)

			# Small level badge — corner only, never replaces the portrait.
			var badge := PanelContainer.new()
			badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
			badge.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
			badge.anchor_left = 1.0
			badge.anchor_top = 1.0
			badge.anchor_right = 1.0
			badge.anchor_bottom = 1.0
			badge.offset_left = -(badge_sz + 2.0)
			badge.offset_top = -(badge_sz + 2.0)
			badge.offset_right = -2.0
			badge.offset_bottom = -2.0
			badge.grow_horizontal = Control.GROW_DIRECTION_BEGIN
			badge.grow_vertical = Control.GROW_DIRECTION_BEGIN
			var bsb := StyleBoxFlat.new()
			bsb.bg_color = ClientUi.CYAN
			bsb.set_corner_radius_all(10)
			bsb.set_border_width_all(2)
			bsb.border_color = ClientUi.VOID
			bsb.content_margin_left = 4
			bsb.content_margin_right = 4
			bsb.content_margin_top = 2
			bsb.content_margin_bottom = 2
			badge.add_theme_stylebox_override("panel", bsb)
			var lvl := Label.new()
			lvl.text = ClientUi.format_level(ch.get("level", 1))
			lvl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			lvl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			lvl.mouse_filter = Control.MOUSE_FILTER_IGNORE
			lvl.add_theme_font_size_override("font_size", badge_fs)
			lvl.add_theme_color_override("font_color", ClientUi.VOID)
			ClientUi.apply_display_font(lvl)
			badge.add_child(lvl)
			host.add_child(badge)
			_doll.add_child(wrap)
			continue
		var worn := InventoryRules.find_equipped_of_type(items, stype)
		var chip := _make_slot_chip(stype, str(slot.get("label", stype)), worn)
		TutorialManager.tag_target(chip, "hero-doll")
		_slot_panels[stype] = chip
		_doll.add_child(chip)


func _make_slot_chip(slot_type: String, label: String, worn: Dictionary) -> PanelContainer:
	var filled := not worn.is_empty()
	var item_id := str(worn.get("id", "")) if filled else ""
	var panel := PanelContainer.new()
	panel.custom_minimum_size = _equip_cell_size()
	panel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	panel.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	panel.clip_contents = true
	panel.tooltip_text = (
		"%s — drag to bag to unequip · double-click to unequip" % str(worn.get("name", "Item"))
		if filled
		else "%s — drop matching gear here" % label
	)
	if filled:
		panel.tooltip_text = ""
	var rarity_tint := ClientUi.rarity_color(str(worn.get("rarity", ""))) if filled else Color(0.3, 0.35, 0.45)
	panel.add_theme_stylebox_override("panel", _equip_frame_style(
		Color(0.09, 0.12, 0.18, 1.0) if filled else Color(0.06, 0.07, 0.1, 1.0),
		Color(rarity_tint, 0.9) if filled else Color(rarity_tint, 0.55)
	))
	ClientUi.apply_interaction_motion(panel, 1.02 if filled else 1.008)
	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 2)
	panel.add_child(col)

	var eye := Label.new()
	eye.mouse_filter = Control.MOUSE_FILTER_IGNORE
	eye.text = label.to_upper()
	eye.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	eye.autowrap_mode = TextServer.AUTOWRAP_OFF
	eye.clip_text = true
	eye.custom_minimum_size.y = float(_equip_label_fs() + 3)
	eye.add_theme_font_size_override("font_size", _equip_label_fs())
	eye.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(eye)
	col.add_child(eye)

	var icon_wrap := CenterContainer.new()
	icon_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	icon_wrap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var icon_sz := _equip_icon_size()
	icon_wrap.custom_minimum_size = Vector2(icon_sz, icon_sz)
	col.add_child(icon_wrap)
	if filled:
		var gear := GearIcon.make(worn, icon_sz)
		gear.custom_minimum_size = Vector2(icon_sz, icon_sz)
		icon_wrap.add_child(gear)
	else:
		var empty_mark := Label.new()
		empty_mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		empty_mark.text = "·"
		empty_mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty_mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		empty_mark.add_theme_font_size_override("font_size", clampi(int(round(18.0 * _equip_scale())), 18, 28))
		empty_mark.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.55))
		icon_wrap.add_child(empty_mark)

	var name := Label.new()
	name.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name.autowrap_mode = TextServer.AUTOWRAP_OFF
	name.clip_text = true
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name.custom_minimum_size.y = float(_equip_name_fs() + 4)
	name.text = str(worn.get("name", "—")) if filled else "empty"
	name.add_theme_font_size_override("font_size", _equip_name_fs())
	name.add_theme_color_override("font_color", rarity_tint.lightened(0.15) if filled else ClientUi.MUTED)
	ClientUi.apply_body_font(name)
	col.add_child(name)

	panel.set_drag_forwarding(
		func(_at: Vector2) -> Variant:
			return _make_item_drag(panel, worn, "equip") if filled else null,
		func(_at: Vector2, data: Variant) -> bool:
			return _can_drop_on_equip_slot(slot_type, data),
		func(_at: Vector2, data: Variant) -> void:
			_drop_on_equip_slot(slot_type, data)
	)
	if filled and not item_id.is_empty():
		var captured := worn.duplicate(true)
		panel.mouse_entered.connect(func() -> void:
			_show_bag_inspect(panel, captured, true)
		)
		panel.mouse_exited.connect(_request_hide_inspect)
		panel.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton:
				var mb := ev as InputEventMouseButton
				if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT and mb.double_click:
					_hide_bag_inspect()
					_on_unequip(item_id)
					panel.accept_event()
		)
	return panel


func _update_backpack() -> void:
	_hide_bag_inspect()
	_clear_container_children(_bag_grid)
	var bag: Array = []
	for item in StatsManager.all_items:
		if typeof(item) == TYPE_DICTIONARY and not bool(item.get("is_equipped", false)):
			bag.append(item)
	var cap := mini(10, InventoryRules.bag_cap(GameManager.active_character))
	_bag_count.text = "%s/%s" % [bag.size(), cap]
	_bag_count.add_theme_color_override(
		"font_color",
		ClientUi.WARNING if bag.size() >= cap else ClientUi.MUTED
	)
	var rows_n := maxi(1, int(ceil(float(cap) / float(BAG_COLS))))
	var avail_h := _bag_grid.size.y
	if avail_h < 8.0 and is_instance_valid(_backpack):
		avail_h = maxf(0.0, _backpack.size.y - 48.0)
	var sep := 6.0 * float(maxi(0, rows_n - 1))
	# Taller clamp so top-centered multi-line names + centered icons fit.
	_bag_slot_min_h = clampf((avail_h - sep) / float(rows_n), 56.0, 112.0)
	var row: HBoxContainer = null
	for i in range(cap):
		if i % BAG_COLS == 0:
			row = HBoxContainer.new()
			row.size_flags_vertical = Control.SIZE_EXPAND_FILL
			row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_theme_constant_override("separation", 6)
			_bag_grid.add_child(row)
		var item: Dictionary = bag[i] if i < bag.size() else {}
		row.add_child(_make_bag_slot(item))
	if not _bag_grid.resized.is_connected(_on_bag_grid_resized):
		_bag_grid.resized.connect(_on_bag_grid_resized)


func _on_bag_grid_resized() -> void:
	if _busy or not _sheet_ready or _doll_layout_lock:
		return
	var rows_n := maxi(1, _bag_grid.get_child_count())
	var avail_h := _bag_grid.size.y
	var sep := 6.0 * float(maxi(0, rows_n - 1))
	var next_h := clampf((avail_h - sep) / float(rows_n), 56.0, 112.0)
	if absf(next_h - _bag_slot_min_h) < 2.0:
		return
	_bag_slot_min_h = next_h
	for row_n in _bag_grid.get_children():
		if row_n is HBoxContainer:
			for slot in row_n.get_children():
				if slot is Control:
					(slot as Control).custom_minimum_size.y = _bag_slot_min_h


## Backpack cell: name top, gear icon centered in middle band (~60% of that band), attrs bottom.
func _make_bag_slot(item: Dictionary) -> PanelContainer:
	var filled := not item.is_empty()
	var item_id := str(item.get("id", "")) if filled else ""
	var item_type := str(item.get("type", "")) if filled else ""
	var can_equip := filled and InventoryRules.is_equippable(item_type) and not item_id.is_empty()
	var can_use := filled and InventoryRules.is_consumable(item) and not item_id.is_empty()
	var can_drag := can_equip or can_use
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(0, _bag_slot_min_h)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	if filled:
		var tint := ClientUi.rarity_color(str(item.get("rarity", "")))
		panel.add_theme_stylebox_override(
			"panel",
			_bag_slot_style(Color(tint, 0.12), Color(tint, 0.6))
		)
		panel.tooltip_text = ""
	else:
		panel.add_theme_stylebox_override(
			"panel",
			_bag_slot_style(Color(0.05, 0.06, 0.09, 0.7), Color(0.3, 0.35, 0.42, 0.35))
		)
		panel.tooltip_text = "Empty bag slot — drop equipped gear here to unequip"
		panel.modulate.a = 0.55

	var root := Control.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.add_child(root)

	var col := VBoxContainer.new()
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.add_theme_constant_override("separation", 2)
	root.add_child(col)

	if filled:
		var rarity_tint := ClientUi.rarity_color(str(item.get("rarity", "")))
		var name_h := clampf(_bag_slot_min_h * 0.26, 20.0, 30.0)

		var name_band := Control.new()
		name_band.mouse_filter = Control.MOUSE_FILTER_IGNORE
		name_band.custom_minimum_size = Vector2(0, name_h)
		name_band.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name_band.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		col.add_child(name_band)

		var title := Label.new()
		title.mouse_filter = Control.MOUSE_FILTER_IGNORE
		title.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		title.offset_left = 1
		title.offset_right = -1
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		title.vertical_alignment = VERTICAL_ALIGNMENT_TOP
		title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		title.max_lines_visible = 2
		title.clip_text = true
		title.text = str(item.get("name", "Item"))
		var name_fs := int(round(clampf(name_h * 0.58, 11.0, 16.0)))
		title.add_theme_font_size_override("font_size", name_fs)
		title.add_theme_color_override("font_color", rarity_tint.lightened(0.2))
		title.add_theme_constant_override("line_spacing", -2)
		ClientUi.apply_display_font(title)
		name_band.add_child(title)

		var icon_wrap := CenterContainer.new()
		icon_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
		icon_wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		icon_wrap.size_flags_vertical = Control.SIZE_EXPAND_FILL
		col.add_child(icon_wrap)
		var gear := GearIcon.make(item, 8.0)
		icon_wrap.add_child(gear)
		_bind_bag_gear_icon_size(icon_wrap, gear)

		var stats_raw: Variant = item.get("stats", {})
		if typeof(stats_raw) == TYPE_DICTIONARY:
			var entries := _bag_attr_entries(stats_raw as Dictionary)
			if not entries.is_empty():
				col.add_child(_make_bag_attr_band(entries))

	else:
		var mark := Label.new()
		mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		mark.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		mark.size_flags_vertical = Control.SIZE_EXPAND_FILL
		mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		mark.text = "·"
		mark.add_theme_font_size_override("font_size", 19)
		mark.add_theme_color_override("font_color", ClientUi.MUTED)
		col.add_child(mark)

	panel.set_drag_forwarding(
		func(_at: Vector2) -> Variant:
			return _make_item_drag(panel, item, "bag") if can_drag else null,
		func(_at: Vector2, data: Variant) -> bool:
			return _can_drop_on_bag(data),
		func(_at: Vector2, data: Variant) -> void:
			_drop_on_bag(data)
	)

	if filled and (can_equip or can_use or not item_id.is_empty()):
		var captured := item.duplicate(true)
		var captured_id := item_id
		var captured_name := str(item.get("name", "Stim"))
		panel.mouse_entered.connect(func() -> void:
			_show_bag_inspect(panel, captured)
		)
		panel.mouse_exited.connect(_request_hide_inspect)
		panel.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and ev.pressed and ev.double_click \
					and ev.button_index == MOUSE_BUTTON_LEFT:
				_hide_bag_inspect()
				if can_use:
					_on_use_stim(captured_id, captured_name)
				elif can_equip:
					_on_equip(captured_id)
		)
	return panel


func _bind_bag_gear_icon_size(wrap: Control, icon: Control) -> void:
	var sync := func() -> void:
		_sync_bag_gear_icon_size(wrap, icon)
	wrap.resized.connect(sync)
	sync.call_deferred()


func _sync_bag_gear_icon_size(wrap: Control, icon: Control) -> void:
	if not is_instance_valid(wrap) or not is_instance_valid(icon):
		return
	var side := minf(wrap.size.x, wrap.size.y) * BAG_GEAR_ICON_FILL
	if side < 4.0:
		return
	icon.custom_minimum_size = Vector2(side, side)


## Positive bag stats in display order, capped at 5.
func _bag_attr_entries(stats_raw: Dictionary) -> Array:
	var entries: Array = []
	for k in ["strength", "agility", "intellect", "vitality", "luck"]:
		var v := int(stats_raw.get(k, 0))
		if v <= 0:
			continue
		entries.append({"k": k, "v": v})
		if entries.size() >= 5:
			break
	return entries


## Bottom-anchored attr stack: 1–2 single row; else top = n - ceil(n/2), bottom = ceil(n/2).
func _make_bag_attr_band(entries: Array) -> Control:
	var band := VBoxContainer.new()
	band.mouse_filter = Control.MOUSE_FILTER_IGNORE
	band.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	band.size_flags_vertical = Control.SIZE_SHRINK_END
	band.alignment = BoxContainer.ALIGNMENT_CENTER
	band.add_theme_constant_override("separation", 2)
	var n := entries.size()
	var top_n := 0
	var bot_n := n
	if n > 2:
		bot_n = int(ceil(float(n) / 2.0))
		top_n = n - bot_n
	if top_n > 0:
		band.add_child(_make_bag_attr_row(entries.slice(0, top_n)))
	band.add_child(_make_bag_attr_row(entries.slice(top_n, n)))
	return band


func _make_bag_attr_row(entries: Array) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 4)
	for e in entries:
		var k := str(e.get("k", ""))
		var v := int(e.get("v", 0))
		row.add_child(StatIcon.make_labeled(
			k,
			str(v),
			StatIcon.SIZE_ITEM_PANE,
			20,
			GameData.stat_color(k),
			4
		))
	return row


func _bag_slot_style(bg: Color, border: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 4
	sb.content_margin_right = 4
	sb.content_margin_top = 3
	sb.content_margin_bottom = 3
	return sb


func _request_hide_inspect() -> void:
	if _inspect != null and is_instance_valid(_inspect):
		_inspect.request_hide()


func _hide_bag_inspect() -> void:
	if _inspect != null and is_instance_valid(_inspect):
		_inspect.force_hide()


func _show_bag_inspect(anchor: Control, item: Dictionary, equipped_preview := false) -> void:
	if _inspect == null or not is_instance_valid(_inspect):
		return
	var item_type := str(item.get("type", ""))
	var item_id := str(item.get("id", ""))
	var worn := {}
	if not equipped_preview and InventoryRules.is_equippable(item_type):
		worn = InventoryRules.find_equipped_of_type(StatsManager.all_items, item_type)
	var actions: Array = []
	if not equipped_preview and not item_id.is_empty():
		if InventoryRules.is_consumable(item):
			actions.append({"id": "use", "label": "Use"})
		elif InventoryRules.is_equippable(item_type):
			actions.append({"id": "equip", "label": "Swap" if not worn.is_empty() else "Equip"})
	_inspect.present(anchor, item, {
		"equipped_preview": equipped_preview,
		"compare_with": worn,
		"show_sell_value": not equipped_preview and not InventoryRules.is_consumable(item),
		"actions": actions,
	})


func _on_inspect_action(action_id: String, item: Dictionary) -> void:
	var item_id := str(item.get("id", ""))
	_hide_bag_inspect()
	if action_id == "use":
		_on_use_stim(item_id, str(item.get("name", "Stim")))
	elif action_id == "equip":
		_on_equip(item_id)


func _on_use_stim(item_id: String, item_name: String) -> void:
	if _busy or item_id.is_empty():
		return
	_busy = true
	_set_action_status("Using %s…" % item_name)
	print("[Hero] use_consumable id=%s via=AuthManager.Node" % item_id.substr(0, mini(8, item_id.length())))
	var res: Dictionary = await AuthManager.use_consumable(item_id)
	_busy = false
	if not res.ok:
		if not Notify.from_result(res):
			_set_action_status(str(res.get("error", "Use failed")), true)
		return
	_set_action_status("Used %s." % item_name)
	AudioManager.play_ui("stim")
	await StatsManager.refresh()
	_refresh_after_inventory_change(false)


func _set_action_status(text: String, danger: bool = false) -> void:
	if not is_instance_valid(_status):
		return
	_status.text = text
	_status.visible = not text.is_empty()
	_status.add_theme_color_override(
		"font_color",
		ClientUi.DANGER if danger else ClientUi.MUTED
	)


func _make_item_drag(host: Control, item: Dictionary, from: String) -> Variant:
	if item.is_empty() or host == null:
		return null
	var item_id := str(item.get("id", ""))
	if item_id.is_empty():
		return null
	host.set_drag_preview(GearIcon.make(item, 40.0))
	return {
		"item_id": item_id,
		"from": from,
		"type": str(item.get("type", "")),
		"consumable": InventoryRules.is_consumable(item),
	}


func _doll_drag_get(_at: Vector2) -> Variant:
	return null


func _doll_drag_can_drop(_at: Vector2, data: Variant) -> bool:
	var ok := _can_drop_on_hero_display(data)
	_highlight_drop_target(data if ok else {})
	return ok


func _doll_drag_drop(_at: Vector2, data: Variant) -> void:
	_clear_slot_highlights()
	_drop_on_hero_display(data)


func _can_drop_on_hero_display(data: Variant) -> bool:
	if typeof(data) != TYPE_DICTIONARY:
		return false
	if str(data.get("from", "")) != "bag":
		return false
	if bool(data.get("consumable", false)):
		return true
	var item_type := str(data.get("type", ""))
	return InventoryRules.is_equippable(item_type)


func _drop_on_hero_display(data: Variant) -> void:
	if not _can_drop_on_hero_display(data):
		Notify.blocked("Can't use that here", "That item can't go on your operative")
		return
	var item_id := str(data.get("item_id", ""))
	if item_id.is_empty():
		return
	if bool(data.get("consumable", false)):
		var item_name := "Stim"
		for it in StatsManager.all_items:
			if typeof(it) == TYPE_DICTIONARY and str(it.get("id", "")) == item_id:
				item_name = str(it.get("name", "Stim"))
				break
		_on_use_stim(item_id, item_name)
		return
	_on_equip(item_id)


func _highlight_drop_target(data: Variant) -> void:
	_clear_slot_highlights()
	if typeof(data) != TYPE_DICTIONARY:
		return
	if bool(data.get("consumable", false)):
		if _doll_wrap != null and is_instance_valid(_doll_wrap):
			_doll_wrap.modulate = Color(1.15, 1.2, 1.05, 1.0)
		return
	var item_type := str(data.get("type", ""))
	if _slot_panels.has(item_type):
		var panel: PanelContainer = _slot_panels[item_type]
		if is_instance_valid(panel):
			panel.modulate = Color(1.25, 1.3, 1.1, 1.0)


func _clear_slot_highlights() -> void:
	if _doll_wrap != null and is_instance_valid(_doll_wrap):
		_doll_wrap.modulate = Color.WHITE
	for k in _slot_panels.keys():
		var panel: PanelContainer = _slot_panels[k]
		if is_instance_valid(panel):
			panel.modulate = Color.WHITE


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
	if bool(data.get("consumable", false)):
		return false
	return str(data.get("type", "")) == slot_type


func _drop_on_equip_slot(slot_type: String, data: Variant) -> void:
	_clear_slot_highlights()
	if not _can_drop_on_equip_slot(slot_type, data):
		return
	var item_id := str(data.get("item_id", ""))
	if not item_id.is_empty():
		_on_equip(item_id)


func _on_equip(item_id: String) -> void:
	if _busy or item_id.is_empty():
		return
	_busy = true
	_set_action_status("Equipping…")
	print("[Hero] equip_item id=%s via=AuthManager.Node" % item_id.substr(0, mini(8, item_id.length())))
	var res: Dictionary = await AuthManager.equip_item(item_id)
	_busy = false
	if not res.ok:
		if not Notify.from_result(res):
			_set_action_status(str(res.get("error", "Equip failed")), true)
		return
	_set_action_status("Equipped.")
	AudioManager.play_ui("equip")
	await StatsManager.refresh()
	_refresh_after_inventory_change(true)


func _on_unequip(item_id: String) -> void:
	if _busy or item_id.is_empty():
		return
	_busy = true
	_set_action_status("Unequipping…")
	print("[Hero] unequip_item id=%s via=AuthManager.Node" % item_id.substr(0, mini(8, item_id.length())))
	var res: Dictionary = await AuthManager.unequip_item(item_id)
	_busy = false
	if not res.ok:
		var err := str(res.get("error", "Unequip failed"))
		if err.to_lower().contains("inventory full"):
			Notify.blocked("Bag full", "Free a bag slot before unequipping")
			await InventoryManager.prompt_bag_pressure(self, "Free a bag slot before unequipping.")
			await StatsManager.refresh()
			_refresh_after_inventory_change(true)
		elif not Notify.from_result(res):
			_set_action_status(err, true)
		return
	_set_action_status("Unequipped.")
	await StatsManager.refresh()
	_refresh_after_inventory_change(true)


func _make_vault_teaser(c: Dictionary) -> PanelContainer:
	## Compact CollectiblesLog teaser — web COSMIC VAULT card.
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.12, 0.97), Color("#A855F7", 0.5), 12, 2
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	panel.add_child(col)

	var head := Label.new()
	head.text = "COSMIC VAULT"
	head.add_theme_font_size_override("font_size", 16)
	head.add_theme_color_override("font_color", Color("#E9D5FF"))
	ClientUi.apply_display_font(head)
	col.add_child(head)

	var pct := MissionBoard.collection_percentage(c)
	var species_n := CollectiblesCatalog.owned_ids(c.get("discovered_species", [])).size()
	var arts_n := CollectiblesCatalog.owned_ids(c.get("collected_artifacts", [])).size()
	var relics_n := CollectiblesCatalog.owned_ids(c.get("collected_relics", [])).size()
	var badges := CollectiblesCatalog.badge_count(c)
	var gear_n := CollectiblesCatalog.discovered_gear_ids(c).size()
	var unlocked: Variant = c.get("unlocked_achievements", [])
	var ach_n := 0
	if typeof(unlocked) == TYPE_ARRAY:
		ach_n = (unlocked as Array).size()
	# Approximate totals matching CollectiblesLog tab denominators.
	const SPECIES_TOTAL := 30
	const BADGES_TOTAL := 10
	const ARTS_TOTAL := 100
	const RELICS_TOTAL := 500
	const GEAR_TOTAL := 200
	const ACH_TOTAL := 40
	var discovered := int(species_n + arts_n + relics_n + gear_n + badges + ach_n)
	var total := SPECIES_TOTAL + BADGES_TOTAL + ARTS_TOTAL + RELICS_TOTAL + GEAR_TOTAL + ACH_TOTAL

	var total_box := PanelContainer.new()
	total_box.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(ClientUi.CYAN, 0.08), Color(ClientUi.CYAN, 0.35), 8, 1
	))
	col.add_child(total_box)
	var total_col := VBoxContainer.new()
	total_col.add_theme_constant_override("separation", 4)
	total_box.add_child(total_col)
	var tot_row := HBoxContainer.new()
	total_col.add_child(tot_row)
	var tot_lab := Label.new()
	tot_lab.text = "TOTAL COLLECTION"
	tot_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tot_lab.add_theme_font_size_override("font_size", 13)
	tot_lab.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_display_font(tot_lab)
	tot_row.add_child(tot_lab)
	var tot_val := Label.new()
	tot_val.text = "%s/%s · %s%%" % [discovered, total, int(round(pct))]
	tot_val.add_theme_font_size_override("font_size", 13)
	tot_val.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_display_font(tot_val)
	tot_row.add_child(tot_val)
	var bar := ProgressBar.new()
	bar.min_value = 0
	bar.max_value = 100
	bar.value = pct
	bar.show_percentage = false
	bar.custom_minimum_size.y = 8
	ClientUi.apply_hp_bar(bar, ClientUi.CYAN)
	total_col.add_child(bar)
	var xp_bonus := Label.new()
	xp_bonus.text = "✨ XP Bonus: +%s%% from all sources" % int(round(pct))
	xp_bonus.add_theme_font_size_override("font_size", 13)
	xp_bonus.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(xp_bonus)
	total_col.add_child(xp_bonus)

	var chips := HFlowContainer.new()
	chips.add_theme_constant_override("h_separation", 4)
	chips.add_theme_constant_override("v_separation", 4)
	col.add_child(chips)
	for chip in [
		["Species", "%s/%s" % [species_n, SPECIES_TOTAL]],
		["Badges", "%s/%s" % [badges, BADGES_TOTAL]],
		["Artifacts", "%s/%s" % [arts_n, ARTS_TOTAL]],
		["Relics", "%s/%s" % [relics_n, RELICS_TOTAL]],
		["Gear", "%s/%s" % [gear_n, GEAR_TOTAL]],
		["Achievements", "%s/%s" % [ach_n, ACH_TOTAL]],
	]:
		var chip_lab := Label.new()
		chip_lab.text = "%s %s" % [chip[0], chip[1]]
		chip_lab.add_theme_font_size_override("font_size", 12)
		chip_lab.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(chip_lab)
		var chip_panel := PanelContainer.new()
		chip_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.06, 0.07, 0.1, 0.8), Color(1, 1, 1, 0.12), 6, 1
		))
		chip_panel.add_child(chip_lab)
		chips.add_child(chip_panel)

	var open := Button.new()
	open.text = "Tap to view full log →"
	ClientUi.apply_ghost_button(open)
	open.pressed.connect(func() -> void: GameManager.go_collectibles())
	TutorialManager.tag_target(open, "hero-vault")
	col.add_child(open)
	return panel


func _make_stat_row(stat: String, primary: String) -> PanelContainer:
	var is_primary := stat == primary
	var accent: Color = GameData.STAT_COLORS.get(stat, ClientUi.CYAN)

	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(accent, 0.08),
		Color(accent, 0.55) if is_primary else Color(1, 1, 1, 0.1),
		10,
		2 if is_primary else 1
	))
	panel.tooltip_text = StatsRules.attribute_tooltip(
		stat, GameManager.active_character, StatsManager.equipped_items
	)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.custom_minimum_size.y = 76
	panel.add_child(row)

	var icon := StatIcon.make(stat, StatIcon.SIZE_HERO_BUTTON)
	row.add_child(icon)

	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 2)
	row.add_child(col)

	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", 6)
	col.add_child(title_row)
	var title := Label.new()
	title.text = str(StatsRules.ATTR_LABELS.get(stat, stat.capitalize()))
	title.add_theme_font_size_override("font_size", 19)
	title.add_theme_color_override("font_color", accent.lightened(0.2))
	ClientUi.apply_display_font(title)
	title_row.add_child(title)
	if is_primary:
		var badge := Label.new()
		badge.text = "Primary"
		badge.add_theme_font_size_override("font_size", 12)
		badge.add_theme_color_override("font_color", Color("#FDE68A"))
		ClientUi.apply_display_font(badge)
		title_row.add_child(badge)

	var val_row := HBoxContainer.new()
	val_row.add_theme_constant_override("separation", 6)
	col.add_child(val_row)
	var value_lab := Label.new()
	value_lab.text = "0"
	value_lab.add_theme_font_size_override("font_size", 32)
	value_lab.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(value_lab)
	val_row.add_child(value_lab)
	var bonus_lab := Label.new()
	bonus_lab.add_theme_font_size_override("font_size", 18)
	bonus_lab.add_theme_color_override("font_color", ClientUi.SUCCESS)
	ClientUi.apply_display_font(bonus_lab)
	bonus_lab.visible = false
	val_row.add_child(bonus_lab)

	var buy := Button.new()
	buy.custom_minimum_size = Vector2(117, 53)
	ClientUi.apply_primary_button(buy)
	buy.add_theme_font_size_override("font_size", 17)
	buy.button_down.connect(func() -> void: _start_upgrade_hold(stat))
	buy.button_up.connect(func() -> void: _stop_upgrade_hold(true))
	TutorialManager.tag_target(buy, "hero-attr-buy")
	row.add_child(buy)

	_stat_rows[stat] = {"panel": panel, "value": value_lab, "bonus": bonus_lab, "buy": buy}
	return panel


func _make_combat_card() -> VBoxContainer:
	## Embedded DerivedStatsPanel — Offensive / Defensive (no POWER tile).
	## Tiles expand to fill the combat band so attrs pane has no deadspace.
	var root := VBoxContainer.new()
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 6)

	var head := HBoxContainer.new()
	head.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	root.add_child(head)
	var h2 := Label.new()
	h2.text = "⚔  COMBAT"
	h2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h2.add_theme_font_size_override("font_size", 15)
	h2.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(h2)
	head.add_child(h2)
	_combat_stim = Label.new()
	_combat_stim.text = "⚗ Stim"
	_combat_stim.visible = false
	_combat_stim.add_theme_font_size_override("font_size", 12)
	_combat_stim.add_theme_color_override("font_color", ClientUi.VIOLET)
	ClientUi.apply_display_font(_combat_stim)
	head.add_child(_combat_stim)
	_combat_via = Label.new()
	_combat_via.add_theme_font_size_override("font_size", 12)
	_combat_via.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_combat_via)
	head.add_child(_combat_via)

	var off_lab := Label.new()
	off_lab.text = "OFFENSIVE"
	off_lab.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	off_lab.add_theme_font_size_override("font_size", 13)
	off_lab.add_theme_color_override("font_color", Color("#F59E0B"))
	ClientUi.apply_display_font(off_lab)
	root.add_child(off_lab)
	var off_row := HBoxContainer.new()
	off_row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	off_row.size_flags_stretch_ratio = 1.0
	off_row.add_theme_constant_override("separation", 6)
	root.add_child(off_row)
	off_row.add_child(_combat_tile("Damage", Color("#F59E0B")))
	off_row.add_child(_combat_tile("Crit Chance", Color("#FBBF24")))

	var def_lab := Label.new()
	def_lab.text = "DEFENSIVE"
	def_lab.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	def_lab.add_theme_font_size_override("font_size", 13)
	def_lab.add_theme_color_override("font_color", Color("#A78BFA"))
	ClientUi.apply_display_font(def_lab)
	root.add_child(def_lab)
	# Two expand rows (not GridContainer) so tiles fill leftover combat height.
	var def_col := VBoxContainer.new()
	def_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	def_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	def_col.size_flags_stretch_ratio = 2.0
	def_col.add_theme_constant_override("separation", 6)
	root.add_child(def_col)
	var def_row_a := HBoxContainer.new()
	def_row_a.size_flags_vertical = Control.SIZE_EXPAND_FILL
	def_row_a.add_theme_constant_override("separation", 6)
	def_col.add_child(def_row_a)
	def_row_a.add_child(_combat_tile("Max Health", Color("#FB7185")))
	def_row_a.add_child(_combat_tile("Dodge Chance", Color("#34D399")))
	var def_row_b := HBoxContainer.new()
	def_row_b.size_flags_vertical = Control.SIZE_EXPAND_FILL
	def_row_b.add_theme_constant_override("separation", 6)
	def_col.add_child(def_row_b)
	def_row_b.add_child(_combat_tile(ARMOR_STAT_LABEL, Color("#A78BFA")))
	def_row_b.add_child(_combat_tile("Tech Resist", Color("#38BDF8")))
	return root


func _update_combat(derived: Dictionary, permanent: Dictionary, display: Dictionary) -> void:
	var mult := float(derived.get("critMult", StatsRules.CRIT_MULT))
	var values := {
		"Damage": str(derived.get("damage", 0)),
		"Crit Chance": "%s%% · %s×" % [_fmt_pct(float(derived.get("critChance", 0))), mult],
		"Max Health": str(derived.get("health", 0)),
		"Dodge Chance": "%s%%" % _fmt_pct(float(derived.get("dodgeChance", 0))),
		ARMOR_STAT_LABEL: "%s%%" % _fmt_pct(float(derived.get("armor", 0))),
		"Tech Resist": "%s%%" % _fmt_pct(float(derived.get("techResist", 0))),
	}
	for key in values:
		if _combat_values.has(key):
			(_combat_values[key] as Label).text = str(values[key])

	if _combat_via:
		_combat_via.text = "via %s" % str(derived.get("primaryStat", ""))
	if _combat_stim:
		var buffs: Array = StatsRules.active_buffs(GameManager.active_character)
		_combat_stim.visible = not buffs.is_empty()
	# silence unused if callers pass permanent/display for future stim deltas
	var _p := permanent
	var _d := display


func _combat_tile(label: String, color: Color) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(0, 0)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(color, 0.1), Color(1, 1, 1, 0.1), 8, 1
	))
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 4)
	panel.add_child(col)
	var l := Label.new()
	l.text = label.to_upper()
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.add_theme_font_size_override("font_size", 15)
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(l)
	col.add_child(l)
	var v := Label.new()
	v.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_theme_font_size_override("font_size", 28)
	v.add_theme_color_override("font_color", color)
	ClientUi.apply_display_font(v)
	col.add_child(v)
	_combat_values[label] = v
	return panel


func _fmt_pct(v: float) -> String:
	return "%.1f" % v


func _clear_container_children(host: Node) -> void:
	if host == null or not is_instance_valid(host):
		return
	while host.get_child_count() > 0:
		var child := host.get_child(host.get_child_count() - 1)
		host.remove_child(child)
		child.queue_free()


func _refresh_after_inventory_change(rebuild_loadout: bool) -> void:
	if not is_inside_tree() or not is_instance_valid(self):
		return
	_doll_layout_lock = true
	_update_hero()
	_update_backpack()
	if rebuild_loadout:
		_rebuild_doll()
	if _sheet_ready:
		_refresh_values()
	_doll_layout_lock = false
	call_deferred("_sync_doll_scale")


func _fmt_int(n: int) -> String:
	var s := str(n)
	var out := ""
	var count := 0
	for i in range(s.length() - 1, -1, -1):
		if count > 0 and count % 3 == 0:
			out = "," + out
		out = s[i] + out
		count += 1
	return out


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		_stop_upgrade_hold(true)


func _on_window_focus_out() -> void:
	_stop_upgrade_hold(true)


func _process(_delta: float) -> void:
	if _inspect != null and is_instance_valid(_inspect) and _inspect.visible \
			and not _inspect.is_pointer_over_zone():
		_inspect.request_hide()
	if _hold == null:
		return
	if _hold.is_active():
		var win := get_window()
		if win != null and not win.has_focus():
			_stop_upgrade_hold(true)
			return
	_hold.tick()


func _start_upgrade_hold(stat: String) -> void:
	if _busy:
		return
	if _hold_flushing and _hold_stat != stat:
		return
	if not _hold_stat.is_empty() and _hold_stat != stat and (_hold_queued + _hold_inflight) > 0:
		_stop_upgrade_hold(true)
		return
	_hold_stat = stat
	_hold.start(_on_hold_fire, _can_hold_fire)


func _stop_upgrade_hold(flush: bool = true) -> void:
	if _hold != null and _hold.is_active():
		_hold.stop()
	if flush:
		_flush_hold_queue()
	_refresh_values()


func _on_hold_controller_stopped() -> void:
	_flush_hold_queue()
	_refresh_values()


func _hold_pending_count(stat: String = "") -> int:
	if stat.is_empty():
		stat = _hold_stat
	if stat.is_empty() or stat != _hold_stat:
		return 0
	var extra := _hold_queued + _hold_inflight
	if _hold_flushing and _hold_purchases_at_flush >= 0:
		var already := StatsRules.purchase_count(GameManager.active_character, _hold_stat) - _hold_purchases_at_flush
		extra = maxi(0, extra - already)
	return extra


func _can_hold_fire() -> bool:
	if _hold_stat.is_empty():
		return false
	if _hold_queued + _hold_inflight >= 20:
		return true
	var c: Dictionary = GameManager.active_character
	var dust := int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_STARDUST))
	var pending := _hold_pending_count()
	var reserved := StatsRules.batch_cost(c, _hold_stat, pending)
	var next := StatsRules.point_cost(StatsRules.purchase_count(c, _hold_stat) + pending + 1)
	if next <= 0:
		return false
	return dust - reserved >= next


func _on_hold_fire() -> void:
	if _hold_queued + _hold_inflight >= 20:
		_flush_hold_queue()
		return
	_hold_queued += 1
	if _hold_queued + _hold_inflight <= 1:
		AudioManager.play_ui("click")
	else:
		AudioManager.play_ui("hover")
	_refresh_values()
	_flush_hold_queue()


func _flush_hold_queue() -> void:
	if _hold_flushing or _hold_stat.is_empty() or _hold_queued <= 0:
		return
	_hold_flushing = true
	var stat := _hold_stat
	var n := _hold_queued
	_hold_queued = 0
	_hold_inflight = n
	_hold_purchases_at_flush = StatsRules.purchase_count(GameManager.active_character, stat)
	_refresh_values()
	var res: Dictionary = await StatsManager.buy_attribute(stat, n)
	_hold_inflight = 0
	_hold_flushing = false
	_hold_purchases_at_flush = -1
	if not is_inside_tree():
		return
	if not res.ok:
		_hold_queued = 0
		_hold.stop()
		var err := str(res.get("error", "BuyAttribute failed"))
		if typeof(res.get("data", null)) == TYPE_DICTIONARY and res.data.has("error"):
			err = str(res.data["error"])
		if Notify.is_player_fault(res):
			Notify.blocked(err)
		else:
			_status.text = err
		_hold_stat = ""
		_refresh_values()
		return
	var data: Dictionary = res.data if typeof(res.data) == TYPE_DICTIONARY else {}
	var server_reported_count := data.has("count")
	var applied := int(StatsManager.last_buy.get("count", 1))
	if not server_reported_count:
		applied = mini(1, n)
	applied = clampi(applied, 0, n)
	var leftover := n - applied
	var label := str(StatsRules.ATTR_LABELS.get(stat, stat))
	var spent := int(StatsManager.last_buy.get("cost", 0))
	_status.text = "+%s %s  ·  −%s ✦" % [applied, label, spent]
	if leftover > 0 and server_reported_count:
		# Server bought as many as dust/cap allowed.
		_hold.stop()
		_hold_queued = 0
		_hold_stat = ""
		_refresh_values()
		return
	if leftover > 0:
		_hold_queued += leftover
	if _hold.is_active() or _hold_queued > 0:
		_flush_hold_queue()
		return
	_hold_stat = ""
	_refresh_values()
