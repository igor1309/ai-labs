---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Exploring deployment target for Agonara private instances."
version: 0.2.0
---

# Agonara Deployment Target

> **Status: promoted.** The provisional emerging direction below was accepted and
> committed by [ADR-017 — Private-Instance Deployment Operational Boundary](adr/adr-017-private-instance-deployment-operational-boundary.md),
> which also settles backup/restore minimums and admin responsibilities. This
> document is retained as the Pre-ADR exploration; ADR-017 governs.

## Context

Agonara is currently scoped as a structured learning program environment for private use by a small group or individual. The deployment shape matters early because it constrains identity setup, admin recovery, storage choices, browser access, backup/restore expectations, and how much operational burden the first implementation may assume.

Known constraints:

- The target user may run a private Agonara instance rather than use a public SaaS service.
- The app needs a human web interface and an API-first backend that can support browser, operator, and future agent clients.
- Curator and student state must be recoverable and protected by admin-owned operational controls.
- The first implementation should avoid requiring a complex platform team to operate it.

## Options considered

### Option A — Dockerized private self-hosted instance

- **Description**: Agonara runs as a containerized backend plus web UI on a VPS, home server, or similar controlled server environment.
- **Tradeoffs**: clear production target, repeatable local development shape, and strong fit for private ownership. Requires basic server operations, backup setup, and admin responsibility.
- **Product intent fit**: supports curated private programs and personal learning state without making Agonara a public multi-tenant SaaS from the start.
- **Risks**: user-managed infrastructure can fail without good backup, restore, and observability guidance.

### Option B — Managed SaaS-first deployment

- **Description**: Agonara runs as a centrally hosted multi-tenant service.
- **Tradeoffs**: lower operational burden for users and easier onboarding. Requires SaaS tenancy, billing, privacy, support, and stronger platform governance much earlier.
- **Product intent fit**: possible long term, but heavier than the current private-instance exploration.
- **Risks**: prematurely expands identity, authorization, compliance, and operational scope.

### Option C — Desktop-local application

- **Description**: Agonara runs as local desktop software with local storage.
- **Tradeoffs**: strongest local control and simple single-user privacy story. Weak fit for small private groups, network web access, and server-side LLM or ingestion workflows.
- **Product intent fit**: acceptable for a solo learner/curator, weak for group access and admin-managed recovery.
- **Risks**: later collaboration and remote access may require a second deployment model.

### Option D — Managed PaaS/serverless deployment

- **Description**: Agonara is deployed to managed application/runtime services while keeping a private-instance mental model.
- **Tradeoffs**: reduces server maintenance. Can increase provider coupling and complicate local parity, backup semantics, and private ownership.
- **Product intent fit**: viable if the managed shape still gives the admin clear control over data and recovery.
- **Risks**: platform-specific limits can leak into architecture before the product boundaries are settled.

## Emerging direction

Agonara should start with a dockerized private self-hosted deployment.

This is provisional. It becomes a commitment only after an ADR accepts the operational boundary, backup/restore expectations, and minimum admin responsibilities.

The application runtime is a private Agonara backend instance, normally running on a VPS, home server, or similar controlled server environment. The same containerized deployment may run locally for development. Agonara exposes an API-first backend so browser UIs and operator commands act as clients of backend contracts, and future Agonara agent skills can use those same contracts. A network web UI is the primary human interface. The default tenancy model is a small private group.

Agonara may use external managed storage for structured state, material storage, or supporting infrastructure if that does not erase private-instance ownership or recovery expectations.

Operational responsibility belongs to the Agonara admin of the private instance.

## Provisional boundaries

- Agonara targets network web access rather than desktop-only local access.
- The backend remains API-first so future UI and agent surfaces do not own core application behavior.
- New browser, CLI, or agent surfaces must be specified against existing or new backend contracts before they add surface-specific workflow state.
- The deployment target assumes one private instance with a small private group, not public SaaS tenancy.
- Managed storage may be used only if backup, restore, and admin ownership remain explicit.
- Admin operations, identity lifecycle, and backup/restore requirements are part of the deployment boundary.

## Rationale

Dockerized private self-hosting keeps the production target clear while allowing the same runtime shape to be used during development.

An API-first backend prevents the core application from being coupled to a single UI or agent surface.

A network web UI fits the small private group model better than desktop-local software.

External managed storage can reduce operational burden without changing the private-instance deployment model.

## Open questions

- Which container registry and image publishing path are acceptable for the first private-instance release?
- Which managed storage services, if any, are acceptable without weakening private-instance ownership?
- What is the minimum viable backup/restore requirement for an admin-run instance?
- What operational health checks must exist before the deployment direction can become an ADR?
- Does the first private instance require HTTPS and domain setup, or can that be deferred to deployment guidance?

## Implementation handoff

The first implementation plan must treat Docker as part of the private-instance substrate, not as a later packaging afterthought.

Before implementation work is pushed, Docker-producing changes require local Docker verification:

- `docker build` for the Agonara backend image;
- container start;
- health check against `/operations/health` once the operational skeleton exists;
- request/log verification for structured operational logging;
- no bind mounts that depend on temporary worktree-only paths.
