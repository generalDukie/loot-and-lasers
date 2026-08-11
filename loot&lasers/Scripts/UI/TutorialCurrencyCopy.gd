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
	return _replace_word(out, "dust", STARDUST)


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


static func _replace_word(text: String, word: String, hex: String) -> String:
	if word.is_empty() or not text.contains(word):
		return text
	var tagged := tag(word, hex)
	var out := text
	var search_from := 0
	while true:
		var idx := out.find(word, search_from)
		if idx < 0:
			break
		if _inside_color_tag(out, idx):
			search_from = idx + word.length()
			continue
		var before_ok := idx == 0 or not _is_word_char(out.substr(idx - 1, 1))
		var after_idx := idx + word.length()
		var after_ok := after_idx >= out.length() or not _is_word_char(out.substr(after_idx, 1))
		if before_ok and after_ok:
			out = out.substr(0, idx) + tagged + out.substr(after_idx)
			search_from = idx + tagged.length()
		else:
			search_from = idx + 1
	return out


static func _is_word_char(ch: String) -> bool:
	if ch.length() != 1:
		return false
	var code := ch.unicode_at(0)
	return (code >= 65 and code <= 90) or (code >= 97 and code <= 122)


static func _inside_color_tag(text: String, pos: int) -> bool:
	var before := text.substr(0, pos)
	var last_open := before.rfind("[color=")
	if last_open < 0:
		return false
	var last_close := before.rfind("[/color]")
	return last_open > last_close
