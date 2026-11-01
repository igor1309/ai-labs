---
date: 2026-02-22
model: gpt-5-codex
description: "Deploy runbook for Am I done frontend (Pages) and backend (Workers)"
---

# Oracle deploy guide (Cloudflare Pages + Workers)

Landing page: apps/am-i-done-web/src/landing.html

## What runs where
- Frontend: `oracle/apps/am-i-done-web/src` on Cloudflare Pages.
- Backend: `oracle/apps/am-i-done-api` on Cloudflare Workers (`am-i-done-api`).
- Browser API calls are same-origin (`POST /api/outlook`), proxied by Pages Functions.

## How to run locally
Run all commands from repo root.

1. Install dependencies:
   - `npm install`
2. Create local worker env:
   - `cp oracle/apps/am-i-done-api/.dev.vars.example oracle/apps/am-i-done-api/.dev.vars`
3. Set local values in `oracle/apps/am-i-done-api/.dev.vars`:
   - `LLM_API_KEY=<your_key>`
   - `NORMALIZER_MODEL=openai/gpt-5-nano`
   - `OUTLOOK_MODEL=openai/gpt-5-nano`
4. Start worker:
   - `npm run worker:dev`
5. Start frontend (separate terminal):
   - `npm run web:dev`
6. Open:
   - `http://localhost:8788`

Notes:
- Worker local URL: `http://localhost:8787`.
- `web:dev` auto-binds `API_BASE_URL=http://localhost:8787`.
- Deterministic browser E2E coverage is test-owned via `oracle/apps/am-i-done-web/tests/support/deterministic-worker-fetch.js` and does not use runtime assembler env switches.

## How to run on web (Cloudflare)
Run all commands from repo root.

1. Verify Wrangler auth:
   - `npx wrangler whoami`
2. Ensure account resources exist and match `oracle/apps/am-i-done-api/wrangler.toml`:
   - KV namespace for `NORMALIZER_CACHE`
   - KV namespace for `OUTLOOK_CACHE`
   - D1 database for `DB`
3. Ensure Worker vars in `oracle/apps/am-i-done-api/wrangler.toml`:
   - `NORMALIZER_MODEL="openai/gpt-5-nano"`
   - `OUTLOOK_MODEL="openai/gpt-5-nano"`
   - `PROMPT_VERSION="2"`
4. Ensure Worker secret exists:
   - `npx wrangler secret put LLM_API_KEY --cwd oracle/apps/am-i-done-api`
5. Run tests:
   - `./scripts/run_silent.sh "tests" npm test`
6. Deploy Worker:
   - `npm run worker:deploy`
7. Configure Pages proxy target:
   - `npx wrangler pages secret put API_BASE_URL --project-name am-i-done-web --cwd oracle/apps/am-i-done-web`
   - value should be Worker URL, for example `https://am-i-done-api.<subdomain>.workers.dev`
8. Deploy web app:
   - `npm run web:deploy`

## Post-deploy checks
1. Worker health:
   - `curl https://am-i-done-api.<your-subdomain>.workers.dev/health`
2. Worker direct API:
   - `curl -X POST https://am-i-done-api.<your-subdomain>.workers.dev/api/outlook -H "content-type: application/json" -d '{"profession":"software developer","locale":"en-US","schemaVersion":"1"}'`
3. Same-origin API through Pages/custom domain:
   - `curl -X POST https://<your-pages-or-custom-domain>/api/outlook -H "content-type: application/json" -d '{"profession":"software developer","locale":"en-US","schemaVersion":"1"}'`

## Worker logs (tail)
Run from repo root.

1. Start live tail:
   - `npx wrangler tail --cwd oracle/apps/am-i-done-api --format pretty`
2. Filter to outlook route traffic:
   - `npx wrangler tail --cwd oracle/apps/am-i-done-api --format pretty --search "/api/outlook"`
3. Structured output mode:
   - `npx wrangler tail --cwd oracle/apps/am-i-done-api --format json`

Notes:
- If no requests hit the Worker, tail shows no new lines.
- With `invocation_logs = false`, tail mostly shows runtime errors and explicit `console.*` app logs.

## Deployment order
1. Deploy Worker first.
2. Set/update Pages `API_BASE_URL`.
3. Deploy Pages web app.

## CI workflows
- `CI` (`.github/workflows/ci.yml`) delegates Oracle baseline checks to reusable `.github/workflows/oracle-core.yml`.
- `Web E2E` (`.github/workflows/web-e2e.yml`) delegates to reusable `.github/workflows/core-web-e2e.yml` and stays manual (`workflow_dispatch`).
- Telegram failure notifications are sent via `scripts/ci/notify_telegram_failure.sh`.

## Release workflow
- Trigger: push a tag matching `v*` (for example `v0.1.0`).
- Guard: tag must equal root `package.json` version.
- Pipeline: core → real-provider-smoke → web-e2e → deploy worker/pages → create GitHub Release.
- Required GitHub Secrets:
  - `CLOUDFLARE_API_TOKEN` (Wrangler deploy auth)
  - `CLOUDFLARE_ACCOUNT_ID` (Cloudflare account targeting, if required by your setup)
  - `CI_BOT_TOKEN` (Telegram failure notifications)
  - `CI_CHAT_ID` (Telegram failure notifications)
  - `NOMOS_ORACLE_TOKEN` (supplies `LLM_API_KEY` for the real-provider smoke gate)
- Required GitHub Actions variables:
  - `OPENROUTER_CI_MODEL` (cheap model for the real-provider smoke gate)

## Description

Enter a profession and get a structured AI-generated assessment: risk timeline, key threats, recommended next steps, and a confidence rating. *No chat, no accounts* — just a single question and a clear answer.

## Stack

- Cloudflare Workers
- Cloudflare Pages
- Vanilla JS
- Nomos
- D1
- KV Cache
