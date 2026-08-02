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

var mission_name := "Mission"
var scene_index := -1
var scene_seed := ""

var _image: TextureRect
var _caption: Label
var _badge: Label
var _fallback: ColorRect
var _elapsed := 0.0


static func pick_index(seed_s: String = "") -> int:
	if seed_s.is_empty():
		return randi() % CAPTIONS.size()
	var h := 2166136261
	for i in seed_s.length():
		h = (h ^ seed_s.unicode_at(i)) * 16777619
		h = h & 0x7fffffff
	return abs(h) % CAPTIONS.size()


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	_apply_scene()
	set_process(true)


func configure(p_mission_name: String, p_seed: String = "", p_index: int = -1) -> void:
	mission_name = p_mission_name
	scene_seed = p_seed
	scene_index = p_index
	if is_inside_tree():
		_apply_scene()


func _build() -> void:
	_fallback = ColorRect.new()
	_fallback.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_fallback.color = Color("#050318")
	_fallback.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_fallback)

	_image = TextureRect.new()
	_image.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_image.modulate.a = 0.0
	add_child(_image)

	var bottom_grad := ColorRect.new()
	bottom_grad.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	bottom_grad.color = Color(0.02, 0.03, 0.06, 0.35)
	bottom_grad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bottom_grad)

	# Keep the bottom clear for mission_run's rocket timer overlay (~117px).
	var vignette := ColorRect.new()
	vignette.set_anchors_preset(PRESET_BOTTOM_WIDE)
	vignette.offset_top = -280
	vignette.offset_bottom = -100
	vignette.color = Color(0.02, 0.03, 0.06, 0.72)
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
	# Sit above the rocket timer overlay so caption and bar do not fight.
	_caption.offset_top = -210
	_caption.offset_bottom = -140
	_caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_caption.add_theme_font_size_override("font_size", 20)
	_caption.add_theme_color_override("font_color", Color(0.95, 0.97, 1.0, 0.95))
	ClientUi.apply_display_font(_caption)
	add_child(_caption)


func _apply_scene() -> void:
	var idx := scene_index
	if idx < 0:
		idx = pick_index(scene_seed if not scene_seed.is_empty() else mission_name)
	idx = clampi(idx, 0, CAPTIONS.size() - 1)
	scene_index = idx
	_badge.text = "EXPLORING · %s" % mission_name.to_upper()
	_caption.text = CAPTIONS[idx]
	var path: String = TEXTURE_PATHS[idx]
	if ResourceLoader.exists(path):
		_image.texture = load(path) as Texture2D
		_image.modulate.a = 0.0
		var tw := create_tween()
		tw.tween_property(_image, "modulate:a", 1.0, 0.55)
	else:
		_image.texture = null
		_paint_fallback(idx)


func _paint_fallback(idx: int) -> void:
	var hues := [
		Color("#0B3D2E"), Color("#1A2744"), Color("#2A1848"),
		Color("#3A2418"), Color("#14263A"), Color("#2E1A1A"),
	]
	_fallback.color = hues[idx % hues.size()]


func _process(delta: float) -> void:
	_elapsed += delta
	if _image.texture != null:
		var s := 1.0 + 0.018 * sin(_elapsed * 0.22)
		_image.scale = Vector2(s, s)
		_image.pivot_offset = _image.size * 0.5
