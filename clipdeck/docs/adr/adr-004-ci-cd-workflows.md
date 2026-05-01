---
title: "ADR-004: CI/CD Workflows"
date: 2026-05-01
model: claude-opus-4-7
description: "Per-project clipdeck-core.yml PR gate plus tag-driven production deploys via the existing release-unit.yml using a least-privilege Cloudflare API token"
status: accepted
artifact_type: adr
---

# ADR-004: CI/CD Workflows

## Executive Summary

Defines the CI and CD workflows for clipdeck. Pull-request CI runs per-project typecheck and tests via a path-filtered `clipdeck-core.yml` workflow. Production deploys are tag-driven through the repo's existing `release-unit.yml`, which dispatches to a dedicated reusable workflow `clipdeck-deploy.yml` that runs `wrangler deploy` and then verifies the deployed Worker via an unauthenticated `GET /api/items` returning `401`. Failure notifications route through the shared `notify-telegram-failure.yml`. The ADR-002 runtime GitHub PAT is set and rotated manually against Cloudflare Workers Secrets and is never visible to CI.

## Context

ADR-001, ADR-002, and ADR-003 collectively name what clipdeck runs and where. Implementation also needs a pull-request gate that catches type errors and test failures before merge, a deploy mechanism that pushes merged code to the Cloudflare Worker chosen by ADR-003, and a clean separation between the Cloudflare deploy credential (used by CI) and the runtime GitHub PAT (used by the Worker at request time).

The repo already operates a per-project CI dispatch model and a per-unit, tag-driven release pipeline (see `CLAUDE.md` "Per-Project CI Isolation" and "Release Process"). This ADR binds clipdeck to those existing models rather than inventing a new one.

Rejected alternatives:

- merging clipdeck tests into another project's CI workflow — violates the repo's per-project isolation rule
- deploying on every push to trunk — couples deploy cadence to commit cadence and bypasses the existing tag-based release model used by every other release unit in the repo
- having CI mutate Cloudflare Workers Secrets — violates ADR-002's rule that CI MUST NOT observe or write the runtime GitHub PAT
- skipping a per-project CI workflow ("clipdeck is docs-only") — valid only while clipdeck has no code; once implementation begins, tests are required

## Decision

clipdeck adopts the repo's existing two-track CI/CD model:

- **PR gate.** A dedicated `.github/workflows/clipdeck-core.yml` runs typecheck and tests for clipdeck on changes to its own paths. It is dispatched from the central `ci.yml` via path filter, consistent with every other code-bearing project.
- **Production deploy.** clipdeck is a release unit declared in `release-units.config.toml`. A `clipdeck_v<version>` tag on trunk triggers the existing `release-unit.yml` pipeline. `release-unit.yml` dispatches to a dedicated reusable workflow `.github/workflows/clipdeck-deploy.yml` (matching the `notio-frontend-deploy.yml` precedent), which runs `wrangler deploy` against the production Worker using a Cloudflare API token stored as a GitHub Actions secret. The deploy workflow MUST verify the deployed Worker before the release is marked successful.

The runtime GitHub PAT defined by ADR-002 is set on the Worker out-of-band by the user (`wrangler secret put` or the Cloudflare dashboard). CI never reads, writes, or logs it.

## Rules / Invariants

### Pull-request CI

- A workflow at `.github/workflows/clipdeck-core.yml` MUST run on a path filter that covers clipdeck source and test files. The path filter MUST include at minimum: `clipdeck/src/**`, `clipdeck/test/**` (or the equivalent test directory adopted by the implementation), `clipdeck/wrangler.*`, `clipdeck/package.json`, `clipdeck/package-lock.json`, and `clipdeck/tsconfig*.json`. Changes confined to `clipdeck/docs/**` MUST NOT trigger the workflow.
- The workflow MUST run typecheck (`npx tsc --noEmit` or equivalent) and the clipdeck test suite. It MUST NOT install dependencies for, or run tests of, any other project.
- The workflow MUST be wired into the `changes` job of `ci.yml` (via `dorny/paths-filter`) so that doc-only changes to clipdeck do not run it. `paths-ignore` MUST NOT be added to `ci.yml` (per the repo-wide rule that all path filtering is handled by the in-workflow `changes` job).

### PR-time vs release-time test scope

- At PR time, only `clipdeck-core.yml` runs for clipdeck code changes; it tests clipdeck only.
- At release time, `release-unit.yml`'s shared `core` job runs the full repo `npm test` and `npx tsc --noEmit` as a belt-and-suspenders gate before the clipdeck deploy job runs. clipdeck inherits this shared gate by default; opting out (the way `notio-backend` and `notio-frontend` do via `if:` conditions on the shared `core` job) is a violation of this ADR.

### Production deploy

- Production deploys MUST be triggered by a `clipdeck_v<version>` tag on trunk via the repo's existing `release-unit.yml` pipeline. Manual `wrangler deploy` from a developer machine MUST NOT be used to ship to the production Worker.
- The deploy step MUST be implemented as a reusable workflow at `.github/workflows/clipdeck-deploy.yml`, called from `release-unit.yml` via a `uses:` reference (the same pattern `notio-frontend-deploy.yml` follows). Adding clipdeck MUST also extend `release-unit.yml`'s `github-release.needs`, `github-release.if`, `notify.needs`, and `notify.if` to include the clipdeck deploy job.
- The deploy step MUST use a Cloudflare API token stored as a GitHub Actions secret. The token's permission set MUST be limited to `Workers Scripts: Edit` (the minimum required to publish a Worker). The token's account resources MUST be limited to the single Cloudflare account that hosts the production Worker; multi-account or all-account scoping is a violation. Broader Cloudflare credentials (account-wide admin, R2/KV admin, Zone admin, User-token equivalents, etc.) MUST NOT be granted to this token.
- The Cloudflare API deploy token MUST be rotated at least every 12 months and MUST be revoked immediately on suspected exposure (logged value, leaked transcript, departed operator, etc.). Rotation MUST replace the GitHub Actions secret in the same change window so deploys remain functional.
- The deploy step MUST NOT read, write, or log the runtime GitHub PAT defined by ADR-002.
- Deploy logs MUST NOT print Cloudflare API token values or Workers Secrets values.

### Post-deploy verification

- After `wrangler deploy` succeeds, `clipdeck-deploy.yml` MUST issue an unauthenticated `GET /api/items` (no `Authorization` header) against the deployed Worker hostname and MUST require an HTTP `401` response before the workflow exits successfully. A `401` proves the Worker is deployed, routing, and serving the API contract's auth middleware (per spec test 1). Any other status, a 5xx, a network error, or no response MUST fail the workflow.
- The verification MUST NOT use the user-facing shared access secret, the runtime GitHub PAT, or any Workers Secret value. It does not authenticate; the goal is proving the Worker is alive on the API path, not exercising the GitHub round trip.
- This verification is bootstrap-friendly: it succeeds on the first deploy before the operator has run `wrangler secret put GITHUB_TOKEN` (per ADR-002), because the auth middleware short-circuits before any GitHub call. A stronger verification (e.g., comparing a deployed-version endpoint to the expected tag, in the manner of notio-backend's `/version`) is a future amendment that requires a spec change to add the endpoint and is out of scope here.

### Failure notification

- All clipdeck workflow failure notifications MUST route through the shared `.github/workflows/notify-telegram-failure.yml` workflow. `clipdeck-deploy.yml` MUST NOT contain inline notification steps (curl-to-Telegram, Slack webhooks, etc.) — this matches the repo-wide rule in `.github/workflows/CLAUDE.md`.

### Runtime credential boundary

- The runtime GitHub PAT defined by ADR-002 MUST be set on the production Worker only via an operator-run command (`wrangler secret put` or the Cloudflare dashboard). CI workflows MUST NOT set, mutate, or read it.
- Rotating the runtime GitHub PAT MUST NOT require a CI run.

### Release manifest

- clipdeck MUST be declared as a release unit in `release-units.config.toml` with a stable basename (`clipdeck`) no later than the first PR that adds clipdeck production code. Production deploys MUST NOT run until the manifest reflects clipdeck.
- The committed `release-units.toml` manifest MUST stay consistent with `release-units.config.toml`; CI MUST gate on manifest drift, consistent with the rest of the repo.

## Consequences

Benefits:

- clipdeck inherits the repo's proven PR-gate and tag-driven deploy model with no new infrastructure
- the runtime GitHub PAT and the Cloudflare deploy token have separate lifecycles, blast radii, and access surfaces
- per-project CI isolation keeps clipdeck failures from blocking unrelated projects and vice versa
- doc-only changes skip the CI run via the path-filter dispatch

Tradeoffs accepted:

- the user must manually set and rotate the runtime GitHub PAT against Cloudflare; rotation is not automated by CI (a deliberate ADR-002 invariant, restated here)
- the Cloudflare API deploy token is a long-lived secret in GitHub Actions; rotation is now governed by this ADR (12-month cadence, immediate revocation on suspected exposure)
- adding a new clipdeck dependency or test glob requires editing both `clipdeck-core.yml` and the central `ci.yml` path filter

Future extension points:

- adding a staging Worker and a pre-production deploy step would amend or supersede this ADR's deploy rules
- migrating the Cloudflare API token from a long-lived GitHub Actions secret to OIDC federation would supersede the secret-based approach
- adding E2E browser tests against a live preview deployment is an amendment to this ADR, not to ADR-001's behavior contract

## Non-Goals

- no automated rotation of the runtime GitHub PAT (ADR-002 keeps that manual)
- no CI access to Cloudflare Workers Secrets values
- no cross-project test runs in `clipdeck-core.yml`
- no deploy to production from anywhere other than the tag-driven `release-unit.yml` pipeline
- no Cloudflare account-wide admin credentials in CI
- no environment-promotion model (no staging tier in v1)
- no inline failure notification logic in `clipdeck-deploy.yml`
- no opt-out from the shared release-time `core` test job in `release-unit.yml`
