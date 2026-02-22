---
date: 2026-02-21
model: gpt-5.2
description: "Decision: frontend v1 stack, API routing model, and locale policy"
---

# Decision: Web Frontend v1 Foundations

## Status
Accepted (2026-02-21).

## Context
The backend Worker is already implemented and the web UI is the next layer. We need to lock minimal frontend choices now to avoid early churn and cross-origin integration risk.

## Decisions
### UI stack (v1)
Use vanilla JavaScript for the initial web app flow.

Reasoning:
- The v1 flow is a single submit action and a small state machine (`idle`, `submitting`, `received`, `failed`).
- This keeps initial implementation and testing lightweight while preserving a clean reducer/effects split.

### API routing model (v1+)
Use same-origin API routing for `POST /api/outlook`.

Reasoning:
- Avoid browser CORS complexity for the primary path.
- Keep frontend calls simple (`/api/outlook`) while backend remains an independently deployed Worker service.
- Use Cloudflare Pages Functions proxying for `/api/*` to the Worker base URL configured by `API_BASE_URL`.

### Locale policy
v1:
- Always send `locale: "en-US"`.

v2:
- Auto-detect locale from browser/runtime environment.
- Fallback to `en-US` when detection is missing or unsupported.

## Consequences
- Frontend implementation can start without framework selection overhead.
- Deployment/config must ensure same-origin routing from web host to Worker API for `/api/outlook`.
- Pages deployment must set `API_BASE_URL` (for example via `wrangler pages secret put` or dashboard vars) for the `/api/*` proxy.
- Locale handling remains deterministic in v1 and can expand safely in v2.
