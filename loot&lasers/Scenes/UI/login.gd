extends Control
## Auth screens — mirrors web Login / Register / ForgotPassword / OTP via AuthLayout.

var _email: LineEdit
var _password: LineEdit
var _confirm: LineEdit
var _otp: LineEdit
var _status_banner: PanelContainer
var _status: Label
var _icon_lab: Label
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


func _build() -> void:
	# Web AuthLayout: min-h-screen bg-background, centered max-w-md
	add_child(ClientUi.make_screen("void"))

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 24)
	margin.add_theme_constant_override("margin_bottom", 24)
	add_child(margin)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	margin.add_child(center)

	var root := VBoxContainer.new()
	root.custom_minimum_size = Vector2(533, 0)
	root.add_theme_constant_override("separation", 0)
	center.add_child(root)

	# Header — icon + title + subtitle (outside card)
	var head := VBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	root.add_child(head)

	var icon_wrap := CenterContainer.new()
	head.add_child(icon_wrap)
	var icon_panel := PanelContainer.new()
	icon_panel.custom_minimum_size = Vector2(75, 75)
	var icon_sb := StyleBoxFlat.new()
	icon_sb.bg_color = ClientUi.CYAN
	icon_sb.set_corner_radius_all(14)
	icon_panel.add_theme_stylebox_override("panel", icon_sb)
	icon_wrap.add_child(icon_panel)
	_icon_lab = Label.new()
	_icon_lab.text = "↪"
	_icon_lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_icon_lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_icon_lab.add_theme_font_size_override("font_size", 32)
	_icon_lab.add_theme_color_override("font_color", ClientUi.VOID)
	ClientUi.apply_display_font(_icon_lab)
	icon_panel.add_child(_icon_lab)

	_title = Label.new()
	_title.text = "Welcome back"
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.add_theme_font_size_override("font_size", 37)
	_title.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_display_font(_title)
	head.add_child(_title)

	_subtitle = Label.new()
	_subtitle.text = "Log in to your account"
	_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_subtitle.add_theme_font_size_override("font_size", 19)
	_subtitle.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_subtitle)
	head.add_child(_subtitle)

	var head_gap := Control.new()
	head_gap.custom_minimum_size.y = 37
	root.add_child(head_gap)

	# Card
	var card := PanelContainer.new()
	card.add_theme_stylebox_override(
		"panel",
		ClientUi.painted_panel_style(Color(0.08, 0.1, 0.14, 0.96), Color(1, 1, 1, 0.12), 16, 1)
	)
	root.add_child(card)

	var form := VBoxContainer.new()
	form.add_theme_constant_override("separation", 14)
	card.add_child(form)
	var card_sb := ClientUi.painted_panel_style(Color(0.08, 0.1, 0.14, 0.96), Color(1, 1, 1, 0.12), 16, 1)
	card_sb.content_margin_left = 28
	card_sb.content_margin_right = 28
	card_sb.content_margin_top = 28
	card_sb.content_margin_bottom = 28
	card.add_theme_stylebox_override("panel", card_sb)

	# Error banner
	_status_banner = PanelContainer.new()
	_status_banner.visible = false
	var err_sb := StyleBoxFlat.new()
	err_sb.bg_color = Color(ClientUi.DANGER, 0.12)
	err_sb.set_corner_radius_all(8)
	err_sb.content_margin_left = 12
	err_sb.content_margin_right = 12
	err_sb.content_margin_top = 10
	err_sb.content_margin_bottom = 10
	_status_banner.add_theme_stylebox_override("panel", err_sb)
	form.add_child(_status_banner)
	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.add_theme_font_size_override("font_size", 17)
	_status.add_theme_color_override("font_color", ClientUi.DANGER)
	ClientUi.apply_body_font(_status)
	_status_banner.add_child(_status)

	# Email
	form.add_child(_field_label("Email"))
	_email = ClientUi.make_field("you@example.com")
	_email.custom_minimum_size.y = 59
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
	_forgot_link.add_theme_font_size_override("font_size", 15)
	_forgot_link.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_body_font(_forgot_link)
	_forgot_link.pressed.connect(func() -> void: _set_mode("forgot"))
	_password_row.add_child(_forgot_link)

	_password = ClientUi.make_field("••••••••", true)
	_password.custom_minimum_size.y = 59
	_password.text_submitted.connect(_on_field_submitted)
	form.add_child(_password)

	# Confirm (register)
	_confirm_wrap = VBoxContainer.new()
	_confirm_wrap.visible = false
	_confirm_wrap.add_theme_constant_override("separation", 6)
	form.add_child(_confirm_wrap)
	_confirm_wrap.add_child(_field_label("Confirm Password"))
	_confirm = ClientUi.make_field("••••••••", true)
	_confirm.custom_minimum_size.y = 59
	_confirm.text_submitted.connect(_on_field_submitted)
	_confirm_wrap.add_child(_confirm)

	# OTP
	_otp_wrap = VBoxContainer.new()
	_otp_wrap.visible = false
	_otp_wrap.add_theme_constant_override("separation", 10)
	form.add_child(_otp_wrap)
	_otp = ClientUi.make_field("6-digit code")
	_otp.custom_minimum_size.y = 59
	_otp.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_otp.text_submitted.connect(_on_field_submitted)
	_otp_wrap.add_child(_otp)
	_resend_btn = Button.new()
	_resend_btn.text = "Didn't receive the code?  Resend"
	_resend_btn.flat = true
	_resend_btn.add_theme_font_size_override("font_size", 16)
	_resend_btn.add_theme_color_override("font_color", ClientUi.MUTED)
	ClientUi.apply_body_font(_resend_btn)
	_resend_btn.pressed.connect(_on_resend_otp)
	_otp_wrap.add_child(_resend_btn)

	_forgot_sent = Label.new()
	_forgot_sent.visible = false
	_forgot_sent.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_forgot_sent.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_forgot_sent.text = "If an account exists with that email, you'll receive a password reset link shortly."
	_forgot_sent.add_theme_font_size_override("font_size", 17)
	_forgot_sent.add_theme_color_override("font_color", ClientUi.TEXT)
	ClientUi.apply_body_font(_forgot_sent)
	form.add_child(_forgot_sent)

	# Dev reset token fields (local API convenience — not on web UI)
	_reset_wrap = VBoxContainer.new()
	_reset_wrap.visible = false
	_reset_wrap.add_theme_constant_override("separation", 8)
	form.add_child(_reset_wrap)
	_reset_wrap.add_child(_field_label("Reset token (dev)"))
	_reset_token = ClientUi.make_field("Token from email / API")
	_reset_wrap.add_child(_reset_token)
	_reset_wrap.add_child(_field_label("New password"))
	_reset_pw = ClientUi.make_field("New password", true)
	_reset_wrap.add_child(_reset_pw)
	var apply_reset := Button.new()
	apply_reset.text = "Apply password reset"
	ClientUi.apply_ghost_button(apply_reset)
	apply_reset.pressed.connect(_on_reset_password)
	_reset_wrap.add_child(apply_reset)

	_primary_btn = Button.new()
	_primary_btn.text = "Log in"
	_primary_btn.custom_minimum_size.y = 59
	_primary_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ClientUi.apply_primary_button(_primary_btn)
	_primary_btn.pressed.connect(_on_primary)
	form.add_child(_primary_btn)

	_back_from_forgot = Button.new()
	_back_from_forgot.visible = false
	_back_from_forgot.text = "‹  Back to log in"
	_back_from_forgot.flat = true
	_back_from_forgot.add_theme_font_size_override("font_size", 16)
	_back_from_forgot.add_theme_color_override("font_color", ClientUi.CYAN)
	ClientUi.apply_body_font(_back_from_forgot)
	_back_from_forgot.pressed.connect(func() -> void: _set_mode("login"))
	form.add_child(_back_from_forgot)

	var foot_gap := Control.new()
	foot_gap.custom_minimum_size.y = 27
	root.add_child(foot_gap)

	_footer = RichTextLabel.new()
	_footer.bbcode_enabled = true
	_footer.fit_content = true
	_footer.scroll_active = false
	_footer.autowrap_mode = TextServer.AUTOWRAP_OFF
	_footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_footer.custom_minimum_size.y = 32
	_footer.add_theme_font_size_override("normal_font_size", 13)
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
	lab.add_theme_font_size_override("font_size", 16)
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


func _set_mode(mode: String) -> void:
	_mode = mode
	_forgot_sent_flag = false
	_show_error("")
	_reset_wrap.visible = false
	_forgot_sent.visible = false
	_back_from_forgot.visible = false

	match mode:
		"register":
			_icon_lab.text = "＋"
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
			_footer.visible = true
			_footer.text = "Already have an account? [url=login][color=#0DCADF][b]Log in[/b][/color][/url]"
		"otp":
			_icon_lab.text = "✉"
			_title.text = "Verify your email"
			_subtitle.text = "We sent a code to %s" % _email.text.strip_edges()
			_password_row.visible = false
			_password.visible = false
			_confirm_wrap.visible = false
			_otp_wrap.visible = true
			_email.visible = false
			_primary_btn.visible = true
			_primary_btn.text = "Verify"
			_footer.visible = false
		"forgot":
			_icon_lab.text = "✉"
			_title.text = "Reset password"
			_subtitle.text = "We'll send you a link to reset it"
			_password_row.visible = false
			_password.visible = false
			_confirm_wrap.visible = false
			_otp_wrap.visible = false
			_email.visible = true
			_primary_btn.visible = true
			_primary_btn.text = "Send reset link"
			_footer.visible = true
			_footer.text = "[url=login][color=#0DCADF][b]‹ Back to log in[/b][/color][/url]"
		_:
			_icon_lab.text = "↪"
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
	_primary_btn.text = "⟳  Logging in..."
	_show_error("")
	var res: Dictionary = await AuthManager.login(_email.text.strip_edges(), _password.text)
	_set_busy(false)
	_primary_btn.text = "Log in"
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
	_primary_btn.text = "⟳  Creating account..."
	_show_error("")
	var res: Dictionary = await AuthManager.register(_email.text.strip_edges(), _password.text)
	_set_busy(false)
	_primary_btn.text = "Create account"
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
	_primary_btn.text = "⟳  Sending..."
	var res: Dictionary = await AuthManager.request_password_reset(_email.text.strip_edges())
	_set_busy(false)
	_primary_btn.text = "Send reset link"
	_forgot_sent_flag = true
	_email.visible = false
	_primary_btn.visible = false
	_forgot_sent.visible = true
	_forgot_sent.text = str(res.get("error", "Password reset is not available in the Godot client yet."))
	_show_error(str(res.get("error", "")), true)


func _on_reset_password() -> void:
	_show_error("Password reset is not available in the Godot client yet.", true)
	_set_mode("login")
