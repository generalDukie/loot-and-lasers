class_name ClassPassives
extends RefCounted
## Combat UI callouts from Node combat events (mirrors web resolveAbilityBanner).

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

## Presentation mirrors of src/lib/classPassives.js — Node combat events are authority.
const OVERCLOCK_STACK_CAP := 6
const STRONG_TANTRUM_CRIT_MULT := 2.0
const NORMAL_TANTRUM_CRIT_MULT := 1.5


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
		or (t == "secondary" and ev.get("passive", null) != null) \
		or (t == "dodge" and str(ev.get("kind", "")) == "fire_support_dodged")
	var banner_kinds := {
		"dirty_trick_selected": true,
		"orbital_assistant_activated": true,
		"fire_support": true,
		"fire_support_dodged": true,
		"kinetic_tantrum_normal": true,
		"kinetic_tantrum_strong": true,
		"astral_barrier_created": true,
		"astral_barrier_restored": true,
		"phantom_signal_armed": true,
		"phantom_signal_reprimed": true,
		"phantom_signal": true,
		"phantom_signal_miss": true,
		"overclock_stack_gained": true,
		"overclock_stacks_removed": true,
		"overclock_vented": true,
		"overclock_ready": true,
		"defensive_protocol_applied": true,
		"defensive_protocol_consumed": true,
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
		"stim_injector_charge":
			detail = "%s → %s" % [str(ev.get("before", 0)), str(ev.get("after", 0))]
		"orbital_assistant_activated":
			detail = str(ev.get("effect", "")).replace("_", " ").capitalize()
		"fire_support":
			detail = "Fire Support"
		"fire_support_dodged":
			detail = "Fire Support · Dodged"
		"kinetic_tantrum_strong":
			detail = "%.1f× guaranteed hit" % STRONG_TANTRUM_CRIT_MULT
		"kinetic_tantrum_normal":
			detail = "%.1f×" % NORMAL_TANTRUM_CRIT_MULT
		"astral_barrier_created":
			detail = "%s shield" % str(ev.get("barrier", ev.get("barrierMax", 0)))
		"astral_barrier_restored":
			detail = "Refresh %s" % str(ev.get("barrier", ev.get("barrierMax", 0)))
		"phantom_signal_armed", "phantom_signal_reprimed":
			detail = "Primed"
		"phantom_signal", "phantom_signal_miss":
			detail = "Scrambled"
		"overclock_stack_gained":
			detail = "%s → %s" % [str(ev.get("before", 0)), str(ev.get("stacks", 0))]
		"overclock_stacks_removed":
			detail = "%s → %s" % [str(ev.get("before", 0)), str(ev.get("stacks", 0))]
		"overclock_vented":
			detail = "%s → %s" % [str(ev.get("before", 0)), str(ev.get("stacks", 0))]
		"overclock_ready":
			detail = "0/%s" % OVERCLOCK_STACK_CAP
		"defensive_protocol_applied":
			detail = "Defensive Protocol"
		"defensive_protocol_consumed":
			detail = "−%s" % str(ev.get("amount", 0))
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
