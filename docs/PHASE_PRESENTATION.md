# Restoration 29 — Visual Feedback & Combat Presentation

Presentation-only restoration. **No gameplay, formulas, persistence, networking, or auth changes.**

## Goal

Every meaningful gameplay event has at least one clear observation path: world FX, status HUD, floater, UI toast/overlay, combat log, or (dev-only) diagnostics.

## Existing assets audited (preserved)

| Area | Location | Status |
|------|----------|--------|
| Floating combat text | Web `ArenaBattleOverlay`; Godot `CombatFxLayer` | Preserved + extended |
| Ability banners | `resolveAbilityBanner` / `ClassPassives.resolve_ability_banner` | Preserved |
| Class VFX bursts | Web `ArenaAbilityBurst` | Preserved |
| Fighter motion | Godot `CombatFighterMotion` | Preserved |
| HP tweens | Godot `CombatHpPresenter` | Preserved |
| Reward overlays | `MissionCompleteOverlay`, `CombatCompleteOverlay`, `LevelUpOverlay`, Godot `CombatSheets` | Preserved |
| Stim / mount chips | `ActiveBuffsBar`, Godot `ActiveEffectsBar` | Preserved |
| Casino FX | `casinoFx.js`, Godot `casino.gd` | Preserved |
| Notifications | `NotificationCenter`, Godot FAB | Preserved |
| Procedural audio | Godot `AudioManager` | Preserved (no asset replacement) |
| Empty VFX folders | `loot&lasers/Assets/VFX` | Untouched (no new GPU particles required) |

## Newly created (presentation only)

| Asset | Purpose |
|-------|---------|
| `src/lib/combatPresentation.js` | Floater labels, status reduce, log format, damage-type colors, dev flag |
| `src/components/game/CombatStatusStrip.jsx` | Persistent barrier / phantom / OC / tantrum / trick / drone chips |
| `src/components/game/CombatEventLog.jsx` | Live combat log (last events) |
| `src/components/game/CombatDevDiagnostics.jsx` | Dev-only event inspector |
| `src/components/game/ConnectivityBanner.jsx` | Offline / reconnect chrome |
| `loot&lasers/Scripts/UI/Combat/CombatPresentation.gd` | Godot parity helpers |
| Status labels + combat log + dev panel | `arena_combat.gd` |

## Modified presentation surfaces

- `ArenaBattleOverlay.jsx` — floaters (MISS / FORCED MISS / TRUE / shield+damage), status strip, log, dev panel
- `ShellOperativePanel.jsx` — signed currency delta flash
- `GameLayout.jsx` — connectivity banner
- `arena_combat.gd` — floater differentiation, status chips, log, diagnostics

## Developer diagnostics

- **Web:** enable with `?combatDev=1` (dev) or `localStorage.ll_combat_dev_diagnostics=1`
- **Godot:** shown when `BackendEnvironment.is_development_overlay_enabled()` (optional `user://presentation.cfg` → `[combat] dev_diagnostics=false` to hide)

Never shown to production players by default.

---

## Gameplay Presentation Coverage Matrix

Legend: **OK** = sufficient existing; **ADD** = filled this restoration; **GAP** = still thin / deferred (non-blocking for significant mechanics).

### Combat readability

| Mechanic | Existing | Missing (pre) | Added | Priority |
|----------|----------|---------------|-------|----------|
| Normal attack | Float −N | Damage-type color | ADD type colors | High |
| Critical | CRIT float + shake | — | OK | High |
| Miss | Banner / weak | Dedicated MISS | ADD | High |
| Forced miss (Phantom) | Banner | Distinct from dodge | ADD FORCED MISS | High |
| Dodge | DODGE float | — | OK | High |
| True damage | Engine flag | Visual | ADD TRUE label/color | High |
| Barrier absorb | SHIELD / banner | Persistent remaining | ADD chips + barrier floats | High |
| Barrier break | Event text | Floater | ADD BARRIER BREAK | High |
| Healing | +N | — | OK | High |
| Victory / defeat | Outro + sheets | — | OK | High |
| Turn / passive triggers | Ability banner | Persistent icons | ADD status strip | High |
| Secondary / passive dmg | Ability FX | — | OK | Med |
| Combat log | Nexus/guild only | Live duel log | ADD | High |

### Class passives

| Passive | Existing | Added | Priority |
|--------|----------|-------|----------|
| Kinetic Tantrum primed (1.5× / 2.0×) | Banner | Status chip | High |
| Tantrum consume | Banner | Chip clear via reduce | High |
| Astral Barrier raise/restore | Banner | Barrier chip + break float | High |
| Phantom charges | Banner | 👻 ×N chip + FORCED MISS | High |
| Dirty Tricks reveal | Banner | 🃏 chip | High |
| Overclock stacks | Banner | ⚡ OC N chip | High |
| Orbital Assistant action | Banner + burst | 🛸 chip | Med |

### Systems (summary)

| Domain | Coverage | Notes |
|--------|----------|-------|
| Mission | OK | Launch / complete / combat reuse |
| Inventory / gear / shops | OK / GAP | Toasts + inventory-full modal; shop still mostly status text |
| Mining | OK | Status + toasts |
| Dungeon / arena | OK | Shared combat + complete overlays; rating on sheets |
| Stim | OK | Active effects bar |
| Casino | OK | Burst FX preserved |
| Achievements / notifications | OK | Toasts + center |
| Economy rail | ADD | Delta flash on operative panel |
| Connectivity | ADD | Offline banner |
| Persistence / recovery | GAP | RecoveryManager states still lightly surfaced on shell |
| Audio pack | GAP | Procedural cues preserved; asset folders empty by design |

---

## Completion checklist (R29)

1. Existing visual assets audited — **Yes**
2. Existing animations preserved — **Yes**
3. Existing VFX preserved — **Yes** (no replacements)
4. Existing UI feedback preserved — **Yes**
5. Coverage matrix — **This document**
6–11. New animations/particles — **None required**; reused Label/tween floaters + Framer Motion
12. Developer diagnostics — **Yes** (web + Godot, gated)
13. Performance — Lightweight (Labels / small CSS / RichText); no GPU particles
14. Accessibility — Distinct labels (FORCED MISS ≠ DODGE); damage-type colors; existing combat speed / shake prefs unchanged
15–19. Files listed above
20. Remaining thin areas — Shop purchase VFX, real SFX pack, global recovery-state chrome, GPU particles (optional polish)

## Regression protection

- No changes to `arenaEngine` formulas, economy, entity access, auth, or network clients beyond UI observation.
- Combat presentation **reads** event streams only.
