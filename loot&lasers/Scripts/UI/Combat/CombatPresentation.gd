extends RefCounted
class_name CombatPresentation
## Presentation helpers for duel overlays (Restoration 29).
## Observes combat events only — never mutates gameplay.

## Floater sizes — scaled up with combat readability pass; crit ≈ 2× normal damage.
const FLOAT_FONT_OTHER := 26
const FLOAT_FONT_DAMAGE := 40
const FLOAT_FONT_CRIT := 76
## Presentation mirror of src/lib/classPassives.js OVERCLOCK_STACK_CAP (server is authority).
const OVERCLOCK_STACK_CAP := 6
## Presentation mirror of src/lib/combatPresentation.js CRIT_DARKEN (visual only).
const CRIT_DARKEN := 0.18


## Damage float colors ← Hero attribute panes (GameData.STAT_COLORS).
static func damage_type_color(dtype: String) -> Color:
	match String(dtype).to_upper():
		"MIGHT":
			return GameData.stat_color("strength")
		"REFLEX":
			return GameData.stat_color("agility")
		"TECH":
			return GameData.stat_color("intellect")
		"TRUE":
			return Color.WHITE
		_:
			return Color("#FCA5A5")


## Crit uses a slightly darkened Hero attribute color (not a universal Crit hue).
static func damage_floater_color(dtype: String, is_crit: bool) -> Color:
	var base := damage_type_color(dtype)
	if is_crit and String(dtype).to_upper() != "TRUE":
		return base.darkened(CRIT_DARKEN)
	return base


static func empty_side() -> Dictionary:
	return {
		"barrier": 0,
		"barrier_max": 0,
		"phantom_pending": false,
		"phantom_charges": 0,
		"overclock_stacks": 0,
		"overclock_active": false,
		"dirty_trick": "",
		"dirty_tricks": [],
		"kinetic_tantrum": "",
		"orbital_primed": "",
		"drone_ready": false,
		"stim_charges": 0,
	}


static func reduce_status(events: Array, up_to: int) -> Dictionary:
	var state := {"player": empty_side(), "opponent": empty_side()}
	var end := mini(events.size() - 1, up_to)
	for i in range(end + 1):
		var ev: Variant = events[i]
		if typeof(ev) != TYPE_DICTIONARY:
			continue
		_apply(state, ev)
	return state


static func _slot(state: Dictionary, side: String) -> Dictionary:
	if side == "player" or side == "opponent":
		return state[side]
	return {}


static func _apply(state: Dictionary, ev: Dictionary) -> void:
	var kind := str(ev.get("kind", ev.get("missKind", "")))
	var side := str(ev.get("side", ev.get("defender", ev.get("attacker", ""))))
	var slot: Dictionary = _slot(state, side)

	if kind == "astral_barrier_created" or kind == "astral_barrier_restored":
		if not slot.is_empty():
			slot["barrier"] = int(ev.get("barrier", ev.get("barrierMax", 0)))
			slot["barrier_max"] = int(ev.get("barrierMax", slot["barrier"]))
		return
	if str(ev.get("type", "")) == "barrier":
		var s: Dictionary = _slot(state, str(ev.get("side", "")))
		if s.is_empty():
			return
		if ev.has("barrierRemaining"):
			s["barrier"] = int(ev.get("barrierRemaining", 0))
		if kind == "barrier_broken":
			s["barrier"] = 0
		return
	if kind == "phantom_signal_armed" or kind == "phantom_signal_reprimed":
		if not slot.is_empty():
			slot["phantom_pending"] = true
			slot["phantom_charges"] = 1
		return
	if kind == "phantom_signal_miss" or (str(ev.get("type", "")) == "miss" and str(ev.get("missKind", "")) == "phantom_signal"):
		var def: Dictionary = _slot(state, str(ev.get("defender", "")))
		if def.is_empty():
			return
		def["phantom_pending"] = false
		def["phantom_charges"] = 0
		return
	if kind == "overclock_stack_gained" or kind == "overclock_ready" or kind == "overclock_vented":
		if not slot.is_empty():
			slot["overclock_active"] = true
			slot["overclock_stacks"] = int(ev.get("stacks", 0))
		return
	if kind == "overclock_stacks_removed":
		if not slot.is_empty():
			slot["overclock_stacks"] = int(ev.get("stacks", 0))
		return
	if kind == "dirty_trick_selected" or str(ev.get("dirtyTrick", "")) != "":
		if not slot.is_empty():
			slot["dirty_trick"] = str(ev.get("dirtyTrick", ""))
			var tricks: Array = slot.get("dirty_tricks", [])
			if typeof(ev.get("dirtyTricks", null)) == TYPE_ARRAY:
				tricks = (ev.get("dirtyTricks") as Array).duplicate()
			elif str(ev.get("dirtyTrick", "")) != "" and not tricks.has(ev.get("dirtyTrick")):
				tricks.append(ev.get("dirtyTrick"))
			slot["dirty_tricks"] = tricks
			if ev.has("openingCharges"):
				slot["stim_charges"] = int(ev.get("openingCharges", 0))
		return
	if kind == "stim_injector_charge":
		if not slot.is_empty():
			slot["stim_charges"] = int(ev.get("after", ev.get("openingCharges", 0)))
		return
	if kind == "kinetic_tantrum_strong" or kind == "kinetic_tantrum_normal":
		if not slot.is_empty():
			var mode := str(ev.get("kineticTantrum", ""))
			if mode.is_empty():
				mode = "strong" if kind.contains("strong") else "normal"
			slot["kinetic_tantrum"] = mode
		return
	if kind == "kinetic_tantrum_consumed":
		if not slot.is_empty():
			slot["kinetic_tantrum"] = ""
		return
	if str(ev.get("passive", "")).begins_with("Orbital") or kind.contains("drone") \
			or kind.contains("fire_support") or kind.contains("acquire_target") \
			or kind.contains("defensive_protocol"):
		var eng_side := str(ev.get("side", ""))
		if eng_side != "player" and eng_side != "opponent":
			eng_side = str(ev.get("attacker", ""))
		var eng_slot: Dictionary = _slot(state, eng_side)
		if not eng_slot.is_empty():
			if kind == "defensive_protocol_applied":
				eng_slot["orbital_primed"] = "defensive_protocol"
			elif kind == "acquire_target_applied":
				eng_slot["orbital_primed"] = "acquire_target"
			elif kind == "defensive_protocol_consumed" or kind == "acquire_target_consumed":
				eng_slot["orbital_primed"] = ""
				eng_slot["drone_ready"] = false
			elif kind == "fire_support" or kind == "fire_support_dodged":
				eng_slot["drone_ready"] = false
			elif kind == "orbital_assistant_activated":
				var effect := str(ev.get("effect", ""))
				eng_slot["drone_ready"] = effect == "fire_support"
				if effect == "defensive_protocol":
					eng_slot["orbital_primed"] = "defensive_protocol"
				elif effect == "acquire_target":
					eng_slot["orbital_primed"] = "acquire_target"
		return


static func _other_floater(label: String, color: Color) -> Dictionary:
	return {
		"label": label,
		"color": color,
		"crit": false,
		"bold": false,
		"font_size": FLOAT_FONT_OTHER,
	}


static func floater_label(ev: Dictionary) -> Dictionary:
	if int(ev.get("heal", 0)) > 0:
		return _other_floater("+%s" % int(ev.get("heal", 0)), Color("#86EFAC"))
	if str(ev.get("type", "")) == "dodge" or bool(ev.get("dodged", false)):
		return _other_floater("DODGE", Color("#67E8F9"))
	if str(ev.get("type", "")) == "miss" or bool(ev.get("missed", false)):
		if str(ev.get("missKind", "")) == "phantom_signal" or str(ev.get("kind", "")) == "phantom_signal_miss":
			return _other_floater("FORCED MISS", Color("#C084FC"))
		return _other_floater("MISS", Color("#94A3B8"))
	if str(ev.get("type", "")) == "barrier":
		if str(ev.get("kind", "")) == "barrier_broken":
			return _other_floater("BARRIER BREAK", Color("#67E8F9"))
		return _other_floater("SHIELD −%s" % int(ev.get("absorbed", 0)), Color("#67E8F9"))
	var dmg := int(ev.get("damage", 0))
	if bool(ev.get("shieldHit", false)) and dmg <= 0:
		return _other_floater("BLOCK", Color("#67E8F9"))
	if dmg > 0:
		var dtype := str(ev.get("damageType", "")).to_upper()
		# True Damage cannot Crit — ignore a stray crit flag for presentation.
		var is_crit := bool(ev.get("crit", false)) and dtype != "TRUE"
		var col := damage_floater_color(dtype, is_crit)
		var prefix := ""
		if dtype == "TRUE":
			prefix = "TRUE "
		elif is_crit:
			prefix = "CRIT "
		var shield := ""
		if bool(ev.get("shieldHit", false)) and int(ev.get("barrierAbsorbed", 0)) > 0:
			shield = " · SHIELD −%s" % int(ev.get("barrierAbsorbed", 0))
		return {
			"label": "%s−%s%s" % [prefix, dmg, shield],
			"color": col,
			"crit": is_crit,
			"bold": is_crit,
			"font_size": FLOAT_FONT_CRIT if is_crit else FLOAT_FONT_DAMAGE,
			"damage_type": dtype,
		}
	if str(ev.get("type", "")) == "passive":
		var pname := str(ev.get("passive", "")).strip_edges()
		var kind := str(ev.get("kind", "")).strip_edges()
		var label := pname if not pname.is_empty() else kind.replace("_", " ").capitalize()
		if label.is_empty():
			label = "ABILITY"
		return _other_floater(label.to_upper(), Color("#C084FC"))
	return {}


## Status chip parts for combat HP chrome: [{ "icon", "text", "color", "tip" }, ...]
static func status_chip_parts(side: Dictionary) -> Array:
	var parts: Array = []
	var barrier_c := Color("#C084FC", 0.98)
	var phantom_c := Color("#94A3B8", 0.98)
	var overclock_c := Color("#38BDF8", 0.98)
	var tantrum_c := Color("#F97316", 0.98)
	var trick_c := Color("#34D399", 0.98)
	var drone_c := Color("#FBBF24", 0.98)
	if int(side.get("barrier", 0)) > 0:
		parts.append({
			"icon": "shield",
			"text": "Barrier %s" % int(side.get("barrier", 0)),
			"color": barrier_c,
			"tip": "Astral Barrier",
		})
	if bool(side.get("phantom_pending", false)) or int(side.get("phantom_charges", 0)) > 0:
		parts.append({
			"icon": "ghost",
			"text": "Phantom primed",
			"color": phantom_c,
			"tip": "Phantom Signal — next incoming attack misses",
		})
	if bool(side.get("overclock_active", false)) or int(side.get("overclock_stacks", 0)) > 0:
		parts.append({
			"icon": "zap",
			"text": "OC %d/%d" % [int(side.get("overclock_stacks", 0)), OVERCLOCK_STACK_CAP],
			"color": overclock_c,
			"tip": "Overclock stacks",
		})
	var kt := str(side.get("kinetic_tantrum", ""))
	if kt == "strong":
		parts.append({
			"icon": "badge-alert",
			"text": "Tantrum 2.0×",
			"color": tantrum_c,
			"tip": "Kinetic Tantrum · Strong",
		})
	elif kt == "normal":
		parts.append({
			"icon": "badge-alert",
			"text": "Tantrum 1.5×",
			"color": tantrum_c,
			"tip": "Kinetic Tantrum · Normal",
		})
	var tricks: Array = side.get("dirty_tricks", [])
	if tricks.is_empty():
		var single := str(side.get("dirty_trick", ""))
		if not single.is_empty():
			tricks = [single]
	for trick_raw in tricks:
		var trick := str(trick_raw)
		if trick.is_empty():
			continue
		var trick_lab := trick.replace("_", " ").capitalize()
		if trick == "stim_injector":
			var charges := int(side.get("stim_charges", 0))
			trick_lab = "Stim Injector %s" % charges if charges > 0 else "Stim Injector"
		parts.append({
			"icon": "list-checks",
			"text": trick_lab,
			"color": trick_c,
			"tip": "Dirty Trick · %s" % trick_lab,
		})
	var primed := str(side.get("orbital_primed", ""))
	if primed == "defensive_protocol":
		parts.append({
			"icon": "bot",
			"text": "Def. Protocol",
			"color": drone_c,
			"tip": "Orbital Assistant · Defensive Protocol primed",
		})
	elif primed == "acquire_target":
		parts.append({
			"icon": "bot",
			"text": "Acquire Target",
			"color": drone_c,
			"tip": "Orbital Assistant · Acquire Target primed",
		})
	elif bool(side.get("drone_ready", false)):
		parts.append({
			"icon": "bot",
			"text": "Fire Support",
			"color": drone_c,
			"tip": "Orbital Assistant",
		})
	return parts


static func fill_status_chip(host: Control, side: Dictionary, align_right: bool = false) -> void:
	if host == null or not is_instance_valid(host):
		return
	while host.get_child_count() > 0:
		var c := host.get_child(0)
		host.remove_child(c)
		c.free()
	var row: HBoxContainer
	if host is HBoxContainer:
		row = host as HBoxContainer
	else:
		row = HBoxContainer.new()
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		host.add_child(row)
	row.add_theme_constant_override("separation", 8)
	row.alignment = (
		BoxContainer.ALIGNMENT_END if align_right else BoxContainer.ALIGNMENT_BEGIN
	)
	for raw in status_chip_parts(side):
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var part: Dictionary = raw
		var chip := HBoxContainer.new()
		chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
		chip.add_theme_constant_override("separation", 3)
		var tip := str(part.get("tip", "")).strip_edges()
		if not tip.is_empty():
			chip.tooltip_text = tip
		row.add_child(chip)
		var icon_id := str(part.get("icon", ""))
		var tint: Color = part.get("color", Color("#A5B4FC", 0.95))
		if CurrencyIcon.is_asset_glyph(icon_id):
			chip.add_child(UiIcon.make(icon_id, tint, 16.0))
		var txt := str(part.get("text", "")).strip_edges()
		if not txt.is_empty():
			var lab := Label.new()
			lab.mouse_filter = Control.MOUSE_FILTER_IGNORE
			lab.text = txt
			lab.add_theme_font_size_override("font_size", 16)
			lab.add_theme_color_override("font_color", tint)
			ClientUi.apply_display_font(lab)
			chip.add_child(lab)


static func status_chip_text(side: Dictionary) -> String:
	## Plain-text fallback (logs / diagnostics).
	var bits: PackedStringArray = []
	for raw in status_chip_parts(side):
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var part: Dictionary = raw
		var t := str(part.get("text", "")).strip_edges()
		var id := str(part.get("icon", ""))
		if t.is_empty():
			bits.append(id.to_upper())
		else:
			bits.append(t)
	return " · ".join(bits)


## Authoritative end HP for skip / settle presentation.
## Prefer flat EndHp (arena ingest) → nested playerEnd.hp → last event replay.
static func resolve_end_hp(battle: Dictionary, fallback_player: int = -1, fallback_enemy: int = -1) -> Vector2i:
	var p_max := maxi(1, int(battle.get("playerMaxHp", 1)))
	var e_max := maxi(1, int(battle.get("opponentMaxHp", 1)))
	if battle.has("playerEndHp") or battle.has("opponentEndHp"):
		var p_flat := int(battle.get("playerEndHp", fallback_player if fallback_player >= 0 else p_max))
		var e_flat := int(battle.get("opponentEndHp", fallback_enemy if fallback_enemy >= 0 else e_max))
		return Vector2i(clampi(p_flat, 0, p_max), clampi(e_flat, 0, e_max))
	var player_end: Variant = battle.get("playerEnd", null)
	var opponent_end: Variant = battle.get("opponentEnd", null)
	if typeof(player_end) == TYPE_DICTIONARY and (player_end as Dictionary).has("hp"):
		var pe: Dictionary = player_end
		var oe: Dictionary = opponent_end if typeof(opponent_end) == TYPE_DICTIONARY else {}
		return Vector2i(
			clampi(int(pe.get("hp", 0)), 0, p_max),
			clampi(int(oe.get("hp", 0)), 0, e_max)
		)
	var p_hp := p_max
	var e_hp := e_max
	var events: Array = battle.get("events", []) if typeof(battle.get("events", [])) == TYPE_ARRAY else []
	for raw in events:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var ev: Dictionary = raw
		var side := str(ev.get("defender", ""))
		var heal := int(ev.get("heal", 0))
		if heal > 0:
			if side == "player":
				p_hp = mini(p_max, p_hp + heal)
			elif side == "opponent":
				e_hp = mini(e_max, e_hp + heal)
			continue
		if bool(ev.get("dodged", false)):
			continue
		var dmg := int(ev.get("damage", 0))
		if dmg <= 0:
			continue
		if side == "player":
			p_hp = maxi(0, p_hp - dmg)
		elif side == "opponent":
			e_hp = maxi(0, e_hp - dmg)
	if events.is_empty() and fallback_player >= 0 and fallback_enemy >= 0:
		return Vector2i(clampi(fallback_player, 0, p_max), clampi(fallback_enemy, 0, e_max))
	return Vector2i(p_hp, e_hp)


static func format_log_line(ev: Dictionary, i: int) -> String:
	if str(ev.get("text", "")) != "":
		return "#%s %s" % [i + 1, str(ev.get("text", ""))]
	var ability_bit := _format_ability_log_bit(ev)
	if not ability_bit.is_empty():
		return "#%s %s" % [i + 1, ability_bit]
	if int(ev.get("heal", 0)) > 0:
		return "#%s heal +%s" % [i + 1, int(ev.get("heal", 0))]
	if bool(ev.get("dodged", false)) or str(ev.get("type", "")) == "dodge":
		return "#%s DODGE" % [i + 1]
	if str(ev.get("type", "")) == "miss" or bool(ev.get("missed", false)):
		var forced := str(ev.get("missKind", "")) == "phantom_signal"
		return "#%s %s" % [i + 1, "FORCED MISS" if forced else "MISS"]
	if int(ev.get("damage", 0)) > 0:
		return "#%s %s → %s −%s%s" % [
			i + 1,
			str(ev.get("attacker", "?")),
			str(ev.get("defender", "?")),
			int(ev.get("damage", 0)),
			" CRIT" if bool(ev.get("crit", false)) else "",
		]
	return "#%s %s" % [i + 1, str(ev.get("type", "event"))]


## Compact class-ability / passive line for the corner combat log.
static func _format_ability_log_bit(ev: Dictionary) -> String:
	var t := str(ev.get("type", ""))
	var ability := str(ev.get("ability", "")).strip_edges()
	if (t == "ability" or t == "drone") and not ability.is_empty():
		return "%s · %s" % [str(ev.get("attacker", "?")), ability]
	var kind := str(ev.get("kind", ev.get("missKind", ev.get("secondaryKind", ""))))
	var passive := str(ev.get("passive", "")).strip_edges()
	var is_passiveish := t == "passive" \
			or (t == "miss" and str(ev.get("missKind", "")) == "phantom_signal") \
			or (t == "secondary" and not passive.is_empty()) \
			or (t == "dodge" and kind == "fire_support_dodged")
	if not is_passiveish:
		return ""
	var detail := ""
	match kind:
		"dirty_trick_selected":
			detail = str(ev.get("dirtyTrick", "")).replace("_", " ").capitalize()
		"stim_injector_charge":
			detail = "%s → %s" % [str(ev.get("before", 0)), str(ev.get("after", 0))]
		"orbital_assistant_activated":
			detail = str(ev.get("effect", "")).replace("_", " ").capitalize()
		"fire_support":
			detail = "Fire Support"
		"fire_support_dodged":
			detail = "Fire Support · Dodged"
		"kinetic_tantrum_strong":
			detail = "Strong"
		"kinetic_tantrum_normal":
			detail = "Normal"
		"astral_barrier_created":
			detail = "Raised"
		"astral_barrier_restored":
			detail = "Restored"
		"phantom_signal_armed":
			detail = "Primed"
		"phantom_signal_reprimed":
			detail = "Re-primed"
		"phantom_signal", "phantom_signal_miss":
			detail = "Scrambled"
		"overclock_stack_gained":
			detail = "%d → %d" % [int(ev.get("before", 0)), int(ev.get("stacks", ev.get("after", 0)))]
		"overclock_stacks_removed":
			detail = "%d → %d" % [int(ev.get("before", 0)), int(ev.get("stacks", ev.get("after", 0)))]
		"overclock_vented":
			detail = "%d → %d" % [int(ev.get("before", 0)), int(ev.get("stacks", ev.get("after", 0)))]
		"overclock_ready":
			detail = "0/%d" % OVERCLOCK_STACK_CAP
		"defensive_protocol_applied":
			detail = "Defensive Protocol"
		"defensive_protocol_consumed":
			detail = "−%s" % str(ev.get("amount", 0))
		"acquire_target_applied":
			detail = "Acquire Target"
		_:
			if passive.is_empty() and kind.is_empty():
				return ""
	var name := passive if not passive.is_empty() else kind.replace("_", " ").capitalize()
	if detail.is_empty():
		return name
	return "%s · %s" % [name, detail]


static func is_ability_log_event(ev: Dictionary) -> bool:
	return not _format_ability_log_bit(ev).is_empty()


static func is_dev_diagnostics_enabled() -> bool:
	if not BackendEnvironment.is_development_overlay_enabled():
		return false
	# Optional user toggle — default on in local/dev overlay environments.
	var cfg := ConfigFile.new()
	if cfg.load("user://presentation.cfg") == OK:
		return bool(cfg.get_value("combat", "dev_diagnostics", true))
	return true
