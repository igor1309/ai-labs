---
title: "ADR-003: Deployment Topology"
date: 2026-05-01
status: accepted
artifact_type: adr
---

# ADR-003: Deployment Topology

## Executive Summary

clipdeck deploys as a single Cloudflare Worker using the Workers Static Assets feature, hosting both the iPhone webpage and the `GET /api/items` API on a single origin. The GitHub fine-grained PAT defined by ADR-002 is stored as a Cloudflare Workers Secret bound to this Worker. ADR-001 named the architectural roles; ADR-002 named the credential; this ADR names the platform.

## Context

ADR-001 left the deployment topology open ("a serverless function or any equivalent server-side process"). ADR-002 left the secret store generic ("the deployment platform's native secret manager"). To unblock implementation, clipdeck needs a concrete platform binding: where the backend runs, where the static frontend is served from, which secret store holds the GitHub PAT, and how the iPhone reaches both.

Relevant constraints:

- single-user, low-volume, read-mostly traffic
- HTTPS required (per ADR-002 and ADR-001's transport rules)
- a real secret manager required (per ADR-002)
- the repo's existing deployment center of gravity is Cloudflare (oracle, notio frontend)
- per-request, in-process work only (per ADR-001) — no platform cache or storage primitives for item state

Rejected alternatives:

- VPS Docker (notio-backend / nomos pattern) — always-on cost and `.env`-style secret management for a tool used a few times a week; weaker secret story than a managed secret manager
- Cloudflare Pages + separate Worker (oracle pattern) — two deploy targets and two `wrangler.toml` files for an app whose API surface is one route; warranted for oracle's scale, overkill here
- Cloudflare Pages with Functions (`functions/` directory) — same Workers runtime under the hood, but Cloudflare's recommended path for new small apps is now Workers Static Assets; adopting Pages Functions today is a future migration cost
- Supabase Edge Functions — non-Supabase use case; introduces a second deploy target for the static frontend without a compensating gain
- Vercel/Netlify — no precedent in this repo; introduces a new vendor without simplifying the credential or secret story

## Decision

clipdeck deploys as a single Cloudflare Worker that uses the Workers Static Assets feature to serve the iPhone frontend and the `GET /api/items` API on the same origin.

The GitHub fine-grained personal access token defined by ADR-002 is stored as a Cloudflare Workers Secret bound to this Worker. The Worker reads the secret at request handling time via the platform's binding mechanism.

The Worker is configured by a single Wrangler configuration file under the clipdeck project tree.

## Rules / Invariants

### Platform binding

- The deployment platform MUST be Cloudflare Workers with the Static Assets feature.
- The frontend and backend MUST be served by a single Worker on a single origin. Splitting them across separate Workers, Pages projects, or origins is a violation.
- The Worker MUST be configured by exactly one Wrangler configuration file in the clipdeck project tree.

### Secret binding

- The GitHub PAT defined by ADR-002 MUST be stored as a Cloudflare Workers Secret on the same Worker that handles `GET /api/items`.
- The Worker MUST read the GitHub PAT only via the Workers Secret binding at request handling time. Reading the token from any other source (committed env file, KV, R2, public environment variable) is a violation.
- No Cloudflare resource (KV namespace, R2 bucket, D1 database, Durable Object, Queue, or additional Worker) MAY be bound to clipdeck's Worker for the purpose of holding the GitHub PAT or item state.

### Transport

- The deployed Worker MUST be reachable over HTTPS only. HTTP traffic to the Worker hostname MUST redirect to HTTPS or be rejected.
- The shared access secret defined by ADR-001 MUST be transported only over the Worker's HTTPS origin.

### Hostname

- The Worker MUST be reachable at a stable hostname — either the Cloudflare-managed `*.workers.dev` subdomain assigned at first deploy, or a custom domain bound via a Worker route. Changing the hostname between deploys is a violation.

## Consequences

Benefits:

- single deploy target, single configuration file, single secret store
- same-origin frontend and API removes CORS and cookie-domain concerns
- HTTPS, certificate management, and global edge availability are platform defaults
- Cloudflare Workers Secrets is a textbook fit for ADR-002's "platform-native secret manager" requirement
- free tier easily covers personal single-user traffic

Tradeoffs accepted:

- the deployment is bound to Cloudflare Workers; migrating to another platform requires superseding this ADR
- the Workers execution envelope (cold starts, CPU/time limits, request-scoped memory) is the implementation ceiling; long-running work, very large responses, or persistent in-process caches are not options
- the user must maintain Cloudflare account access; loss of account access is a deploy and rotation blocker

Future extension points:

- adding a custom domain is a no-ADR config change
- moving off Cloudflare supersedes this ADR
- promoting clipdeck to multi-user use would invalidate the single-Worker, single-secret model and require new architectural decisions

## Non-Goals

- no Cloudflare Pages project (the frontend stays inside the Worker)
- no separate Worker for the API
- no Cloudflare KV, R2, D1, Durable Objects, or Queues for clipdeck
- no use of the Cloudflare Cache API for `GET /api/items`
- no CI/CD workflow definitions (covered by a future ADR-004)
- no automated secret-rotation tooling (manual rotation is governed by ADR-002)
