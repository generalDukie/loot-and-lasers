shader_type canvas_item;
render_mode unshaded;

uniform vec4 color_deep : source_color = vec4(0.015, 0.025, 0.055, 1.0);
uniform vec4 color_nebula : source_color = vec4(0.20, 0.06, 0.34, 1.0);
uniform vec4 color_accent : source_color = vec4(0.02, 0.78, 0.90, 1.0);
uniform float intensity : hint_range(0.0, 1.5) = 1.0;
uniform float speed : hint_range(0.0, 1.0) = 0.16;
uniform float transparency : hint_range(0.0, 1.0) = 1.0;

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float noise21(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
		mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
		f.y
	);
}

float fbm(vec2 p) {
	float value = 0.0;
	float amplitude = 0.52;
	for (int i = 0; i < 5; i++) {
		value += noise21(p) * amplitude;
		p = p * 2.03 + vec2(17.1, 9.2);
		amplitude *= 0.48;
	}
	return value;
}

float star_layer(vec2 uv, float cells, float threshold, float time_shift) {
	vec2 grid = uv * cells;
	vec2 id = floor(grid);
	vec2 local = fract(grid) - 0.5;
	float seed = hash21(id + time_shift);
	vec2 jitter = vec2(hash21(id + 7.2), hash21(id + 19.6)) - 0.5;
	float distance_to_star = length(local - jitter * 0.55);
	float core = smoothstep(0.075, 0.0, distance_to_star);
	float exists = smoothstep(threshold, 1.0, seed);
	float twinkle = 0.52 + 0.48 * sin(TIME * (1.4 + seed * 3.2) + seed * 18.0);
	return core * exists * twinkle;
}

float dust_layer(vec2 uv, float cells, float time_shift) {
	vec2 grid = uv * cells;
	vec2 id = floor(grid);
	vec2 local = fract(grid) - 0.5;
	float seed = hash21(id + time_shift);
	vec2 jitter = vec2(hash21(id + 4.7), hash21(id + 13.1)) - 0.5;
	float speck = smoothstep(0.045, 0.0, length(local - jitter * 0.72));
	return speck * smoothstep(0.72, 1.0, seed);
}

void fragment() {
	vec2 uv = UV;
	vec2 centered = uv - 0.5;
	centered.x *= 1.78;
	float t = TIME * speed;

	float cloud_a = fbm(centered * 2.0 + vec2(t * 0.06, -t * 0.035));
	float cloud_b = fbm(centered * 3.8 + vec2(-t * 0.04, t * 0.055) + 8.0);
	float nebula_mask = smoothstep(0.43, 0.88, cloud_a * 0.72 + cloud_b * 0.46);
	nebula_mask *= 1.0 - smoothstep(0.45, 1.2, length(centered - vec2(-0.38, -0.12)));

	vec3 color = color_deep.rgb;
	color = mix(color, color_nebula.rgb, nebula_mask * 0.72 * intensity);

	float glow_a = exp(-5.5 * length(centered - vec2(-0.52, -0.24)));
	float glow_b = exp(-7.0 * length(centered - vec2(0.55, 0.32)));
	color += color_accent.rgb * glow_a * 0.16 * intensity;
	color += color_nebula.rgb * glow_b * 0.22 * intensity;

	float stars = star_layer(uv + vec2(t * 0.0012, 0.0), 62.0, 0.955, 0.0);
	stars += star_layer(uv - vec2(t * 0.0007, 0.0), 118.0, 0.978, 31.0) * 0.52;
	color += mix(vec3(0.58, 0.82, 1.0), color_accent.rgb, 0.25) * stars * intensity;

	// Very fine foreground dust drifts independently for quiet parallax depth.
	float dust = dust_layer(uv + vec2(t * 0.0035, -t * 0.0011), 156.0, 73.0);
	dust += dust_layer(uv - vec2(t * 0.0018, -t * 0.0005), 214.0, 109.0) * 0.52;
	float dust_breathe = 0.72 + 0.28 * sin(TIME * 0.34);
	color += mix(vec3(0.72, 0.82, 1.0), color_accent.rgb, 0.18) * dust * dust_breathe * 0.22 * intensity;

	// A faint technical grid gives the shell depth without competing with content.
	vec2 grid_uv = abs(fract((centered + vec2(t * 0.004, 0.0)) * vec2(22.0, 13.0)) - 0.5);
	float grid_line = 1.0 - smoothstep(0.475, 0.5, max(grid_uv.x, grid_uv.y));
	float grid_fade = smoothstep(0.9, 0.05, length(centered));
	color += color_accent.rgb * grid_line * grid_fade * 0.018 * intensity;

	float vignette = smoothstep(0.95, 0.22, length(centered));
	color *= mix(0.48, 1.0, vignette);
	float scanline = 0.988 + 0.012 * sin(uv.y * 1440.0 * 3.14159);
	color *= scanline;

	COLOR = vec4(color, transparency);
}
