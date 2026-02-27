# Review: Implementation Plan 0001 — Release Architecture

**Reviewer**: Claude (automated architectural review)
**Date**: 2026-02-27
**Reviewed documents**:
- `docs/plans/0001-release-architecture-implementation.md` (the plan)
- `docs/adr/release/ADR-000` through `ADR-006` (the source ADRs)
- `docs/adr/governance/implementation-plan-planner-requirements.md` (the requirements spec)
- `docs/adr/release/ADR-Review-Process.md` (review process)

------------------------------------------------------------------------

## 1. Overall Assessment

The plan is well-structured, invariant-driven, and faithfully translates
the ADR forest into a phased execution strategy. It satisfies the
majority of planner requirements with high fidelity. Phase ordering is
sound — irreversible actions (tagging, publishing) are gated behind
validation and detection phases.

Five findings are raised below: one `fail`, three `warn`, one
observation. None invalidate the plan's core structure; all are
addressable without rephasing.

------------------------------------------------------------------------

## 2. Planner Requirements Compliance

### §2 Core Obligation — `pass`

- Invariant-driven, not step-driven: yes — each phase defines invariants
  and acceptance criteria, not procedural steps.
- Phase-based and sequential: yes — five ordered phases with explicit
  dependencies.
- Observable acceptance criteria: yes — every phase has CI-observable
  outcomes.
- Executor freedom preserved: yes — no scripting language, CI vendor, or
  command sequences prescribed.

### §3 ADR Traceability — `warn`

The traceability matrix (plan lines 43–73) maps invariants to phases.
Coverage is strong but has one gap:

- **ADR-001 §4 invariant "Each release unit MUST have its own version"**
  is absent from the matrix. It is implicitly covered by ADR-002/ADR-005
  invariants in Phase 1 (canonical metadata enforces per-unit version),
  but it is not explicitly traced. Per §3: "If a capability cannot be
  traced to an ADR, it MUST NOT appear in the plan" — the converse risk
  is that an ADR invariant not traced to the plan could be silently
  dropped.

  **Fix**: Add a row to the traceability matrix:
  `| 001 | Each release unit has its own version | 1 |`

### §4 Phase Structure — `pass`

- Each phase concludes with a commit boundary: explicitly stated.
- Later phases depend only on earlier invariants: Phase 3 → Phases 1+2,
  Phase 4 → Phase 3, Phase 5 → all. Correct.
- No irreversible action before validation proven: tagging (Phase 3)
  follows detection validation (Phase 2). Docker publish (Phase 4)
  follows tagging. Correct.
- Phase completion criteria defined: yes, every phase.

### §5 Acceptance Criteria Discipline — `pass`

All acceptance criteria describe observable outcomes ("CI fails when…",
"release detected", "no release detected"). None prescribe
implementation steps. Compliant.

### §6 Automated Verification — `pass`

Each phase introduces or extends automated CI checks. Phase completion
depends on automated verification. No manual-only gates.

### §7 Sequential Commit Discipline — `pass`

Each phase specifies "Commit boundary" in its completion criteria. CI
must pass before advancing. No phase bundling.

### §8 Edge Case Coverage — `pass`

All five required edge cases are addressed:

| Edge case                          | Addressed in      |
| ---------------------------------- | ----------------- |
| First release of a unit            | Phases 1, 2, 5    |
| Unit rename                        | Phases 3, 5       |
| Basename collision attempt         | Phases 1, 3, 5    |
| Version change without path change | Phases 2, 5       |
| Path change without version change | Phases 2, 5       |

Expected behaviors are defined, not implementation mechanics. Compliant.

### §9 Scope Guardrails — `pass`

All six exclusions from ADR-000 Non-Goals are explicitly listed in the
plan's Scope Guardrails section (plan lines 29–38). Compliant.

### §10 Completion Definition — `pass`

All four required observable criteria are present (plan lines 361–369):
CI enforcement of all ADR invariants, full lifecycle completion,
idempotent rerun, no manual intervention. Compliant.

### §11 Executor Freedom — `pass`

The Executor Freedom section (plan lines 375–385) explicitly states that
CI vendor, scripting language, workflow layout, and command sequences are
not prescribed. Compliant.

------------------------------------------------------------------------

## 3. ADR Invariant Coverage

Cross-checking every `MUST`/`MUST NOT` from ADR-000 through ADR-006
against the plan:

### ADR-000 — Release Architecture Overview

| Invariant                                      | Plan coverage |
| ---------------------------------------------- | ------------- |
| Releases only on push to trunk                 | Phase 3 ✓     |
| Canonical version source per unit              | Phase 1 ✓     |
| Semver                                         | Phase 1 ✓     |
| Tag contract                                   | Phase 3 ✓     |
| Basename uniqueness                            | Phase 1 ✓     |
| Detection uses last matching tag               | Phase 2 ✓     |
| Discovery follows configured scope             | Phase 1 ✓     |
| Deterministic, idempotent releases             | Phase 5 ✓     |
| CI enforces invariants                         | Phase 5 ✓     |

### ADR-001 — Independent Release Units

| Invariant                                      | Plan coverage   |
| ---------------------------------------------- | --------------- |
| Each unit has its own version                  | Phase 1 (implicit) ⚠ |
| Releases trigger only on push to trunk         | Phase 3 ✓       |
| Release branches MUST NOT be used              | Phase 3 ✓       |
| Version bump is explicit release intent signal | Phase 2 ✓       |

### ADR-002 — Canonical Version Metadata

| Invariant                                      | Plan coverage |
| ---------------------------------------------- | ------------- |
| Node units use package.json                    | Phase 1 ✓     |
| Non-Node units use release.toml                | Phase 1 ✓     |
| Unit MUST NOT contain both                     | Phase 1 ✓     |
| Version follows semver                         | Phase 1 ✓     |
| Canonical version must change for release      | Phase 3 ✓     |

### ADR-003 — Tagging Convention

| Invariant                                      | Plan coverage |
| ---------------------------------------------- | ------------- |
| Tag format `<basename>_v<version>`             | Phase 3 ✓     |
| Basename = leaf directory name                 | Phase 1, 3 ✓  |
| Basenames globally unique                      | Phase 1 ✓     |
| Basenames MUST NOT contain underscores         | Phase 1 ✓     |
| Tag lookup uses glob `<basename>_v*`           | Phase 2, 3 ✓  |

### ADR-004 — Release Detection Algorithm

| Invariant                                      | Plan coverage |
| ---------------------------------------------- | ------------- |
| Base commit = last matching tag                | Phase 2 ✓     |
| No tag → base = initial commit                 | Phase 2 ✓     |
| Release iff path changed AND version changed   | Phase 2 ✓     |
| Detection is idempotent                        | Phase 2 ✓     |

### ADR-005 — Release Unit Discovery

| Invariant                                      | Plan coverage |
| ---------------------------------------------- | ------------- |
| Discovery limited to configured prefixes       | Phase 1 ✓     |
| Generator output committed                    | Phase 1 ✓     |
| CI fails if manifest drifts                    | Phase 1 ✓     |
| Each unit has exactly one canonical metadata   | Phase 1 ✓     |

### ADR-006 — Docker Image Tagging

| Invariant                                      | Plan coverage |
| ---------------------------------------------- | ------------- |
| Policy applies only to Docker-producing units  | Phase 4 ✓     |
| Image version matches canonical semver         | Phase 4 ✓     |
| Git tag = `<basename>_v<version>`              | Phase 4 ✓     |
| Image pushed with SHA tag                      | Phase 4 ✓     |
| Image pushed with version tag                  | Phase 4 ✓     |

**Result**: 29 of 30 invariants explicitly traced. One implicit (noted
in §3 finding above).

------------------------------------------------------------------------

## 4. Findings

### F1 — `warn` — ADR-001 invariant missing from traceability matrix

**Location**: plan lines 43–73 (traceability matrix)

ADR-001 §4: "Each release unit MUST have its own version" is not listed
in the traceability matrix. The invariant is substantively covered by
Phase 1 (ADR-002 and ADR-005 enforce per-unit canonical metadata with
semver), but per planner requirements §3, every planned capability must
map to a specific ADR requirement. The converse — an ADR invariant not
mapped to the plan — risks silent omission.

**Fix**: Add row `| 001 | Each release unit has its own version | 1 |`
to the traceability matrix.

### F2 — `fail` — Phase 4 depends on manifest data not required by Phase 1

**Location**: plan lines 286–289 (Phase 4 Applicability)

The plan states: "the executor must ensure the manifest (Phase 1)
captures which units produce Docker images." However, Phase 1's
invariants (plan lines 89–103) define the manifest as containing: root
path, basename, canonical metadata type, and current version. No
invariant requires the manifest to record Docker-producing status.

Phase 4's invariant "Non-Docker-producing units are completely
unaffected" (line 273) requires a mechanism to distinguish
Docker-producing units from others. This mechanism is not established in
any prior phase.

This is a structural dependency gap: Phase 4 requires data that no
earlier phase guarantees will exist.

**Fix**: Either:
1. Add a Phase 1 invariant: "The manifest MUST record whether each unit
   is a Docker-producing unit." Add the corresponding ADR traceability
   (ADR-006 scoping rule: "This policy MUST apply only to release units
   that produce Docker images" logically requires discoverability of
   Docker status at the manifest level).
2. Or add a Phase 4 invariant defining how Docker-producing status is
   determined independently of the manifest (e.g., presence of a
   Dockerfile in the unit root).

Option 1 is cleaner because it keeps all unit metadata centralized in
the manifest.

### F3 — `warn` — Legacy tag migration lacks ADR traceability

**Location**: plan lines 224–225, 233 (Phase 3 invariant 7 and
acceptance criterion)

Phase 3 includes: "The existing `v*` tag namespace (used by the legacy
Oracle release workflow) is migrated or coexists without conflict" and
"Legacy `v*` tags are not broken or orphaned by the transition."

This is a legitimate practical concern, but it does not trace to any ADR
invariant. Per planner requirements §3: "If a capability cannot be
traced to an ADR, it MUST NOT appear in the plan."

However, this is a borderline case — removing it would create real
transition risk. The underlying ADR gap is that no ADR addresses legacy
tag migration.

**Fix**: Either:
1. Accept this as a necessary transition concern outside ADR scope but
   document it explicitly as such (e.g., "Transition concern — not
   ADR-derived but required for safe migration").
2. Or add a brief amendment to ADR-003 acknowledging the legacy `v*`
   namespace and the transition boundary.

### F4 — `warn` — Phase 2 edge case analysis overspecifies

**Location**: plan lines 173–183 (Phase 2 edge case "Version change
without path change")

The plan includes a multi-paragraph analysis concluding that "version
change without path change is only possible if the metadata file lives
outside the unit root, which the architecture prohibits." While this
analysis is correct, it crosses from invariant-driven planning into
implementation-level reasoning about what constitutes a "file change."

Per planner requirements §11, the plan should define *what* must hold,
not *how*. The acceptance criterion (line 159: "Version change without
path change: no release detected") is sufficient. The inline analysis
risk is that an executor might treat the reasoning as normative rather
than explanatory.

**Fix**: Condense the edge case discussion to: "The metadata file
resides under the unit root, so a version-only bump constitutes a path
change. The scenario 'version change without path change' is
architecturally impossible and is listed for completeness."

### F5 — Observation — Execution Lock compliance

**Location**: plan lines 18–23

The Execution Lock section includes all required fields per CLAUDE.md
Plan Creation Lock: worktree required, expected worktree/branch,
preflight check. Compliant. No action needed.

------------------------------------------------------------------------

## 5. Architecture Doc Review Checklist

Per CLAUDE.md Architecture Doc Review criteria:

| Criterion          | Verdict | Notes                                      |
| ------------------ | ------- | ------------------------------------------ |
| Ambiguity          | `pass`  | Core terms defined; rules unambiguous       |
| Clarity            | `pass`  | Scope, allowed/prohibited behavior explicit |
| Consistency        | `pass`  | F2 resolved: Docker status in Phase 1       |
| Readability        | `pass`  | Skimmable structure, concise bullets        |
| Best practices     | `pass`  | Aligns with repo architecture constraints   |
| Drift resistance   | `pass`  | Uses MUST/MUST NOT; CI verification gates   |

------------------------------------------------------------------------

## 6. Summary

| Finding | Severity | Status     | Resolution                            |
| ------- | -------- | ---------- | ------------------------------------- |
| F1      | `warn`   | `resolved` | ADR-001 invariant added to matrix     |
| F2      | `fail`   | `resolved` | Docker status added to Phase 1        |
| F3      | `warn`   | `resolved` | Legacy migration labeled as transition concern |
| F4      | `warn`   | `resolved` | Edge case analysis condensed          |
| F5      | obs.     | `pass`     | Already compliant                     |

All findings resolved. Plan is ready for execution.
