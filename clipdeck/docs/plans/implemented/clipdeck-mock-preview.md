---
title: "Clipdeck local mock preview server"
date: 2026-05-02
model: claude-opus-4-7
description: "Add a Node-based mock preview server so frontend changes can be visually verified locally before deploy"
status: implemented
---

# Clipdeck Local Mock Preview Server

## Goal

Add a tiny Node-based preview server so a developer can render the full clipdeck UI on `localhost` — including the populated library state, hover effects, and toast — without deploying or holding a GitHub PAT. This closes the "make changes blind, ship to verify" loop that produced PR #302's redesign-by-faith.

## Motivation

Clipdeck has no `dev` script today. The only feedback channel for UI work is `wrangler deploy` to `clipdeck.enoa.ai`. The previous redesign PR shipped 290 lines of CSS without anyone seeing it rendered. A static-only server (`python3 -m http.server`) was considered but rejected: the bugs the user complained about all live in the populated library state, which only appears after a successful `/api/items` response. A static server cannot reach that state.

A full-fidelity option (`wrangler dev` against a `.dev.vars` containing `CLIPDECK_AUTH_SECRET` + `GITHUB_TOKEN`) is deferred. Faster iteration on visuals — without per-machine PAT setup — is the dominant need today.

## Execution mode

- Mode: `auto-continue`
- Human review: not gated
- Worktree: feature branch `codex/clipdeck-mock-preview` (no isolated worktree)
- Push policy: do not push; user will authorize push and PR creation when satisfied
- Final archive: move this file to `clipdeck/docs/plans/implemented/` once green

## Non-goals

- Full-fidelity local integration (real auth, real GitHub) — deferred
- iPhone-on-LAN preview — server binds to `127.0.0.1` only, not `0.0.0.0`
- Mock parity tests — drift will be caught by the developer running the preview
- README documentation of the workflow — out of scope for this PR

## Files touched

1. `clipdeck/dev/preview-server.js` — new, ~50 lines
   - Node built-in `http` + `fs`, no new dependencies
   - Serves `clipdeck/src/static/*` with explicit MIME map for `.html`, `.css`, `.js`
   - Intercepts `GET /api/items`:
     - 401 if `Authorization` header is missing or empty
     - Otherwise returns canned JSON after a 400ms delay (so the loading state is visible)
   - Listens on `127.0.0.1:8000`
   - Canned fixture covers: one Prompts section (2 items, mixed subtitle states), one Skills section with one resource-backed item (so the teal accent renders)

2. `clipdeck/package.json` — add one script
   - `"preview": "node dev/preview-server.js"`
   - No new dependencies

3. `clipdeck/docs/log.md` — one-line entry under the existing `## 2026-05-02` heading

## Test plan

- `./scripts/run_silent.sh "tests" npm test` — passes (no production code touched)
- `./scripts/run_silent.sh "build" npx tsc --noEmit` — passes
- Manual: `cd clipdeck && npm run preview`, open `http://localhost:8000`:
  - Unlock card renders with mouse-tracked gradient on hover
  - Submit empty secret → unauthenticated path returns 401, error toast surfaces
  - Submit any non-empty secret → loading state visible (~400ms), then library renders with sectioned items
  - Hovering items changes border + background
  - Resource-backed item shows teal left rail
  - Click item → "Copied" toast floats at bottom, auto-clears
  - Reload button visible at desktop viewport; toggles loading state when clicked

## Self-review checklist (run before commit)

- MIME map covers every extension actually present in `clipdeck/src/static/`
- Mock JSON shape matches the production `/api/items` response shape used by `frontend.test.ts`
- Server binds to `127.0.0.1` (not `0.0.0.0`)
- No new npm dependencies added
- Mock fixture exercises all three rendering branches: prompt item, skill item, resource-backed skill item
- `clipdeck/dev/` does not collide with any existing path
