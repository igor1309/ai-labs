---
date: 2026-02-22
model: gpt-5-codex
description: "Deploy runbook for Am I done frontend (Pages) and backend (Workers)"
---

# Oracle deploy guide (Cloudflare Pages + Workers)

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
   - `OPENROUTER_API_KEY=<your_key>`
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
   - `PROMPT_VERSION="1"`
4. Ensure Worker secret exists:
   - `npx wrangler secret put OPENROUTER_API_KEY --cwd oracle/apps/am-i-done-api`
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

## Deployment order
1. Deploy Worker first.
2. Set/update Pages `API_BASE_URL`.
3. Deploy Pages web app.

## CI workflows
- `CI` (`.github/workflows/ci.yml`) delegates baseline checks to reusable `.github/workflows/core.yml`.
- `Web E2E` (`.github/workflows/web-e2e.yml`) delegates to reusable `.github/workflows/core-web-e2e.yml` and stays manual (`workflow_dispatch`).
- Telegram failure notifications are sent via `scripts/ci/notify_telegram_failure.sh`.
