---
date: 2026-02-22
model: gpt-5-codex
description: "Deploy runbook for Am I done frontend (Pages) and backend (Workers)"
---

# Oracle deploy guide (Cloudflare Pages + Workers)

## Architecture
- Frontend: `oracle/apps/am-i-done-web/src` deployed to Cloudflare Pages.
- Backend: `oracle/apps/am-i-done-api` deployed as Cloudflare Worker service `am-i-done-api`.
- Frontend API calls are same-origin (`POST /api/outlook`), so production routing must send `/api/*` to the Worker.

## Prerequisites
1. Install dependencies:
   - `npm install`
2. Verify Wrangler auth:
   - `npx wrangler whoami`
3. Run tests before deployment:
   - `./scripts/run_silent.sh "tests" npm test`

## Deploy backend (Worker)
1. Confirm Worker config exists:
   - `oracle/apps/am-i-done-api/wrangler.toml`
2. Set required secret:
   - `npx wrangler secret put OPENROUTER_API_KEY --cwd oracle/apps/am-i-done-api`
3. Deploy Worker:
   - `npm run worker:deploy`
4. Smoke check Worker:
   - `curl https://am-i-done-api.<your-subdomain>.workers.dev/health`
   - `curl -X POST https://am-i-done-api.<your-subdomain>.workers.dev/api/outlook -H "content-type: application/json" -d '{"profession":"software developer","locale":"en-US","schemaVersion":"1"}'`

## Deploy frontend (Pages)
1. Create Pages project once:
   - `npx wrangler pages project create am-i-done-web`
2. Deploy static frontend:
   - `npx wrangler pages deploy oracle/apps/am-i-done-web/src --project-name am-i-done-web`

## Same-origin API routing
1. Attach a custom domain to the Pages project (for example `am-i-done.example.com`).
2. Add a Worker route for the same host:
   - Route pattern: `am-i-done.example.com/api/*`
   - Service: `am-i-done-api`
3. Verify from the Pages host:
   - `curl https://am-i-done.example.com/api/outlook -X POST -H "content-type: application/json" -d '{"profession":"software developer","locale":"en-US","schemaVersion":"1"}'`

## Deployment order
1. Deploy Worker first.
2. Deploy Pages second.
3. Verify `/health` on Worker and `/api/outlook` through the Pages domain.
