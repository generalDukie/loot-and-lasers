extends Control
## Auth screens — mirrors web Login / Register / ForgotPassword / OTP via AuthLayout.

const UI_SCALE := 2
## Footer is doubled first (13→26), then the whole window is 2× (26→52).
const FOOTER_FS := 13 * 2 * UI_SCALE

var _email: LineEdit
var _password: LineEdit
var _confirm: LineEdit
var _otp: LineEdit
var _status_banner: PanelContainer
var _status: Label
var _icon_host: CenterContainer
var _title: Label
var _subtitle: Label
var _password_row: HBoxContainer
var _confirm_wrap: VBoxContainer
var _otp_wrap: VBoxContainer
var _forgot_sent: Label
var _reset_wrap: VBoxContainer
var _reset_token: LineEdit
var _reset_pw: LineEdit
var _primary_btn: Button
var _footer: RichTextLabel
var _forgot_link: Button
var _resend_btn: Button
var _back_from_forgot: Button
var _busy := false
var _mode := "login" # login | register | otp | forgot
var _forgot_sent_flag := false


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_build()
	DevEnvironmentBadge.attach_to(self)
	var diag: Dictionary = AuthManager.get_auth_diagnostics()
	print(
		"[Login] Nakama auth env=%s host=%s:%s method=email (no :8787)"
		% [diag.get("environment", ""), diag.get("host", ""), diag.get("port", "")]
	)
	var kicked := str(AuthManager.session_superseded_message).strip_edges()
	if not kicked.is_empty():
		call_deferred("_show_error", kicked)
		AuthManager.session_superseded_message = ""


func _s(v: int) -> int:
	return v * UI_SCALE


func _scale_chrome(sb: StyleBox) -> StyleBox:
	if sb == null or not (sb is StyleBoxFlat):
		return sb
	var s := (sb as StyleBoxFlat).duplicate() as StyleBoxFlat
	s.content_margin_left *= UI_SCALE
	s.content_margin_right *= UI_SCALE
	s.content_margin_top *= UI_SCALE
	s.content_margin_bottom *= UI_SCALE
	s.border_width_left *= UI_SCALE
	s.border_width_right *= UI_SCALE
	s.border_width_top *= UI_SCALE
	s.border_width_bottom *= UI_SCALE
	s.corner_radius_top_left *= UI_SCALE
	s.corner_radius_top_right *= UI_SCALE
	s.corner_radius_bottom_left *= UI_SCALE
	s.corner_radius_bottom_right *= UI_SCALE
	s.shadow_size *= UI_SCALE
	s.shadow_offset *= UI_SCALE
	return s


func _scale_button_chrome(btn: Button) -> void:
	for kind in ["normal", "hover", "pressed", "disabled"]:
		var sb := btn.get_theme_stylebox(kind)
		if sb != null:
			btn.add_theme_stylebox_override(kind, _scale_chrome(sb))


func _style_auth_field(edit: LineEdit) -> void:
	edit.custom_minimum_size.y = _s(59)
	edit.add_theme_font_size_override("font_size", _s(19))
	edit.add_theme_stylebox_override(
		"normal",
		_scale_chrome(
			ClientUi.painted_panel_style(ClientUi.PANEL_DEEP, Color(0.25, 0.36, 0.48, 0.9), 6, 1)
		)
	)
	edit.add_theme_stylebox_override(
		"hover",
		_scale_chrome(
			ClientUi.painted_panel_style(
				ClientUi.PANEL_DEEP.lightened(0.025), Color(ClientUi.CYAN, 0.58), 6, 1
			)
		)
	)
	edit.add_theme_stylebox_override(
		"focus",
		_scale_chrome(ClientUi.painted_panel_style(ClientUi.PANEL_DEEP, ClientUi.CYAN, 6, 2))
	)


func _build() -> void:
	# Web AuthLayout: min-h-screen bg-background, centered max-w-md
	add_child(ClientUi.make_screen("void", true))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", _s(16))
	margin.add_theme_constant_override("margin_right", _s(16))
	margin.add_theme_constant_override("margin_top", _s(24))
	margin.add_theme_constant_override("margin_bottom", _s(24))
	add_child(margin)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_child(center)

	var root := VBoxContainer.new()
	root.custom_minimum_size = Vector2(_s(533), 0)
	root.add_theme_constant_override("separation", 0)
	center.add_child(root)

	# Header — icon + title + subtitle (outside card)
	var head := VBoxContainer.new()
	head.add_theme_constant_override("separation", _s(8))
	root.add_child(head)

	var icon_wrap := CenterContainer.new()
	head.add_child(icon_wrap)
	var icon_panel := PanelContainer.new()
	icon_panel.custom_minimum_size = Vector2(_s(75), _s(75))
	var icon_sb := StyleBoxFlat.new()
	icon_sb.bg_color = ClientUi.CYAN
	icon_sb.set_corner_radius_all(_s(14))
	icon_panel.add_theme_stylebox_override("panel", icon_sb)
	icon_wrap.add_child(icon_panel)
	_icon_host = CenterContainer.new()
	_icon_host.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	icon_panel.add_child(_icon_host)
	_set_header_icon("log-in")

	_title = Label.new()
	_title.text = "Welcome back"
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.add_theme_font_size_override("font_size", _s(37))
	_title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(_title)
	head.add_child(_title)

	_subtitle = Label.new()
	_subtitle.text = "Log in to your account"
	_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_subtitle.add_theme_font_size_override("font_size", _s(19))
	_subtitle.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_subtitle)
	head.add_child(_subtitle)

	var head_gap := Control.new()
	head_gap.custom_minimum_size.y = _s(37)
	root.add_child(head_gap)

	# Card
	var card := PanelContainer.new()
	root.add_child(card)

	var form := VBoxContainer.new()
	form.add_theme_constant_override("separation", _s(14))
	card.add_child(form)
	var card_sb := ClientUi.painted_panel_style(
		Color(0.08, 0.1, 0.14, 0.96), Color(1, 1, 1, 0.12), 16, 1
	).duplicate() as StyleBoxFlat
	card_sb.set_corner_radius_all(_s(16))
	card_sb.set_border_width_all(_s(1))
	card_sb.border_width_bottom = _s(1) + 1
	card_sb.content_margin_left = _s(28)
	card_sb.content_margin_right = _s(28)
	card_sb.content_margin_top = _s(28)
	card_sb.content_margin_bottom = _s(28)
	card.add_theme_stylebox_override("panel", card_sb)

	# Error banner
	_status_banner = PanelContainer.new()
	_status_banner.visible = false
	var err_sb := StyleBoxFlat.new()
	err_sb.bg_color = Color(ClientUi.DANGER, 0.12)
	err_sb.set_corner_radius_all(_s(8))
	err_sb.content_margin_left = _s(12)
	err_sb.content_margin_right = _s(12)
	err_sb.content_margin_top = _s(10)
	err_sb.content_margin_bottom = _s(10)
	_status_banner.add_theme_stylebox_override("panel", err_sb)
	form.add_child(_status_banner)
	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.add_theme_font_size_override("font_size", _s(19))
	_status.add_theme_color_override("font_color", ClientUi.DANGER)
	ClientUi.apply_body_font(_status)
	_status_banner.add_child(_status)

	# Email
	form.add_child(_field_label("Email"))
	_email = ClientUi.make_field("you@example.com")
	_style_auth_field(_email)
	_email.text_submitted.connect(_on_field_submitted)
	form.add_child(_email)

	# Password row label + Forgot
	_password_row = HBoxContainer.new()
	form.add_child(_password_row)
	var pw_lab := _field_label("Password")
	pw_lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_password_row.add_child(pw_lab)
	_forgot_link = Button.new()
	_forgot_link.text = "Forgot password?"
	_forgot_link.flat = true
	_forgot_link.add_theme_font_size_override("font_size", _s(15))
	_forgot_link.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_body_font(_forgot_link)
	_forgot_link.pressed.connect(func() -> void: _set_mode("forgot"))
	_password_row.add_child(_forgot_link)

	_password = ClientUi.make_field("••••••••", true)
	_style_auth_field(_password)
	_password.text_submitted.connect(_on_field_submitted)
	form.add_child(_password)

	# Confirm (register)
	_confirm_wrap = VBoxContainer.new()
	_confirm_wrap.visible = false
	_confirm_wrap.add_theme_constant_override("separation", _s(6))
	form.add_child(_confirm_wrap)
	_confirm_wrap.add_child(_field_label("Confirm Password"))
	_confirm = ClientUi.make_field("••••••••", true)
	_style_auth_field(_confirm)
	_confirm.text_submitted.connect(_on_field_submitted)
	_confirm_wrap.add_child(_confirm)

	# OTP
	_otp_wrap = VBoxContainer.new()
	_otp_wrap.visible = false
	_otp_wrap.add_theme_constant_override("separation", _s(10))
	form.add_child(_otp_wrap)
	_otp = ClientUi.make_field("6-digit code")
	_style_auth_field(_otp)
	_otp.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_otp.text_submitted.connect(_on_field_submitted)
	_otp_wrap.add_child(_otp)
	_resend_btn = Button.new()
	_resend_btn.text = "Didn't receive the code?  Resend"
	_resend_btn.flat = true
	_resend_btn.add_theme_font_size_override("font_size", _s(16))
	_resend_btn.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_resend_btn)
	_resend_btn.pressed.connect(_on_resend_otp)
	_otp_wrap.add_child(_resend_btn)

	_forgot_sent = Label.new()
	_forgot_sent.visible = false
	_forgot_sent.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_forgot_sent.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_forgot_sent.text = "If an account exists with that email, you'll receive a password reset link shortly."
	_forgot_sent.add_theme_font_size_override("font_size", _s(17))
	_forgot_sent.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(_forgot_sent)
	form.add_child(_forgot_sent)

	# Reset token fields. Desktop players paste the token delivered by email.
	_reset_wrap = VBoxContainer.new()
	_reset_wrap.visible = false
	_reset_wrap.add_theme_constant_override("separation", _s(8))
	form.add_child(_reset_wrap)
	_reset_wrap.add_child(_field_label("Reset token"))
	_reset_token = ClientUi.make_field("Token from email / API")
	_style_auth_field(_reset_token)
	_reset_wrap.add_child(_reset_token)
	_reset_wrap.add_child(_field_label("New password"))
	_reset_pw = ClientUi.make_field("New password", true)
	_style_auth_field(_reset_pw)
	_reset_wrap.add_child(_reset_pw)
	var apply_reset := Button.new()
	apply_reset.text = "Apply password reset"
	ClientUi.apply_ghost_button(apply_reset)
	_scale_button_chrome(apply_reset)
	apply_reset.add_theme_font_size_override("font_size", _s(16))
	apply_reset.custom_minimum_size.y = _s(51)
	apply_reset.pressed.connect(_on_reset_password)
	_reset_wrap.add_child(apply_reset)

	_primary_btn = Button.new()
	_primary_btn.text = "Log in"
	_primary_btn.custom_minimum_size.y = _s(59)
	_primary_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(_primary_btn)
	_scale_button_chrome(_primary_btn)
	_primary_btn.add_theme_font_size_override("font_size", _s(13))
	_primary_btn.pressed.connect(_on_primary)
	form.add_child(_primary_btn)

	_back_from_forgot = Button.new()
	_back_from_forgot.visible = false
	_back_from_forgot.text = "‹  Back to log in"
	_back_from_forgot.flat = true
	_back_from_forgot.add_theme_font_size_override("font_size", _s(16))
	_back_from_forgot.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_body_font(_back_from_forgot)
	_back_from_forgot.pressed.connect(func() -> void: _set_mode("login"))
	form.add_child(_back_from_forgot)

	var foot_gap := Control.new()
	foot_gap.custom_minimum_size.y = _s(27)
	root.add_child(foot_gap)

	_footer = RichTextLabel.new()
	_footer.bbcode_enabled = true
	_footer.fit_content = true
	_footer.scroll_active = false
	_footer.autowrap_mode = TextServer.AUTOWRAP_OFF
	_footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_footer.custom_minimum_size.y = FOOTER_FS + _s(8)
	_footer.add_theme_font_size_override("normal_font_size", FOOTER_FS)
	_footer.add_theme_font_size_override("bold_font_size", FOOTER_FS)
	_footer.add_theme_color_override("default_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_footer)
	_footer.meta_clicked.connect(_on_footer_meta)
	root.add_child(_footer)

	_set_mode("login")
	if _email.text.strip_edges().is_empty():
		_email.grab_focus()
	else:
		_password.grab_focus()


func _prefill_remembered_email() -> bool:
	## Returns true when the email field was filled from local remember storage.
	if not _email.text.strip_edges().is_empty():
		return false
	var saved := ""
	if NakamaManager != null and NakamaManager.has_method("get_remembered_login_email"):
		saved = str(NakamaManager.get_remembered_login_email()).strip_edges()
	if saved.is_empty():
		return false
	_email.text = saved
	return true


func _on_field_submitted(_text: String = "") -> void:
	# Enter in any auth field submits the active mode (login / register / forgot / OTP).
	_on_primary()


func _field_label(text: String) -> Label:
	var lab := Label.new()
	lab.text = text
	lab.add_theme_font_size_override("font_size", _s(16))
	lab.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(lab)
	return lab


func _set_busy(v: bool) -> void:
	_busy = v
	_primary_btn.disabled = v
	_forgot_link.disabled = v
	_resend_btn.disabled = v
	_back_from_forgot.disabled = v


func _show_error(msg: String, danger := true) -> void:
	if msg.is_empty():
		_status_banner.visible = false
		_status.text = ""
		return
	_status_banner.visible = true
	_status.text = msg
	_status.add_theme_color_override("font_color", ClientUi.DANGER if danger else ClientUi.SUCCESS)
	var sb := _status_banner.get_theme_stylebox("panel") as StyleBoxFlat
	if sb:
		sb.bg_color = Color(ClientUi.DANGER if danger else ClientUi.SUCCESS, 0.12)


func _set_header_icon(icon_id: String) -> void:
	CurrencyIcon.fill_glyph_host(_icon_host, icon_id, float(_s(32)), ClientUi.VOID)


func _set_mode(mode: String) -> void:
	_mode = mode
	_forgot_sent_flag = false
	_show_error("")
	_reset_wrap.visible = false
	_forgot_sent.visible = false
	_back_from_forgot.visible = false

	match mode:
		"register":
			_set_header_icon("plus")
			_title.text = "Create your account"
			_subtitle.text = "Sign up to get started"
			_password_row.visible = true
			_forgot_link.visible = false
			_password.visible = true
			_confirm_wrap.visible = true
			_otp_wrap.visible = false
			_email.visible = true
			_primary_btn.visible = true
			_primary_btn.text = "Create account"
			_primary_btn.icon = null
			_footer.visible = true
			_footer.text = "Already have an account? [url=login][color=#0DCADF][b]Log in[/b][/color][/url]"
		"otp":
			_set_header_icon("mail")
			_title.text = "Verify your email"
			_subtitle.text = "We sent a code to %s" % _email.text.strip_edges()
			_password_row.visible = false
			_password.visible = false
			_confirm_wrap.visible = false
			_otp_wrap.visible = true
			_email.visible = false
			_primary_btn.visible = true
			_primary_btn.text = "Verify"
			_primary_btn.icon = null
			_footer.visible = false
		"forgot":
			_set_header_icon("mail")
			_title.text = "Reset password"
			_subtitle.text = "We'll send you a link to reset it"
			_password_row.visible = false
			_password.visible = false
			_confirm_wrap.visible = false
			_otp_wrap.visible = false
			_email.visible = true
			_primary_btn.visible = true
			_primary_btn.text = "Send reset link"
			_primary_btn.icon = null
			_footer.visible = true
			_footer.text = "[url=login][color=#0DCADF][b]‹ Back to log in[/b][/color][/url]"
		_:
			_set_header_icon("log-in")
			_title.text = "Welcome back"
			_subtitle.text = "Log in to your account"
			_password_row.visible = true
			_forgot_link.visible = true
			_password.visible = true
			_confirm_wrap.visible = false
			_otp_wrap.visible = false
			_email.visible = true
			_primary_btn.visible = true
			_primary_btn.text = "Log in"
			_primary_btn.icon = null
			_footer.visible = true
			_footer.text = "Don't have an account? [url=register][color=#0DCADF][b]Create one[/b][/color][/url]"
			_prefill_remembered_email()


func _on_footer_meta(meta: Variant) -> void:
	var m := str(meta)
	if m == "register":
		_set_mode("register")
	elif m == "login":
		_set_mode("login")


func _on_primary() -> void:
	if _busy:
		return
	match _mode:
		"login":
			_do_login()
		"register":
			_do_register()
		"otp":
			_on_verify_otp()
		"forgot":
			_on_forgot()


func _do_login() -> void:
	if _email.text.strip_edges().is_empty() or _password.text.is_empty():
		_show_error("Invalid email or password")
		return
	_set_busy(true)
	_primary_btn.text = "Logging in..."
	UiIcon.apply_leading_icon(_primary_btn, "loader-circle", Color(0.05, 0.05, 0.08), float(_s(16)))
	_show_error("")
	var res: Dictionary = await AuthManager.login(_email.text.strip_edges(), _password.text)
	_set_busy(false)
	_primary_btn.text = "Log in"
	_primary_btn.icon = null
	if not res.ok:
		_show_error(_friendly_auth_error(str(res.get("error", "Invalid email or password"))))
		return
	GameManager.go_character_select()


func _do_register() -> void:
	if _password.text != _confirm.text:
		_show_error("Passwords do not match")
		return
	if _password.text.length() < 8:
		_show_error("Password must be at least 8 characters.")
		return
	_set_busy(true)
	_primary_btn.text = "Creating account..."
	UiIcon.apply_leading_icon(_primary_btn, "loader-circle", Color(0.05, 0.05, 0.08), float(_s(16)))
	_show_error("")
	var res: Dictionary = await AuthManager.register(_email.text.strip_edges(), _password.text)
	_set_busy(false)
	_primary_btn.text = "Create account"
	_primary_btn.icon = null
	if not res.ok:
		_show_error(_friendly_auth_error(str(res.get("error", "Registration failed"))))
		return
	_show_error("Account created.", false)
	GameManager.go_character_select()


func _friendly_auth_error(err: String) -> String:
	var diag: Dictionary = AuthManager.get_auth_diagnostics()
	var host := "%s://%s:%s" % [
		str(diag.get("scheme", "http")),
		str(diag.get("host", "")),
		str(diag.get("port", "")),
	]
	if err.strip_edges().is_empty():
		return "Authentication failed (%s)" % host
	return "%s\n(%s · %s)" % [err, str(diag.get("environment", "")).to_upper(), host]


func _on_verify_otp() -> void:
	_show_error("OTP is not used — log in with email and password on Nakama.", true)
	_set_mode("login")


func _on_resend_otp() -> void:
	_show_error("OTP is not used — log in with email and password on Nakama.", true)
	_set_mode("login")


func _on_forgot() -> void:
	if _busy:
		return
	if _email.text.strip_edges().is_empty():
		_show_error("Enter your email address.")
		return
	_set_busy(true)
	_primary_btn.text = "Sending..."
	UiIcon.apply_leading_icon(_primary_btn, "loader-circle", Color(0.05, 0.05, 0.08), float(_s(16)))
	var res: Dictionary = await AuthManager.request_password_reset(_email.text.strip_edges())
	_set_busy(false)
	_primary_btn.text = "Send reset link"
	_primary_btn.icon = null
	if not bool(res.get("ok", false)):
		_show_error(str(res.get("error", "Could not request a reset token")))
		return
	_forgot_sent_flag = true
	_email.visible = false
	_primary_btn.visible = false
	_forgot_sent.visible = true
	_forgot_sent.text = "If an account exists with that email, a reset token has been sent. Enter it below."
	_reset_wrap.visible = true
	var response_data: Variant = res.get("data", {})
	if typeof(response_data) == TYPE_DICTIONARY:
		_reset_token.text = str((response_data as Dictionary).get("reset_token_dev", ""))
	_show_error("Reset request accepted.", true)


func _on_reset_password() -> void:
	if _busy:
		return
	if _reset_token.text.strip_edges().is_empty():
		_show_error("Enter the reset token from your email.")
		return
	if _reset_pw.text.length() < 8:
		_show_error("New password must be at least 8 characters.")
		return
	_set_busy(true)
	var res: Dictionary = await AuthManager.reset_password(_reset_token.text, _reset_pw.text)
	_set_busy(false)
	if not bool(res.get("ok", false)):
		_show_error(str(res.get("error", "Password reset failed")))
		return
	_set_mode("login")
	_show_error("Password updated. You can log in now.", true)
