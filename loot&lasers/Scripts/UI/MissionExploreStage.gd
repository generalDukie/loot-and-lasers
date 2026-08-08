class_name MissionExploreStage
extends Control
## Full-bleed exploration backdrop — mirrors web MissionExploreBackdrop.

const CAPTIONS := [
	"Emergency plumbing. The toilet launched first.",
	"Scientific observation. Definitely scientific.",
	"Vent reconnaissance. Exit strategy pending.",
	"Customs medical. Consent forms were optional.",
	"Asteroid rest stop. Leave no trace. Mostly.",
	"Diplomatic incident with a vending machine.",
]

const TEXTURE_PATHS: PackedStringArray = [
	"res://Assets/Textures/mission-explore/mission-explore-1.png",
	"res://Assets/Textures/mission-explore/mission-explore-2.png",
	"res://Assets/Textures/mission-explore/mission-explore-3.png",
	"res://Assets/Textures/mission-explore/mission-explore-4.png",
	"res://Assets/Textures/mission-explore/mission-explore-5.png",
	"res://Assets/Textures/mission-explore/mission-explore-6.png",
]

const SCENE_COUNT := 6

var mission_name := "Mission"
var scene_index := -1
var scene_seed := ""
## When false, badge/caption chrome is omitted (host UI owns copy).
var show_chrome := true

var _image: TextureRect
var _caption: Label
var _badge: Label
var _fallback: ColorRect
var _elapsed := 0.0
var _applied_index := -2
var _built := false
var _pending_apply := false


static func scene_count() -> int:
	return SCENE_COUNT


static func image_id_for_index(idx: int) -> String:
	var n := normalize_index(idx)
	if n < 0:
		return ""
	return "mission_explore_%02d" % (n + 1)


static func normalize_index(raw: int) -> int:
	if raw < 0:
		return -1
	return raw % SCENE_COUNT


static func pick_index(seed_s: String = "") -> int:
	if seed_s.is_empty():
		return randi() % SCENE_COUNT
	var h := 2166136261
	for i in seed_s.length():
		h = (h ^ seed_s.unicode_at(i)) * 16777619
		h = h & 0x7fffffff
	return abs(h) % SCENE_COUNT


## Unique scene indices for a board (no duplicates when count ≤ pool size).
static func pick_unique_indices(count: int) -> Array:
	var pool: Array = []
	for i in SCENE_COUNT:
		pool.append(i)
	pool.shuffle()
	var out: Array = []
	for i in range(maxi(0, count)):
		out.append(int(pool[i % pool.size()]))
	return out


static func texture_for_index(idx: int) -> Texture2D:
	var n := normalize_index(idx)
	if n < 0:
		return null
	var path: String = TEXTURE_PATHS[n]
	if ResourceLoader.exists(path):
		return load(path) as Texture2D
	return null


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	# Never pick art in _ready — host must configure once to avoid flicker.
	if _pending_apply or scene_index >= 0:
		_apply_scene()
	set_process(true)


func configure(
	p_mission_name: String,
	p_seed: String = "",
	p_index: int = -1,
	p_show_chrome: bool = true
) -> void:
	mission_name = p_mission_name
	scene_seed = p_seed
	scene_index = normalize_index(p_index) if p_index >= 0 else -1
	show_chrome = p_show_chrome
	_pending_apply = true
	if _built:
		_apply_scene()
	elif is_inside_tree():
		# _ready will apply after build.
		pass


func _build() -> void:
	_fallback = ColorRect.new()
	_fallback.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_fallback.color = Color("#050318")
	_fallback.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_fallback)

	_image = TextureRect.new()
	_image.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_image.modulate.a = 0.0
	add_child(_image)

	var bottom_grad := ColorRect.new()
	bottom_grad.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	bottom_grad.color = Color(0.02, 0.03, 0.06, 0.28)
	bottom_grad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bottom_grad)

	# Soft bottom vignette so overlaid timer/copy stays readable.
	var vignette := ColorRect.new()
	vignette.set_anchors_preset(PRESET_BOTTOM_WIDE)
	vignette.offset_top = -300
	vignette.offset_bottom = 0
	vignette.color = Color(0.02, 0.03, 0.06, 0.55)
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(vignette)

	_badge = Label.new()
	_badge.set_anchors_preset(PRESET_CENTER_TOP)
	_badge.offset_top = 16
	_badge.offset_bottom = 45
	_badge.offset_left = -187
	_badge.offset_right = 187
	_badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_badge.add_theme_font_size_override("font_size", 15)
	_badge.add_theme_color_override("font_color", ClientUi.CYAN_SOFT)
	ClientUi.apply_display_font(_badge)
	add_child(_badge)

	_caption = Label.new()
	_caption.set_anchors_preset(PRESET_BOTTOM_WIDE)
	_caption.offset_left = 24
	_caption.offset_right = -24
	_caption.offset_top = -210
	_caption.offset_bottom = -140
	_caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_caption.add_theme_font_size_override("font_size", 20)
	_caption.add_theme_color_override("font_color", Color(0.95, 0.97, 1.0, 0.95))
	_caption.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.75))
	_caption.add_theme_constant_override("shadow_offset_x", 1)
	_caption.add_theme_constant_override("shadow_offset_y", 2)
	ClientUi.apply_display_font(_caption)
	add_child(_caption)

	_built = true


func _apply_scene() -> void:
	if not _built:
		_pending_apply = true
		return
	_pending_apply = false

	var idx := scene_index
	if idx < 0:
		# Only seed-pick when host never provided an index (legacy missions).
		idx = pick_index(scene_seed if not scene_seed.is_empty() else mission_name)
	idx = normalize_index(idx)
	scene_index = idx

	if is_instance_valid(_badge):
		_badge.visible = show_chrome
		_badge.text = "EXPLORING · %s" % mission_name.to_upper()
	if is_instance_valid(_caption):
		_caption.visible = show_chrome
		_caption.text = CAPTIONS[idx]

	# Same art already showing — do not reload / re-fade (flicker fix).
	if idx == _applied_index and _image.texture != null:
		return
	_applied_index = idx

	var path: String = TEXTURE_PATHS[idx]
	if ResourceLoader.exists(path):
		_image.texture = load(path) as Texture2D
		_image.modulate.a = 1.0
	else:
		_image.texture = null
		_image.modulate.a = 0.0
		_paint_fallback(idx)


func _paint_fallback(idx: int) -> void:
	var hues := [
		Color("#0B3D2E"), Color("#1A2744"), Color("#2A1848"),
		Color("#3A2418"), Color("#14263A"), Color("#2E1A1A"),
	]
	_fallback.color = hues[idx % hues.size()]


func _process(delta: float) -> void:
	_elapsed += delta
	if _image != null and _image.texture != null:
		var s := 1.0 + 0.018 * sin(_elapsed * 0.22)
		_image.scale = Vector2(s, s)
		_image.pivot_offset = _image.size * 0.5
