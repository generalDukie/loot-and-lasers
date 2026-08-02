# Loot & Lasers — Godot client

Talks to the **same Node API** as the web game (`http://127.0.0.1:8787`).

## Run

1. `npm run server`
2. Open `loot&lasers/project.godot` in Godot 4.7 → **F5**

## Display / resolution

- **Logical design:** 2560×1440 (16:9) via `content_scale_size` + stretch `canvas_items` / `keep` / `fractional`
- **Physical window:** starts at 1920×1080 override (or maximized to the monitor). Never requires a 2560×1440 physical canvas.
- **Authoritative autoload:** `ResolutionManager` (SettingsManager only toggles fullscreen / audio)
- **Web export:** `export_presets.cfg` + `export/web/index.template.html` — canvas is `width/height: 100%` of the browser
- Tests: `npm run test:godot-resolution`

## Coverage

Login / OTP / password reset · character create (looks) · slots · hub  
Cantina · Arena · Frontier · Nexus · Mining · Casino · Void · Shop · Ship · Stats  
Mail (compose) · Messages · Friends (block) · Guild (invite + weekly + activity log) · Guild Wars  
Crystal Store · Progress (daily prompt + achievement catalog) · Leaderboard (challenge) · Notifications  
Cosmic Vault (species/artifacts/relics/gear/badges) · Inventory paper-doll + compare/lock · Codex  
Settings (promo/rename/legacy display/delete) · Admin (search/grant/reports) · Public profiles · Galaxy News  
Realtime: ChatMessage WS + mail/DM/notification poll · class passives in combat sim · procedural audio beds

## Next

Visual polish (combat FX, hub art, soundtrack)
