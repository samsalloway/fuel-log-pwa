# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Health Log** — single-file personal health PWA that tracks macros, body composition, and (via integration) Whoop recovery/sleep/strain/workouts. The app UI lives entirely in `index.html`. A small Netlify Functions backend handles the Whoop OAuth client secret.

Hosted at `https://samhealthlog.netlify.app/`. Static `privacy.html` at `/privacy.html`.

## Development

- `netlify dev` — serves the site + functions locally at `http://localhost:8888`. Required for testing the Whoop OAuth flow end-to-end.
- Opening `index.html` directly (or `npx serve .` / `python -m http.server`) works for everything *except* Whoop (the functions need `netlify dev` or a deployed Netlify site).
- No build, lint, or test commands.
- No `package.json` — the functions use Node 18+'s global `fetch` and have zero dependencies.

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
  - `macro-tracker-whoop-client-id-v1` — Whoop app's public Client ID, pasted in Settings → Integrations.
  - `whoop-tokens-v1` — `{ access_token, refresh_token, expires_at, scope, token_type }`. Refreshed transparently via the refresh function.
  - `whoop-recovery-v1`, `whoop-sleep-v1`, `whoop-cycles-v1` — `{ "YYYY-MM-DD": {...} }`. Same-day entries overwrite.
  - `whoop-workouts-v1` — `{ "YYYY-MM-DD": [workout...] }`. Dedup'd by `id`.
  - `whoop-last-sync-v1` — ISO timestamp of last successful sync.
  - `whoop-sync-log-v1` — last 10 sync attempts for debugging.
  - `whoop-profile-v1` — cached profile `{ user_id, email, first_name, last_name }`.
- **AI integration**: Direct browser calls to the Anthropic Messages API (`claude-sonnet-4-20250514`) for food analysis, meal suggestions, and body-metric screenshot OCR (vision). Requires `anthropic-dangerous-direct-browser-access` header.
- **Voice input**: Web Speech Recognition API (`SpeechRecognition` / `webkitSpeechRecognition`). Uses `abort()` (not `stop()`) for reliable mic release on iOS Safari, plus a 60s safety timer and `visibilitychange`/`pagehide`/`blur` listeners.
- **Barcode scanner**: native `BarcodeDetector` API + Open Food Facts for product lookups; gracefully falls back on unsupported browsers.

## Whoop integration

### Netlify Functions (`/netlify/functions/`)
These are the only server-side code. Each is a single file, no deps.
- `whoop-token-exchange.js` — POST `{ code, redirect_uri }` → Whoop token URL with client secret. Returns token payload to browser.
- `whoop-token-refresh.js` — POST `{ refresh_token, scope }` → refreshed tokens. Tries with `scope`, retries once without if rejected.
- `whoop-fetch.js` — GET proxy to `api.prod.whoop.com/v2/*`. Takes `?path=/v2/...&<query>` and forwards the `Authorization: Bearer` header. Validates `path` prefix to prevent SSRF. Exists to dodge potential CORS issues on Whoop's data endpoints.

All three set `Access-Control-Allow-Origin` for `https://samhealthlog.netlify.app`, `http://localhost:8888`, `http://localhost:3000`.

### Environment variables (set in Netlify dashboard; see `.env.example`)
- `WHOOP_CLIENT_ID` — public client ID (also stored in localStorage in the browser).
- `WHOOP_CLIENT_SECRET` — **never sent to the browser**.
- `WHOOP_REDIRECT_URI` — `https://samhealthlog.netlify.app/whoop-callback`.

### OAuth flow
Settings → Integrations → Connect Whoop → Whoop consent → redirect to `/whoop-callback?code=...&state=...`. `netlify.toml` rewrites `/whoop-callback` to `/index.html` (SPA fallback). `App` reads the query params on load, validates `state` against `sessionStorage`, calls the exchange function, stores tokens in localStorage, and strips the URL.

Scopes requested: `offline read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement`. The `offline` scope is required for Whoop to issue a refresh token.

### Sync engine (`syncWhoop({ backfillDays })`)
- Auto: fires on app open if tokens exist and last sync > 6h ago.
- Manual: "↻" button on the Recovery card or "Re-backfill 60d" in Settings.
- Sequentially fetches cycles → recovery → sleep → workouts from Whoop v2 (paginated by `next_token`, 25 per page, capped at 20 pages per endpoint). Each record is mapped to a calendar date key using the record's `timezone_offset` (the **wake day**: `cycle.start` date for cycles, `sleep.end` for sleep, the joined cycle start for recovery, and `workout.start` for workouts).
- All records are kept `raw` alongside the parsed fields, so a schema change can be re-parsed without a re-fetch.
- `whoopFetch(path, params)` handles one 401 refresh + retry; if still 401, tokens are cleared and the UI prompts "Reconnect Whoop".

### Date mapping helpers
- `localDateFromOffset(iso, offset)` — converts an ISO timestamp + Whoop `timezone_offset` string (e.g. `"-04:00"`) to a local calendar `YYYY-MM-DD`. Falls back to browser TZ if offset is missing.

## Theming

- Two palettes live in the `themes` object: `light` (warm & organic — cream, sage, terracotta, amber, rose) and `dark` (warm charcoal with the same hues brightened).
- Theme mode is `"auto"` by default (follows `prefers-color-scheme`), overrideable via the Settings panel.
- `useThemeMode()` hook reads the stored mode + system preference and returns `{ theme, mode, setMode, isDark }`.
- `ThemeContext` is installed at the `App` root. Components read `const t = useTheme()` and style via tokens: `t.bg`, `t.surface`, `t.surfaceElevated`, `t.sheet`, `t.text`, `t.textDim`, `t.textMuted`, `t.textFaint`, `t.border`, `t.borderStrong`, `t.overlay`, `t.cal`, `t.pro`, `t.carb`, `t.fat`, `t.accent`, `t.danger`, `t.shadow`, `t.onAccent`, etc.
- Do NOT hardcode `"#fff"`, `"#0D0D0D"`, or `rgba(255,255,255,...)` — use tokens so both themes work.
- `privacy.html` uses its own tiny inline CSS (not the theme system) with `prefers-color-scheme` media queries.

## Key Components (all in index.html)

- `App` — root; installs `ThemeContext`, handles Whoop OAuth callback on load, gates on API key, renders `SetupScreen` or `MacroTracker`.
- `MacroTracker` — main screen: date pill, 44pt toolbar (History / Trends / Favorites / Settings), macro rings, Recovery card, Workouts card, Speak/Type/Scan input tiles, food log with inline editor, suggestion chip.
- `Ring` — SVG circular progress for a macro. Takes `mode: "target" | "limit"`:
  - `"target"` (protein): shows a ✓ badge + "goal hit" when `value >= max`; under target shows "Xg to go".
  - `"limit"` (calories, carbs, fat): no ✓ ever — goals are ceilings. Under shows "Xg left"; over shows red "+Xg over".
- `SetupScreen` — API key entry with validation.
- `SettingsPanel` — Appearance, Daily Targets (macro limits + protein target), **Body Targets** (bodyFat %, muscleMass lb for chart dotted lines), **Integrations** (Whoop Client ID + Connect/Disconnect), Data (Export/Restore).
- `FavoritesPanel`, `HistoryPanel` — bottom-sheet overlays.
- `TrendsPanel` — bottom-sheet with **Macros / Body / Whoop** tabs and 7d / 30d / 90d range.
- `RecoveryCard` — home-screen card showing today's Whoop recovery (score with color, HRV, RHR, sleep, strain, sync button). Taps expand to show sleep stage breakdown.
- `WorkoutsCard` — inline list of today's Whoop workouts.
- `BackfillPrompt` — modal after first Whoop OAuth success, offering 60-day backfill or minimal 2-day sync.
- `WhoopOAuthErrorDialog` — modal surfacing OAuth failures with a "Open Settings" action.
- `BarcodeScanner`, `BarcodeConfirm` — camera scan + Open Food Facts lookup.
- `LineChart` / `DualLineChart` — hand-built SVG charts. Both accept a `goal` (LineChart) or per-series `goal` (DualLineChart) that's rendered as a dotted horizontal line in the series' color; the y-scale auto-expands to include the goal so you can see progress even when far from it.
- `analyzeFood`, `suggestMeal`, `analyzeBodyScreenshot` — Anthropic API utilities.
- `whoopFetch`, `syncWhoop`, `mapRecovery/Sleep/Cycle/Workout`, `buildWhoopSeries` — Whoop data layer.

## Conventions

- Designed for iPhone (440px max-width, safe area insets, `-webkit-tap-highlight-color`).
- Warm & organic aesthetic — muted macro hues, generous padding (24px sheets, 14–16px cards), larger radii (12/14/16/20/24), soft ring glows. Playfair Display for headers, DM Sans with `fontVariantNumeric: "tabular-nums"` for most numbers, DM Mono reserved for timestamps and small letter-spaced UPPERCASE labels.
- No comments in code; component boundaries marked with `// ── Name ──` separator lines.
- When adding features that should survive across code edits, use a new localStorage key (don't mutate existing data shapes). Data persists automatically because localStorage is scoped to the origin, not the code.
- Whoop durations stay in **milliseconds** in storage to match the source; UI formatters (`formatDurationMs`) render them as `Xh MMm`.
