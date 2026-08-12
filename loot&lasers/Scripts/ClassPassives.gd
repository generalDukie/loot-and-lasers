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
