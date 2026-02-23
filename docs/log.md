# Log

## 2026-02-23
Extract Oracle core CI into `oracle-core`, dispatch by changed project paths, and gate `real-provider-smoke` on Oracle/shared changes.
Oracle: implement locale v2 (backend + frontend). See `oracle/docs/log.md`.
Add Loki logging stack decision + implementation plan docs (single-host Loki+Grafana, host Alloy journald-first ingestion, 14-day retention, Cloudflare Tunnel + Access).
Release `v0.1.4`.
Stop uploading custom GitHub Release assets (GitHub always includes source archives).
Release `v0.1.3`.
Create minimal GitHub Releases for successful `v*` tag-driven deployments.
Harden tag-driven release workflow (verify tag on trunk/checkout, centralize node version, and reuse Telegram notify wiring).
Switch CI real-provider smoke model to `openai/gpt-5-nano` via Actions variable `OPENROUTER_CI_MODEL`.

## 2026-02-22
Add Telegram notifications on CI failure to both CI and Web E2E workflows using `CI_BOT_TOKEN`/`CI_CHAT_ID` secrets.
Oracle: document local-dev automation and config defaults. See `oracle/docs/log.md`.
Add repo-wide `.env`/`.dev.vars` gitignore protection so local secret files stay untracked by default.

## 2026-02-21
Add Playwright-based web E2E test wiring to CI (browser install + `RUN_WEB_E2E=1` test execution) while keeping local suite runs deterministic.
Add `oracle` project with `seed.md` doc.
Create `ia-labs` repo (name by gpt-5.2).
