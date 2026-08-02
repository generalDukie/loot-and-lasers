class_name ClassPassives
extends RefCounted
## Player class passives — mirrors src/lib/classPassives.js (arenaEngine hooks).

const PASSIVE_BY_CLASS := {
	"Vanguard": "Kinetic Tantrum",
	"Astral Warden": "Astral Barrier",
	"Shadow Operative": "Phantom Signal",
	"Void Runner": "Dirty Tricks",
	"Technomancer": "Overclock",
	"Cosmic Engineer": "Orbital Assistant",
}

const CLASS_ABILITY_COLORS := {
	"Vanguard": Color("#F97316"),
	"Astral Warden": Color("#C084FC"),
	"Shadow Operative": Color("#94A3B8"),
	"Void Runner": Color("#34D399"),
	"Technomancer": Color("#38BDF8"),
	"Cosmic Engineer": Color("#FBBF24"),
}

const OVERCLOCK_DEALT := 0.125
const OVERCLOCK_TAKEN := 0.05
const OVERCLOCK_CRIT_LOSS := 3
const ASTRAL_CHANCE := 0.1
const ASTRAL_FRAC := 0.15
const PHANTOM_CHARGES := 2
const DIRTY_BONUS := 0.075
const FIRE_SUPPORT_FRAC := 0.6
const DEFENSIVE_REDUCTION := 0.25
const ACQUIRE_CRIT := 0.4
const STRONG_TANTRUM_CRIT := 2.0

const DIRTY_TRICKS := ["flashbang", "targeting_beacon", "stim_injector"]
const ORBITAL_EFFECTS := ["fire_support", "defensive_protocol", "acquire_target"]


static func create_state() -> Dictionary:
	return {
		"kineticTantrum": null,
		"phantomCharges": 0,
		"dirtyTrick": null,
		"overclockStacks": 0,
		"engineerTurns": 0,
		"nextIncomingDamageMult": 1.0,
		"nextAttackCritBonus": 0.0,
	}


static func on_combat_start(fighter: Dictionary) -> Array:
	var events: Array = []
	if bool(fighter.get("suppressClassPassive", false)) or fighter.get("className") == null:
		fighter["passive"] = null
		fighter["barrier"] = 0
		fighter["passiveState"] = create_state()
		return events
	var cls := str(fighter.get("className", ""))
	fighter["passive"] = PASSIVE_BY_CLASS.get(cls, null)
	fighter["barrier"] = 0
	fighter["passiveState"] = create_state()
	var ps: Dictionary = fighter["passiveState"]

	if cls == "Shadow Operative":
		ps["phantomCharges"] = PHANTOM_CHARGES
		events.append({
			"type": "passive",
			"kind": "phantom_signal_armed",
			"passive": "Phantom Signal",
			"side": fighter["side"],
			"charges": PHANTOM_CHARGES,
			"text": "%s arms Phantom Signal (%s)" % [fighter["name"], PHANTOM_CHARGES],
		})
	elif cls == "Void Runner":
		var trick: String = DIRTY_TRICKS[randi() % DIRTY_TRICKS.size()]
		ps["dirtyTrick"] = trick
		if trick == "flashbang":
			fighter["dodge"] = float(fighter.get("dodge", 0.0)) + DIRTY_BONUS
		elif trick == "targeting_beacon":
			fighter["crit"] = float(fighter.get("crit", 0.0)) + DIRTY_BONUS
		events.append({
			"type": "passive",
			"kind": "dirty_trick_selected",
			"passive": "Dirty Tricks",
			"dirtyTrick": trick,
			"side": fighter["side"],
			"text": "%s Dirty Trick: %s" % [fighter["name"], trick.replace("_", " ")],
		})
	elif cls == "Technomancer":
		events.append({
			"type": "passive",
			"kind": "overclock_ready",
			"passive": "Overclock",
			"side": fighter["side"],
			"text": "%s Overclock ready" % fighter["name"],
		})
	return events


static func has_stim_injector(fighter: Dictionary) -> bool:
	return str(fighter.get("className", "")) == "Void Runner" \
		and str(fighter.get("passiveState", {}).get("dirtyTrick", "")) == "stim_injector"


static func on_turn_start(fighter: Dictionary) -> Array:
	var events: Array = []
	if str(fighter.get("className", "")) != "Astral Warden":
		return events
	if randf() < ASTRAL_CHANCE:
		var full := int(round(float(fighter.get("maxHp", 0)) * ASTRAL_FRAC))
		fighter["barrier"] = full
		events.append({
			"type": "passive",
			"kind": "astral_barrier_created",
			"passive": "Astral Barrier",
			"side": fighter["side"],
			"text": "%s Astral Barrier (%s)" % [fighter["name"], full],
		})
	return events


static func try_phantom_miss(defender: Dictionary) -> bool:
	if str(defender.get("className", "")) != "Shadow Operative":
		return false
	var ps: Dictionary = defender.get("passiveState", {})
	if int(ps.get("phantomCharges", 0)) <= 0:
		return false
	ps["phantomCharges"] = int(ps["phantomCharges"]) - 1
	return true


## Extra miss event payload when Phantom Signal fires (caller appends when try_phantom_miss).
static func phantom_miss_event(defender: Dictionary, attacker: Dictionary) -> Dictionary:
	var left := int(defender.get("passiveState", {}).get("phantomCharges", 0))
	return {
		"type": "miss",
		"missKind": "phantom_signal",
		"kind": "phantom_signal_miss",
		"passive": "Phantom Signal",
		"attacker": attacker.get("side", ""),
		"defender": defender.get("side", ""),
		"side": defender.get("side", ""),
		"chargesRemaining": left,
		"damage": 0,
		"crit": false,
		"text": "%s Phantom Signal — miss!" % defender["name"],
	}


static func activate_tantrum(vanguard: Dictionary, strength: String) -> void:
	if str(vanguard.get("className", "")) != "Vanguard":
		return
	var ps: Dictionary = vanguard.get("passiveState", {})
	# Strong always overrides Normal — never downgrade.
	if strength == "normal" and str(ps.get("kineticTantrum", "")) == "strong":
		return
	ps["kineticTantrum"] = strength


static func on_dodge(dodger: Dictionary, attacker: Dictionary) -> void:
	activate_tantrum(dodger, "normal")
	activate_tantrum(attacker, "strong")


static func begin_attack_mods(attacker: Dictionary) -> Dictionary:
	var ps: Dictionary = attacker.get("passiveState", {})
	var mode = ps.get("kineticTantrum", null)
	var mods := {
		"guaranteedHit": false,
		"guaranteedCrit": false,
		"critMultOverride": null,
		"critBonusFlat": 0.0,
		"kineticMode": mode,
	}
	if mode == "strong":
		mods["guaranteedHit"] = true
		mods["guaranteedCrit"] = true
		mods["critMultOverride"] = STRONG_TANTRUM_CRIT
	elif mode == "normal":
		mods["guaranteedCrit"] = true
	var bonus := float(ps.get("nextAttackCritBonus", 0.0))
	if bonus > 0.0:
		mods["critBonusFlat"] = bonus
	return mods


static func end_attack_mods(attacker: Dictionary, mods: Dictionary) -> void:
	var ps: Dictionary = attacker.get("passiveState", {})
	var mode = mods.get("kineticMode", null)
	if mode != null and str(ps.get("kineticTantrum", "")) == str(mode):
		ps["kineticTantrum"] = null
	if float(mods.get("critBonusFlat", 0.0)) > 0.0:
		ps["nextAttackCritBonus"] = 0.0


static func overclock_dealt(fighter: Dictionary) -> float:
	var n := int(fighter.get("passiveState", {}).get("overclockStacks", 0))
	return 1.0 + OVERCLOCK_DEALT * float(n)


static func overclock_taken(fighter: Dictionary) -> float:
	var n := int(fighter.get("passiveState", {}).get("overclockStacks", 0))
	return 1.0 + OVERCLOCK_TAKEN * float(n)


static func on_hit_dealt(attacker: Dictionary) -> void:
	if str(attacker.get("className", "")) != "Technomancer":
		return
	var ps: Dictionary = attacker.get("passiveState", {})
	ps["overclockStacks"] = int(ps.get("overclockStacks", 0)) + 1


static func on_crit_taken(defender: Dictionary) -> void:
	if str(defender.get("className", "")) != "Technomancer":
		return
	var ps: Dictionary = defender.get("passiveState", {})
	ps["overclockStacks"] = maxi(0, int(ps.get("overclockStacks", 0)) - OVERCLOCK_CRIT_LOSS)


## After Cosmic Engineer's normal attack resolves (every 2nd turn).
static func maybe_orbital(engineer: Dictionary, opponent: Dictionary) -> Array:
	var events: Array = []
	if str(engineer.get("className", "")) != "Cosmic Engineer":
		return events
	var ps: Dictionary = engineer.get("passiveState", {})
	ps["engineerTurns"] = int(ps.get("engineerTurns", 0)) + 1
	if int(ps["engineerTurns"]) % 2 != 0:
		return events
	var effect: String = ORBITAL_EFFECTS[randi() % ORBITAL_EFFECTS.size()]
	events.append({
		"type": "passive",
		"kind": "orbital_assistant_activated",
		"passive": "Orbital Assistant",
		"effect": effect,
		"side": engineer["side"],
		"text": "%s Orbital Assistant: %s" % [engineer["name"], effect.replace("_", " ")],
	})
	if effect == "fire_support":
		var raw := maxi(0, int(round(float(engineer.get("standardAttack", 0)) * FIRE_SUPPORT_FRAC)))
		var barrier := int(opponent.get("barrier", 0))
		var hp_dmg := raw
		if barrier > 0 and raw > 0:
			var absorb := mini(barrier, raw)
			opponent["barrier"] = barrier - absorb
			hp_dmg = raw - absorb
		opponent["hp"] = maxi(0, int(opponent.get("hp", 0)) - hp_dmg)
		events.append({
			"type": "drone",
			"ability": "Fire Support",
			"attacker": engineer["side"],
			"defender": opponent["side"],
			"damage": hp_dmg,
			"crit": false,
			"text": "Orbital Assistant Fire Support deals %s True Damage" % hp_dmg,
		})
	elif effect == "defensive_protocol":
		ps["nextIncomingDamageMult"] = 1.0 - DEFENSIVE_REDUCTION
		events.append({
			"type": "passive",
			"kind": "defensive_protocol_applied",
			"passive": "Orbital Assistant",
			"side": engineer["side"],
			"text": "%s Defensive Protocol" % engineer["name"],
		})
	else:
		ps["nextAttackCritBonus"] = ACQUIRE_CRIT
		events.append({
			"type": "passive",
			"kind": "acquire_target_applied",
			"passive": "Orbital Assistant",
			"side": engineer["side"],
			"text": "%s Acquire Target" % engineer["name"],
		})
	return events


static func apply_incoming_mult(defender: Dictionary, dmg: float) -> float:
	var ps: Dictionary = defender.get("passiveState", {})
	var m := float(ps.get("nextIncomingDamageMult", 1.0))
	ps["nextIncomingDamageMult"] = 1.0
	return dmg * m


## Combat UI callout from a battle event — mirrors web resolveAbilityBanner.
static func resolve_ability_banner(ev: Dictionary, player: Dictionary, opponent: Dictionary) -> Dictionary:
	if ev.is_empty():
		return {}
	var t := str(ev.get("type", ""))
	if (t == "ability" or t == "drone") and ev.get("ability", null) != null:
		var side := "opponent" if str(ev.get("attacker", "")) == "opponent" else "player"
		var fighter: Dictionary = player if side == "player" else opponent
		var cls_name := str(fighter.get("class", fighter.get("className", "")))
		return {
			"name": str(ev.get("ability", "")),
			"detail": "",
			"className": cls_name,
			"side": side,
			"color": CLASS_ABILITY_COLORS.get(cls_name, Color("#22D3EE") if side == "player" else Color("#FB7185")),
		}

	var kind := str(ev.get("kind", ev.get("missKind", ev.get("secondaryKind", ""))))
	var is_passiveish := t == "passive" \
		or (t == "miss" and str(ev.get("missKind", "")) == "phantom_signal") \
		or (t == "secondary" and bool(ev.get("passive", false)))
	var banner_kinds := {
		"dirty_trick_selected": true,
		"orbital_assistant_activated": true,
		"kinetic_tantrum_normal": true,
		"kinetic_tantrum_strong": true,
		"astral_barrier_created": true,
		"astral_barrier_restored": true,
		"phantom_signal_armed": true,
		"phantom_signal_miss": true,
		"overclock_stack_gained": true,
		"overclock_stacks_removed": true,
		"overclock_ready": true,
		"defensive_protocol_applied": true,
		"acquire_target_applied": true,
	}
	if not is_passiveish or not banner_kinds.has(kind):
		return {}

	var resolved_side := "player"
	if str(ev.get("side", "")) in ["player", "opponent"]:
		resolved_side = str(ev["side"])
	elif t == "miss" and str(ev.get("defender", "")) in ["player", "opponent"]:
		resolved_side = str(ev["defender"])
	elif str(ev.get("attacker", "")) in ["player", "opponent"]:
		resolved_side = str(ev["attacker"])

	var fighter2: Dictionary = player if resolved_side == "player" else opponent
	var cls_name2 := str(fighter2.get("class", fighter2.get("className", "")))
	var pname := str(ev.get("passive", PASSIVE_BY_CLASS.get(cls_name2, "Class Ability")))
	var detail := ""
	match kind:
		"dirty_trick_selected":
			detail = str(ev.get("dirtyTrick", "")).replace("_", " ").capitalize()
		"orbital_assistant_activated":
			detail = str(ev.get("effect", "")).replace("_", " ").capitalize()
		"kinetic_tantrum_strong":
			detail = "Strong"
		"kinetic_tantrum_normal":
			detail = "Normal"
		"astral_barrier_created":
			detail = "Raised"
		"astral_barrier_restored":
			detail = "Restored"
		"phantom_signal_armed":
			detail = "%s charges" % str(ev.get("charges", 2))
		"phantom_signal_miss":
			detail = "Miss · %s left" % str(ev.get("chargesRemaining", 0))
		"overclock_stack_gained":
			detail = "Stack %s" % str(ev.get("stacks", 0))
		"overclock_stacks_removed":
			detail = "−%s → %s" % [str(ev.get("removed", 0)), str(ev.get("stacks", 0))]
		"overclock_ready":
			detail = "Armed"
		"defensive_protocol_applied":
			detail = "Defensive Protocol"
		"acquire_target_applied":
			detail = "Acquire Target"
	return {
		"name": pname,
		"detail": detail,
		"className": cls_name2,
		"side": resolved_side,
		"color": CLASS_ABILITY_COLORS.get(cls_name2, Color("#22D3EE") if resolved_side == "player" else Color("#FB7185")),
		"kind": kind,
	}
