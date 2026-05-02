---
date: 2026-05-02
model: gpt-5
description: "First deploy runbook for Clipdeck with Cloudflare Access authentication"
---

# Clipdeck First Deploy

## Scope

This runbook covers the first production deployment of Clipdeck after moving user-facing authentication to Cloudflare Access. Clipdeck remains a single Cloudflare Worker that serves static assets and `/api/items`; the Worker still uses `GITHUB_TOKEN` to read the private source repository.

## Cloudflare Access Setup

Configure a Cloudflare Access self-hosted application before releasing the Worker:

- Application domain: `clipdeck.enoa.ai`
- Path coverage: the full hostname, including `/` and `/api/items`
- Policy: allow only the owner's primary Cloudflare Access identity
- Default behavior: deny every other identity
- Login method: email one-time PIN unless an existing Cloudflare-supported provider authenticates the same owner identity without broadening access

Do not commit the concrete owner email address or identity selector. Store that value only in Cloudflare configuration or non-source-controlled operator notes.

## Worker Secrets

Set the runtime GitHub token as a Worker secret:

```bash
npx wrangler secret put GITHUB_TOKEN --cwd clipdeck
```

`GITHUB_TOKEN` must be a read-only GitHub fine-grained token for the source repository. The browser must never receive this token.

`SHARED_SECRET` is not part of the normal runtime setup after Cloudflare Access is active. During migration, it may remain only for a short rollback window. If retained, record the rollback window outside source control and remove the secret after the new Worker and Access checks pass.

## Release

Ship production through the tag-driven release pipeline only:

1. Merge the Clipdeck release PR into `trunk` with a merge commit.
2. Create and push the explicit `clipdeck_v<version>` tag from updated `trunk`.
3. Watch the release-unit workflow until `deploy-clipdeck` succeeds.

Do not manually deploy production with `wrangler deploy` from a developer machine.

## Smoke Checks

Run unauthenticated checks from a clean client context with no Access session:

- `GET https://clipdeck.enoa.ai/` returns a Cloudflare Access challenge or denial, not the Clipdeck static page.
- `GET https://clipdeck.enoa.ai/api/items` returns a Cloudflare Access challenge or denial, not item data and not `{"error":"unauthorized"}`.

Run authenticated owner checks in a browser session admitted by Cloudflare Access:

- `https://clipdeck.enoa.ai/` loads the Clipdeck app without a Clipdeck unlock form.
- `/api/items` returns `200` without a Clipdeck `Authorization` header.
- Prompt and skill items render, copy feedback works, and front matter remains stripped.

## Secret Cleanup

After production Access protection and authenticated owner checks pass, remove the production `SHARED_SECRET` Worker secret unless a documented rollback window is still active. Do not remove `GITHUB_TOKEN`.

After cleanup, repeat the smoke checks:

- unauthenticated `/` and `/api/items` remain Access-blocked
- authenticated owner `/api/items` still returns `200`

## Rollback

If the release must be rolled back during the temporary migration window, revert through the release process and keep Cloudflare Access enabled. Do not broaden the Access policy. If `SHARED_SECRET` was retained for rollback, delete it when the rollback window closes.
