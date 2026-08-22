class_name StardustEconomy
extends RefCounted
## Client mirror of server/src/shared/stardustEconomy.js — StardustPerFuel,
## attribute costs, vendor values, mission/arena/mining currency rules.
## XP, fuel costs, combat, and gear STAT budgets are intentionally out of scope.

# ── Pity / drop constants ─────────────────────────────────────
const MISSION_GEAR_BASE_CHANCE := 0.2
const MISSION_GEAR_PITY_INCREMENT := 0.025
## Soft upper bound so pity never exceeds a guaranteed drop. Spec has no 50% cap.
const MISSION_GEAR_DROP_CAP := 1.0
const MISSION_STIM_CHANCE_AFTER_GEAR_FAIL := 0.25
const MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL := 0.75
## @deprecated alias — prefer MISSION_JUNK_CHANCE_AFTER_GEAR_AND_STIM_FAIL
const MISSION_JUNK_CHANCE_ON_GEAR_FAIL := 0.75
const JUNK_AVG_MISSION_REWARD_RATIO := 0.45
const JUNK_VALUE_MULT_MIN := 0.6
const JUNK_VALUE_MULT_MAX := 1.4

const GEAR_BASE_FUEL_EQUIVALENT := 2.0
const RARITY_SALE_MULT := {
	"common": 0.7,
	"uncommon": 0.85,
	"rare": 1.0,
	"epic": 1.2,
	"legendary": 1.75,
}
const WEAPON_VENDOR_MULT := 1.2
const SHIP_MODULE_VENDOR_MULT := 1.2

const ARENA_REWARDED_WINS_PER_DAY := 10
const ARENA_WIN_FUEL_EQUIVALENT := 2.25
const MINING_EFFICIENCY := 0.03
const MINUTES_PER_HOUR := 60.0
const STARDUST_PER_FUEL_BASE := 50.0
const STARDUST_PER_FUEL_GROWTH_COEFFICIENT := 1.009
const STARDUST_PER_FUEL_LEVEL_EXPONENT := 1.625
const STARDUST_PER_FUEL_ACCELERATION_LEVEL := 166.66
const STARDUST_PER_FUEL_ACCELERATION_EXPONENT := 3.055
const DROP_CHANCE_PRECISION := 0.0001

## @deprecated Historical PCHIP waypoints — not production authority (Restoration 11).
## AttributePurchaseCost still uses PCHIP; StardustPerFuel uses the closed form below.
const STARDUST_PER_FUEL_ANCHORS := [
	[1, 50],
	[10, 80],
	[25, 250],
	[50, 600],
	[75, 1200],
	[100, 2250],
	[150, 6000],
	[200, 15000],
	[250, 35000],
	[300, 75000],
]

## AttributePurchaseCost anchors (absolute Stardust).
## @deprecated Historical PCHIP waypoints — not live attrcost authority (Phase 1 uses Horner).
const ATTRIBUTE_PURCHASE_COST_ANCHORS := [
	[1, 100],
	[10, 150],
	[20, 250],
	[30, 400],
	[40, 650],
	[50, 1000],
	[75, 2250],
	[100, 5000],
	[150, 15000],
	[200, 40000],
	[300, 200000],
	[400, 750000],
	[500, 2250000],
	[600, 6000000],
	[650, 10000000],
]


# ── Log-space monotone cubic PCHIP ───────────────────────────

static func _pchip_slopes(xs: Array, ys: Array) -> Array:
	var n := xs.size()
	var d: Array = []
	d.resize(n)
	var delta: Array = []
	delta.resize(n - 1)
	for i in range(n - 1):
		delta[i] = (float(ys[i + 1]) - float(ys[i])) / (float(xs[i + 1]) - float(xs[i]))
	d[0] = delta[0]
	d[n - 1] = delta[n - 2]
	for i in range(1, n - 1):
		var d_prev: float = delta[i - 1]
		var d_cur: float = delta[i]
		if d_prev == 0.0 or d_cur == 0.0 or sign(d_prev) != sign(d_cur):
			d[i] = 0.0
		else:
			var w1 := 2.0 * (float(xs[i + 1]) - float(xs[i])) + (float(xs[i]) - float(xs[i - 1]))
			var w2 := (float(xs[i + 1]) - float(xs[i])) + 2.0 * (float(xs[i]) - float(xs[i - 1]))
			d[i] = (w1 + w2) / (w1 / d_prev + w2 / d_cur)
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


## Evaluate log-space PCHIP over positive anchors; exact at anchors;
## power-law extrapolation past the last two anchors.
static func log_pchip_anchors(anchors: Array, x: float) -> int:
	if anchors.is_empty():
		return 0
	var pts: Array = []
	for a in anchors:
		pts.append([float(a[0]), float(a[1])])
	var X := maxf(float(pts[0][0]), x)

	for p in pts:
		if X == float(p[0]):
			return int(round(float(p[1])))

	var last: Array = pts[pts.size() - 1]
	var prev: Array = pts[pts.size() - 2] if pts.size() >= 2 else last
	if X > float(last[0]):
		var ratio := float(last[1]) / float(prev[1])
		var expn := (X - float(last[0])) / (float(last[0]) - float(prev[0]))
		return maxi(1, int(round(float(last[1]) * pow(ratio, expn))))

	if X < float(pts[0][0]):
		return int(round(float(pts[0][1])))

	var xs: Array = []
	var lny: Array = []
	for p in pts:
		xs.append(float(p[0]))
		lny.append(log(float(p[1])))
	var d := _pchip_slopes(xs, lny)

	var i := 0
	while i < xs.size() - 2 and X > float(xs[i + 1]):
		i += 1

	var y_log := _hermite(
		X,
		float(xs[i]), float(xs[i + 1]),
		float(lny[i]), float(lny[i + 1]),
		float(d[i]), float(d[i + 1])
	)
	return maxi(1, int(round(exp(y_log))))


## StardustPerFuel(L) = ROUND(50 + 1.009 × (L-1)^1.625 × (1 + (L/166.66)^3.055))
static func stardust_per_fuel(level: int = 1) -> int:
	var L := maxi(1, level)
	if L <= 1:
		return int(STARDUST_PER_FUEL_BASE)
	var growth := (
		STARDUST_PER_FUEL_GROWTH_COEFFICIENT
		* pow(float(L - 1), STARDUST_PER_FUEL_LEVEL_EXPONENT)
		* (
			1.0
			+ pow(
				float(L) / STARDUST_PER_FUEL_ACCELERATION_LEVEL,
				STARDUST_PER_FUEL_ACCELERATION_EXPONENT,
			)
		)
	)
	return maxi(1, int(round(STARDUST_PER_FUEL_BASE + growth)))


const ATTR_COST_HORNER := [
	0.00263490059,
	-0.0530391365,
	0.411171165,
	-0.985347882,
	-0.461561195,
	7.41094646,
]
const ATTR_COST_LOG_OFFSET := 20.0
const ATTR_INTRO_PURCHASE_COUNT := 5
const ATTR_INTRO_PURCHASE_COST_1 := 10
const ATTR_INTRO_PURCHASE_COST_2 := 20
const ATTR_INTRO_PURCHASE_COST_3 := 40
const ATTR_INTRO_PURCHASE_COST_4 := 60
const ATTR_INTRO_PURCHASE_COST_5 := 80
const ATTR_INTRO_PURCHASE_COSTS := [
	ATTR_INTRO_PURCHASE_COST_1,
	ATTR_INTRO_PURCHASE_COST_2,
	ATTR_INTRO_PURCHASE_COST_3,
	ATTR_INTRO_PURCHASE_COST_4,
	ATTR_INTRO_PURCHASE_COST_5,
]


static func attribute_purchase_cost(purchase_number: int = 1) -> int:
	## Certified Horner attrcost preview. Unchanged. Not the live per-stat purchase price.
	var n := maxi(1, purchase_number)
	var z := log(float(n) + ATTR_COST_LOG_OFFSET)
	var v := 0.0
	for q in ATTR_COST_HORNER:
		v = v * z + float(q)
	return maxi(1, int(floor(exp(v) + 0.5)))


static func permanent_attribute_purchase_cost(purchase_number: int = 1) -> int:
	## Preview-only mirror of productionMath.permanentAttributePurchaseCost.
	## Per-stat purchase index. Server BuyAttribute remains settlement authority.
	var n := maxi(1, purchase_number)
	if n <= ATTR_INTRO_PURCHASE_COUNT:
		return int(ATTR_INTRO_PURCHASE_COSTS[n - 1])
	return attribute_purchase_cost(n - ATTR_INTRO_PURCHASE_COUNT)


static func mission_stardust_reward(level: int, fuel_cost: float) -> int:
	var fuel := maxf(0.0, fuel_cost)
	if fuel <= 0.0:
		return 0
	return int(round(float(stardust_per_fuel(level)) * fuel))


static func arena_win_stardust(level: int = 1) -> int:
	return int(round(ARENA_WIN_FUEL_EQUIVALENT * float(stardust_per_fuel(level))))


static func mining_stardust(level: int, minutes: float) -> int:
	var mins := maxf(0.0, minutes)
	if mins <= 0.0:
		return 0
	return int(round(float(stardust_per_fuel(level)) * MINING_EFFICIENCY * mins))


static func compute_mining_reward(level: int, hours: float) -> int:
	return mining_stardust(level, hours * MINUTES_PER_HOUR)


## Snapshot junk vendor value. Optional unit_roll in [0,1] picks Uniform(0.60, 1.40).
## If unit_roll < 0, a random roll is used (client preview only — server snapshots at claim).
static func junk_sale_value(mission_stardust_reward_amt: int, unit_roll: float = -1.0) -> int:
	var base := maxi(0, mission_stardust_reward_amt)
	var base_junk := float(base) * JUNK_AVG_MISSION_REWARD_RATIO
	var u := unit_roll
	if u < 0.0:
		u = randf()
	u = clampf(u, 0.0, 1.0)
	var mult := JUNK_VALUE_MULT_MIN + u * (JUNK_VALUE_MULT_MAX - JUNK_VALUE_MULT_MIN)
	return maxi(1, int(round(base_junk * mult)))


static func item_type_vendor_mult(item_type: String) -> float:
	if item_type == "weapon":
		return WEAPON_VENDOR_MULT
	if item_type == "ship_module":
		return SHIP_MODULE_VENDOR_MULT
	return 1.0


static func gear_sale_value(item: Dictionary) -> int:
	if item.is_empty():
		return 1
	var itype := str(item.get("type", ""))
	if itype == "consumable" or itype == "material":
		var flat := int(item.get("sell_value", 0))
		if flat > 0:
			return maxi(1, flat)
		return 1
	var item_level := maxi(1, int(item.get("level_requirement", item.get("level", 1))))
	var rarity := str(item.get("rarity", "common"))
	var rarity_mult := float(RARITY_SALE_MULT.get(rarity, 1.0))
	var type_mult := item_type_vendor_mult(itype)
	return maxi(
		1,
		int(round(float(stardust_per_fuel(item_level)) * GEAR_BASE_FUEL_EQUIVALENT * rarity_mult * type_mult))
	)


static func mission_gear_drop_chance(miss_streak: int = 0) -> float:
	var streak := maxi(0, miss_streak)
	var raw := MISSION_GEAR_BASE_CHANCE + float(streak) * MISSION_GEAR_PITY_INCREMENT
	return minf(MISSION_GEAR_DROP_CAP, snappedf(raw, DROP_CHANCE_PRECISION))
