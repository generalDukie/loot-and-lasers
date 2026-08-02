shader_type canvas_item;
render_mode unshaded;

uniform float aspect = 2.6;
uniform float speed : hint_range(0.0, 2.0) = 0.42;
uniform float activity : hint_range(0.0, 1.0) = 0.72;
uniform vec4 hot_color : source_color = vec4(1.0, 0.48, 0.12, 1.0);
uniform vec4 warm_color : source_color = vec4(1.0, 0.78, 0.28, 1.0);
uniform vec4 lens_color : source_color = vec4(0.55, 0.30, 1.0, 1.0);

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

mat2 rotate2d(float angle) {
	float s = sin(angle);
	float c = cos(angle);
	return mat2(vec2(c, -s), vec2(s, c));
}

void fragment() {
	vec2 p = (UV - 0.5) * vec2(aspect, 1.0);
	float time = TIME * speed;
	float radius = length(p);
	float angle = atan(p.y, p.x);

	// Deep-space plate with sparse stars. Stars fade close to the lens.
	vec3 color = mix(vec3(0.004, 0.005, 0.012), vec3(0.018, 0.008, 0.035), UV.y);
	vec2 star_grid = floor(UV * vec2(190.0, 72.0));
	float star_seed = hash21(star_grid);
	float star = smoothstep(0.992, 1.0, star_seed);
	float star_twinkle = 0.45 + 0.55 * sin(TIME * (0.7 + star_seed * 2.2) + star_seed * 30.0);
	color += vec3(0.55, 0.70, 1.0) * star * star_twinkle * smoothstep(0.28, 0.58, radius);

	// Faint gravitational well darkens and bends the surrounding field.
	float gravity_well = exp(-radius * 5.2);
	color *= 1.0 - gravity_well * 0.78;
	color += lens_color.rgb * exp(-pow((radius - 0.235) * 17.0, 2.0)) * 0.10;

	// Tilted accretion disk. Compressing Y creates its extreme perspective.
	vec2 disk_p = rotate2d(-0.18) * p;
	vec2 disk_space = vec2(disk_p.x, disk_p.y / 0.20);
	float disk_radius = length(disk_space);
	float disk_angle = atan(disk_space.y, disk_space.x);
	float disk_band = smoothstep(0.62, 0.18, disk_radius) * smoothstep(0.145, 0.205, disk_radius);
	float spiral = noise21(vec2(disk_angle * 4.2 - time * 5.0, disk_radius * 19.0 + time * 1.8));
	spiral += 0.42 * sin(disk_angle * 11.0 - disk_radius * 42.0 - time * 7.0);
	float strands = smoothstep(-0.18, 0.72, spiral);
	float doppler = smoothstep(-0.8, 0.9, cos(disk_angle - 0.25));
	vec3 disk_color = mix(lens_color.rgb * 0.75, hot_color.rgb, doppler);
	disk_color = mix(disk_color, warm_color.rgb, smoothstep(0.40, 0.19, disk_radius));
	color += disk_color * disk_band * (0.42 + strands * 1.15) * (0.55 + activity * 0.7);

	// Hot inner rim and cooler outer halo.
	float inner_rim = exp(-pow((disk_radius - 0.202) * 38.0, 2.0));
	float outer_haze = exp(-pow((disk_radius - 0.48) * 7.0, 2.0));
	color += warm_color.rgb * inner_rim * 0.78 * (0.65 + doppler * 0.55);
	color += lens_color.rgb * outer_haze * 0.055 * activity;

	// Polar jets stay restrained so the inventory remains readable.
	float jet_axis = exp(-abs(disk_p.x) * 34.0);
	float jet_fade = smoothstep(0.16, 0.46, abs(disk_p.y)) * smoothstep(0.70, 0.25, abs(disk_p.y));
	color += mix(lens_color.rgb, vec3(0.45, 0.75, 1.0), 0.45) * jet_axis * jet_fade * 0.13 * activity;

	// The event horizon must remain genuinely black, with a razor photon ring.
	float horizon = smoothstep(0.178, 0.165, radius);
	color = mix(color, vec3(0.0), horizon);
	float photon_ring = exp(-pow((radius - 0.181) * 92.0, 2.0));
	float ring_flicker = 0.76 + 0.24 * sin(angle * 7.0 - time * 3.0);
	color += mix(warm_color.rgb, vec3(0.9, 0.8, 1.0), 0.28) * photon_ring * ring_flicker * 0.9;

	// Soft vignette contains the spectacle inside its panel.
	float edge = smoothstep(0.72, 0.32, length((UV - 0.5) * vec2(1.15, 1.0)));
	color *= mix(0.42, 1.0, edge);
	COLOR = vec4(color, 1.0);
}
