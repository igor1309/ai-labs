---
date: 2026-02-23
model: gpt-5.2
description: "Plan: web frontend locale v2 (UI chrome i18n + raw locale + schemaVersion 2) for Oracle Am I done"
---

# Locale v2 (frontend): UI chrome i18n + schemaVersion 2 requests

## Scope
- Frontend only: `oracle/apps/am-i-done-web` and its tests.
- Add UI chrome localization for English (default) and Russian.
- Send raw locale from browser (`navigator.language`) to the API.
- Opt into backend locale v2 by sending `schemaVersion: "2"`.
- Keep deterministic UI testing via:
  - Playwright context locale for E2E.
  - Unit/integration stubbing `globalThis.navigator`.

## Dependencies
- Backend locale v2 support (schema `"2"` + `effectiveLocale` + RU prompts/copy) is delivered in a separate backend plan.
- During frontend work, deterministic-worker responses must be test-owned (no real provider calls required).

## Non-goals
- Supporting locales other than Russian (ru) + English fallback.
- Introducing a frontend framework or build toolchain (keep vanilla JS + static Pages assets).
- Changing model answer schema keys or enums.

## Execution lock
- Worktree required: yes
- Expected worktree: `worktrees/oracle-0011-locale-v2-frontend-plan`
- Expected branch: `codex/oracle-0011-locale-v2-frontend-plan`
- Preflight check: [ ] done

## Locale policy (frontend)
- Read raw locale from the browser (`navigator.language`), for example `ru-RU`.
- Derive `effectiveLocale` for chrome selection:
  - if raw locale is `ru` or starts with `ru-` (case-insensitive, `_` treated as `-`) → `"ru"`
  - else → `"en"`
- Send raw locale in the request body.
- Use `effectiveLocale` for UI chrome selection.

Rationale:
- Matches backend `ru-only + fallback en` behavior while keeping the request raw for observability and future clients.

## Resource strategy (no runtime file reads on server, static assets on web)
- Store UI strings as JSON source files in the deployed static directory:
  - `oracle/apps/am-i-done-web/src/i18n/strings_en.json` (required)
  - `oracle/apps/am-i-done-web/src/i18n/strings_ru.json` (required for v2 RU chrome)
- Load strings via JavaScript module imports (static) and select by `effectiveLocale`.

Notes:
- This keeps strings as translator-friendly JSON while avoiding async fetch for initial render.
- Ensure English defaults are always present; tests enforce it.

## UI chrome content to localize
At minimum, localize:
- Document title.
- Hero eyebrow, title, intro.
- Form label, placeholder, submit button.
- Loading state, transport error state.
- Section headers: clarification header, time horizon header, confidence header, risks header, what-to-do-next header, assumptions header.

Also localize enum-like renderings owned by UI:
- `answer.confidence.label` display mapping:
  - `low|medium|high` → localized label strings (RU/EN).

## Step 0: Preflight (blocking)
- Run:
  - `git worktree list --porcelain`
  - `git -C worktrees/oracle-0011-locale-v2-frontend-plan branch --show-current`
- Record:
  - `Preflight: worktree=<path>, branch=<branch>, separate_worktree=<pass|fail>`
- Gate: no edits before preflight is `pass`.

## Step 1: Add locale resolution utilities (raw + effective)
- Add small pure helpers in `oracle/apps/am-i-done-web/src/app.js` (or a new module if it reduces churn):
  - `readBrowserLocale()` (returns `navigator.language` or `""`).
  - `resolveEffectiveLocale(rawLocale)` (returns `"ru"` or `"en"`).
- Add unit tests proving:
  - `ru-RU`, `ru_UA`, `ru` → `"ru"`.
  - `en-US`, `fr-FR`, empty/invalid → `"en"`.
- Run: `./scripts/run_silent.sh "tests" npm test`
- Commit: `add web locale resolver`

## Step 2: Add UI strings JSON resources + contract tests
- Add:
  - `src/i18n/strings_en.json`
  - `src/i18n/strings_ru.json`
- Add tests that enforce:
  - English JSON exists and has all required keys.
  - Russian JSON exists and has the same key set as English (no missing keys).
- Run: `./scripts/run_silent.sh "tests" npm test`
- Commit: `add web strings for en and ru`

## Step 3: Render chrome from localized strings
- Implement a single `applyStrings({ document, strings })` that sets:
  - `<html lang>`
  - `<title>`
  - text content for all chrome elements
  - placeholder for the input
- Update `index.html` to include stable `data-testid` or `data-i18n` hooks for the chrome text nodes if needed.
- Add unit tests that validate:
  - When `effectiveLocale="en"`, chrome texts match English strings.
  - When `effectiveLocale="ru"`, chrome texts match Russian strings.
- Run: `./scripts/run_silent.sh "tests" npm test`
- Commit: `render localized ui chrome`

## Step 4: Send v2 requests (schemaVersion=2 + raw locale)
- Update `requestOutlook` to send:
  - `schemaVersion: "2"`
  - `locale: <raw browser locale>` (example `ru-RU`)
- Keep the rest of the request stable.
- Update unit tests that currently assert `{ locale: "en-US", schemaVersion: "1" }` to:
  - stub browser locale and assert the raw locale is sent
  - assert schemaVersion is `"2"`
- Run: `./scripts/run_silent.sh "tests" npm test`
- Commit: `send schemaVersion 2 with raw browser locale`

## Step 5: Align answer rendering with localized enums (confidence label)
- Keep model output `confidence.label` as `low|medium|high`.
- Map this value to localized chrome strings for display.
- Add unit tests asserting the mapping for both locales.
- Run: `./scripts/run_silent.sh "tests" npm test`
- Commit: `localize confidence label rendering`

## Step 6: Update web E2E coverage for RU chrome (Playwright locale)
- Update browser context creation in `oracle/apps/am-i-done-web/tests/web-e2e.test.js`:
  - Create RU context with `{ locale: "ru-RU" }`.
  - Add one RU E2E test (happy path) asserting:
    - chrome is Russian (button/headers/labels)
    - answer renders successfully.
- Update deterministic worker fetch to return RU-shaped responses when:
  - request `schemaVersion="2"` and request locale indicates Russian.
- Keep existing EN E2E tests passing.
- Run: `./scripts/run_silent.sh "tests" npm test` (with `RUN_WEB_E2E=1` only when available; unit suite must remain green without it).
- Commit: `add ru e2e coverage`

## Completion gates
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `./scripts/run_silent.sh "tests" npm test`

