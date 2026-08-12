shader_type canvas_item;
render_mode unshaded, blend_mul;

uniform float scan_intensity = 0.18;
uniform float scan_period_px = 8.0;
uniform float scan_thick_px = 2.5;
uniform float scan_cycle_sec = 1.6;

void fragment() {
	float period = max(scan_period_px, 1.0);
	float thick = clamp(scan_thick_px, 0.5, period);
	float scroll = TIME * (period / max(scan_cycle_sec, 0.5));
	float y = mod(FRAGCOORD.y + scroll, period);
	float scan = mix(1.0 - scan_intensity, 1.0, step(thick, y));
	COLOR = vec4(vec3(scan), 1.0);
}
