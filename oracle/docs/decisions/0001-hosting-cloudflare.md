---
date: 2026-02-21
model: gpt-5.2
description: "Decision: host Am I done on Cloudflare Pages + Workers"
---

# Decision: Host on Cloudflare Pages + Workers

## Status
Accepted (2026-02-21).

## Context
We are building a toy app (“Am I done?”) where the user submits a profession and receives a fixed, structured multi-part answer. The product needs:
- Near-zero ops deployment
- A simple API surface (`/api/outlook`)
- Cheap caching and lightweight analytics (popularity counters)
- No pre-populated professions database (only store observed mappings)

## Decision
Use Cloudflare as the primary hosting platform:
- Frontend: Cloudflare Pages (static site).
- Backend: separate Cloudflare Worker service for `/api/*` (independent deploy from the frontend).
- Storage:
  - Workers KV for normalization/answer caches.
  - D1 for popularity counters and observed synonym mappings (raw → canonical).
- Secrets: store the OpenRouter API key in Cloudflare secrets (not in repo).

## Rationale
- Simple “one provider” serverless stack with minimal operational overhead.
- Low cost for small traffic and good scaling if traffic increases.
- KV fits cache workloads; D1 provides a more suitable home for counters and mappings than encoding state into cache values.

## Cost (rough)
This is expected to be “free-tier friendly” for a toy app; the main variable cost is model usage via OpenRouter, not Cloudflare hosting.

## Consequences
- Counters and mappings live in D1; cache TTL/eviction does not affect analytics.
- API code must be Workers-compatible (runtime constraints vs. a full Node server).
- Frontend and backend can be deployed/versioned independently.
- We should add basic rate limiting and request logging early (to protect OpenRouter spend).

## Implementation status
- [x] Separate Worker service created and deployed
- [x] KV namespaces provisioned for caches
- [x] D1 database provisioned and migrated
- [x] OpenRouter API key stored as Worker secret

## Alternatives considered
- Vercel: great DX, but would require an external store for caches/counters.
- Fly/Render (single VM/container): simple mental model, but more ops and persistence decisions (Redis/Postgres) earlier than needed.
