---
date: 2026-06-22
model: claude
description: "Amends ADR-016 to decide a curator-only read surface over accepted quick checks that enumerates accepted entities and current revisions, so a Program Curator can target an accepted entity for in-place re-acceptance without rewriting history."
status: proposed
---

# ADR-019 - Curator Accepted Quick-Check Read Surface

## Executive Summary

This ADR amends [ADR-016](adr-016-quick-check-assessment-boundary.md) to add a curator-only read surface over accepted quick checks.

ADR-016 sanctions re-accepting a corrected quick check onto an existing accepted entity (a later revision that does not rewrite prior attempts), but decided only the student-facing delivery projection and no curator read surface. A Program Curator therefore has no route to discover the stable accepted entity identifier that in-place re-acceptance requires.

Corpus Storage MUST expose a curator-authorized read surface that enumerates a Program's accepted quick checks and identifies, per item, the stable accepted entity identifier and current accepted revision identifier.

That curator read surface MAY include the answer key and curator-only metadata; it MUST require effective Program Curator (or Admin) authority and MUST NOT be reachable through Student participation alone.

This ADR does not decide HTTP route names, payloads, pagination, or curator UI. It does not change the student delivery projection, the attempt/result lifecycle, or answer-key secrecy from students.

## Context

[ADR-016](adr-016-quick-check-assessment-boundary.md) assigns accepted quick-check entities, revisions, options, and answer keys to Corpus Storage, and mandates a student-facing delivery projection that excludes the answer key. It also establishes that accepting a later quick-check revision MUST NOT rewrite prior attempts or results — that is, a weak accepted quick check is corrected by re-accepting onto the existing accepted entity, producing a new current revision while history stays intact.

The decisive gap: ADR-016 was silent on any curator read surface for accepted quick checks. The implementation exposes a protected curation detail keyed by revision identifier, but a curator has no enumeration route to obtain that revision identifier after acceptance. The candidate listing exposes only candidate identifiers, never the accepted entity or revision identifier produced by acceptance. The only enumeration of accepted quick checks is the student delivery list, which is gated to effective Student participation and deliberately omits the answer key.

The result is that an ADR-016-sanctioned workflow — re-accept a corrected candidate onto the accepted entity via the entity identifier — is unreachable for already-accepted items, because nothing exposes that entity identifier to a curator who did not capture it at original acceptance time. This blocks correcting weak accepted quick checks in place.

The sibling accepted assessment artifacts do not have this gap: assessment criteria and open-answer checks each expose a curator-readable accepted-list surface that carries the stable entity identifier. Quick checks are the only accepted assessment artifact missing such a surface.

Alternatives considered:

- **Open the student delivery list to curators**: rejected — it would either leak answer keys onto a Student-authorized surface or force the delivery projection to serve two audiences, violating ADR-016 answer-key secrecy and conflating student and curator reads.
- **Attach accepted entity/revision identifiers to the accepted-status candidate listing**: rejected — candidate records are draft-side Curator Workspace artifacts; binding accepted-entity identity onto them blurs the candidate-versus-accepted boundary that the lifecycle depends on.
- **Document-only, add no surface**: rejected — it leaves the ADR-016 re-acceptance workflow permanently unreachable for already-accepted items and contradicts the decision that such items are corrected in place.

Industry reference points support a separate curator-authorized surface rather than overloading the student projection. The [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) recommends least-privilege, server-side authorization per audience; keeping answer-key-bearing reads behind curator authority follows that guidance without selecting any transport payload.

## Decision

Corpus Storage MUST expose a curator-authorized read surface over the accepted quick checks of a stable `Program`.

That surface MUST enumerate the Program's accepted quick-check entities and MUST identify, per entity, the stable accepted quick-check entity identifier and the identifier of its current accepted quick-check revision.

The curator read surface MUST require effective `Program Curator` authority for the Program. Admin authority MAY also be permitted consistent with existing assessment-curation authorization. Effective `Student` participation alone MUST NOT grant access.

The curator read surface MAY expose the answer key and curator-only correctness metadata, consistent with the existing protected curation detail. It MUST NOT become, or be merged into, a student-facing projection.

The identifiers the surface exposes MUST be sufficient for a `Program Curator` to perform in-place re-acceptance by targeting the accepted entity, while preserving every ADR-016 invariant — prior attempts, results, and historical revisions MUST NOT be rewritten.

The student-facing delivery projection is unchanged and MUST continue to exclude the answer key and option correctness metadata.

This decision is read-only: exposing the curator read surface MUST NOT alter accepted revisions, attempts, results, or any other state.

## Rules / Invariants

- A curator accepted quick-check read MUST require effective `Program Curator` authority for the Program; Admin MAY also be permitted; effective `Student` participation alone MUST be rejected.
- The curator accepted quick-check read surface MUST be distinct from the student delivery projection; the two MUST NOT be collapsed into one audience-ambiguous surface.
- The curator read surface MUST expose, for each accepted quick check of the Program, the stable accepted quick-check entity identifier and the current accepted quick-check revision identifier.
- The curator read surface MAY expose answer keys and curator-only correctness metadata.
- Answer keys and option correctness metadata MUST NOT leak from this surface into any student-facing projection, fault, log, or transport metadata.
- The curator read surface MUST be read-only; reading it MUST NOT create or mutate accepted revisions, attempts, results, candidates, membership, identity, session, or CSRF state.
- Re-acceptance that targets an accepted quick-check entity MUST continue to preserve prior attempts and historical revisions (restating the ADR-016 invariant this surface enables).
- A revision remains immutable; correcting a weak accepted quick check MUST be done by re-acceptance onto the accepted entity, not by editing a revision in place.
- Specs and implementation plans derived from this ADR MUST include tests for curator-only authorization (Student-only access rejected), presence of the accepted entity and current revision identifiers per item, answer-key non-leakage to student-facing surfaces, and read-only behavior.

## Consequences

- A Program Curator can enumerate accepted quick checks and obtain the accepted entity identifier required for `targetEntityId` re-acceptance, completing the ADR-016 in-place revisioning workflow for already-accepted items.
- The change restores symmetry with the sibling accepted-read surfaces for assessment criteria and open-answer checks; quick checks stop being the lone accepted assessment artifact without a curator enumeration route.
- Answer-key exposure now has two curator-only surfaces — the existing per-revision curation detail and this enumeration surface. Both MUST stay behind curator authorization; the projection discipline that keeps keys off student reads now applies to both.
- The curator and student read paths diverge explicitly by audience, which adds one read surface but prevents answer-key leakage through an overloaded student projection.
- A future ADR or spec MAY add pagination, filtering, status scoping, or a `/learn` curator UI over this surface. Those are not decided here.

## Non-Goals

This ADR does not decide:

- HTTP route names, request payloads, response payloads, status codes, or pagination;
- Curator UI, `/learn` surfaces, or generated frontend artifacts;
- any change to the student-facing delivery projection, attempt/result lifecycle, idempotency, or answer-key secrecy from students;
- editing an accepted quick-check revision in place — revisions remain immutable and correction is by re-acceptance;
- curator read access to student attempts, results, weak areas, or progress — that boundary is unchanged and remains out of scope;
- concrete database tables, columns, indexes, or storage layout;
- multiple-select, free-form, adaptive, or spaced-repetition quick-check behavior.
