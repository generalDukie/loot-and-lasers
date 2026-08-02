extends Node
## Global audio routing — procedural UI cues until real assets exist.

const BUS_MASTER := "Master"
const BUS_MUSIC := "Music"
const BUS_SFX := "SFX"

var _sfx: AudioStreamPlayer
var _music: AudioStreamPlayer
var _bed_kind := ""


func _ready() -> void:
	_ensure_buses()
	_sfx = AudioStreamPlayer.new()
	_sfx.bus = BUS_SFX
	add_child(_sfx)
	_music = AudioStreamPlayer.new()
	_music.bus = BUS_MUSIC
	add_child(_music)
	print("[AudioManager] ready")


func apply_volumes(master: float, music: float, sfx: float) -> void:
	_set_bus_linear(BUS_MASTER, master)
	_set_bus_linear(BUS_MUSIC, music)
	_set_bus_linear(BUS_SFX, sfx)


func play_sfx(stream: AudioStream, volume_db: float = 0.0) -> void:
	if stream == null or _sfx == null:
		return
	_sfx.stream = stream
	_sfx.volume_db = volume_db
	_sfx.play()


func play_music(stream: AudioStream, _fade_in: float = 0.0) -> void:
	if stream == null or _music == null:
		return
	_music.stream = stream
	_music.volume_db = -8.0
	if not _music.playing:
		_music.play()


func stop_music(_fade_out: float = 0.0) -> void:
	if _music and _music.playing:
		_music.stop()
	_bed_kind = ""


## Lightweight UI / combat cue tones (no asset pack required).
func play_ui(kind: String = "click") -> void:
	match kind:
		"equip":
			play_sfx(_tone(660.0, 0.08), -6.0)
		"stim":
			play_sfx(_tone(520.0, 0.12), -8.0)
		"dissolve":
			play_sfx(_tone(180.0, 0.16), -4.0)
		"blackhole_suck":
			# Closest equivalent to web playBlackHoleSuck (falling rumble + whoosh).
			play_sfx(_tone(90.0, 0.55), -6.0)
			play_sfx(_noise_burst(0.35), -10.0)
		"blackhole_burst":
			# Closest equivalent to web playBlackHoleBurst (thump + sparkle).
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
			play_sfx(_tone(440.0, 0.05), -10.0)


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


func start_cantina_bed() -> void:
	if _bed_kind == "cantina":
		return
	_bed_kind = "cantina"
	play_music(_drone(146.0), 0.0)


func _tone(freq: float, seconds: float) -> AudioStreamWAV:
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
	return stream


func _chord(freqs: Array, seconds: float) -> AudioStreamWAV:
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
	return stream


func _noise_burst(seconds: float) -> AudioStreamWAV:
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
	return stream


func _drone(freq: float) -> AudioStreamWAV:
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
	return stream


func _ensure_buses() -> void:
	for bus_name in [BUS_MASTER, BUS_MUSIC, BUS_SFX]:
		if AudioServer.get_bus_index(bus_name) >= 0:
			continue
		# Master always exists; add Music/SFX under Master when missing.
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
