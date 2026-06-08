---
date: 2026-06-06
description: "Evaluation note — is Dokku a better tool for the repo's dockerized deployments than the current tag-driven GitHub Actions + Docker Compose + Caddy pipeline? Comparison and recommendation."
---

# Dokku vs. the Current Deployment Model

## Question

Is Dokku (a self-hosted, Heroku-style PaaS) a better tool for this
repo's dockerized deployments than what we use today?

## Short answer

No — for this repo, Dokku would not be a clear improvement and is
arguably a worse fit. It solves problems we have mostly already solved,
applies to only a small slice of what actually gets deployed here, and
conflicts with the deliberate tag-driven release model. This is an
evaluation, not a binding decision; if we ever want to make "no Dokku" a
standing commitment, that would be a separate ADR.

## What's deployed today

The repo deploys across three independent tiers:

- **VPS + Docker Compose** — `nomos` (prod + staging), `notio-backend`.
  Tag → GitHub Actions → SSH/SCP → VPS builds the image locally →
  `docker compose up -d --build` → health-check verify. Caddy provides
  reverse-proxy + auto-TLS for `nomos.enoa.ai` (:8080) and
  `staging.nomos.enoa.ai` (:8081); `notio-backend` is reached via a
  Cloudflare Tunnel (`inbox.enoa.ai`, no public ingress port).
- **Cloudflare edge** — `clipdeck` (Workers), `notio-frontend` /
  `oracle` (Pages), deployed via `wrangler`.
- **Supabase** — `claude-insights`, deployed via `supabase functions
  deploy`.

Releases are tag-driven semver per-unit (`<basename>_v<version>`), with
automatic staging→prod promotion gated on a real LLM smoke test and
post-deploy runtime version verification (see `docs/adr/release/ADR-000`,
`notio/docs/adr/adr-005`, `nomos/scripts/deploy-prod.sh`). `nomos`
snapshots the running image as `nomos-nomos:rollback` before each
rebuild.

The crucial point: only two or three services touch the VPS at all. The
Cloudflare and Supabase tiers are the majority of deployable units.

## What Dokku is, and where it would fit

Dokku is a single-VPS PaaS: `git push` → buildpack/Dockerfile build →
run, with bundled nginx vhosts, a Let's Encrypt plugin, `config:set`
env management, zero-downtime `checks`, and datastore plugins. It could
only ever replace the **VPS Docker tier** (`nomos`, `notio-backend`). It
is irrelevant to the Cloudflare and Supabase tiers.

### What Dokku would give us there

- A standardized app lifecycle instead of bespoke `deploy-*.sh` bash.
- Built-in Let's Encrypt and zero-downtime deploys with health gating.
- `dokku config:set` instead of hand-managed `.env` files on the box.

### Why those wins are mostly already covered — or counterproductive

1. **TLS + reverse proxy is already solved.** Caddy does multi-domain
   auto-TLS today. Dokku defaults to nginx; running Caddy under Dokku is
   a non-standard plugin path — a lateral move at best.
2. **Zero-downtime + rollback already exist.** The pipeline does
   post-deploy health/version verification and keeps a `:rollback`
   image snapshot. Dokku's `checks` and rollback are not additive here.
3. **It fights the release model.** The repo's releases are per-unit,
   trunk-only, tag-driven semver with runtime version verification.
   Dokku's `git push`-to-deploy model is push-based; adopting it means
   either bolting tags onto a push tool (friction) or abandoning a
   deliberately chosen, documented model.
4. **Compose is a second-class citizen in Dokku.** `nomos` uses two
   Compose stacks with named SQLite volumes; Dokku is app-centric (one
   app ≈ one image), with multi-container Compose as a bolt-on plugin.
5. **The Tunnel blunts Dokku's value.** `notio-backend` has no public
   ingress port; Dokku's nginx vhost + TLS termination — its headline
   feature — is largely moot behind a Cloudflare Tunnel.
6. **It adds a stateful daemon to maintain.** That contradicts the
   low-operational-overhead goal in `nomos/docs/adr-0001`. The current
   stack ("plain Docker + Caddy + CI") is about as low-maintenance as
   self-hosting gets.
7. **Monorepo friction.** Dokku apps built from subdirectories need
   extra configuration; the existing per-unit, path-filtered CI already
   handles subdirectory builds cleanly.

## Where Dokku would genuinely win

To be fair: for a greenfield "I have one VPS and want Heroku-style
push-to-deploy for several small apps" scenario, Dokku is excellent and
would beat hand-rolled scripts. It also shines with self-service env
management, many similar apps on one box, or built-in managed
Postgres/Redis without thinking about it. None of those describe this
repo — here the VPS hosts a couple of carefully-managed services, most
workloads are serverless, and the release model is intentionally
tag-driven.

## Recommendation

Keep the current `Compose + Caddy + tag-driven CI` setup. If we want
incremental gains, target them within the existing model — for example,
consolidate the per-service `deploy-*.sh` scripts into a shared, tested
deploy helper — rather than adopting a PaaS layer.
