extends Node
## Global UI + ambient audio.
## Procedural sci-fi cues (no asset pack required). One ambient player; pooled SFX.

const BUS_MASTER := "Master"
const BUS_MUSIC := "Music"
const BUS_SFX := "SFX"
const BUS_AMBIENT := "Ambient"

const SFX_POOL_SIZE := 8
const HOVER_COOLDOWN_MS := 90
const CLICK_COOLDOWN_MS := 28

var _sfx_pool: Array[AudioStreamPlayer] = []
var _sfx_pool_i := 0
var _music: AudioStreamPlayer
var _ambient: AudioStreamPlayer
var _bed_kind := ""
var _ambient_on := false
var _stream_cache: Dictionary = {}
var _last_hover_ms := 0
var _last_click_ms := 0
var _tree_wired := false


func _ready() -> void:
	_ensure_buses()
	for i in SFX_POOL_SIZE:
		var p := AudioStreamPlayer.new()
		p.bus = BUS_SFX
		p.name = "SfxPool_%d" % i
		add_child(p)
		_sfx_pool.append(p)
	_music = AudioStreamPlayer.new()
	_music.bus = BUS_MUSIC
	_music.name = "MusicBed"
	add_child(_music)
	_ambient = AudioStreamPlayer.new()
	_ambient.bus = BUS_AMBIENT
	_ambient.name = "StationAmbient"
	add_child(_ambient)
	call_deferred("_wire_tree_buttons")
	print("[AudioManager] ready (ui + ambient)")


func _wire_tree_buttons() -> void:
	var tree := get_tree()
	if tree == null or _tree_wired:
		return
	_tree_wired = true
	if not tree.node_added.is_connected(_on_tree_node_added):
		tree.node_added.connect(_on_tree_node_added)
	# Catch buttons already in the tree (shell / login).
	_wire_subtree(tree.root)


func _on_tree_node_added(node: Node) -> void:
	if node is BaseButton:
		call_deferred("wire_button", node as BaseButton)


func _wire_subtree(node: Node) -> void:
	if node is BaseButton:
		wire_button(node as BaseButton)
	for child in node.get_children():
		_wire_subtree(child)


## Idempotent — safe to call from ClientUi styling helpers.
func wire_button(btn: BaseButton, kind: String = "") -> void:
	if btn == null or not is_instance_valid(btn):
		return
	if bool(btn.get_meta("_ui_sfx_wired", false)):
		if not kind.is_empty():
			btn.set_meta("ui_sfx_kind", kind)
		return
	btn.set_meta("_ui_sfx_wired", true)
	if not kind.is_empty():
		btn.set_meta("ui_sfx_kind", kind)
	if not btn.pressed.is_connected(_on_wired_button_pressed.bind(btn)):
		btn.pressed.connect(_on_wired_button_pressed.bind(btn))
	if not btn.mouse_entered.is_connected(_on_wired_button_hover.bind(btn)):
		btn.mouse_entered.connect(_on_wired_button_hover.bind(btn))


func _on_wired_button_pressed(btn: BaseButton) -> void:
	if btn == null or not is_instance_valid(btn) or btn.disabled:
		return
	var kind := str(btn.get_meta("ui_sfx_kind", ""))
	if kind.is_empty():
		kind = _infer_button_kind(btn)
	play_ui(kind)


func _on_wired_button_hover(btn: BaseButton) -> void:
	if btn == null or not is_instance_valid(btn) or btn.disabled:
		return
	if bool(btn.get_meta("ui_sfx_no_hover", false)):
		return
	play_ui("hover")


func _infer_button_kind(btn: BaseButton) -> String:
	var label := str(btn.text).strip_edges().to_lower()
	if label.contains("back") or label.contains("cancel") or label.contains("close") or label.contains("dismiss"):
		return "cancel"
	if label.contains("confirm") or label.contains("claim") or label.contains("accept") or label.contains("buy"):
		return "confirm"
	if label.contains("delete") or label.contains("destroy") or label.contains("ban"):
		return "error"
	return "click"


func apply_volumes(master: float, music: float, sfx: float, ambient: float = -1.0) -> void:
	_set_bus_linear(BUS_MASTER, master)
	_set_bus_linear(BUS_MUSIC, music)
	_set_bus_linear(BUS_SFX, sfx)
	if ambient < 0.0:
		ambient = sfx * 0.55
	_set_bus_linear(BUS_AMBIENT, ambient)


func play_sfx(stream: AudioStream, volume_db: float = 0.0) -> void:
	if stream == null or _sfx_pool.is_empty():
		return
	var player := _sfx_pool[_sfx_pool_i]
	_sfx_pool_i = (_sfx_pool_i + 1) % _sfx_pool.size()
	player.stop()
	player.stream = stream
	player.volume_db = volume_db
	player.play()


func play_music(stream: AudioStream, _fade_in: float = 0.0) -> void:
	if stream == null or _music == null:
		return
	_music.stream = stream
	_music.volume_db = -10.0
	if not _music.playing:
		_music.play()


func stop_music(_fade_out: float = 0.0) -> void:
	if _music and _music.playing:
		_music.stop()
	_bed_kind = ""


## Station-wide ambient — persists across page swaps; never stacked.
func start_station_ambient() -> void:
	if _ambient == null:
		return
	if _ambient_on and _ambient.playing:
		return
	_ambient.stream = _space_ambient()
	_ambient.volume_db = -18.0
	_ambient.play()
	_ambient_on = true


func stop_station_ambient() -> void:
	if _ambient and _ambient.playing:
		_ambient.stop()
	_ambient_on = false


func is_ambient_playing() -> bool:
	return _ambient != null and _ambient.playing


## Lightweight UI / combat cue tones (no asset pack required).
func play_ui(kind: String = "click") -> void:
	var now := Time.get_ticks_msec()
	match kind:
		"hover":
			if now - _last_hover_ms < HOVER_COOLDOWN_MS:
				return
			_last_hover_ms = now
			play_sfx(_tone(520.0, 0.028), -22.0)
		"click":
			if now - _last_click_ms < CLICK_COOLDOWN_MS:
				return
			_last_click_ms = now
			play_sfx(_ui_click(), -14.0)
		"confirm", "success":
			play_sfx(_chord([523.25, 659.25], 0.11), -12.0)
		"cancel", "back":
			play_sfx(_tone(280.0, 0.055), -16.0)
		"error", "invalid":
			play_sfx(_chord([220.0, 185.0], 0.12), -10.0)
		"equip":
			play_sfx(_tone(660.0, 0.08), -6.0)
		"stim":
			play_sfx(_tone(520.0, 0.12), -8.0)
		"dissolve":
			play_sfx(_tone(180.0, 0.16), -4.0)
		"blackhole_suck":
			play_sfx(_tone(90.0, 0.55), -6.0)
			play_sfx(_noise_burst(0.35), -10.0)
		"blackhole_burst":
			play_sfx(_tone(140.0, 0.12), -5.0)
			play_sfx(_chord([660.0, 880.0, 1175.0], 0.22), -7.0)
		"claim":
			play_sfx(_tone(880.0, 0.1), -6.0)
		"hit":
			play_sfx(_tone(140.0, 0.06), -2.0)
		"levelup":
			play_sfx(_chord([523.25, 659.25, 783.99], 0.28), -5.0)
		"swing":
			play_sfx(_tone(220.0, 0.09), -4.0)
		"stab":
			play_sfx(_tone(380.0, 0.06), -3.0)
		"shoot":
			play_sfx(_noise_burst(0.07), -2.0)
		"crit":
			play_sfx(_chord([440.0, 660.0], 0.12), -3.0)
		"dodge":
			play_sfx(_tone(720.0, 0.05), -8.0)
		"ability":
			play_sfx(_chord([392.0, 523.25, 659.25], 0.18), -4.0)
		_:
			if now - _last_click_ms < CLICK_COOLDOWN_MS:
				return
			_last_click_ms = now
			play_sfx(_ui_click(), -14.0)


func play_attack(style: String = "swing", crit: bool = false, ability: bool = false) -> void:
	if ability:
		play_ui("ability")
		return
	if crit:
		play_ui("crit")
		return
	match style:
		"stab":
			play_ui("stab")
		"shoot":
			play_ui("shoot")
		_:
			play_ui("swing")


func start_hub_bed() -> void:
	if _bed_kind == "hub":
		return
	_bed_kind = "hub"
	play_music(_drone(110.0), 0.0)
	start_station_ambient()


func start_cantina_bed() -> void:
	if _bed_kind == "cantina":
		return
	_bed_kind = "cantina"
	play_music(_drone(146.0), 0.0)
	start_station_ambient()


func _ui_click() -> AudioStreamWAV:
	var key := "ui_click_v2"
	if _stream_cache.has(key):
		return _stream_cache[key]
	var sample_rate := 22050
	var seconds := 0.045
	var frames := int(sample_rate * seconds)
	var data := PackedByteArray()
	data.resize(frames * 2)
	for i in frames:
		var t := float(i) / float(sample_rate)
		var env := exp(-t * 55.0)
		# Soft digital tick: mid blip + tiny noise sparkle.
		var sample_f := sin(TAU * 910.0 * t) * 0.55 * env
		sample_f += sin(TAU * 1420.0 * t) * 0.18 * env
		sample_f += (fmod(float(i * 17), 11.0) / 11.0 - 0.5) * 0.08 * env
		var sample := int(clamp(sample_f, -1.0, 1.0) * 32767.0)
		data.encode_s16(i * 2, sample)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_rate
	stream.stereo = false
	stream.data = data
	_stream_cache[key] = stream
	return stream


func _tone(freq: float, seconds: float) -> AudioStreamWAV:
	var key := "tone:%.2f:%.3f" % [freq, seconds]
	if _stream_cache.has(key):
		return _stream_cache[key]
	var sample_rate := 22050
	var frames := int(sample_rate * seconds)
	var data := PackedByteArray()
	data.resize(frames * 2)
	for i in frames:
		var t := float(i) / float(sample_rate)
		var env := 1.0 - (float(i) / float(maxi(1, frames)))
		var sample := int(clamp(sin(TAU * freq * t) * env * 0.35, -1.0, 1.0) * 32767.0)
		data.encode_s16(i * 2, sample)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_rate
	stream.stereo = false
	stream.data = data
	_stream_cache[key] = stream
	return stream


func _chord(freqs: Array, seconds: float) -> AudioStreamWAV:
	var parts: PackedStringArray = []
	for f in freqs:
		parts.append("%.2f" % float(f))
	var key := "chord:%s:%.3f" % [",".join(parts), seconds]
	if _stream_cache.has(key):
		return _stream_cache[key]
	var sample_rate := 22050
	var frames := int(sample_rate * seconds)
	var data := PackedByteArray()
	data.resize(frames * 2)
	var amp := 0.28 / maxf(1.0, float(freqs.size()))
	for i in frames:
		var t := float(i) / float(sample_rate)
		var env := 1.0 - (float(i) / float(maxi(1, frames)))
		var sample_f := 0.0
		for f in freqs:
			sample_f += sin(TAU * float(f) * t) * amp
		var sample := int(clamp(sample_f * env, -1.0, 1.0) * 32767.0)
		data.encode_s16(i * 2, sample)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_rate
	stream.stereo = false
	stream.data = data
	_stream_cache[key] = stream
	return stream


func _noise_burst(seconds: float) -> AudioStreamWAV:
	var key := "noise:%.3f" % seconds
	if _stream_cache.has(key):
		return _stream_cache[key]
	var sample_rate := 22050
	var frames := int(sample_rate * seconds)
	var data := PackedByteArray()
	data.resize(frames * 2)
	var rng := RandomNumberGenerator.new()
	rng.seed = 0xC0FFEE
	for i in frames:
		var env := 1.0 - (float(i) / float(maxi(1, frames)))
		var sample := int(clamp((rng.randf() * 2.0 - 1.0) * env * 0.4, -1.0, 1.0) * 32767.0)
		data.encode_s16(i * 2, sample)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_rate
	stream.stereo = false
	stream.data = data
	_stream_cache[key] = stream
	return stream


func _drone(freq: float) -> AudioStreamWAV:
	var key := "drone:%.2f" % freq
	if _stream_cache.has(key):
		return _stream_cache[key]
	var sample_rate := 22050
	var seconds := 2.0
	var frames := int(sample_rate * seconds)
	var data := PackedByteArray()
	data.resize(frames * 2)
	for i in frames:
		var t := float(i) / float(sample_rate)
		var sample := int(clamp(
			(sin(TAU * freq * t) * 0.18) + (sin(TAU * freq * 1.5 * t) * 0.08),
			-1.0, 1.0
		) * 32767.0)
		data.encode_s16(i * 2, sample)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_rate
	stream.stereo = false
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin = 0
	stream.loop_end = frames
	stream.data = data
	_stream_cache[key] = stream
	return stream


## Deep station / ship ambience — low hum, distant tones, sparse static. Not music.
func _space_ambient() -> AudioStreamWAV:
	var key := "space_ambient_v1"
	if _stream_cache.has(key):
		return _stream_cache[key]
	var sample_rate := 22050
	var seconds := 12.0
	var frames := int(sample_rate * seconds)
	var data := PackedByteArray()
	data.resize(frames * 2)
	var rng := RandomNumberGenerator.new()
	rng.seed = 0x5A7E11
	for i in frames:
		var t := float(i) / float(sample_rate)
		# Slow breathing envelope so the loop seam is soft.
		var breath := 0.82 + 0.18 * sin(TAU * t / seconds)
		var hum := sin(TAU * 48.0 * t) * 0.11
		hum += sin(TAU * 72.5 * t) * 0.07
		hum += sin(TAU * 96.0 * t + 0.4) * 0.04
		# Distant glassy tone (very quiet).
		var glass := sin(TAU * 220.0 * t + sin(TAU * 0.07 * t) * 2.0) * 0.018
		glass += sin(TAU * 329.6 * t * 0.5) * 0.01
		# Sparse radio static pops.
		var static_bit := 0.0
		if rng.randf() < 0.0018:
			static_bit = (rng.randf() * 2.0 - 1.0) * 0.045
		elif fmod(t * 0.37, 1.0) < 0.012:
			static_bit = (rng.randf() * 2.0 - 1.0) * 0.012 * sin(TAU * 1800.0 * t)
		# Slow machinery throb.
		var throb := sin(TAU * 0.22 * t) * sin(TAU * 38.0 * t) * 0.03
		var sample_f := (hum + glass + static_bit + throb) * breath
		var sample := int(clamp(sample_f, -1.0, 1.0) * 32767.0)
		data.encode_s16(i * 2, sample)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_rate
	stream.stereo = false
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin = 0
	stream.loop_end = frames
	stream.data = data
	_stream_cache[key] = stream
	return stream


func _ensure_buses() -> void:
	for bus_name in [BUS_MASTER, BUS_MUSIC, BUS_SFX, BUS_AMBIENT]:
		if AudioServer.get_bus_index(bus_name) >= 0:
			continue
		if bus_name == BUS_MASTER:
			continue
		var idx := AudioServer.bus_count
		AudioServer.add_bus(idx)
		AudioServer.set_bus_name(idx, bus_name)
		AudioServer.set_bus_send(idx, BUS_MASTER)


func _set_bus_linear(bus_name: String, linear: float) -> void:
	var idx := AudioServer.get_bus_index(bus_name)
	if idx < 0:
		return
	var clamped := clampf(linear, 0.0, 1.0)
	AudioServer.set_bus_volume_db(idx, linear_to_db(clamped) if clamped > 0.0 else -80.0)
