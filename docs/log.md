# Log

## 2026-02-23
Implement locale v2 web frontend (EN/RU chrome i18n + schemaVersion 2 + RU deterministic/E2E coverage).
Release `v0.1.4`.
Stop uploading custom GitHub Release assets (GitHub always includes source archives).
Release `v0.1.3`.
Create minimal GitHub Releases for successful `v*` tag-driven deployments.
Switch CI real-provider smoke model to `openai/gpt-5-nano` via Actions variable `OPENROUTER_CI_MODEL`.

## 2026-02-22
Add Telegram notifications on CI failure to both CI and Web E2E workflows using `CI_BOT_TOKEN`/`CI_CHAT_ID` secrets.
Document Oracle local-dev automation: `npm run web:dev` now auto-binds `API_BASE_URL` to local worker by default, and worker model defaults are configured via vars (`openai/gpt-5-nano`) instead of assembler hardcoded values.
Add repo-wide `.env`/`.dev.vars` gitignore protection so local secret files stay untracked by default.

## 2026-02-21
Add Playwright-based web E2E test wiring to CI (browser install + `RUN_WEB_E2E=1` test execution) while keeping local suite runs deterministic.
Add `oracle` project with `seed.md` doc.
Create `ia-labs` repo (name by gpt-5.2).
