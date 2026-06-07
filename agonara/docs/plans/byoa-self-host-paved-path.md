---
date: 2026-06-07
model: claude-opus-4-8
description: "Implementation plan: turn Agonara's author-only agonara-vps deployment into a host-agnostic, operator-facing, non-author-verified self-host paved path so the BYOA 'point your agent at your instance' claim is backed by a real route to having an instance."
---

# BYOA Self-Host Paved Path

## Problem

Agonara is positioned as **bring-your-own-agent (BYOA)**: an operator points the
agent they already use at *their* Agonara instance. The committed deployment
model — [ADR-017](../adr/adr-017-private-instance-deployment-operational-boundary.md) —
is an operator-self-hosted private instance, and operational ownership
(provisioning, secrets, reverse proxy, TLS, backup, restore) belongs to that
instance's admin.

The gap: the *only* deployment path that exists is the author's CI-driven
release to `agonara-vps`. `scripts/deploy-prod.sh` is invoked by
`release-unit.yml` over SSH, defaults its deploy root to `/opt/agonara`, and
assumes the author's host, env files, and secrets; `compose.prod.yml`,
`backup-prod.sh`, and `restore-prod.sh` are the same shape. None of this is a route a non-author operator can follow to
stand up *their own* instance. The reverse-proxy + TLS step ADR-017 requires is
host-managed and undocumented for a third party, and no backup/restore drill has
been rehearsed by anyone but the author.

So BYOA presents the agent-connection step as the front door while the committed
front door — self-hosting an HTTPS-reachable private instance — has no paved,
documented, non-author-reproducible path. The claim is hollow until *getting an
instance* is something a stranger can do from published guidance.

This plan closes that gap. It does **not** change ADR-017's boundary and it does
**not** build a hosted/multi-tenant offering (that on-ramp is sketched
separately in [`../demo-instance-exception.md`](../demo-instance-exception.md)).

## Execution declarations

```
Execution mode: human-review-gated
Human review between tasks: yes
Worktree mode: none
Expected worktree: repository root (no separate worktree)
Expected branch: claude/byoa-self-host-paved-path-* (a dedicated branch off trunk)
Push policy: push at closeout
Preflight check: [ ] not yet run — author-time plan, no execution preflight evidence exists
Stop conditions: failed gates, unclear scope, missing a fresh non-author host for verification, any change that would alter ADR-017's committed operational boundary, destructive operations on a live instance, explicit user interruption
```

Human review is gated because the paved path is operator-facing deployment
guidance whose acceptance depends on a real, non-author run on real
infrastructure (Phase 5). The executor MUST stop rather than guess when a fresh
verification host, its DNS/TLS ownership, or operator secrets are unavailable.

## Scope guardrails

Out of scope:

- Changing ADR-017's committed boundary (dockerized private instance, loopback +
  TLS reverse proxy, build delivery, backup/restore minimums, admin ownership).
- A hosted, managed, or multi-tenant offering — ADR-017 rejects SaaS-first; the
  demo on-ramp is a separate, ADR-gated decision.
- Changes to the author's `agonara-vps` CI release machinery
  (`release-unit.yml`, the `agonara-vps`-specific deploy/rollback path).
- New application behavior, routes, schemas, or skills.

In scope: documentation, host-agnostic operator scripts/compose where needed to
remove `agonara-vps` assumptions, landing/positioning links, and a non-author
verification record.

## Reference choices (operator guidance, not new architecture)

ADR-017's non-goals leave the reverse-proxy product, TLS mechanism, hostnames,
and backup tooling open. The runbook MUST pick **concrete reference choices** so
an operator has a path that works, while stating they are recommended defaults,
not narrowings of ADR-017:

- Reverse proxy + TLS: Caddy with automatic HTTPS (matches the author's existing
  `agonara-vps` proxy; lowest-friction auto-cert path for a single operator).
- Image delivery: operator builds locally via `compose.yaml` on their host
  (build-on-host, consistent with ADR-017's build-on-VPS posture) — no registry
  dependency.
- Backup: a scheduled copy of the `/data` SQLite volume to off-host storage,
  cadence and provider left to the operator above the at-least-daily minimum.

## Phases

### Phase 1 — Gap audit and operator-path shape

- Confirm exactly which existing artifacts are `agonara-vps`/CI-specific
  (`deploy-prod.sh`, `compose.prod.yml`, `backup-prod.sh`, `restore-prod.sh`,
  `release-unit.yml` coupling) and which are already host-agnostic
  (`compose.yaml`, `Dockerfile`, `src/cli.js` bootstrap, `/operations/health`).
- Decide the operator path shape: a compose-based self-host that does **not**
  require the CI/SSH release machinery, parameterized only by host-side env and
  a reverse-proxy config the operator owns.
- **DoD:** a short decision note in this plan's eventual closeout listing what an
  operator reuses as-is vs. what new operator-facing artifacts Phases 2–3 add.

### Phase 2 — Host-agnostic self-host runbook (zero to instance)

- Author `docs/self-hosting.md`: prerequisites (a Docker-capable host, a domain),
  obtain source/build the image, supply `AGONARA_BOOTSTRAP_SECRET` and provider
  keys as host-side runtime config, run the loopback container, stand up the
  Caddy reverse proxy with automatic HTTPS in front, bootstrap the first Admin
  via `cli.js identity bootstrap-admin`, and verify `/operations/health` over
  HTTPS.
- End with the BYOA close: load a role skill and point the agent at the
  operator's HTTPS instance URL.
- Extend and cross-link the existing `docs/demos.md` Docker Demo rather than
  duplicate it: demos.md covers the local loopback path; this runbook adds the
  reverse-proxy + TLS + own-domain production shape on top.
- **DoD:** the runbook is followable end to end without reading `agonara-vps` CI
  scripts; every command is host-agnostic; secrets stay host-side per ADR-017.

### Phase 3 — Operator backup + rehearsed restore drill (ADR-017 G3)

- Author `docs/backup-restore-runbook.md`: an automated `/data` backup to
  off-host storage and a step-by-step restore drill an operator can rehearse,
  honoring ADR-017's exclusion rules (ADR-008 credentials, ADR-015 raw
  evaluator artifacts).
- Provide host-agnostic backup/restore commands (generalize from the
  `*-prod.sh` scripts; remove `agonara-vps` path assumptions).
- **DoD:** an operator can configure automated backup and complete a restore
  drill from the runbook alone, with no `agonara-vps`-specific paths.

### Phase 4 — Back the BYOA claim in positioning

- Update `index.html` "Operate a private instance" and the BYOA section to link
  the self-host runbook so the "point your agent at your instance" claim resolves
  to a real "get your own instance" route (today the steps show only
  `127.0.0.1:18080`).
- Align `docs/positioning.md` "Private Instance Operation" with the paved path.
- Keep the README Components row and architecture deployment section consistent.
- **DoD:** no BYOA "your instance" copy without a reachable path to *having* one;
  no stale claims (cf. the `index.html` "provisional" fix already landed).

### Phase 5 — Non-author verification (the acceptance gate)

- A person who is **not** the author follows `docs/self-hosting.md` from a fresh
  Docker host to an HTTPS-reachable instance, bootstraps Admin, runs the backup +
  restore drill from Phase 3, and points an agent at it via a role skill.
- Record evidence in `docs/reviews/byoa-self-host-paved-path-verification.md`
  (host shape redacted per deployment-discipline: no real addresses, domains, or
  secrets).
- **DoD:** the verification record exists and shows a non-author reaching a
  working instance + agent connection + completed restore drill from published
  docs alone.

## Definition of done (claim-level)

The BYOA self-host claim is backed when:

1. A non-author operator, starting from a fresh Docker host and the published
   runbook, stands up an HTTPS-reachable Agonara instance.
2. They bootstrap the first Admin and verify health over HTTPS.
3. They configure automated `/data` backup and complete a rehearsed restore
   drill (ADR-017 G3) from the runbook alone.
4. They point their own agent at the instance via a role skill and perform one
   role action through the API contract.
5. All of the above is reproducible from published docs without reading the
   `agonara-vps` CI release machinery, and is recorded in the Phase 5 evidence.

## Traceability

- Boundary and operator obligations: [ADR-017](../adr/adr-017-private-instance-deployment-operational-boundary.md)
  (loopback + TLS reverse proxy, build-on-host delivery, backup/restore minimums,
  admin operational ownership).
- Operating model the path must back: [Product Intent — BYOA operating model](../intent/intent_learning_program_app.md),
  [`../positioning.md`](../positioning.md).
- Existing author-only artifacts the path generalizes: `scripts/deploy-prod.sh`,
  `compose.prod.yml`, `scripts/backup-prod.sh`, `scripts/restore-prod.sh`,
  reused host-agnostic primitives `compose.yaml`, `Dockerfile`, `src/cli.js`.
- On-ramp alternative considered separately: [`../demo-instance-exception.md`](../demo-instance-exception.md).
