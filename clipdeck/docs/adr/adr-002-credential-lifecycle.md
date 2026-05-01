---
title: "ADR-002: Credential Lifecycle"
date: 2026-05-01
status: accepted
artifact_type: adr
---

# ADR-002: Credential Lifecycle

## Executive Summary

Defines how the clipdeck backend obtains, stores, scopes, and rotates the GitHub credential it uses to read the ai-labs source repo. ADR-001 established that the backend is the sole runtime GitHub principal but deferred credential management. This ADR closes that gap: the credential is a single GitHub fine-grained personal access token, scoped to the ai-labs repository with read-only permissions, provisioned manually, stored exclusively in the deployment platform's secret manager, and rotated on a fixed cadence.

## Context

ADR-001 names the backend as the only runtime component that holds GitHub credentials and explicitly excludes CI workflows and developer tooling from its scope. Without a paired decision on credential lifecycle, implementation is blocked: nothing decides what kind of GitHub credential to use, where it lives at deploy time, who can issue it, and when it must be rotated.

Relevant constraints:

- single-user, personal tool — no organizational identity to bind to
- backend deploys to a serverless or equivalent platform with native secret management
- the source repo (ai-labs) is private; a GitHub App adds installation/auth ceremony with no security gain in a one-user, one-repo scenario
- ADR-001 forbids any runtime sharing of credentials between clipdeck components

Rejected alternatives:

- classic (unscoped) personal access token — grants the backend access to every repo the user has, violating least privilege
- GitHub App with installation token — overkill for a single-user, single-repo read use case
- credential checked into source — outright leak
- credential injected via CI workflow at deploy time — couples credential lifecycle to deploy cadence and exposes the credential to CI logs

## Decision

The backend authenticates to GitHub using a single GitHub fine-grained personal access token. The token is owned by the human user, scoped to the ai-labs repository, and granted only the permissions required to list and read files under the allowlisted source paths defined by ADR-001.

The token is stored exclusively in the deployment platform's native secret manager and exposed to the running backend via environment-variable injection. It is never written to source control, build artifacts, deployment logs, or any other storage.

## Rules / Invariants

### Token type and scope

- The credential MUST be a GitHub fine-grained personal access token.
- The token MUST be scoped to the ai-labs repository only. Any other repository selection is a violation.
- The token's repository permissions MUST be the minimum sufficient to list and read the ADR-001 allowlisted source paths: `Contents: Read` and `Metadata: Read`. No write, admin, or organization permissions.
- The token MUST NOT carry user-level permissions (no `read:user`, `user:email`, or equivalent).

### Storage

- The token MUST be stored only in the deployment platform's native secret manager (for example, Cloudflare Workers Secrets, Fly.io Secrets, AWS Secrets Manager, or equivalent).
- The token MUST NOT be committed to any source-controlled file, even encrypted.
- The token MUST NOT appear in any deployment artifact, build log, container image, or platform log.
- The token MUST NOT be readable by any clipdeck component other than the request-handling backend at runtime.

### Issuance and ownership

- The token MUST be issued manually by the user from their GitHub account.
- The owner of record is the human user; clipdeck does not use a service account.
- Each issuance MUST set an explicit expiry of at most 90 days.

### Rotation

- The token MUST be rotated on or before its expiry. The new token MUST be in place before the old one is revoked.
- The old token MUST be revoked from GitHub within 24 hours of the new token taking effect.
- A token believed to be exposed (committed, logged, shared, observed in any non-runtime location) MUST be revoked immediately.

### CI and deploy boundary

- CI and deploy workflows MUST NOT read, log, or otherwise observe the runtime GitHub token. Deploy is concerned only with deploy-platform credentials and code publication.
- Setting or rotating the runtime token MUST be performed manually against the deployment platform's secret manager, not via a committed config file or a CI step.

## Consequences

Benefits:

- least-privilege access: the token cannot read anything outside ai-labs, cannot write, cannot administer
- no credential exposure in source control, CI logs, or deploy artifacts
- the 90-day expiry bounds the blast radius of an unnoticed leak
- credential lifecycle is decoupled from code deploys

Tradeoffs accepted:

- manual issuance and rotation; no automation in v1
- the human user is the single point of failure for token availability — an expired or revoked token degrades the backend until the user replaces it
- the 90-day expiry produces a predictable, recurring maintenance touch point
- the tool inherits the security posture of the deployment platform's secret manager

Future extension points:

- migrating to a GitHub App (for multi-user use, or to enable scoped automation) would supersede this ADR
- automating rotation via a scheduled job would require explicitly granting an automation principal a narrow permission to mutate the runtime secret — a change worth its own ADR

## Non-Goals

- no automated token rotation
- no service-account ownership
- no shared credential vault outside the deployment platform's native secret manager
- no GitHub App or installation auth
- no token use by any clipdeck component other than the runtime backend
- no in-source storage of the credential, encrypted or otherwise
- no CI/deploy access to the runtime token
