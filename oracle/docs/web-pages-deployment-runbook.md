---
date: 2026-02-22
model: gpt-5
description: "Runbook for deploying Am I done web via Cloudflare Pages with same-origin API proxying"
---

# Am I done Web Pages Deployment Runbook

## Goal
Deploy `am-i-done-web` so browser traffic stays same-origin (`/api/*`) while Pages Functions proxies to the deployed Worker API using `API_BASE_URL`.

## Required Inputs
- Worker API is deployed and reachable by HTTPS URL.
- `API_BASE_URL` is configured for the Pages project and points to the Worker origin, for example:
  - `https://am-i-done-api.example.workers.dev`

## Deployment Order
1. Deploy/update Worker API first (`am-i-done-api`).
2. Configure/update Pages runtime variable `API_BASE_URL` to the Worker origin.
3. Deploy Pages web app (`am-i-done-web`).

## Commands
Run all commands from the repository root.

### 1. Verify test baseline
```bash
./scripts/run_silent.sh "tests" npm test
```

### 2. Deploy Worker API
```bash
npm run worker:deploy
```

### 3. Set Pages proxy target
```bash
npx wrangler pages secret put API_BASE_URL --project-name am-i-done-web --cwd oracle/apps/am-i-done-web
```

### 4. Deploy Web Pages app
```bash
npm run web:deploy
```

## Post-Deploy Checks
1. Open the deployed web URL and submit a profession.
2. Confirm the browser request path is `/api/outlook` on the same origin.
3. Confirm the UI shows one of the expected outcomes: structured answer, clarification prompt, or transport failure message for timeout/network issues.
