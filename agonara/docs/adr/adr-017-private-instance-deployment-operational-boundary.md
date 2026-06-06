---
date: 2026-06-06
model: claude
description: "Decision committing Agonara's private-instance deployment operational boundary, backup/restore minimums, and admin responsibilities."
status: accepted
---

# ADR-017 - Private-Instance Deployment Operational Boundary

## Executive Summary

Agonara commits to a dockerized private-instance deployment on a dedicated host (agonara-vps), running staging and production as separate loopback-bound containers behind a TLS-terminating reverse proxy.

Images are built on the host (build-on-VPS), tagged locally with both the release version and the git sha, and rolled back from a retained prior image.

Operational ownership — provisioning, secrets, reverse proxy, backup, and restore — belongs to the Agonara admin of the private instance.

A documented, automated backup of the `/data` SQLite volume and a rehearsed restore drill MUST exist before production is declared real.

This ADR decides the operational boundary, backup/restore minimums, and admin responsibilities. It does not choose hostnames, DNS ownership, registry tooling, or CI/script mechanics.

## Context

[`deployment-target.md`](../deployment-target.md) explored the deployment shape and reached an emerging direction — a dockerized private self-hosted instance — but explicitly remained provisional: it "becomes a commitment only after an ADR accepts the operational boundary, backup/restore expectations, and minimum admin responsibilities." No ADR had accepted it, so the deployment shape could not ground a real production release. [`deployment-handoff.md`](../deployment-handoff.md) records this as gate **G1** (deployment ADR) and gate **G3** (backup/restore of the `/data` SQLite volume) and marks the first-release runbook non-executable until they close. This ADR closes G1 and G3.

The owner confirmed the load-bearing decisions during deployment-handoff intake: a single dedicated VPS (agonara-vps) running both staging and production tiers; build-on-VPS image delivery (the established nomos/notio pattern); HTTPS and domain in scope for v1, not deferred; and operational ownership held by the private-instance admin. The closest working analog in this repo is **nomos** (Node, Docker, VPS, staging→prod), and Agonara models its deploy path on nomos: build-on-VPS, the prior-image rollback snapshot, and the staging/prod compose split are already implemented in `nomos/scripts/deploy-staging.sh`, `nomos/scripts/deploy-prod.sh`, `nomos/scripts/rollback-prod.sh`, and `nomos/docker-compose.staging.yml`, demonstrating the mechanism is achievable on this stack. Agonara's container already binds loopback only (`agonara/compose.yaml` → `127.0.0.1:18080:8080`) and ships a `/operations/health` `HEALTHCHECK` (`agonara/Dockerfile`), so the loopback + health-gated deploy posture this ADR commits is concretely supported today.

Constraints that shaped the decision:

- Agonara is a private-instance product for a small group or individual, not public multi-tenant SaaS.
- The backend is API-first with a network web UI; curator and student state must be recoverable under admin-owned operational controls.
- The first implementation must not require a platform team to operate.
- Agonara's container binds loopback only (`compose.yaml` binds `127.0.0.1`), so external access requires a reverse proxy terminating TLS in front of each tier.
- The image is small (node:22-slim + one runtime dependency), so on-host build cost is negligible.

Rejected alternatives (explored in `deployment-target.md`): managed SaaS-first (prematurely expands identity, billing, compliance, and tenancy scope), desktop-local (weak fit for a small group, network web access, and admin-managed recovery), and managed PaaS/serverless (increases provider coupling and complicates backup semantics and private ownership). A registry-based image-delivery path was also rejected for v1 because no concrete trigger (multiple hosts, build contention, signed provenance) exists yet; it remains a future extension point.

## Decision

Agonara MUST deploy as a dockerized private instance on a dedicated host, agonara-vps.

The host MUST run a staging tier and a production tier as separate containers with distinct names, distinct host loopback ports, and distinct named data volumes. Neither tier MUST bind a non-loopback interface directly; external web and API access MUST reach each tier through a reverse proxy that terminates TLS.

HTTPS with a real domain is in scope for the first production release. Each tier MUST be served over HTTPS through the reverse proxy before that tier is treated as externally reachable.

Images MUST be built on agonara-vps from delivered source (build-on-VPS). The deploy step MUST tag each freshly built image locally with both the release `<version>` and the building `<git-sha>`, and MUST retain the prior production image so production can roll back to it without a rebuild.

Operational responsibility for provisioning, secret storage, reverse proxy, TLS, DNS, backup, and restore belongs to the Agonara admin of the private instance. Operational secrets (`AGONARA_BOOTSTRAP_SECRET`, provider keys) MUST be supplied to the host as runtime configuration and MUST NOT be committed to the repository.

An automated backup of the production `/data` SQLite volume MUST run at least daily and store copies off the agonara-vps host. A restore procedure MUST be documented and rehearsed (a restore drill) before production is declared real. Backups MUST preserve everything required to restore identity, program, corpus, and student-workspace state, and MUST follow the same secret- and raw-artifact-exclusion rules the application enforces (ADR-008 credential boundary, ADR-015 raw evaluator artifact exclusion).

## Rules / Invariants

- Agonara MUST deploy as a container on agonara-vps; production MUST NOT run from an un-pinned or worktree-only build.
- Staging and production MUST be separate containers with distinct container names, distinct host loopback ports, and distinct named data volumes (e.g. `agonara-staging-data`, `agonara-data`).
- Containers MUST bind loopback only; only the reverse proxy MUST be exposed to the network.
- Each externally reachable tier MUST be served over HTTPS via the reverse proxy.
- The deploy step MUST build the image on agonara-vps and MUST tag it locally as both `agonara:<version>` and `agonara:<git-sha>`.
- The production deploy MUST retain the prior image (e.g. tagged `agonara:rollback`) and MUST be able to restore it without rebuilding.
- The deploy step MUST gate promotion on a health check that confirms the live version (see [Operations Health Version](../specs/operations-health-version.md)) before declaring a tier deployed.
- `AGONARA_BOOTSTRAP_SECRET` and provider credentials MUST be host-side runtime configuration and MUST NOT appear in the repository, image layers, logs, or backups.
- Production `/data` MUST be backed up automatically at least daily, with copies stored off the agonara-vps host.
- A documented restore drill MUST pass before production is declared real, and the restore procedure MUST be re-validated whenever the backup mechanism changes.
- Backups MUST exclude provider credentials, session/CSRF material, and raw evaluator artifacts per ADR-008 and ADR-015.

## Consequences

The first-release runbook's G1 and G3 gates are satisfied: the deployment shape is now a commitment, and backup/restore minimums are defined, so a production release can be declared real once the remaining wiring lands.

Build-on-VPS keeps the private-instance ownership story clean (nothing leaves agonara-vps) and makes rollback local and simple, at the cost of coupling build and run on one box and of applying the `<version>`/`<git-sha>` image-tag invariant locally in the deploy script rather than in a registry push.

Running both tiers on one host keeps operations small but means staging and production share the host's failure domain; the separate volumes, ports, and reverse-proxy hostnames keep their data and traffic isolated.

A reverse proxy with TLS becomes part of the first deployment rather than a later add-on, adding one-time host provisioning (proxy, certificate, DNS) to the admin's responsibilities.

Backup and restore become explicit, recurring admin obligations. This reduces the risk of unrecoverable data loss on an admin-run instance, at the cost of requiring backup storage off the host and a periodic restore rehearsal.

Future extension points (explicitly not adopted now): moving to a container registry (GHCR) when more than one host needs the image, build contention appears, or signed/immutable provenance is required; and splitting staging and production onto separate hosts if their shared failure domain becomes a problem.

This ADR supersedes the provisional emerging direction in `deployment-target.md`; that document is retained as the Pre-ADR exploration and now points here.

## Non-Goals

This ADR does not decide:

- concrete hostnames, the DNS zone owner, or whether TLS uses auto-issued (e.g. Caddy) or managed certificates;
- the reverse-proxy product (Caddy, nginx, or other);
- container registry choice or image-publishing tooling (build-on-VPS is committed for v1; a registry is a future extension);
- exact host ports, the deploy directory layout, or compose file decomposition;
- backup tooling, exact cadence beyond the at-least-daily minimum, retention duration, or off-host storage provider;
- CI workflow structure, deploy/rollback script language, or `scp`/SSH mechanics;
- the evaluator worker runtime topology or the real LLM provider path (decided by the ADR-015 amendment, ADR-018);
- the bootstrap-secret generation and rotation procedure (an open operational question);
- application behavior, routes, schemas, or the version-surfacing mechanism (specified separately).
