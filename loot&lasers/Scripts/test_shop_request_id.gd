extends SceneTree
## Headless contract check: shop purchase request_id must match Node normalizeOperationKey.
## Mirrors ShopManager._new_request_id after the float-timestamp fix.
## Run: Godot --headless -s res://Scripts/test_shop_request_id.gd


func _init() -> void:
	var failed := 0
	failed += _check("generator produces Node-safe id", _assert_generator_safe())
	failed += _check("legacy float-timestamp form is rejected by charset", _assert_legacy_float_rejected())
	failed += _check("request_id survives JSON round-trip", _assert_json_roundtrip())
	print("test_shop_request_id: %s" % ("PASS" if failed == 0 else "FAIL (%d)" % failed))
	quit(0 if failed == 0 else 1)


func _check(name: String, ok: bool) -> int:
	print("  %s %s" % ["✓" if ok else "✗", name])
	return 0 if ok else 1


## Same format as ShopManager._new_request_id (int unix + rand; no float dots).
func _shop_request_id(prefix: String) -> String:
	return "%s-%d-%d" % [prefix, int(Time.get_unix_time_from_system()), randi() % 100000]


func _assert_generator_safe() -> bool:
	var rid := _shop_request_id("shop-gear")
	return _charset_ok(rid) and not rid.contains(".")


func _assert_legacy_float_rejected() -> bool:
	var legacy := "shop-gear-%s-%d" % [str(Time.get_unix_time_from_system()), 12345]
	return legacy.contains(".") and not _charset_ok(legacy)


func _assert_json_roundtrip() -> bool:
	var rid := _shop_request_id("shop-gear")
	var body := {
		"slot_id": "slot-1",
		"is_hot": false,
		"haggle": false,
		"request_id": rid,
		"refresh_id": 3,
	}
	var raw := JSON.stringify(body)
	var parsed: Variant = JSON.parse_string(raw)
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	var got := str((parsed as Dictionary).get("request_id", ""))
	return got == rid and (parsed as Dictionary).has("request_id")


func _charset_ok(value: String) -> bool:
	if value.is_empty() or value.length() > 128:
		return false
	var re := RegEx.new()
	if re.compile("^[A-Za-z0-9:_-]+$") != OK:
		return false
	return re.search(value) != null
