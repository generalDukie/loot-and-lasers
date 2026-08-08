extends Control
## Cosmic Vault — mirrors web CollectiblesLog (career · tabs · denser grids).

var _status: Label
var _progress_lab: Label
var _progress_bar: ProgressBar
var _career_lab: Label
var _tabs: HBoxContainer
var _list: GridContainer
var _tab := "species"

const TAB_KEYS := ["species", "badges", "artifacts", "relics", "gear", "achievements"]
const TAB_LABELS := ["Species", "Badges", "Artifacts", "Relics", "Gear", "Achievements"]


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	_populate()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for k in ["margin_left", "margin_right"]:
		margin.add_theme_constant_override(k, 18)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	root.add_child(UiIcon.make_title_row("package", "Cosmic Vault", ClientUi.TEXT, 32, 28.0))

	var career := PanelContainer.new()
	career.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.1, 0.96), Color(0.45, 0.5, 0.65, 0.4), 10, 1
	))
	root.add_child(career)
	_career_lab = Label.new()
	_career_lab.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_career_lab.add_theme_font_size_override("font_size", 16)
	_career_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_career_lab)
	career.add_child(_career_lab)

	var prog_panel := PanelContainer.new()
	prog_panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.08, 0.12, 0.97), Color(ClientUi.CYAN, 0.45), 12, 2
	))
	root.add_child(prog_panel)
	var pcol := VBoxContainer.new()
	pcol.add_theme_constant_override("separation", 6)
	prog_panel.add_child(pcol)
	_progress_lab = Label.new()
	_progress_lab.add_theme_font_size_override("font_size", 17)
	_progress_lab.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(_progress_lab)
	pcol.add_child(_progress_lab)
	_progress_bar = ProgressBar.new()
	_progress_bar.min_value = 0
	_progress_bar.max_value = 100
	_progress_bar.show_percentage = false
	_progress_bar.custom_minimum_size = Vector2(0, 16)
	ClientUi.apply_hp_bar(_progress_bar, ClientUi.CYAN)
	pcol.add_child(_progress_bar)

	_status = ClientUi.make_status()
	root.add_child(_status)

	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 6)
	root.add_child(_tabs)
	for i in TAB_KEYS.size():
		var b := Button.new()
		b.text = TAB_LABELS[i]
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ClientUi.apply_ghost_button(b)
		var key: String = str(TAB_KEYS[i])
		b.pressed.connect(func() -> void:
			_tab = key
			_populate()
		)
		_tabs.add_child(b)

	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(scroll)
	_list = GridContainer.new()
	_list.columns = 3
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("h_separation", 8)
	_list.add_theme_constant_override("v_separation", 8)
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
	_style_tabs()

	var ch: Dictionary = GameManager.active_character
	_career_lab.text = "CAREER  ·  Missions %s  ·  Arena %s-%s  ·  Dungeon clears %s  ·  Peak hit %s  ·  Lifetime ✦ %s" % [
		str(ch.get("missions_completed", 0)),
		str(ch.get("arena_wins", 0)),
		str(ch.get("arena_losses", 0)),
		str(ch.get("dungeon_clears", 0)),
		str(ch.get("highest_damage", 0)),
		str(ch.get("total_stardust_earned", 0)),
	]

	var species_owned := CollectiblesCatalog.owned_ids(ch.get("discovered_species", []))
	var arts_owned := CollectiblesCatalog.owned_ids(ch.get("collected_artifacts", []))
	var relics_owned := CollectiblesCatalog.owned_ids(ch.get("collected_relics", []))
	var gear_owned := CollectiblesCatalog.discovered_gear_ids(ch)
	var gear_total := CollectiblesCatalog.gear_catalog().size()
	var badges := CollectiblesCatalog.badge_count(ch)

	var ach_unlocked := 0
	for entry in AchievementsCatalog.ENTRIES:
		if AchievementsCatalog.is_unlocked(entry, ch):
			ach_unlocked += 1

	var discovered := species_owned.size() + arts_owned.size() + relics_owned.size() + gear_owned.size() + badges
	var total := CollectiblesCatalog.SPECIES.size() + 100 + 500 + maxi(1, gear_total) + 10
	var pct := int(round(float(discovered) / float(total) * 100.0))
	_progress_lab.text = "TOTAL COLLECTION  %s / %s · %s%%  ·  XP bonus +%s%%" % [
		str(discovered), str(total), str(pct), str(pct),
	]
	_progress_bar.value = pct

	match _tab:
		"species":
			_list.columns = 3
		"badges":
			# Few badges + wrapping labels in a 3-col grid collapsed to ~1 glyph wide.
			_list.columns = 1 if badges <= 1 else 3
		"gear", "achievements":
			_list.columns = 2
		_:
			_list.columns = 4

	match _tab:
		"species":
			_status.text = "Alien species discovered in combat · %s/%s" % [
				species_owned.size(), CollectiblesCatalog.SPECIES.size(),
			]
			for s in CollectiblesCatalog.SPECIES:
				var id := int(s.get("id", 0))
				_list.add_child(_entry(
					str(s.get("name", "?")),
					str(s.get("rarity", "")),
					str(s.get("lore", "")),
					species_owned.has(id)
				))
		"badges":
			_status.text = "Frontier planet badges · %s" % badges
			if badges <= 0:
				_list.columns = 1
				_list.add_child(_empty("No badges — conquer spiral planets on the Galactic Frontier."))
			else:
				for i in badges:
					_list.add_child(_entry("Planet Badge #%s" % (i + 1), "frontier", "Earned by clearing a spiral planet.", true))
		"artifacts":
			_status.text = "Artifacts · %s/100" % arts_owned.size()
			for i in range(1, 101):
				var art := CollectiblesCatalog.artifact(i)
				var owned := arts_owned.has(i)
				var name := str(art.get("name", "Artifact #%s" % i)) if not art.is_empty() else "Artifact #%s" % i
				var rarity := str(art.get("rarity", "")) if not art.is_empty() else ""
				var lore := str(art.get("lore", "")) if not art.is_empty() else ""
				_list.add_child(_entry(name, rarity, lore, owned))
		"relics":
			_status.text = "Relics · %s/500" % relics_owned.size()
			var shown := 0
			for i in range(1, 501):
				var owned := relics_owned.has(i)
				if not owned and shown > 60 and relics_owned.size() < 20:
					continue
				var rel := CollectiblesCatalog.relic(i)
				var name := str(rel.get("name", "Relic #%s" % i)) if not rel.is_empty() else "Relic #%s" % i
				var rarity := str(rel.get("rarity", "")) if not rel.is_empty() else ""
				var lore := str(rel.get("lore", "")) if not rel.is_empty() else ""
				_list.add_child(_entry(name, rarity, lore, owned))
				shown += 1
				if shown >= 120:
					_list.add_child(_empty("Showing %s cells — discover more to fill the vault." % shown))
					break
		"gear":
			_status.text = "Base gear types · %s/%s" % [gear_owned.size(), gear_total]
			var catalog: Array = CollectiblesCatalog.gear_catalog()
			var shown_ids := {}
			var shown_gear := 0
			for e in catalog:
				var eid := str(e.get("id", ""))
				shown_ids[eid] = true
				var has_it: bool = gear_owned.has(eid)
				_list.add_child(_entry(
					str(e.get("name", "?")),
					str(e.get("type", "")),
					"Discovered base type." if has_it else "Not yet discovered.",
					has_it
				))
				shown_gear += 1
				if shown_gear >= 120:
					_list.add_child(_empty("Showing first 120 of %s catalog entries." % catalog.size()))
					break
			for oid in gear_owned.keys():
				var ok := str(oid)
				if shown_ids.has(ok):
					continue
				var parts := ok.split(":", true, 1)
				var oname := parts[1] if parts.size() > 1 else ok
				var otype := parts[0] if parts.size() > 1 else "gear"
				_list.add_child(_entry(oname, otype, "Discovered (off-catalog key).", true))
			if catalog.is_empty() and gear_owned.is_empty():
				_list.add_child(_empty("Gear catalog unavailable."))
		"achievements":
			_status.text = "Achievements · %s/%s" % [ach_unlocked, AchievementsCatalog.ENTRIES.size()]
			for entry in AchievementsCatalog.ENTRIES:
				var unlocked := AchievementsCatalog.is_unlocked(entry, ch)
				_list.add_child(_entry(
					str(entry.get("name", "?")),
					str(entry.get("category", "")),
					str(entry.get("desc", "")),
					unlocked
				))


func _style_tabs() -> void:
	for i in _tabs.get_child_count():
		var b: Button = _tabs.get_child(i) as Button
		if b == null:
			continue
		if i < TAB_KEYS.size() and TAB_KEYS[i] == _tab:
			ClientUi.apply_primary_button(b)
		else:
			ClientUi.apply_ghost_button(b)


func _entry(name: String, rarity: String, lore: String, owned: bool) -> PanelContainer:
	var tint := ClientUi.rarity_color(rarity) if owned and not rarity.is_empty() else Color(0.3, 0.35, 0.45, 0.5)
	if owned and rarity.is_empty():
		tint = ClientUi.CYAN
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size.x = 220
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.07, 0.11, 0.96) if owned else Color(0.04, 0.05, 0.07, 0.9),
		Color(tint, 0.65) if owned else Color(0.3, 0.35, 0.45, 0.35),
		10,
		1
	))
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 4)
	panel.add_child(col)
	var title := Label.new()
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.text = ("%s · %s" % [name, rarity]) if owned else "???"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", tint if owned else Color(0.45, 0.5, 0.55))
	ClientUi.apply_display_font(title)
	col.add_child(title)
	var body := Label.new()
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.text = lore if owned else "Not yet discovered."
	body.add_theme_font_size_override("font_size", 13)
	body.add_theme_color_override("font_color", ClientUi.MUTED if owned else Color(0.4, 0.45, 0.5))
	ClientUi.apply_body_font(body)
	col.add_child(body)
	return panel


func _empty(t: String) -> Control:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size.x = 320
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.05, 0.06, 0.1, 0.9), Color(0.35, 0.4, 0.5, 0.35), 10, 1
	))
	var l := Label.new()
	l.text = t
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.add_theme_font_size_override("font_size", 15)
	l.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(l)
	panel.add_child(l)
	return panel
