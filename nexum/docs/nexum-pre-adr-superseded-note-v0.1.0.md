---
title: "ADR: Supersede Nexum Pre-ADR Spec"
date: 2026-04-05
model: GPT-5.4 Thinking
version: 0.1.0
status: accepted
type: adr
supersedes:
  - nexum-pre-adr-spec-v0.0.1.md
references:
  - nexum-frontend-adr-v0_1_0.md
  - nexum-backend-adr-v0_1_0.md
  - nexum-openapi-v1.yml
---

# ADR: Supersede Nexum Pre-ADR Spec

## Status

Accepted.

## Context

`nexum-pre-adr-spec-v0.0.1.md` was useful as an initial framing document.

Later, the frontend ADR, backend ADR, and OpenAPI contract developed the system in more detail and now define the architecture and contract more precisely.

As a result, the pre-ADR now mixes:

- still-valid product intent
- earlier architectural assumptions
- implementation details that have been replaced or contradicted by the accepted ADRs and the locked API contract

Keeping the pre-ADR in its current form as an architectural reference would create ambiguity.

## Decision

The pre-ADR is superseded as an architectural source of truth.

For implementation and future architectural decisions, the normative sources are:

1. `nexum-frontend-adr-v0_1_0.md`
2. `nexum-backend-adr-v0_1_0.md`
3. `nexum-openapi-v1.yml`

The pre-ADR may still be retained as historical context for early intent, but it must not be used as the current architectural baseline.

## What remains valid from the pre-ADR

The following intent-level points remain valid and may continue to be referenced:

- Nexum is a private single-user repo memory system
- one repo equals one canonical entry
- duplicate repo entries are rejected
- the app database is authoritative for personal fields
- GitHub is authoritative for repo metadata
- note is a single multiline freeform field in v1
- there is no separate detail page in v1
- repo name opens the repository itself
- search and sorting are part of the primary retrieval model
- frontend and backend are separate runtimes

These points are preserved by the later ADRs and contract.

## What is superseded or replaced

### 1. Refresh model in the pre-ADR

The pre-ADR defines refresh triggers such as:

- repo add
- manual refresh
- page open

and also defines page-open refresh behavior in the UI.

This is superseded.

The current contract exposes exactly three operations:

- `POST /repos`
- `GET /repos`
- `PATCH /repos/{id}/note`

`GET /repos` is a pure read with no side effects.

There is no refresh endpoint and no separate refresh operation in the locked contract.

### 2. Partial refresh / stale-on-error snapshot semantics

The pre-ADR includes assumptions such as:

- partial refresh success per repo
- stale metadata preservation on refresh failure
- per-repo refresh status/result carried in snapshot
- optional refresh timestamp/result metadata in the snapshot model

These are superseded.

They are not present in the accepted API contract or in the accepted frontend/backend ADR surface.

### 3. Add-flow assumptions about pre-save metadata fetch in the UI

The pre-ADR describes a UI flow in which metadata is fetched automatically after URL paste and the add form opens around that result before explicit save.

This is not part of the locked external contract.

The accepted contract defines add as a single `POST /repos` operation with `repoUrl` and `note` as request input.

If such UX is later desired, it must be introduced explicitly as a new frontend decision and, if needed, a new contract decision.

### 4. Snapshot shape assumptions

The pre-ADR states that the snapshot is stored as a fully denormalized flat array in a single JSON blob with `schemaVersion`.

This must not be treated as the client-facing contract.

The locked API contract defines the response shape exposed to the frontend. Internal persistence details remain backend-internal unless explicitly surfaced by the contract.

### 5. Auth-provider specificity

The pre-ADR names Supabase Auth directly.

The accepted frontend ADR intentionally keeps the frontend contract at Bearer-token level and does not bind frontend architecture to a specific auth provider.

Provider-specific detail is therefore no longer normative at the cross-system contract level.

## Authority split after this decision

### Product intent / historical framing

May remain in the old pre-ADR, but only as background context.

### Current frontend architecture

Owned by `nexum-frontend-adr-v0_1_0.md`.

### Current backend architecture

Owned by `nexum-backend-adr-v0_1_0.md`.

### System contract

Owned by `nexum-openapi-v1.yml`.

If any historical statement in the pre-ADR conflicts with these sources, the later ADRs and OpenAPI win.

## Consequences

- The pre-ADR should no longer be cited as the architectural baseline.
- Future work should reference the frontend ADR, backend ADR, and OpenAPI directly.
- Any still-useful product framing from the pre-ADR should be moved into a smaller non-normative product/context document if desired.
- Any future reintroduction of refresh behavior, richer snapshot status, or provider-specific assumptions must be captured as new ADR or contract changes, not inferred from the superseded pre-ADR.

## Follow-up note

One backend point still appears underspecified and should be resolved separately: the `EditNote` flow describes fetching metadata for the target entry, while the published `RepoStore` surface shown in the backend ADR does not expose an explicit read-by-id operation. That should be clarified in a later ADR revision or implementation note.
