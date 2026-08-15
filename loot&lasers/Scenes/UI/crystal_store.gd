extends Control
## Crystal Store — mirrors web CrystalStorePage + WeeklyNovaQuests.

## Web USES strip (CrystalStorePage.jsx) — cosmetics / convenience / pets.
const USES := [
	{"icon": "palette", "title": "Cosmetics", "desc": "Ship skins, avatar auras & taunts"},
	{"icon": "zap", "title": "Convenience", "desc": "Fuel refills, instant mission completes"},
	{"icon": "paw-print", "title": "Cosmic Pets", "desc": "Companions with passive bonuses"},
]

var _balance: PanelContainer
var _balance_row: HBoxContainer
var _balance_lab: Label
var _status: Label
var _list: VBoxContainer
var _busy_id := ""
var _tick: Timer


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	if not CurrencyManager.wallet_changed.is_connected(_on_wallet_changed):
		CurrencyManager.wallet_changed.connect(_on_wallet_changed)
	await _boot()


func _on_wallet_changed(_wallet: Dictionary) -> void:
	_populate()


func _boot() -> void:
	await MissionManager.refresh_character(true)
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

	var title_col := VBoxContainer.new()
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_col.add_theme_constant_override("separation", 2)
	header.add_child(title_col)
	title_col.add_child(UiIcon.make_title_row("sparkles", "Crystal Store", ClientUi.TEXT, 27, 28.0))
	var sub := Label.new()
	sub.text = "Under-table Nova drops · six sealed crates · pay what the fence quotes"
	sub.add_theme_font_size_override("font_size", 17)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(sub)
	title_col.add_child(sub)

	_balance = PanelContainer.new()
	_balance.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(CurrencyIcon.NOVA_GOLD, 0.10), Color(CurrencyIcon.NOVA_GOLD, 0.35), 999, 1
	))
	header.add_child(_balance)
	var bal_pad := MarginContainer.new()
	bal_pad.add_theme_constant_override("margin_left", 10)
	bal_pad.add_theme_constant_override("margin_right", 12)
	bal_pad.add_theme_constant_override("margin_top", 6)
	bal_pad.add_theme_constant_override("margin_bottom", 6)
	_balance.add_child(bal_pad)
	_balance_row = HBoxContainer.new()
	_balance_row.add_theme_constant_override("separation", 6)
	_balance_row.alignment = BoxContainer.ALIGNMENT_CENTER
	bal_pad.add_child(_balance_row)
	_balance_row.add_child(CurrencyIcon.make("nova", 18.0))
	_balance_lab = Label.new()
	_balance_lab.add_theme_font_size_override("font_size", 17)
	_balance_lab.add_theme_color_override("font_color", CurrencyIcon.NOVA_GOLD.lightened(0.12))
	ClientUi.apply_display_font(_balance_lab)
	_balance_row.add_child(_balance_lab)

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

	var nova: int = int(CurrencyManager.get_balance(CurrencyManager.CURRENCY_NOVA))
	_balance_lab.text = "%s  Nova Crystals" % _fmt_int(nova)

	_list.add_child(_make_quests_panel())
	_list.add_child(_make_featured_section())
	_list.add_child(_make_shelf_section())
	_list.add_child(_make_uses_section())

	var foot := HBoxContainer.new()
	foot.alignment = BoxContainer.ALIGNMENT_CENTER
	foot.add_theme_constant_override("separation", 4)
	_list.add_child(foot)
	var check := Label.new()
	check.text = "✓"
	check.add_theme_font_size_override("font_size", 18)
	check.add_theme_color_override("font_color", Color("#4ADE80"))
	foot.add_child(check)
	var foot_lab := Label.new()
	foot_lab.text = "Real purchases activate once Stripe checkout is connected."
	foot_lab.add_theme_font_size_override("font_size", 18)
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

	head_l.add_child(UiIcon.make_title_row("gift", "Weekly Nova Ops", Color("#FCD34D"), 19, 22.0))

	var sub := Label.new()
	sub.name = "QuestCountdown"
	sub.text = _quest_subline()
	sub.add_theme_font_size_override("font_size", 18)
	sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(sub)
	head_l.add_child(sub)

	for q in CrystalStoreManager.QUESTS:
		col.add_child(_make_quest_row(q))
	return panel


func _quest_subline() -> String:
	var left := CrystalStoreManager.weekly_seconds_left()
	return "Play to earn up to %s Nova this week · resets in %s" % [
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

	var emoji_host := CenterContainer.new()
	emoji_host.custom_minimum_size = Vector2(28, 28)
	emoji_host.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(emoji_host)
	CurrencyIcon.fill_glyph_host(
		emoji_host,
		str(q.get("emoji", "sparkles")),
		24.0,
		Color("#FCD34D")
	)

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
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", ClientUi.TEXT)
	title.clip_text = true
	ClientUi.apply_display_font(title)
	title_row.add_child(title)

	var reward := CurrencyIcon.make_amount_row("+%s" % str(q["reward"]), 13.0, CurrencyIcon.NOVA_GOLD, 13)
	title_row.add_child(reward)

	var desc := Label.new()
	desc.text = str(q.get("desc", ""))
	desc.add_theme_font_size_override("font_size", 17)
	desc.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(desc)
	mid.add_child(desc)

	var bar := ProgressBar.new()
	bar.min_value = 0
	bar.max_value = goal
	bar.value = mini(prog, goal)
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0, 8)
	ClientUi.apply_hp_bar(bar, Color("#FBBF24"))
	mid.add_child(bar)

	var prog_lab := Label.new()
	prog_lab.text = "%s / %s" % [mini(prog, goal), goal]
	prog_lab.add_theme_font_size_override("font_size", 12)
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
		done_lab.add_theme_font_size_override("font_size", 17)
		done_lab.add_theme_color_override("font_color", Color("#34D399"))
		ClientUi.apply_display_font(done_lab)
		done.add_child(done_lab)
		row.add_child(done)
	else:
		var claim := Button.new()
		claim.text = "Claim" if claimable else "Locked"
		claim.icon = UiIcon.texture("sparkles")
		claim.expand_icon = true
		claim.add_theme_constant_override("icon_max_width", 16)
		UiIcon.apply_button_icon_colors(claim, Color("#FDE68A"))
		claim.disabled = not claimable or _busy_id == qid
		claim.custom_minimum_size = Vector2(112, 0)
		_style_claim_button(claim)
		claim.pressed.connect(func() -> void: _on_claim(qid))
		row.add_child(claim)
	return panel


func _style_claim_button(btn: Button) -> void:
	ClientUi.apply_display_font(btn)
	btn.add_theme_font_size_override("font_size", 13)
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


func _make_featured_section() -> VBoxContainer:
	var wrap := VBoxContainer.new()
	wrap.add_theme_constant_override("separation", 8)

	var head := Label.new()
	head.text = "⚡  FEATURED CONTRABAND"
	head.add_theme_font_size_override("font_size", 14)
	head.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(head)
	wrap.add_child(head)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wrap.add_child(row)
	for p in CrystalStoreManager.featured_packs():
		row.add_child(_make_featured_card(p))
	return wrap


func _make_shelf_section() -> VBoxContainer:
	var wrap := VBoxContainer.new()
	wrap.add_theme_constant_override("separation", 8)

	var head := Label.new()
	head.text = "✦  CRYSTAL ASSAY SHELF"
	head.add_theme_font_size_override("font_size", 14)
	head.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(head)
	wrap.add_child(head)

	var shelf := PanelContainer.new()
	shelf.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shelf.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.04, 0.08, 0.1, 0.92), Color(ClientUi.CYAN, 0.22), 16, 1
	))
	wrap.add_child(shelf)

	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shelf.add_child(grid)
	for p in CrystalStoreManager.shelf_packs():
		grid.add_child(_make_pack_card(p))
	return wrap


func _make_featured_card(p: Dictionary) -> PanelContainer:
	var pid := str(p["id"])
	var tint := Color(str(p.get("color", "#A855F7")))
	var best := bool(p.get("best_value", false))
	var bonus := CrystalStoreManager.pack_value_bonus_pct(p)

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size.y = 200
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.07, 0.10, 0.88).lerp(Color(tint, 0.22), 0.55),
		Color(tint, 0.45),
		16,
		2
	))

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	panel.add_child(row)

	var gem_wrap := CenterContainer.new()
	gem_wrap.custom_minimum_size = Vector2(110, 0)
	row.add_child(gem_wrap)
	var gem_glow := PanelContainer.new()
	gem_glow.custom_minimum_size = Vector2(88, 88)
	gem_glow.add_theme_stylebox_override("panel", _gem_glow_style(tint))
	gem_wrap.add_child(gem_glow)
	var gem := CurrencyIcon.make("nova", 48.0)
	gem_glow.add_child(gem)
	_bob_gem(gem)

	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 4)
	row.add_child(col)

	var badge_row := HBoxContainer.new()
	badge_row.alignment = BoxContainer.ALIGNMENT_END
	col.add_child(badge_row)
	var badge := PanelContainer.new()
	badge.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.96, 0.62, 0.04, 0.20) if not best else Color(0.99, 0.90, 0.54, 0.18),
		Color(0.96, 0.62, 0.04, 0.40) if not best else Color(0.99, 0.90, 0.54, 0.45),
		999,
		1
	))
	badge_row.add_child(badge)
	var badge_inner := HBoxContainer.new()
	badge_inner.add_theme_constant_override("separation", 4)
	badge.add_child(badge_inner)
	badge_inner.add_child(UiIcon.make("crown" if not best else "sparkles", Color("#FCD34D"), 14.0))
	var badge_lab := Label.new()
	badge_lab.text = "BEST VALUE" if best else "POPULAR"
	badge_lab.add_theme_font_size_override("font_size", 12)
	badge_lab.add_theme_color_override("font_color", Color("#FDE68A") if best else Color("#FCD34D"))
	ClientUi.apply_display_font(badge_lab)
	badge_inner.add_child(badge_lab)

	var name := Label.new()
	name.text = str(p["name"])
	name.add_theme_font_size_override("font_size", 22)
	name.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(name)
	col.add_child(name)

	var blurb := Label.new()
	blurb.text = str(p.get("blurb", ""))
	blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	blurb.add_theme_font_size_override("font_size", 17)
	blurb.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(blurb)
	col.add_child(blurb)

	var amt := Label.new()
	amt.text = "%s Nova" % _fmt_int(int(p["crystals"]))
	amt.add_theme_font_size_override("font_size", 28)
	amt.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(amt)
	col.add_child(amt)

	if bonus > 0:
		var bpanel := PanelContainer.new()
		bpanel.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		bpanel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
			Color(0.13, 0.77, 0.37, 0.15), Color(0.13, 0.77, 0.37, 0.30), 999, 1
		))
		col.add_child(bpanel)
		var b := Label.new()
		b.text = "+%s%% vs Signal Shard" % bonus
		b.add_theme_font_size_override("font_size", 12)
		b.add_theme_color_override("font_color", Color("#4ADE80"))
		ClientUi.apply_display_font(b)
		bpanel.add_child(b)

	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(spacer)

	var buy := Button.new()
	buy.text = str(p["price"])
	buy.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	buy.custom_minimum_size = Vector2(140, 0)
	ClientUi.apply_tinted_painted_button(buy, tint)
	buy.pressed.connect(func() -> void: _on_buy(pid))
	col.add_child(buy)
	return panel


func _make_pack_card(p: Dictionary) -> PanelContainer:
	var pid := str(p["id"])
	var tint := Color(str(p.get("color", "#A855F7")))
	var bonus := CrystalStoreManager.pack_value_bonus_pct(p)
	var usd := float(p.get("usd", 0))
	var crystals := int(p.get("crystals", 0))
	var per_dollar := int(round(float(crystals) / usd)) if usd > 0.0 else 0

	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.custom_minimum_size.y = 300
	panel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.06, 0.07, 0.10, 0.72).lerp(Color(tint, 0.14), 0.55),
		Color(tint, 0.28),
		14,
		1
	))

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	panel.add_child(col)

	var accent := ColorRect.new()
	accent.custom_minimum_size.y = 3
	accent.color = tint
	col.add_child(accent)

	var gem_wrap := CenterContainer.new()
	gem_wrap.custom_minimum_size.y = 72
	col.add_child(gem_wrap)
	var gem_glow := PanelContainer.new()
	gem_glow.custom_minimum_size = Vector2(64, 64)
	gem_glow.add_theme_stylebox_override("panel", _gem_glow_style(tint))
	gem_wrap.add_child(gem_glow)
	var gem := CurrencyIcon.make("nova", 36.0)
	gem_glow.add_child(gem)
	_bob_gem(gem)

	var name := Label.new()
	name.text = str(p["name"])
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name.add_theme_font_size_override("font_size", 16)
	name.add_theme_color_override("font_color", tint)
	ClientUi.apply_display_font(name)
	col.add_child(name)

	var blurb := Label.new()
	blurb.text = str(p.get("blurb", ""))
	blurb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	blurb.custom_minimum_size.y = 34
	blurb.add_theme_font_size_override("font_size", 17)
	blurb.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(blurb)
	col.add_child(blurb)

	var amt := Label.new()
	amt.text = _fmt_int(crystals)
	amt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	amt.add_theme_font_size_override("font_size", 28)
	amt.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(amt)
	col.add_child(amt)

	var amt_sub := Label.new()
	amt_sub.text = "Nova Crystals"
	amt_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	amt_sub.add_theme_font_size_override("font_size", 17)
	amt_sub.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(amt_sub)
	col.add_child(amt_sub)

	var bonus_slot := CenterContainer.new()
	bonus_slot.custom_minimum_size.y = 26
	col.add_child(bonus_slot)
	var bpanel := PanelContainer.new()
	bpanel.add_theme_stylebox_override("panel", ClientUi.painted_panel_style(
		Color(0.13, 0.77, 0.37, 0.15) if bonus > 0 else Color(0.2, 0.22, 0.28, 0.35),
		Color(0.13, 0.77, 0.37, 0.30) if bonus > 0 else Color(0.4, 0.42, 0.48, 0.35),
		999,
		1
	))
	bonus_slot.add_child(bpanel)
	var b := Label.new()
	b.text = ("+%s%% value" % bonus) if bonus > 0 else "Entry crate"
	b.add_theme_font_size_override("font_size", 12)
	b.add_theme_color_override("font_color", Color("#4ADE80") if bonus > 0 else ClientUi.MUTED)
	ClientUi.apply_display_font(b)
	bpanel.add_child(b)

	var rate := Label.new()
	rate.text = "~%s Nova / $" % per_dollar
	rate.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rate.add_theme_font_size_override("font_size", 12)
	rate.add_theme_color_override("font_color", Color(ClientUi.MUTED, 0.85))
	ClientUi.apply_body_font(rate)
	col.add_child(rate)

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

	var head_row := HBoxContainer.new()
	head_row.add_theme_constant_override("separation", 8)
	wrap.add_child(head_row)
	head_row.add_child(CurrencyIcon.make("stardust", 15.0))
	var head := Label.new()
	head.text = "WHAT NOVA CRYSTALS UNLOCK"
	head.add_theme_font_size_override("font_size", 15)
	head.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_display_font(head)
	head_row.add_child(head)

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
		var icon_host := CenterContainer.new()
		icon_host.custom_minimum_size = Vector2(32, 32)
		col.add_child(icon_host)
		CurrencyIcon.fill_glyph_host(icon_host, str(u["icon"]), 29.0, ClientUi.CYAN)
		var t := Label.new()
		t.text = str(u["title"])
		t.add_theme_font_size_override("font_size", 17)
		t.add_theme_color_override("font_color", ClientUi.TEXT)
		ClientUi.apply_display_font(t)
		col.add_child(t)
		var d := Label.new()
		d.text = str(u["desc"])
		d.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		d.add_theme_font_size_override("font_size", 18)
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
	_status.text = "Checkout coming soon — %s (%s Nova). Stripe payment is being connected." % [
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
		if not Notify.from_result(res):
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
