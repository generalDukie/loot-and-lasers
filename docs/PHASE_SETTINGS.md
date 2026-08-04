# Phase / Restoration 24 — Player Settings, Client Configuration, UX

Architecture: **Godot owns the client experience** (graphics, audio, accessibility
presentation). **Node** stores only account preferences that already roam
(`legacy_display`, `legacy_name`). Hardware settings never sync.

## Completion verdict

Settings already existed on both clients (Godot `SettingsManager` + web
`audioEngine` / `displayScale`). This restoration classifies local vs account
settings, expands Godot persistence (window mode, VSync, unfocused music,
combat presentation accessibility), adds Node Get/SaveAccountPreferences, and
documents that localization / colorblind / input-rebinding were **never
finalized** and were not invented.

---

## Completion report

### 1. Existing settings architecture
| Client | Store | Scope |
|--------|-------|-------|
| Godot | `user://settings.cfg` via SettingsManager | Local device |
| Web | `localStorage` (`ll_audio_*`, `loot_display_*`) | Local device |
| Account | `users.legacy_display` / `legacy_name` | Node |

### 2. Graphics / display
Godot: ResolutionManager 2560×1440 KEEP + fullscreen/maximized/windowed/exclusive,
VSync toggle, F11. Web: displayScale + anchor (localStorage). No redesign.

### 3. Accessibility
Restored **existing** combat presentation knobs: `combat_anim_speed`,
`screen_shake_scale` → CombatBeatConfig.make_default(). No colorblind / subtitle
systems invented.

### 4. Localization
**Absent** as a product feature — English UI retained. Not invented.

### 5. Client configuration
SettingsManager `serialize_local_preferences`, UI state section `ui_state`,
settings version migration v1→v2.

### 6. Local vs synchronized
**Local:** volumes, window mode, VSync, play-when-unfocused, combat FX scale,
display scale/anchor, resolution.
**Account:** legacy_display, legacy_name only.

### 7–8. Files
**Node:** `preferencesService.js`, RPCs in `functions/index.js`.
**Web:** `preferencesEngine.js`, SettingsPage migration hook.
**Godot:** `SettingsManager.gd`, `settings.gd`, `CombatBeatConfig.gd`.

### 9. Tests
`npm run test:settings` · existing `npm run test:godot-resolution`.

### 10. Migration strategy
- Godot cfg version stamp; derive `window_mode` from legacy `fullscreen`.
- Browser: `migrateBrowserSettingsIfNeeded` no-op preserve (volumes already local).
- Account prefs via explicit RPC — never auto-upload volumes/resolution.

### 11. Regression
No auth/combat/economy/arena rewrites. Combat math unchanged; only FX timing
scale reads SettingsManager.

## Deferred / absent
- Full i18n / localization packs
- Colorblind modes
- Input rebinding UI
- Separate UI volume bus (SFX remains UI+combat cues, matching web)
