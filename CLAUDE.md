# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Single-file macro/calorie tracking PWA. Everything lives in `index.html` — no build step, no bundler, no package.json.

## Development

Open `index.html` directly in a browser or serve it locally (`npx serve .` or `python -m http.server`). There are no build, lint, or test commands.

## Architecture

- **Runtime**: React 18 loaded from CDN (production UMD), no JSX — all UI uses `React.createElement` via the alias `e()`.
- **State**: `useState`/`useEffect` with localStorage persistence. No state library.
- **Storage keys**: `macro-tracker-history-v1` (date-keyed food log), `macro-tracker-favorites-v1`, `macro-tracker-goals`, `macro-tracker-api-key`.
- **AI integration**: Direct browser calls to the Anthropic Messages API (`claude-sonnet-4-20250514`) for food analysis. Requires `anthropic-dangerous-direct-browser-access` header. The API key is stored in localStorage and entered via a setup screen.
- **Voice input**: Web Speech Recognition API (`SpeechRecognition` / `webkitSpeechRecognition`).

## Key Components (all in index.html)

- `App` — root; gates on API key presence, renders `SetupScreen` or `MacroTracker`.
- `MacroTracker` — main screen: date navigation, macro rings, mic/keyboard input, food log, entry management.
- `Ring` — SVG circular progress for each macro (calories, protein, carbs, fat).
- `SetupScreen` — API key entry with validation.
- `SettingsPanel`, `FavoritesPanel`, `HistoryPanel` — bottom-sheet overlays.
- `analyzeFood(text, apiKey)` — sends natural language to Claude, expects JSON with `{ items: [...] }`.

## Conventions

- Designed for iPhone (440px max-width, safe area insets, `-webkit-tap-highlight-color`).
- Dark theme with specific color tokens in the `C` object (cal/pro/carb/fat/card/bord).
- Fonts: DM Sans, DM Mono, Playfair Display (loaded from Google Fonts CDN).
- No comments in code; component boundaries marked with `// ── Name ──` separator lines.
