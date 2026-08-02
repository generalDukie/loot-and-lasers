extends Control
## Crystal Store — mirrors web CrystalStorePage + WeeklyNovaQuests.

## Web USES strip (CrystalStorePage.jsx) — cosmetics / convenience / pets.
const USES := [
	{"icon": "🎨", "title": "Cosmetics", "desc": "Ship skins, avatar auras & taunts"},
	{"icon": "⚡", "title": "Convenience", "desc": "Fuel refills, instant mission completes"},
	{"icon": "🐾", "title": "Cosmic Pets", "desc": "Companions with passive bonuses"},
]

var _balance: PanelContainer
var _balance_lab: Label
var _status: Label
var _list: VBoxContainer
var _busy_id := ""
var _tick: Timer


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	await _boot()


func _boot() -> void:
	await MissionManager.refresh_character()
	_populate()


func _build() -> void:
	add_child(ClientUi.make_page_bg(self, "hub"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 12)
	margin.add_theme_constant_override("margin_bottom", 12)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 14)
	margin.add_child(root)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	root.add_child(header)

	var title := Label.new()
	title.text = "💎  Crystal Store"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(title)
	header.add_child(title)

	_balance = PanelContainer.new()
	_balance.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.96, 0.62, 0.04, 0.10), Color(0.96, 0.62, 0.04, 0.30), 999, 1
	))
	header.add_child(_balance)
	_balance_lab = Label.new()
	_balance_lab.add_theme_font_size_override("font_size", 13)
	_balance_lab.add_theme_color_override("font_color", Color("#FCD34D"))
	ClientUi.apply_display_font(_balance_lab)
	_balance.add_child(_balance_lab)

	_status = ClientUi.make_status()
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	root.add_child(_status)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(scroll)

	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 14)
	scroll.add_child(_list)

	_tick = Timer.new()
	_tick.wait_time = 30.0
	_tick.timeout.connect(_refresh_quest_countdown)
	add_child(_tick)
	_tick.start()


func _populate() -> void:
	for c in _list.get_children():
		c.queue_free()

	var nova := int(GameManager.active_character.get("nova_crystals", 0))
	_balance_lab.text = "💎  %s  Nova Crystals" % _fmt_int(nova)

	_list.add_child(_make_quests_panel())
	_list.add_child(_make_packs_grid())
	_list.add_child(_make_uses_section())

	var foot := HBoxContainer.new()
	foot.alignment = BoxContainer.ALIGNMENT_CENTER
	foot.add_theme_constant_override("separation", 4)
	_list.add_child(foot)
	var check := Label.new()
	check.text = "✓"
	check.add_theme_font_size_override("font_size", 11)
	check.add_theme_color_override("font_color", Color("#4ADE80"))
	foot.add_child(check)
	var foot_lab := Label.new()
	foot_lab.text = "Real purchases activate once Stripe checkout is connected."
	foot_lab.add_theme_font_size_override("font_size", 11)
	foot_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(foot_lab)
	foot.add_child(foot_lab)


func _make_quests_panel() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.08, 0.06, 0.03, 0.97), Color(0.96, 0.62, 0.04, 0.30), 16, 1
	))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	panel.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	col.add_child(head)

	var head_l := VBoxContainer.new()
	head_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_l.add_theme_constant_override("separation", 2)
	head.add_child(head_l)

	var title := Label.new()
	title.text = "🎁  Weekly Nova Ops"
	title.add_theme_font_size_override("font_size", 14)
	title.add_theme_color_override("font_color", Color("#FCD34D"))
	ClientUi.apply_display_font(title)
	head_l.add_child(title)

	var sub := Label.new()
	sub.name = "QuestCountdown"
	sub.text = _quest_subline()
	sub.add_theme_font_size_override("font_size", 11)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(sub)
	head_l.add_child(sub)

	for q in CrystalStoreManager.QUESTS:
		col.add_child(_make_quest_row(q))
	return panel


func _quest_subline() -> String:
	var left := CrystalStoreManager.weekly_seconds_left()
	return "Play to earn up to %s 💎 this week · resets in %s" % [
		CrystalStoreManager.total_weekly_reward(),
		CrystalStoreManager.format_week_left(left),
	]


func _refresh_quest_countdown() -> void:
	var node := _list.find_child("QuestCountdown", true, false)
	if node is Label:
		(node as Label).text = _quest_subline()


func _make_quest_row(q: Dictionary) -> PanelContainer:
	var qid := str(q["id"])
	var prog := CrystalStoreManager.quest_progress(qid)
	var goal := int(q["goal"])
	var claimed := CrystalStoreManager.is_claimed(qid)
	var claimable := CrystalStoreManager.can_claim(qid)

	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.05, 0.08, 0.55), Color(0.35, 0.40, 0.48, 0.50), 12, 1
	))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	panel.add_child(row)

	var emoji := Label.new()
	emoji.text = str(q.get("emoji", "◆"))
	emoji.add_theme_font_size_override("font_size", 18)
	emoji.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(emoji)

	var mid := VBoxContainer.new()
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid.add_theme_constant_override("separation", 2)
	row.add_child(mid)

	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override("separation", 8)
	mid.add_child(title_row)

	var title := Label.new()
	title.text = str(q["label"])
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 12)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	title.clip_text = true
	ClientUi.apply_display_font(title)
	title_row.add_child(title)

	var reward := Label.new()
	reward.text = "+%s 💎" % str(q["reward"])
	reward.add_theme_font_size_override("font_size", 10)
	reward.add_theme_color_override("font_color", Color("#FCD34D"))
	ClientUi.apply_display_font(reward)
	title_row.add_child(reward)

	var desc := Label.new()
	desc.text = str(q.get("desc", ""))
	desc.add_theme_font_size_override("font_size", 10)
	desc.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(desc)
	mid.add_child(desc)

	var bar := ProgressBar.new()
	bar.min_value = 0
	bar.max_value = goal
	bar.value = mini(prog, goal)
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0, 6)
	ClientUi.apply_hp_bar(bar, Color("#FBBF24"))
	mid.add_child(bar)

	var prog_lab := Label.new()
	prog_lab.text = "%s / %s" % [mini(prog, goal), goal]
	prog_lab.add_theme_font_size_override("font_size", 9)
	prog_lab.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(prog_lab)
	mid.add_child(prog_lab)

	if claimed:
		var done := PanelContainer.new()
		done.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.06, 0.72, 0.50, 0.10), Color(0.06, 0.72, 0.50, 0.30), 8, 1
		))
		var done_lab := Label.new()
		done_lab.text = "✓  Done"
		done_lab.add_theme_font_size_override("font_size", 10)
		done_lab.add_theme_color_override("font_color", Color("#34D399"))
		ClientUi.apply_display_font(done_lab)
		done.add_child(done_lab)
		row.add_child(done)
	else:
		var claim := Button.new()
		claim.text = "💎  Claim" if claimable else "💎  Locked"
		claim.disabled = not claimable or _busy_id == qid
		claim.custom_minimum_size = Vector2(84, 0)
		_style_claim_button(claim)
		claim.pressed.connect(func() -> void: _on_claim(qid))
		row.add_child(claim)
	return panel


func _style_claim_button(btn: Button) -> void:
	ClientUi.apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", 10)
	var a := Color("#FBBF24")
	btn.add_theme_stylebox_override("normal", ClientUi.button_style(Color(a.r, a.g, a.b, 0.15), Color(a.r, a.g, a.b, 0.40)))
	btn.add_theme_stylebox_override("hover", ClientUi.button_style(Color(a.r, a.g, a.b, 0.25), Color(a.r, a.g, a.b, 0.55)))
	btn.add_theme_stylebox_override("pressed", ClientUi.button_style(Color(a.r, a.g, a.b, 0.20), Color(a.r, a.g, a.b, 0.45)))
	btn.add_theme_stylebox_override("disabled", ClientUi.button_style(Color(0.10, 0.10, 0.12, 0.55), Color(0.4, 0.35, 0.2, 0.25)))
	btn.add_theme_color_override("font_color", Color("#FDE68A"))
	btn.add_theme_color_override("font_hover_color", Color("#FEF3C7"))
	btn.add_theme_color_override("font_pressed_color", Color("#FDE68A"))
	btn.add_theme_color_override("font_disabled_color", Color(0.55, 0.50, 0.40, 0.55))
	ClientUi.apply_interaction_motion(btn, 1.012)


func _make_packs_grid() -> GridContainer:
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for p in CrystalStoreManager.PACKS:
		grid.add_child(_make_pack_card(p))
	return grid


func _make_pack_card(p: Dictionary) -> PanelContainer:
	var pid := str(p["id"])
	var tint := Color(str(p.get("color", "#A855F7")))
	var popular := bool(p.get("popular", false))

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size.y = 220
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.07, 0.10, 0.72).lerp(Color(tint, 0.14), 0.55),
		Color(tint, 0.25),
		14,
		1
	))

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	panel.add_child(col)

	# Reserve POPULAR badge height so cards stay aligned.
	var badge_slot := Control.new()
	badge_slot.custom_minimum_size.y = 18
	col.add_child(badge_slot)
	if popular:
		var badge := PanelContainer.new()
		badge.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
		badge.grow_horizontal = Control.GROW_DIRECTION_BEGIN
		badge.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.96, 0.62, 0.04, 0.20), Color(0.96, 0.62, 0.04, 0.40), 999, 1
		))
		badge_slot.add_child(badge)
		var badge_lab := Label.new()
		badge_lab.text = "👑  POPULAR"
		badge_lab.add_theme_font_size_override("font_size", 9)
		badge_lab.add_theme_color_override("font_color", Color("#FCD34D"))
		ClientUi.apply_display_font(badge_lab)
		badge.add_child(badge_lab)

	var gem_wrap := CenterContainer.new()
	gem_wrap.custom_minimum_size.y = 56
	col.add_child(gem_wrap)
	var gem_glow := PanelContainer.new()
	gem_glow.custom_minimum_size = Vector2(56, 56)
	gem_glow.add_theme_stylebox_override("panel", _gem_glow_style(tint))
	gem_wrap.add_child(gem_glow)
	var gem := Label.new()
	gem.text = "💎"
	gem.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	gem.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	gem.add_theme_font_size_override("font_size", 28)
	gem.add_theme_color_override("font_color", tint)
	gem_glow.add_child(gem)
	_bob_gem(gem)

	var name := Label.new()
	name.text = str(p["name"])
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name.add_theme_font_size_override("font_size", 13)
	name.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(name)
	col.add_child(name)

	var amt := Label.new()
	amt.text = _fmt_int(int(p["crystals"]))
	amt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	amt.add_theme_font_size_override("font_size", 22)
	amt.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(amt)
	col.add_child(amt)

	var amt_sub := Label.new()
	amt_sub.text = "Nova Crystals"
	amt_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	amt_sub.add_theme_font_size_override("font_size", 10)
	amt_sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(amt_sub)
	col.add_child(amt_sub)

	var bonus := str(p.get("bonus", ""))
	var bonus_slot := Control.new()
	bonus_slot.custom_minimum_size.y = 20
	col.add_child(bonus_slot)
	if not bonus.is_empty():
		var bwrap := CenterContainer.new()
		bwrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		bonus_slot.add_child(bwrap)
		var bpanel := PanelContainer.new()
		bpanel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.13, 0.77, 0.37, 0.15), Color(0.13, 0.77, 0.37, 0.30), 999, 1
		))
		bwrap.add_child(bpanel)
		var b := Label.new()
		b.text = "%s BONUS" % bonus
		b.add_theme_font_size_override("font_size", 10)
		b.add_theme_color_override("font_color", Color("#4ADE80"))
		ClientUi.apply_display_font(b)
		bpanel.add_child(b)

	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(spacer)

	var buy := Button.new()
	buy.text = str(p["price"])
	buy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_tinted_painted_button(buy, tint)
	buy.pressed.connect(func() -> void: _on_buy(pid))
	col.add_child(buy)
	return panel


func _gem_glow_style(tint: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(tint, 0.22)
	s.set_corner_radius_all(12)
	s.shadow_color = Color(tint, 0.45)
	s.shadow_size = 10
	s.content_margin_left = 8
	s.content_margin_right = 8
	s.content_margin_top = 8
	s.content_margin_bottom = 8
	return s


func _bob_gem(node: Control) -> void:
	## Closest equivalent to Framer Motion y/rotate idle on pack gems.
	if node == null:
		return
	var tween := node.create_tween().set_loops()
	tween.tween_property(node, "position:y", -3.0, 1.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(node, "position:y", 0.0, 1.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


func _make_uses_section() -> VBoxContainer:
	var wrap := VBoxContainer.new()
	wrap.add_theme_constant_override("separation", 8)

	var head := Label.new()
	head.text = "✨  WHAT NOVA CRYSTALS UNLOCK"
	head.add_theme_font_size_override("font_size", 11)
	head.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(head)
	wrap.add_child(head)

	var grid := GridContainer.new()
	# Web: lg:grid-cols-4 with 3 cards — same grid, fourth cell empty.
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wrap.add_child(grid)

	for u in USES:
		var panel := PanelContainer.new()
		panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.05, 0.06, 0.09, 0.55), Color(0.35, 0.40, 0.48, 0.40), 10, 1
		))
		grid.add_child(panel)
		var col := VBoxContainer.new()
		col.add_theme_constant_override("separation", 2)
		panel.add_child(col)
		var icon := Label.new()
		icon.text = str(u["icon"])
		icon.add_theme_font_size_override("font_size", 22)
		col.add_child(icon)
		var t := Label.new()
		t.text = str(u["title"])
		t.add_theme_font_size_override("font_size", 13)
		t.add_theme_color_override("font_color", ClientUi.TEXT)
		ClientUi.apply_display_font(t)
		col.add_child(t)
		var d := Label.new()
		d.text = str(u["desc"])
		d.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		d.add_theme_font_size_override("font_size", 11)
		d.add_theme_color_override("font_color", ClientUi.MUTED)
		ClientUi.apply_body_font(d)
		col.add_child(d)

	return wrap


func _on_buy(pack_id: String) -> void:
	## Web: toast only — Stripe checkout not wired yet.
	var p: Dictionary = CrystalStoreManager.pack_by_id(pack_id)
	if p.is_empty():
		_status.text = "Unknown pack."
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		return
	_status.add_theme_color_override("font_color", Color("#FCD34D"))
	_status.text = "🔒 Checkout coming soon — %s (%s 💎). Stripe payment is being connected." % [
		str(p.get("name", pack_id)),
		_fmt_int(int(p.get("crystals", 0))),
	]


func _on_claim(quest_id: String) -> void:
	if not _busy_id.is_empty():
		return
	_busy_id = quest_id
	_status.add_theme_color_override("font_color", ClientUi.MUTED)
	_status.text = "Claiming…"
	var res: Dictionary = await CrystalStoreManager.claim_quest(quest_id)
	_busy_id = ""
	if not res.ok:
		_status.add_theme_color_override("font_color", ClientUi.DANGER)
		_status.text = str(res.get("error", "Could not claim"))
		_populate()
		return
	var reward := 0
	for q in CrystalStoreManager.QUESTS:
		if str(q["id"]) == quest_id:
			reward = int(q["reward"])
			break
	_status.add_theme_color_override("font_color", Color("#34D399"))
	_status.text = "+%s Nova Crystals — claimed for the week." % reward
	_populate()


func _fmt_int(n: int) -> String:
	var s := str(n)
	var out := ""
	var i := 0
	for c_i in range(s.length() - 1, -1, -1):
		if i > 0 and i % 3 == 0:
			out = "," + out
		out = s[c_i] + out
		i += 1
	return out
