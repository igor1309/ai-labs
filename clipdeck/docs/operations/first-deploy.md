---
date: 2026-05-01
model: gpt-5
description: "First production deployment runbook for clipdeck"
---

# Clipdeck First Deploy

## Goal

Deploy `clipdeck_v0.1.0` through the tag-driven release pipeline, then provision runtime secrets so the private iPhone page can read sanitized prompt and skill items.

## Prerequisites

- Cloudflare account selected for the Worker.
- Production URL chosen and stored as GitHub Actions variable `CLIPDECK_PRODUCTION_URL`.
- GitHub Actions secrets set:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_API_TOKEN`
- Cloudflare API token is scoped to the target account with `Workers Scripts: Edit`.

## Release Deploy

1. Merge the Clipdeck implementation to `trunk`.
2. From `trunk`, create and push the explicit tag `clipdeck_v0.1.0`.
3. Confirm `.github/workflows/release-unit.yml` detects basename `clipdeck`.
4. Confirm `.github/workflows/clipdeck-deploy.yml` deploys the Worker.
5. Confirm the deploy workflow's unauthenticated `GET /api/items` check returns `401`.

## Runtime Secrets

After the first Worker deploy succeeds, set runtime secrets against the deployed Worker:

```bash
WRANGLER_LOG_PATH=.wrangler/logs npx wrangler secret put GITHUB_TOKEN --cwd clipdeck
WRANGLER_LOG_PATH=.wrangler/logs npx wrangler secret put SHARED_SECRET --cwd clipdeck
```

`GITHUB_TOKEN` is the fine-grained GitHub PAT from ADR-002. `SHARED_SECRET` is the private page access secret shared with the intended iPhone user.

## Smoke Check

1. Open the production URL on iPhone.
2. Enter the shared secret.
3. Confirm prompt and skill items render.
4. Tap one prompt and confirm the visible feedback says `Copied`.
5. Bookmark the page to the home screen if desired.

## Failure Handling

- If deploy verification returns anything other than `401`, inspect the `clipdeck-deploy` job logs before setting runtime secrets.
- If authenticated item fetch returns `502`, verify the Worker has `GITHUB_TOKEN`, the PAT is not expired, and the token can read `igor1309/ai-labs`.
- If the page returns to the unlock form, re-enter the shared secret; a backend `401` clears the stored local secret by design.
