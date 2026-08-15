class_name ExpectedPlayerAttributes
extends RefCounted
## Balance benchmark: expected total effective attributes at a level.
## Stim-adjusted anchors already bake in typical 3-Stim combat readiness.
## Not derived from the live player. Mirrors src/lib/expectedPlayerAttributes.js.
## Do NOT apply an extra Stim multiplier on top of at(level).

const ANCHORS: Array = [
	[1, 68], [10, 383], [20, 630], [25, 745], [30, 864], [40, 1087], [50, 1277],
	[60, 1512], [70, 1718], [80, 1919], [90, 2119], [100, 2275],
	[110, 2520], [120, 2706], [130, 2893], [140, 3078], [150, 3263],
	[160, 3448], [170, 3631], [180, 3816], [190, 4001], [200, 4096],
	[250, 5365], [300, 6336], [350, 7700], [400, 8673], [450, 10095], [500, 11054],
]

const AT_500 := 11054.0
const POST_500_SLOPE := 23.9
const FINAL_ANCHOR_LEVEL := 500


static func at(level: int) -> int:
	var L := maxi(1, level)
	if L > FINAL_ANCHOR_LEVEL:
		return int(round(AT_500 + POST_500_SLOPE * float(L - FINAL_ANCHOR_LEVEL)))
	return _pchip(L)


static func _pchip(level: int) -> int:
	var X := float(level)
	for pair in ANCHORS:
		if int(pair[0]) == level:
			return int(pair[1])
	var xs: Array = []
	var ys: Array = []
	for pair in ANCHORS:
		xs.append(float(pair[0]))
		ys.append(float(pair[1]))
	var n := xs.size()
	if X < xs[0]:
		return int(round(ys[0]))
	var d := _pchip_slopes(xs, ys)
	var i := 0
	while i < n - 2 and X > xs[i + 1]:
		i += 1
	return maxi(1, int(round(_hermite(X, xs[i], xs[i + 1], ys[i], ys[i + 1], d[i], d[i + 1]))))


static func _pchip_slopes(xs: Array, ys: Array) -> Array:
	var n := xs.size()
	var d: Array = []
	d.resize(n)
	var delta: Array = []
	delta.resize(n - 1)
	for i in range(n - 1):
		delta[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i])
	d[0] = delta[0]
	d[n - 1] = delta[n - 2]
	for i in range(1, n - 1):
		if delta[i - 1] == 0.0 or delta[i] == 0.0 or sign(delta[i - 1]) != sign(delta[i]):
			d[i] = 0.0
		else:
			var w1 := 2.0 * (float(xs[i + 1]) - float(xs[i])) + (float(xs[i]) - float(xs[i - 1]))
			var w2 := (float(xs[i + 1]) - float(xs[i])) + 2.0 * (float(xs[i]) - float(xs[i - 1]))
			d[i] = (w1 + w2) / (w1 / float(delta[i - 1]) + w2 / float(delta[i]))
	return d


static func _hermite(x: float, x0: float, x1: float, y0: float, y1: float, d0: float, d1: float) -> float:
	var h := x1 - x0
	var t := (x - x0) / h
	var t2 := t * t
	var t3 := t2 * t
	var h00 := 2.0 * t3 - 3.0 * t2 + 1.0
	var h10 := t3 - 2.0 * t2 + t
	var h01 := -2.0 * t3 + 3.0 * t2
	var h11 := t3 - t2
	return h00 * y0 + h10 * h * d0 + h01 * y1 + h11 * h * d1
