class_name DerivedStatLevelCaps
extends RefCounted
## Presentation mirror of productionMath natural Dodge / Crit / Resistance level caps.
## Server `src/lib/productionMath/derivedStatCaps.js` is authoritative.

const LEVEL_CAP_LEVEL_1 := 1
const LEVEL_CAP_LEVEL_25 := 25
const LEVEL_CAP_LEVEL_75 := 75
const LEVEL_CAP_LEVEL_100 := 100

const DODGE_CAP_AT_1 := 0.08
const DODGE_CAP_AT_25 := 0.15
const DODGE_CAP_AT_75 := 0.20
const DODGE_CAP_AT_100 := 0.25

const CRIT_RESIST_CAP_AT_1 := 0.10
const CRIT_RESIST_CAP_AT_25 := 0.175
const CRIT_RESIST_CAP_AT_75 := 0.25
const CRIT_RESIST_CAP_AT_100 := 0.30

const PCHIP_SECANT_DOUBLE_WEIGHT := 2.0
const CUBIC_HERMITE_SQUARE_COEFFICIENT := 3.0
const CUBIC_HERMITE_CUBE_COEFFICIENT := 2.0
const PCHIP_ENDPOINT_SLOPE_LIMIT := 3.0

const CHANCE_PERCENT_SCALE := 100.0


static func natural_dodge_level_cap(level: int) -> float:
	var L := maxi(LEVEL_CAP_LEVEL_1, level)
	if L >= LEVEL_CAP_LEVEL_100:
		return DODGE_CAP_AT_100
	return _pchip(
		L,
		[LEVEL_CAP_LEVEL_1, LEVEL_CAP_LEVEL_25, LEVEL_CAP_LEVEL_75, LEVEL_CAP_LEVEL_100],
		[DODGE_CAP_AT_1, DODGE_CAP_AT_25, DODGE_CAP_AT_75, DODGE_CAP_AT_100],
	)


static func natural_crit_resist_level_cap(level: int) -> float:
	var L := maxi(LEVEL_CAP_LEVEL_1, level)
	if L >= LEVEL_CAP_LEVEL_100:
		return CRIT_RESIST_CAP_AT_100
	return _pchip(
		L,
		[LEVEL_CAP_LEVEL_1, LEVEL_CAP_LEVEL_25, LEVEL_CAP_LEVEL_75, LEVEL_CAP_LEVEL_100],
		[CRIT_RESIST_CAP_AT_1, CRIT_RESIST_CAP_AT_25, CRIT_RESIST_CAP_AT_75, CRIT_RESIST_CAP_AT_100],
	)


static func _pchip_end_slope(h0: float, h1: float, m0: float, m1: float) -> float:
	var d := ((PCHIP_SECANT_DOUBLE_WEIGHT * h0 + h1) * m0 - h0 * m1) / (h0 + h1)
	if sign(d) != sign(m0):
		return 0.0
	if sign(m0) != sign(m1) and absf(d) > PCHIP_ENDPOINT_SLOPE_LIMIT * absf(m0):
		return PCHIP_ENDPOINT_SLOPE_LIMIT * m0
	return d


static func _pchip(x: float, xs: Array, ys: Array) -> float:
	var n := xs.size()
	var h: Array = []
	var m: Array = []
	h.resize(n - 1)
	m.resize(n - 1)
	for i in range(n - 1):
		h[i] = float(xs[i + 1]) - float(xs[i])
		m[i] = (float(ys[i + 1]) - float(ys[i])) / h[i]
	var d: Array = []
	d.resize(n)
	d[0] = _pchip_end_slope(h[0], h[1], m[0], m[1])
	d[n - 1] = _pchip_end_slope(h[n - 2], h[n - 3], m[n - 2], m[n - 3])
	for i in range(1, n - 1):
		if m[i - 1] == 0.0 or m[i] == 0.0 or sign(m[i - 1]) != sign(m[i]):
			d[i] = 0.0
		else:
			var w1 := PCHIP_SECANT_DOUBLE_WEIGHT * h[i] + h[i - 1]
			var w2 := h[i] + PCHIP_SECANT_DOUBLE_WEIGHT * h[i - 1]
			d[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i])
	if x <= float(xs[0]):
		return float(ys[0])
	if x >= float(xs[n - 1]):
		return float(ys[n - 1])
	var k := 0
	while k < n - 2 and x > float(xs[k + 1]):
		k += 1
	var t := (x - float(xs[k])) / h[k]
	var t2 := t * t
	var t3 := t2 * t
	var h00 := CUBIC_HERMITE_CUBE_COEFFICIENT * t3 - CUBIC_HERMITE_SQUARE_COEFFICIENT * t2 + 1.0
	var h10 := t3 - CUBIC_HERMITE_CUBE_COEFFICIENT * t2 + t
	var h01 := -CUBIC_HERMITE_CUBE_COEFFICIENT * t3 + CUBIC_HERMITE_SQUARE_COEFFICIENT * t2
	var h11 := t3 - t2
	return h00 * float(ys[k]) + h10 * h[k] * d[k] + h01 * float(ys[k + 1]) + h11 * h[k] * d[k + 1]
