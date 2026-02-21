---
date: 2026-02-21
model: gpt-5.2
description: "Implementation plan: deploy Worker and run smoke checks"
---

# Deploy Worker + smoke check

## Goal
Deploy the assembled Worker and verify the service works at a basic integration level (not full domain correctness).

## Preconditions
- KV, D1, and `OPENROUTER_API_KEY` secret exist and are bound in `wrangler.toml`.

## Steps
1. Run tests locally
   - `./scripts/run_silent.sh "tests" npm test`
2. Deploy
   - `npm run worker:deploy`
3. Smoke checks (manual or scripted)
   - `GET /health` returns 200 and `ok`.
   - `POST /api/outlook` returns structured JSON and 200/4xx as expected for invalid inputs.
4. Update log and commit
   - Update `oracle/docs/log.md` (new bullet at the top of the current date).
   - Commit (do not push unless explicitly requested).

## Done criteria
- Deployment succeeds.
- Smoke checks pass.
- Log updated.
