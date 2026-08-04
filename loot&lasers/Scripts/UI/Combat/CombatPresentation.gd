extends RefCounted
class_name CombatPresentation
## Presentation helpers for duel overlays (Restoration 29).
## Observes combat events only — never mutates gameplay.


static func damage_type_color(dtype: String) -> Color:
	match dtype:
		"MIGHT":
			return Color("#F87171")
		"REFLEX":
			return Color("#4ADE80")
		"TECH":
			return Color("#60A5FA")
		"TRUE":
			return Color("#E879F9")
		_:
			return Color("#FCA5A5")


static func empty_side() -> Dictionary:
	return {
		"barrier": 0,
		"barrier_max": 0,
		"phantom_charges": 0,
		"overclock_stacks": 0,
		"dirty_trick": "",
		"kinetic_tantrum": "",
		"drone_ready": false,
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
	if kind == "phantom_signal_armed":
		if not slot.is_empty():
			slot["phantom_charges"] = int(ev.get("charges", 2))
		return
	if kind == "phantom_signal_miss" or (str(ev.get("type", "")) == "miss" and str(ev.get("missKind", "")) == "phantom_signal"):
		var def: Dictionary = _slot(state, str(ev.get("defender", "")))
		if def.is_empty():
			return
		if ev.has("chargesRemaining"):
			def["phantom_charges"] = int(ev.get("chargesRemaining", 0))
		else:
			def["phantom_charges"] = maxi(0, int(def.get("phantom_charges", 0)) - 1)
		return
	if kind == "overclock_stack_gained" or kind == "overclock_ready":
		if not slot.is_empty():
			slot["overclock_stacks"] = int(ev.get("stacks", 0))
		return
	if kind == "overclock_stacks_removed":
		if not slot.is_empty():
			slot["overclock_stacks"] = int(ev.get("stacks", 0))
		return
	if kind == "dirty_trick_selected" or str(ev.get("dirtyTrick", "")) != "":
		if not slot.is_empty():
			slot["dirty_trick"] = str(ev.get("dirtyTrick", ""))
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
	if str(ev.get("passive", "")).begins_with("Orbital") or kind.contains("drone") or kind.contains("fire_support") or kind.contains("acquire_target") or kind.contains("defensive_protocol"):
		if not slot.is_empty():
			slot["drone_ready"] = true


static func floater_label(ev: Dictionary) -> Dictionary:
	if int(ev.get("heal", 0)) > 0:
		return {"label": "+%s" % int(ev.get("heal", 0)), "color": Color("#86EFAC"), "crit": false}
	if str(ev.get("type", "")) == "dodge" or bool(ev.get("dodged", false)):
		return {"label": "DODGE", "color": Color("#67E8F9"), "crit": false}
	if str(ev.get("type", "")) == "miss" or bool(ev.get("missed", false)):
		if str(ev.get("missKind", "")) == "phantom_signal" or str(ev.get("kind", "")) == "phantom_signal_miss":
			return {"label": "FORCED MISS", "color": Color("#C084FC"), "crit": false}
		return {"label": "MISS", "color": Color("#94A3B8"), "crit": false}
	if str(ev.get("type", "")) == "barrier":
		if str(ev.get("kind", "")) == "barrier_broken":
			return {"label": "BARRIER BREAK", "color": Color("#67E8F9"), "crit": false}
		return {"label": "SHIELD −%s" % int(ev.get("absorbed", 0)), "color": Color("#67E8F9"), "crit": false}
	var dmg := int(ev.get("damage", 0))
	if bool(ev.get("shieldHit", false)) and dmg <= 0:
		return {"label": "BLOCK", "color": Color("#67E8F9"), "crit": false}
	if dmg > 0:
		var dtype := str(ev.get("damageType", ""))
		var col := damage_type_color(dtype)
		var prefix := ""
		if dtype == "TRUE":
			prefix = "TRUE "
		elif bool(ev.get("crit", false)):
			prefix = "CRIT "
		var shield := ""
		if bool(ev.get("shieldHit", false)) and int(ev.get("barrierAbsorbed", 0)) > 0:
			shield = " · SHIELD −%s" % int(ev.get("barrierAbsorbed", 0))
		return {"label": "%s−%s%s" % [prefix, dmg, shield], "color": col, "crit": bool(ev.get("crit", false)) or dtype == "TRUE"}
	if str(ev.get("type", "")) == "passive":
		return {"label": "✧", "color": Color("#C084FC"), "crit": false}
	return {}


static func status_chip_text(side: Dictionary) -> String:
	var parts: PackedStringArray = []
	if int(side.get("barrier", 0)) > 0:
		parts.append("🛡 %s" % int(side.get("barrier", 0)))
	if int(side.get("phantom_charges", 0)) > 0:
		parts.append("👻 ×%s" % int(side.get("phantom_charges", 0)))
	if int(side.get("overclock_stacks", 0)) > 0:
		parts.append("⚡ OC %s" % int(side.get("overclock_stacks", 0)))
	var kt := str(side.get("kinetic_tantrum", ""))
	if kt == "strong":
		parts.append("💥 2.0×")
	elif kt == "normal":
		parts.append("💥 1.5×")
	var trick := str(side.get("dirty_trick", ""))
	if not trick.is_empty():
		parts.append("🃏 %s" % trick.replace("_", " "))
	if bool(side.get("drone_ready", false)):
		parts.append("🛸")
	return " · ".join(parts)


static func format_log_line(ev: Dictionary, i: int) -> String:
	if str(ev.get("text", "")) != "":
		return "#%s %s" % [i + 1, str(ev.get("text", ""))]
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


static func is_dev_diagnostics_enabled() -> bool:
	if not BackendEnvironment.is_development_overlay_enabled():
		return false
	# Optional user toggle — default on in local/dev overlay environments.
	var cfg := ConfigFile.new()
	if cfg.load("user://presentation.cfg") == OK:
		return bool(cfg.get_value("combat", "dev_diagnostics", true))
	return true
