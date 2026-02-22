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
3. Provision required backend bindings in your Cloudflare account and set matching IDs in `oracle/apps/am-i-done-api/wrangler.toml`:
   - `NORMALIZER_CACHE` (KV namespace)
   - `OUTLOOK_CACHE` (KV namespace)
   - `DB` (D1 database)
4. For local Worker development, copy `oracle/apps/am-i-done-api/.dev.vars.example` to `oracle/apps/am-i-done-api/.dev.vars` and set local values.
   - Required local values include:
     - `OPENROUTER_API_KEY`
     - `NORMALIZER_MODEL` (default example: `openai/gpt-5-nano`)
     - `OUTLOOK_MODEL` (default example: `openai/gpt-5-nano`)
   - Runtime defaults in `oracle/apps/am-i-done-api/wrangler.toml` are:
     - `NORMALIZER_MODEL="openai/gpt-5-nano"`
     - `OUTLOOK_MODEL="openai/gpt-5-nano"`
5. Set required backend secret:
   - `npx wrangler secret put OPENROUTER_API_KEY --cwd oracle/apps/am-i-done-api`
6. Prepare a custom domain/zone for same-origin API routing (for example `am-i-done.example.com`) so `/api/*` can be routed to the Worker service.
7. Run tests before deployment:
   - `./scripts/run_silent.sh "tests" npm test`

## Local development (web + worker)
1. Start Worker API:
   - `npm run worker:dev`
2. Start frontend:
   - `npm run web:dev`
3. Open local web app:
   - `http://localhost:8788`

`web:dev` automatically binds `API_BASE_URL` to `http://localhost:8787` by default, so same-origin `/api/*` requests proxy to the local Worker without extra flags.

## Deploy backend (Worker)
1. Confirm Worker config exists:
   - `oracle/apps/am-i-done-api/wrangler.toml`
2. Deploy Worker:
   - `npm run worker:deploy`
3. Smoke check Worker:
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
