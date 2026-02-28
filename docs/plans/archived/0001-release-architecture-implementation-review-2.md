# Review: Release ADRs & Implementation Plan 0001

**Reviewer**: Claude (Opus 4.6 — independent architectural review)
**Date**: 2026-02-27
**Scope**: Release ADRs (000–006), implementation plan, planner requirements compliance
**Prior review**: `0001-release-architecture-implementation-review.md` (all findings resolved)
**Status**: Closed — all findings resolved, ADR set accepted

**Reviewed documents**:
- `docs/adr/release/ADR-000` through `ADR-006`
- `docs/adr/release/ADR-Review-Process.md`
- `docs/plans/0001-release-architecture-implementation.md`
- `docs/adr/governance/implementation-plan-planner-requirements.md`
- `docs/adr/governance/adr-review-standard.md`
- `docs/adr/governance/adr-structure-template.md`

------------------------------------------------------------------------

## 1. Overall Assessment

The release ADR forest (000–006) is coherent, well-bounded, and
structurally sound. The implementation plan faithfully translates ADR
invariants into a phased execution strategy with correct dependency
ordering. Prior review findings (F1–F5) were properly resolved.

This review raises two new findings (`warn`) and two observations.
No `fail`-severity issues found. The plan is executable as-is; the
findings are refinements that strengthen edge case coverage and
textual clarity.

------------------------------------------------------------------------

## 2. ADR Review (per ADR Review Standard dimensions)

### ADR-000 — Release Architecture Overview

| Dimension             | Verdict | Notes                                              |
| --------------------- | ------- | -------------------------------------------------- |
| Intent Integrity      | `pass`  | Summary matches decision; system-level architecture |
| Boundary Clarity      | `pass`  | Non-Goals: changelog, commit conventions, signing, deployment |
| Cross-ADR Consistency | `pass`  | Root document; child ADRs elaborate without contradiction |
| Decision Stability    | `pass`  | Model accommodates growth (new units, ecosystems)  |

**Review summary block** (per ADR Review Standard §4):
- I understand this ADR to decide that the monorepo uses independent, trunk-only, semver-based, tag-driven releases with per-unit canonical version sources.
- The main structural risk I see is that the overview delegates nearly all enforcement detail to child ADRs; if a child ADR is removed or weakened, the overview's invariants lose their backing.
- No cross-ADR inconsistency detected.

### ADR-001 — Independent Release Units & Trunk Policy

| Dimension             | Verdict | Notes                                              |
| --------------------- | ------- | -------------------------------------------------- |
| Intent Integrity      | `pass`  | Addresses real tension: coupled release trains      |
| Boundary Clarity      | `pass`  | Non-Goals: global release train versioning          |
| Cross-ADR Consistency | `pass`  | "trunk" used consistently with ADR-000              |
| Decision Stability    | `pass`  | Independent units are a stable monorepo pattern     |

**Review summary block**:
- I understand this ADR to decide that each release unit is versioned independently and releases occur only from `trunk`, with version bump as the explicit release intent signal.
- The main structural risk I see is minimal — trunk-only policy is well-understood and widely adopted.
- No cross-ADR inconsistency detected.

### ADR-002 — Canonical Version Metadata Policy

| Dimension             | Verdict | Notes                                              |
| --------------------- | ------- | -------------------------------------------------- |
| Intent Integrity      | `pass`  | Clear: Node → package.json, Non-Node → release.toml |
| Boundary Clarity      | `pass`  | Non-Goals: ecosystem-specific publishing rules      |
| Cross-ADR Consistency | `pass`  | Semver aligns with ADR-000; version-change gate aligns with ADR-004 |
| Decision Stability    | `warn`  | See observation O1 below                           |

**Review summary block**:
- I understand this ADR to decide that each unit has exactly one canonical version source (package.json for Node, release.toml for non-Node), with semver mandatory and mutual exclusion enforced.
- The main structural risk I see is that the binary Node/Non-Node classification may require amendment if future ecosystems (Python, Rust) join the monorepo. The ADR is clear about current scope, so this is a stability observation, not a defect.
- No cross-ADR inconsistency detected.

### ADR-003 — Tagging Convention

| Dimension             | Verdict | Notes                                              |
| --------------------- | ------- | -------------------------------------------------- |
| Intent Integrity      | `pass`  | Tag format unambiguous; examples provided           |
| Boundary Clarity      | `pass`  | Non-Goals: namespaced hierarchies, multi-separator  |
| Cross-ADR Consistency | `pass`  | No-underscore rule ensures `_v` separator is unambiguous; glob aligns with ADR-004 |
| Decision Stability    | `pass`  | Resolved — basename reuse rule added (F1)           |

**Review summary block**:
- I understand this ADR to decide that tags follow `<basename>_v<version>` where basename is the leaf directory name, globally unique, and underscore-free.
- The main structural risk I see is basename reuse after unit rename: historical tags persist and would collide with a new unit taking the same basename.
- Potential inconsistency with ADR-004: if a reused basename inherits stale tags, detection base would be incorrect.

### ADR-004 — Release Detection Algorithm

| Dimension             | Verdict | Notes                                              |
| --------------------- | ------- | -------------------------------------------------- |
| Intent Integrity      | `pass`  | Algorithm is clearly stated: last-tag diff + version gate |
| Boundary Clarity      | `pass`  | Non-Goals: content-based detection, implicit inference |
| Cross-ADR Consistency | `pass`  | Depends on ADR-003 tag format, ADR-002 version, ADR-001 trunk |
| Decision Stability    | `pass`  | Simple, deterministic, explicitly defines first-release fallback |

**Review summary block**:
- I understand this ADR to decide that release detection uses the last matching tag as comparison base, falling back to initial commit, and requires both path change and version change.
- The main structural risk I see is minimal — the dual-gate (path + version) is a well-proven pattern.
- No cross-ADR inconsistency detected.

### ADR-005 — Release Unit Discovery & Validation

| Dimension             | Verdict | Notes                                              |
| --------------------- | ------- | -------------------------------------------------- |
| Intent Integrity      | `pass`  | Config-driven discovery prevents accidental drift   |
| Boundary Clarity      | `pass`  | Non-Goals: fully dynamic discovery                  |
| Cross-ADR Consistency | `pass`  | Feeds ADR-003 basename validation and ADR-002 metadata validation |
| Decision Stability    | `pass`  | Config-driven approach is extensible without ADR change |

**Review summary block**:
- I understand this ADR to decide that release units are discovered via `release-units.config.toml` and a deterministic generator produces a committed `release-units.toml` manifest.
- The main structural risk I see is that the Rules section uses generic language ("configured prefixes", "generator output") without repeating the file names from the Decision section. An implementor must read both sections. This is a readability preference, not a defect.
- No cross-ADR inconsistency detected.

### ADR-006 — Docker Image Tagging Policy

| Dimension             | Verdict | Notes                                              |
| --------------------- | ------- | -------------------------------------------------- |
| Intent Integrity      | `pass`  | Two tags per image (semver + SHA) for traceability  |
| Boundary Clarity      | `pass`  | Non-Goals: multi-arch, registry selection           |
| Cross-ADR Consistency | `pass`  | Git tag references ADR-003 format; image version references ADR-002 semver |
| Decision Stability    | `pass`  | Two-tag strategy is standard practice               |

**Review summary block**:
- I understand this ADR to decide that Docker-producing release units publish two image tags (`<version>` and `<git-sha>`) with the git tag `<basename>_v<version>` as canonical release reference.
- The main structural risk I see is minimal — the policy is narrowly scoped and opt-in per unit.
- No cross-ADR inconsistency detected.

------------------------------------------------------------------------

## 3. ADR Structure Compliance

All seven ADRs follow the governance template structure:

| Section            | ADR-000 | 001 | 002 | 003 | 004 | 005 | 006 |
| ------------------ | ------- | --- | --- | --- | --- | --- | --- |
| Executive Summary  | ✓       | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| Context            | ✓       | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| Decision           | ✓       | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| Rules / Invariants | ✓       | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| Consequences       | ✓       | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| Non-Goals          | ✓       | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |

- All Executive Summaries ≤ 10 lines. ✓
- All Rules sections use MUST/MUST NOT language. ✓
- Terminology is consistent across all ADRs ("trunk", "release unit", "canonical version", "basename", "manifest"). ✓

------------------------------------------------------------------------

## 4. Implementation Plan — Planner Requirements Compliance

### §2 Core Obligation — `pass`

- Invariant-driven, not step-driven: each phase defines invariants and
  observable outcomes, not procedural steps.
- Phase-based and sequential: five ordered phases with explicit
  dependencies.
- Observable acceptance criteria: every phase has CI-observable outcomes.
- Executor freedom preserved: no scripting language, CI vendor, or
  command sequences prescribed.

### §3 ADR Traceability — `pass`

The traceability matrix (plan lines 43–76) contains 31 rows mapping
all ADR invariants to phases. Cross-check against ADR §4 sections:

- ADR-000: 7 rules → all covered (3 directly as ADR-000, 4 via child
  ADR rows). ✓
- ADR-001: 4 rules → all explicitly mapped. ✓
- ADR-002: 5 rules → all explicitly mapped. ✓
- ADR-003: 5 rules → all explicitly mapped. ✓
- ADR-004: 4 rules → all explicitly mapped. ✓
- ADR-005: 4 rules → all explicitly mapped. ✓
- ADR-006: 5 rules → all explicitly mapped, plus Docker-producing
  manifest status in Phase 1. ✓

No out-of-scope functionality introduced.

### §4 Phase Structure — `pass`

- Each phase concludes with "Commit boundary." ✓
- Later phases depend only on earlier invariants. ✓
- Irreversible actions (tagging Phase 3, Docker publish Phase 4) gated
  behind validation (Phase 1) and detection (Phase 2). ✓
- Phase completion criteria defined for every phase. ✓

### §5 Acceptance Criteria Discipline — `pass`

All acceptance criteria describe observable outcomes ("CI fails
when…", "release detected", "no release detected"). None prescribe
implementation steps.

### §6 Automated Verification — `pass`

Each phase introduces or extends automated CI checks. Phase completion
depends on automated verification. No manual-only gates.

### §7 Sequential Commit Discipline — `pass`

Each phase specifies "Commit boundary" in completion criteria. CI must
pass before advancing. No phase bundling.

### §8 Edge Case Coverage — `pass`

All five required edge cases addressed:

| Edge case                          | Addressed in   |
| ---------------------------------- | -------------- |
| First release of a unit            | Phases 1, 2, 5 |
| Unit rename                        | Phases 3, 5    |
| Basename collision attempt         | Phases 1, 3, 5 |
| Version change without path change | Phases 2, 5    |
| Path change without version change | Phases 2, 5    |

### §9 Scope Guardrails — `pass`

All six exclusions explicitly listed in plan lines 29–38.

### §10 Completion Definition — `pass`

All four required observable criteria present (plan lines 361–369).
Plan adds legacy workflow resolution as a fifth criterion — acceptable
as a transition necessity.

### §11 Executor Freedom — `pass`

Executor Freedom section (plan lines 375–385) explicitly preserves
choice of CI vendor, scripting language, workflow layout, and command
sequences.

------------------------------------------------------------------------

## 5. Implementation Plan — ADR Invariant Coverage

Full cross-check of every MUST/MUST NOT from ADR-000 through ADR-006:

| ADR | Invariant                                      | Plan phase | Status |
| --- | ---------------------------------------------- | ---------- | ------ |
| 000 | Releases only on push to trunk                 | 3          | ✓      |
| 000 | Canonical version source per unit              | 1          | ✓      |
| 000 | Semver                                         | 1          | ✓      |
| 000 | Tag contract                                   | 3          | ✓      |
| 000 | Basename uniqueness                            | 1          | ✓      |
| 000 | Detection uses last matching tag               | 2          | ✓      |
| 000 | Discovery follows configured scope             | 1          | ✓      |
| 000 | Deterministic, idempotent releases             | 5          | ✓      |
| 000 | CI enforces invariants                         | 5          | ✓      |
| 001 | Each unit has its own version                  | 1          | ✓      |
| 001 | Releases trigger only on push to trunk         | 3          | ✓      |
| 001 | Release branches MUST NOT be used              | 3          | ✓      |
| 001 | Version bump is explicit release intent signal | 2          | ✓      |
| 002 | Node units use package.json                    | 1          | ✓      |
| 002 | Non-Node units use release.toml                | 1          | ✓      |
| 002 | Unit MUST NOT contain both                     | 1          | ✓      |
| 002 | Version follows semver                         | 1          | ✓      |
| 002 | Canonical version must change for release      | 3          | ✓      |
| 003 | Tag format `<basename>_v<version>`             | 3          | ✓      |
| 003 | Basename = leaf directory name                 | 1, 3       | ✓      |
| 003 | Basenames globally unique                      | 1          | ✓      |
| 003 | Basenames MUST NOT contain underscores         | 1          | ✓      |
| 003 | Tag lookup uses glob `<basename>_v*`           | 2, 3       | ✓      |
| 004 | Base commit = last matching tag                | 2          | ✓      |
| 004 | No tag → base = initial commit                 | 2          | ✓      |
| 004 | Release iff path changed AND version changed   | 2          | ✓      |
| 004 | Detection is idempotent                        | 2          | ✓      |
| 005 | Discovery limited to configured prefixes       | 1          | ✓      |
| 005 | Generator output committed                     | 1          | ✓      |
| 005 | CI fails if manifest drifts                    | 1          | ✓      |
| 005 | Each unit has exactly one canonical metadata   | 1          | ✓      |
| 006 | Policy applies only to Docker-producing units  | 4          | ✓      |
| 006 | Image version matches canonical semver         | 4          | ✓      |
| 006 | Git tag = `<basename>_v<version>`              | 4          | ✓      |
| 006 | Image pushed with SHA tag                      | 4          | ✓      |
| 006 | Image pushed with version tag                  | 4          | ✓      |

**Result**: All ADR invariants explicitly traced and covered.

------------------------------------------------------------------------

## 6. Architecture Doc Review Checklist

Per CLAUDE.md Architecture Doc Review criteria (applied to both ADRs
and implementation plan):

| Criterion        | ADRs   | Plan   | Notes                                              |
| ---------------- | ------ | ------ | -------------------------------------------------- |
| Ambiguity        | `pass` | `pass` | Core terms defined once; rules have one interpretation |
| Clarity          | `pass` | `pass` | Scope, allowed/prohibited behavior explicit         |
| Consistency      | `pass` | `pass` | No internal contradictions; ADR cross-references align |
| Readability      | `pass` | `pass` | Skimmable structure, concise bullets, table-driven  |
| Best practices   | `pass` | `pass` | Aligns with repo architecture constraints           |
| Drift resistance | `pass` | `pass` | MUST/MUST NOT language; CI verification gates       |

------------------------------------------------------------------------

## 7. Findings

### F1 — `warn` — Basename reuse after unit rename is unaddressed

**Location**: `ADR-003-tagging-convention.md:31-33`, plan lines 237–243

ADR-003 requires basenames to be globally unique "across all release
units." The plan correctly states that when a unit is renamed, old
`<old-basename>_v*` tags remain as historical artifacts and the renamed
unit starts fresh (first-release path).

However, neither ADR-003 nor the plan addresses what happens if a
**new** unit later takes the same basename as a previously renamed or
removed unit. The historical tags `<old-basename>_v*` would still
exist, and ADR-004's detection algorithm would use the stale tag as
the base commit for the new unit — producing incorrect detection
results.

ADR-003's uniqueness constraint covers current units only, not
historical basenames. This creates a latent tag namespace collision
risk.

**Severity rationale**: `warn` not `fail` because:
1. Unit renames are infrequent.
2. The collision requires a specific sequence (rename + reuse).
3. The plan correctly handles the rename itself; only the reuse
   scenario is unaddressed.

**Fix options**:
1. Add to ADR-003 §4: "A basename previously used by a removed or
   renamed unit MUST NOT be reused by a new unit."
2. Or add a plan Phase 1 validation: "The generator MUST reject a
   basename that matches any existing tag prefix `<basename>_v*` for
   a unit not in the current manifest."
3. Or add a plan edge case note acknowledging this as a known boundary
   requiring operator awareness.

Option 3 is the lightest touch; option 1 is the most architecturally
complete.

### F2 — `warn` — Phase 2 edge case text is internally contradictory

**Location**: plan lines 162–163 vs. 178–183

The Phase 2 acceptance criteria states:

> "Version change without path change: no release detected."

The Phase 2 edge case section states:

> "This scenario is architecturally impossible and is listed for
> completeness. Detection correctly triggers."

The phrase "Detection correctly triggers" can be read as contradicting
the acceptance criterion "no release detected." The intended meaning is
that when someone bumps only the version, the metadata file change IS
a path change, so both conditions are met and detection triggers — but
this is a different scenario than the acceptance criterion describes.

The acceptance criterion tests a hypothetical pure version-change-
without-any-path-change (which per ADR-004 should NOT trigger). The
edge case explains why this hypothetical cannot occur in practice.
The sentence "Detection correctly triggers" describes what actually
happens (version bump = path change + version change → release), not
the hypothetical scenario.

**Fix**: Replace the edge case text (plan lines 178–183) with:

> "**Version change without path change**: the metadata file resides
> under the unit root, so a version-only bump constitutes both a path
> change and a version change. The hypothetical scenario of a pure
> version change without any path change is architecturally impossible
> given the metadata-in-unit-root invariant."

This eliminates the ambiguous "Detection correctly triggers" sentence
and makes the relationship between the hypothetical and the real
scenario explicit.

------------------------------------------------------------------------

## 8. Observations

### O1 — ADR-002 ecosystem extensibility

ADR-002's binary Node/Non-Node classification (package.json vs.
release.toml) is clean for current scope. If future ecosystems (Python,
Rust) join the monorepo, they would use `release.toml` as designed
— the non-Node path is the extensible default. No action needed now;
the observation is recorded for future reference.

### O2 — ADR Context sections are terse

Several ADRs (005, 004, 001) have single-sentence Context sections.
The governance structure template suggests Context should include
problem, constraints, and rejected alternatives. Per the ADR Review
Process: review does not "demand over-specification where intent is
sufficient." The Context sections are adequate for comprehension. No
action needed.

------------------------------------------------------------------------

## 9. Prior Review Findings Verification

The prior review (`0001-release-architecture-implementation-review.md`)
raised 5 findings. Verification of their resolution in the current
plan:

| Prior finding | Severity | Resolution | Verified |
| ------------- | -------- | ---------- | -------- |
| F1 — ADR-001 invariant missing from matrix | `warn` | Row added (plan line 60) | ✓ |
| F2 — Phase 4 Docker status dependency gap  | `fail` | Phase 1 invariant 10 added (plan line 107); matrix row added (line 72) | ✓ |
| F3 — Legacy tag migration lacks ADR traceability | `warn` | Labeled as "Transition concern (not ADR-derived)" (plan line 222) | ✓ |
| F4 — Phase 2 edge case overspecifies | `warn` | Text condensed (plan lines 178–183) | ✓ (but see F2 above for residual issue) |
| F5 — Execution Lock compliance | obs. | Already compliant | ✓ |

All prior findings resolved. F4's resolution introduced a minor
textual issue captured as this review's F2.

------------------------------------------------------------------------

## 10. Summary

| Finding | Severity | Status     | Resolution                                    |
| ------- | -------- | ---------- | --------------------------------------------- |
| F1      | `warn`   | `resolved` | ADR-003 rule added; plan Phase 1 invariant, acceptance criterion, and Phase 3 edge case added |
| F2      | `warn`   | `resolved` | Plan Phase 2 edge case text rewritten         |
| O1      | obs.     | noted      | No action needed                              |
| O2      | obs.     | noted      | No action needed                              |

**Outcome**: Accepted — all findings resolved.

The ADR forest is coherent, well-bounded, and cross-consistent. The
implementation plan faithfully translates ADR invariants into an
executable phased strategy. Both findings have been resolved:
F1 by adding an ADR-003 rule and corresponding plan invariants/validation,
F2 by rewriting the ambiguous edge case text. The plan is ready for
implementation.
