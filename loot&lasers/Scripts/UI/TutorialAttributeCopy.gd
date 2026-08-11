class_name TutorialAttributeCopy
## Class-specific Attributes tutorial copy (hero_upgrade step) with stat BBCode coloring.

const STAT_DISPLAY := ["Strength", "Agility", "Intellect", "Vitality", "Luck"]

const _INTELLECT_PRIMARY := (
	"Attributes act differently depending on your class. As a %s, Strength will provide you Might resistance, "
	+ "a defense against Strength based classes. Agility increases dodge chance. Intellect is your primary stat "
	+ "and it will power your tech, thus increasing your overall damage. Vitality increases your health, and Luck "
	+ "increases your chance to critically strike. You can purchase more attributes with stardust, but each purchase "
	+ "will cost more than the last."
)

const _AGILITY_PRIMARY := (
	"Attributes act differently depending on your class. As a %s, Strength provides you Might resistance, "
	+ "a defense against Strength based classes. Agility is your primary stat. It increases your damage as well as "
	+ "your dodge chance. Intellect provides Tech resistance, a defense against Intellect based classes. Vitality "
	+ "increases your health, and Luck increases your chance to critically strike. You can purchase more attributes "
	+ "with stardust, but each purchase will cost more than the last."
)

const _STRENGTH_PRIMARY := (
	"Attributes act differently depending on your class. As a %s, Strength is your primary attribute and It increases "
	+ "your damage. Agility increases dodge chance. Intellect provides Tech resistance, a defense against Intellect "
	+ "based classes. Vitality increases your health, and Luck increases your chance to critically strike. You can "
	+ "purchase more attributes with stardust, but each purchase will cost more than the last."
)


static func body_for_class(class_key: String) -> String:
	var base := _colorize_stats(_plain_for_class(class_key))
	return (
		base
		+ "\n\nSpend some of the "
		+ TutorialCurrencyCopy.tag("100 Stardust")
		+ " from your first mission — pick an attribute and press [b]Upgrade now[/b]."
	)


static func _plain_for_class(class_key: String) -> String:
	match class_key:
		"Technomancer":
			return _INTELLECT_PRIMARY % "Technomancer"
		"Cosmic Engineer":
			return _INTELLECT_PRIMARY % "Cosmic Engineer"
		"Void Runner":
			return _AGILITY_PRIMARY % "Void Runner"
		"Shadow Operative":
			return _AGILITY_PRIMARY % "Shadow Operative"
		"Vanguard":
			return _STRENGTH_PRIMARY % "Vanguard"
		"Astral Warden":
			return _STRENGTH_PRIMARY % "Astral Warden"
		_:
			return _STRENGTH_PRIMARY % "Vanguard"


static func _colorize_stats(text: String) -> String:
	var out := text
	for stat in STAT_DISPLAY:
		var key: String = stat.to_lower()
		if not GameData.STAT_COLORS.has(key):
			continue
		var idx := out.find(stat)
		if idx < 0:
			continue
		var color: Color = GameData.STAT_COLORS[key]
		var hex: String = color.to_html(false)
		var tagged := "[b][color=%s]%s[/color][/b]" % [hex, stat]
		out = out.substr(0, idx) + tagged + out.substr(idx + stat.length())
	return out
