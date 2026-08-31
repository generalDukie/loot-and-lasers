class_name NumberDisplay
extends RefCounted
## Player-facing quantity labels. Stored values stay full integers; this is display only.
## Under 100,000: grouped with commas. 100,000+: K / M / B / T.
## Nova Crystals never abbreviate.

const ABBREV_THRESHOLD := 100_000
const GROUP_SIZE := 1_000
const THOUSAND := 1_000
const MILLION := 1_000_000
const BILLION := 1_000_000_000
const TRILLION := 1_000_000_000_000
const K_FRAC_DIGITS := 1
const LARGE_FRAC_DIGITS := 2
const SUFFIX_K := "K"
const SUFFIX_M := "M"
const SUFFIX_B := "B"
const SUFFIX_T := "T"
const GROUP_SEPARATOR := ","
const DECIMAL_POINT := "."
const NOVA_HALF_STEP := 0.5
const TEN := 10


static func quantity(value: Variant) -> String:
	var n := to_int(value)
	var negative := n < 0
	var absn := absi(n)
	if absn < ABBREV_THRESHOLD:
		return _signed(negative, _comma_group(absn))
	return _signed(negative, _abbreviate(absn))


static func quantity_exact(value: Variant) -> String:
	var n := to_int(value)
	var negative := n < 0
	return _signed(negative, _comma_group(absi(n)))


static func signed_quantity(value: Variant) -> String:
	var n := to_int(value)
	if n > 0:
		return "+" + quantity(n)
	return quantity(n)


## Nova: exact display amount with commas, never K/M/B.
## Half-units are the storage quantum (1 Nova = 2); a leftover half always shows as .5.
static func nova(value: Variant) -> String:
	var half := int(round(float(value) / NOVA_HALF_STEP))
	var negative := half < 0
	var abs_half := absi(half)
	var whole := abs_half / 2
	var text := _comma_group(whole)
	if abs_half % 2 == 1:
		text += DECIMAL_POINT + "5"
	return _signed(negative, text)


static func currency_amount(amount: Variant, icon_id: String) -> String:
	var prefix := ""
	var raw: Variant = amount
	if typeof(amount) == TYPE_STRING:
		var s := String(amount).strip_edges()
		if s.begins_with("+") or s.begins_with("-"):
			prefix = s.substr(0, 1)
			s = s.substr(1)
		if s.is_valid_int():
			raw = int(s)
		elif s.is_valid_float():
			raw = float(s)
		else:
			return String(amount)
	var body := nova(raw) if _is_nova_icon(icon_id) else quantity(raw)
	return prefix + body


static func _is_nova_icon(icon_id: String) -> bool:
	var key := icon_id.strip_edges().to_lower()
	return key == "nova" or key == "nova_crystals" or key == "nova crystals"


static func to_int(value: Variant) -> int:
	if value == null:
		return 0
	match typeof(value):
		TYPE_INT:
			return int(value)
		TYPE_FLOAT:
			return int(value)
		TYPE_STRING:
			var s := String(value).strip_edges()
			if s.is_empty():
				return 0
			if s.is_valid_int():
				return int(s)
			if s.is_valid_float():
				return int(float(s))
			return 0
		_:
			return int(value)


static func _signed(negative: bool, body: String) -> String:
	return ("-" if negative else "") + body


static func _comma_group(absn: int) -> String:
	var s := str(absn)
	var out := ""
	while s.length() > 3:
		out = GROUP_SEPARATOR + s.substr(s.length() - 3, 3) + out
		s = s.substr(0, s.length() - 3)
	return s + out


static func _pow10(digits: int) -> int:
	var p := 1
	for i in range(digits):
		p *= TEN
	return p


static func _div_round_half_up(numerator: int, denominator: int) -> int:
	if denominator <= 0:
		return 0
	return (numerator + denominator / 2) / denominator


static func _abbreviate(absn: int) -> String:
	var divisor := THOUSAND
	var frac_digits := K_FRAC_DIGITS
	var suffix := SUFFIX_K
	if absn >= TRILLION:
		divisor = TRILLION
		frac_digits = LARGE_FRAC_DIGITS
		suffix = SUFFIX_T
	elif absn >= BILLION:
		divisor = BILLION
		frac_digits = LARGE_FRAC_DIGITS
		suffix = SUFFIX_B
	elif absn >= MILLION:
		divisor = MILLION
		frac_digits = LARGE_FRAC_DIGITS
		suffix = SUFFIX_M
	var scale := _pow10(frac_digits)
	var rounded := _div_round_half_up(absn * scale, divisor)
	if rounded >= GROUP_SIZE * scale:
		if divisor == THOUSAND:
			divisor = MILLION
			frac_digits = LARGE_FRAC_DIGITS
			suffix = SUFFIX_M
		elif divisor == MILLION:
			divisor = BILLION
			frac_digits = LARGE_FRAC_DIGITS
			suffix = SUFFIX_B
		elif divisor == BILLION:
			divisor = TRILLION
			frac_digits = LARGE_FRAC_DIGITS
			suffix = SUFFIX_T
		scale = _pow10(frac_digits)
		rounded = _div_round_half_up(absn * scale, divisor)
	return _mantissa(rounded, scale) + suffix


static func _mantissa(rounded: int, scale: int) -> String:
	var whole := rounded / scale
	var frac := rounded % scale
	if frac == 0:
		return str(whole)
	var frac_str := str(frac).pad_zeros(str(scale).length() - 1)
	return str(whole) + DECIMAL_POINT + frac_str
