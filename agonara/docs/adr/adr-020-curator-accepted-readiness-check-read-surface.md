---
date: 2026-06-22
model: claude
description: "Amends ADR-011 to decide a curator-only read surface over accepted readiness checks that enumerates accepted entities and current revisions, so a Program Curator can target an accepted entity for in-place re-acceptance without rewriting history."
status: accepted
---

# ADR-020 - Curator Accepted Readiness-Check Read Surface

## Executive Summary

This ADR amends [ADR-011](adr-011-accepted-checks-and-student-assessment-boundary.md) to add a curator-only read surface over accepted readiness checks.

ADR-011 sanctions re-accepting a corrected check onto an existing accepted entity (a later revision that does not rewrite prior attempts), but decided only the ownership boundary and no curator enumeration read surface. A Program Curator therefore has no route to discover the stable accepted entity identifier that in-place re-acceptance of an already-accepted readiness check requires.

Corpus Storage MUST expose a curator-authorized read surface that enumerates a Program's accepted readiness checks and identifies, per item, the stable accepted entity identifier and current accepted revision identifier.

That curator read surface MAY include curator-only metadata; it MUST require effective Program Curator (or Admin) authority and MUST NOT be reachable through Student participation alone.

This ADR does not decide HTTP route names, payloads, pagination, or curator UI. It does not change the student delivery projection, the attempt/result lifecycle, or progression interpretation.

## Context

[ADR-011](adr-011-accepted-checks-and-student-assessment-boundary.md) assigns accepted checks, revisions, and assessment criteria to Corpus Storage as versioned Program corpus, and establishes that updating an accepted check MUST NOT rewrite prior student attempts or feedback — that is, a weak accepted check is corrected by re-accepting onto the existing accepted entity, producing a new current revision while history stays intact. The [Topic and Period Readiness Checks](../specs/topic-period-readiness-checks.md) spec operationalizes that boundary for readiness checks on top of ADR-010, ADR-011, and ADR-016.

The decisive gap: neither ADR-011 nor the readiness spec gave a curator any enumeration read surface for accepted readiness checks. The implementation exposes a protected curation detail keyed by revision identifier, but a curator has no route to obtain that revision identifier after acceptance. The candidate listing exposes only candidate identifiers, never the accepted entity or revision identifier produced by acceptance. The only enumeration of accepted readiness checks is the student delivery list (`listReadinessCheckDeliveries`), which is gated to effective Student participation.

The result is that an ADR-011-sanctioned workflow — re-accept a corrected candidate onto the accepted entity via the entity identifier — is unreachable for already-accepted readiness checks, because nothing exposes that entity identifier to a curator who did not capture it at original acceptance time. This blocks correcting accepted readiness checks in place.

This is the same gap [ADR-019](adr-019-curator-accepted-quick-check-read-surface.md) closed for quick checks. The sibling accepted assessment artifacts — assessment criteria, open-answer checks, and (since ADR-019) quick checks — each expose a curator-readable accepted-list surface that carries the stable entity identifier. Readiness checks are now the only accepted assessment artifact missing such a surface.

Alternatives considered:

- **Open the student delivery list to curators**: rejected — it would conflate student and curator reads and force the delivery projection to serve two audiences, contradicting the ADR-011 ownership boundary.
- **Attach accepted entity/revision identifiers to the accepted-status candidate listing**: rejected — candidate records are draft-side Curator Workspace artifacts; binding accepted-entity identity onto them blurs the candidate-versus-accepted boundary the lifecycle depends on.
- **Document-only, add no surface**: rejected — it leaves the ADR-011 re-acceptance workflow permanently unreachable for already-accepted readiness checks and contradicts the decision that such items are corrected in place.

Industry reference points support a separate curator-authorized surface rather than overloading the student projection. The [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) recommends least-privilege, server-side authorization per audience; keeping curator enumeration behind curator authority follows that guidance without selecting any transport payload.

## Decision

Corpus Storage MUST expose a curator-authorized read surface over the accepted readiness checks of a stable `Program`.

That surface MUST enumerate the Program's accepted readiness-check entities and MUST identify, per entity, the stable accepted readiness-check entity identifier and the identifier of its current accepted readiness-check revision.

The curator read surface MUST require effective `Program Curator` authority for the Program. Admin authority MAY also be permitted consistent with existing assessment-curation authorization. Effective `Student` participation alone MUST NOT grant access.

The curator read surface MAY expose curator-only metadata consistent with the existing protected curation detail. It MUST NOT become, or be merged into, a student-facing projection.

The identifiers the surface exposes MUST be sufficient for a `Program Curator` to perform in-place re-acceptance by targeting the accepted entity, while preserving every ADR-011 invariant — prior attempts, results, and historical revisions MUST NOT be rewritten.

The student-facing delivery projection is unchanged.

This decision is read-only: exposing the curator read surface MUST NOT alter accepted revisions, attempts, results, or any other state.

## Rules / Invariants

- A curator accepted readiness-check read MUST require effective `Program Curator` authority for the Program; Admin MAY also be permitted; effective `Student` participation alone MUST be rejected.
- The curator accepted readiness-check read surface MUST be distinct from the student delivery projection; the two MUST NOT be collapsed into one audience-ambiguous surface.
- The curator read surface MUST expose, for each accepted readiness check of the Program, the stable accepted readiness-check entity identifier and the current accepted readiness-check revision identifier.
- The curator read surface MAY expose curator-only metadata (scope, requirements, rationale) consistent with the existing curation detail.
- The curator read surface MUST be read-only; reading it MUST NOT create or mutate accepted revisions, attempts, results, candidates, membership, identity, session, or CSRF state.
- Re-acceptance that targets an accepted readiness-check entity MUST continue to preserve prior attempts and historical revisions (restating the ADR-011 invariant this surface enables).
- A revision remains immutable; correcting an accepted readiness check MUST be done by re-acceptance onto the accepted entity, not by editing a revision in place.
- Specs and implementation derived from this ADR MUST include tests for curator-only authorization (Student-only access rejected), presence of the accepted entity and current revision identifiers per item, and read-only behavior.

## Consequences

- A Program Curator can enumerate accepted readiness checks and obtain the accepted entity identifier required for `targetEntityId` re-acceptance, completing the ADR-011 in-place revisioning workflow for already-accepted readiness checks.
- The change restores symmetry with the sibling accepted-read surfaces for assessment criteria, open-answer checks, and quick checks; readiness checks stop being the lone accepted assessment artifact without a curator enumeration route.
- The curator and student read paths diverge explicitly by audience, which adds one read surface but prevents an overloaded student projection.
- A future ADR or spec MAY add pagination, filtering, status scoping, or a `/learn` curator UI over this surface. Those are not decided here.

## Non-Goals

This ADR does not decide:

- HTTP route names, request payloads, response payloads, status codes, or pagination;
- Curator UI, `/learn` surfaces, or generated frontend artifacts;
- any change to the student-facing delivery projection, attempt/result lifecycle, idempotency, or progression interpretation;
- editing an accepted readiness-check revision in place — revisions remain immutable and correction is by re-acceptance;
- curator read access to student attempts, results, weak areas, or progress — that boundary is unchanged and remains out of scope;
- concrete database tables, columns, indexes, or storage layout;
- readiness threshold, aggregation, or progression-gate policy.
