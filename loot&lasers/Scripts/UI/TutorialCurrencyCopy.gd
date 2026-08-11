class_name TutorialCurrencyCopy
## Bold + tint currency names in tutorial coach body copy (matches operative console colors).

const FUEL := "#39FF14"
const STARDUST := "#E879F9"
const NOVA := "#FFD700"

const _TERMS: Array = [
	["Nova Crystals", NOVA],
	["Nova Crystal", NOVA],
	["Stardust", STARDUST],
	["stardust", STARDUST],
	["Fuel", FUEL],
	["fuel", FUEL],
]


static func colorize(text: String) -> String:
	var out := text
	for entry in _TERMS:
		out = _replace_plain(out, str(entry[0]), str(entry[1]))
	return out


static func tag(term: String, hex: String = STARDUST) -> String:
	return "[b][color=%s]%s[/color][/b]" % [hex, term]


static func _replace_plain(text: String, term: String, hex: String) -> String:
	if term.is_empty() or not text.contains(term):
		return text
	var tagged := tag(term, hex)
	var out := text
	var search_from := 0
	while true:
		var idx := out.find(term, search_from)
		if idx < 0:
			break
		if _inside_color_tag(out, idx):
			search_from = idx + term.length()
			continue
		out = out.substr(0, idx) + tagged + out.substr(idx + term.length())
		search_from = idx + tagged.length()
	return out


static func _inside_color_tag(text: String, pos: int) -> bool:
	var before := text.substr(0, pos)
	var last_open := before.rfind("[color=")
	if last_open < 0:
		return false
	var last_close := before.rfind("[/color]")
	return last_open > last_close
