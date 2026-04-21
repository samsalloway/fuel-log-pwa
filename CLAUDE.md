# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Health Log** — single-file personal health PWA that tracks macros and body composition. The entire app lives in `index.html`; no build step, no backend.

Hosted at `https://samhealthlog.netlify.app/`.

## Development

- Open `index.html` directly, or serve statically (`npx serve .`, `python -m http.server`, `netlify dev`) — all work identically.
- No build, lint, or test commands.
- No `package.json`.

## Architecture

- **Runtime**: React 18 loaded from CDN (production UMD), no JSX — all UI uses `React.createElement` via the alias `e()`.
- **State**: `useState`/`useEffect` with localStorage persistence. No state library.
- **Storage keys** (all scoped to the origin, so data persists across code edits):
  - `macro-tracker-history-v1` — date-keyed food log `{ "YYYY-MM-DD": [entry, ...] }`.
  - `macro-tracker-favorites-v1` — quick-log favorites.
  - `macro-tracker-goals` — daily macro targets.
  - `macro-tracker-api-key` — Anthropic API key (plain text).
  - `macro-tracker-body-metrics-v1` — date-keyed weigh-ins `{ "YYYY-MM-DD": { weight, bodyFat, muscleMass, unit, ts } }`. Same-day entries overwrite.
  - `macro-tracker-body-targets-v1` — `{ bodyFat: number|null, muscleMass: number|null }`. Rendered as dotted goal lines on the Composition chart; null hides the line.
  - `macro-tracker-theme` — `"auto" | "light" | "dark"`.
  - `macro-tracker-seed-20260413` — one-time seed flag.
- **Date resolution**: `today()` and `dateKey(d)` resolve in `America/New_York` (`APP_TZ`) so late-evening ET entries don't roll into the next UTC day.
- **AI integration**: Direct browser calls to the Anthropic Messages API (`claude-sonnet-4-20250514`) for food analysis, meal suggestions, and body-metric screenshot OCR (vision). Requires `anthropic-dangerous-direct-browser-access` header.
- **Voice input**: Web Speech Recognition API (`SpeechRecognition` / `webkitSpeechRecognition`). Uses `abort()` (not `stop()`) for reliable mic release on iOS Safari, plus a 60s safety timer and `visibilitychange`/`pagehide`/`blur` listeners.
- **Barcode scanner**: native `BarcodeDetector` API when available (Chromium), falling back to `@zxing/library` (loaded from CDN) for iOS Safari and other browsers without native support. Product lookup via Open Food Facts.

## Theming

- Two palettes live in the `themes` object: `light` (warm & organic — cream, sage, terracotta, amber, rose) and `dark` (warm charcoal with the same hues brightened). Both expose a `good` green used by macro rings to signal "on track".
- Theme mode is `"auto"` by default (follows `prefers-color-scheme`), overrideable via the Settings panel.
- `useThemeMode()` hook reads the stored mode + system preference and returns `{ theme, mode, setMode, isDark }`.
- `ThemeContext` is installed at the `App` root. Components read `const t = useTheme()` and style via tokens: `t.bg`, `t.surface`, `t.surfaceElevated`, `t.sheet`, `t.text`, `t.textDim`, `t.textMuted`, `t.textFaint`, `t.border`, `t.borderStrong`, `t.overlay`, `t.cal`, `t.pro`, `t.carb`, `t.fat`, `t.good`, `t.accent`, `t.danger`, `t.shadow`, `t.onAccent`, etc.
- Do NOT hardcode `"#fff"`, `"#0D0D0D"`, or `rgba(255,255,255,...)` — use tokens so both themes work.

## Key Components (all in index.html)

- `App` — root; installs `ThemeContext`, gates on API key, renders `SetupScreen` or `MacroTracker`.
- `MacroTracker` — main screen: date pill, 44pt toolbar (History / Trends / Favorites / Settings), macro rings, Speak/Type/Scan input tiles, food log with inline editor + move-to-another-day action, suggestion chip.
- `Ring` — SVG circular progress for a macro. Takes `mode: "target" | "limit"`:
  - `"limit"` (calories, carbs, fat): arc fills `t.good` while under target, flips to `t.danger` when over. Sub-label shows "Xg left" / "+Xg over".
  - `"target"` (protein): arc fills `t.danger` until the target is hit, then flips to `t.good` with a ✓ badge. Sub-label shows "Xg to go" / "goal hit" / "+Xg".
- `SetupScreen` — API key entry with validation.
- `SettingsPanel` — Appearance, Daily Targets (macro limits + protein target), **Body Targets** (bodyFat %, muscleMass lb for chart dotted lines), Data (Export/Restore).
- `FavoritesPanel`, `HistoryPanel` — bottom-sheet overlays.
- `TrendsPanel` — bottom-sheet with **Macros / Body** tabs and 7d / 30d / 90d range. Body tab has inline "Log Weigh-In" form at the top (manual entry + screenshot OCR via `analyzeBodyScreenshot`).
- `BarcodeScanner`, `BarcodeConfirm` — camera scan + Open Food Facts lookup. Prefers native `BarcodeDetector`, falls back to `ZXing.BrowserMultiFormatReader` when absent.
- `LineChart` / `DualLineChart` — hand-built SVG charts. Both accept a `goal` (LineChart) or per-series `goal` (DualLineChart) that's rendered as a dotted horizontal line in the series' color; the y-scale auto-expands to include the goal so you can see progress even when far from it.
- `analyzeFood`, `suggestMeal`, `analyzeBodyScreenshot` — Anthropic API utilities.

## Conventions

- Designed for iPhone (440px max-width, safe area insets, `-webkit-tap-highlight-color`).
- Warm & organic aesthetic — muted macro hues, generous padding (24px sheets, 14–16px cards), larger radii (12/14/16/20/24), soft ring glows. Playfair Display for headers, DM Sans with `fontVariantNumeric: "tabular-nums"` for most numbers, DM Mono reserved for timestamps and small letter-spaced UPPERCASE labels.
- No comments in code; component boundaries marked with `// ── Name ──` separator lines.
- When adding features that should survive across code edits, use a new localStorage key (don't mutate existing data shapes). Data persists automatically because localStorage is scoped to the origin, not the code.
