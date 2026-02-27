# Review: Release Architecture ADRs (ADR-000 through ADR-006)

Date: 2026-02-27

---

## Scope

Review of all seven release architecture ADRs added in commit `a2f5f8d`.
Evaluated per the ADR Review Process for release architecture.

---

## ADR-000 --- Release Architecture Overview

### I. Intent Integrity — pass

The executive summary accurately reflects the decision: independent,
trunk-only, semver-based, tag-driven releases. The decision section
matches. The rationale (deterministic, automation-friendly, drift-resistant)
is clear and well-motivated.

### II. Boundary Clarity — pass

Scope is system-level overview with explicit delegation to child ADRs.
Non-Goals are well-chosen (changelog enforcement, commit conventions,
signing/SBOM, deployment strategy) and prevent adjacent policy creep.

### III. Cross-ADR Consistency — warn

**W1 (tag format vs. existing release infrastructure):** ADR-000 rule
"Tags MUST follow the defined tag contract (see ADR-003)" implies
`<basename>_v<version>` format. However, the existing `release.yml`
(line 6) triggers on `v*` tags and the verify job (line 36-46) checks
`v${version}` against root `package.json`. CLAUDE.md (line 125) also
says "release tag `vX.Y.Z`". The log (`docs/log.md`) records releases
as `v0.2.0`, `v0.1.5`, etc. The ADR forest defines a tag contract that
contradicts the running system.

**Fix:** ADR-000 should explicitly acknowledge the migration from `v*`
to `<basename>_v*` as a transition concern, or ADR-003 should document
the current `v*` format as a valid legacy pattern for the root unit.

### IV. Decision Stability — pass

Stable under foreseeable evolution. Adding new unit types or ecosystems
would not invalidate the overview — they extend it.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that the
   monorepo uses independent, trunk-only, semver-based, tag-driven
   releases with deterministic CI validation.
2. **Primary risk:** The tag contract (ADR-003 `<basename>_v*`) is not
   aligned with the running release pipeline (`v*`). Adopting the ADRs
   without a migration plan creates an immediate contradiction.
3. **Cross-ADR observation:** The overview is internally consistent with
   the child ADRs it references. The inconsistency is between the ADR
   forest and the deployed system.

---

## ADR-001 --- Independent Release Units & Trunk Policy

### I. Intent Integrity — pass

Summary matches decision: independent versioning per unit, trunk-only
releases. Solves a real tension (coupled release trains in a monorepo).

### II. Boundary Clarity — pass

Rules are precise. "Release branches MUST NOT be used" is unambiguous.
"A version bump MUST be the explicit signal of release intent" clearly
separates intent from detection.

### III. Cross-ADR Consistency — warn

**W2 (monolithic pipeline contradiction):** ADR-001 declares each unit
is released independently. The current `release.yml` is a monolithic
pipeline: one tag triggers verify → core → smoke → e2e → deploy (worker
+ web) for all deployables. There is no per-unit pipeline dispatch.

This is an architectural intent vs. implementation gap. The ADR is
valid as target architecture, but should acknowledge the current state.

**Fix:** Add a sentence to Context or Consequences noting that the
existing pipeline is monolithic and will require decomposition to
realize independent release units.

### IV. Decision Stability — pass

Stable. The only invalidating change would be re-introducing a global
release train, which the Non-Goals explicitly exclude.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that each
   release unit is versioned and released independently, with releases
   occurring only from trunk.
2. **Primary risk:** The existing CI pipeline does not implement per-unit
   independence. Without a migration note, this ADR could be read as
   describing current state rather than target architecture.
3. **Cross-ADR observation:** Consistent with ADR-000 and ADR-004.

---

## ADR-002 --- Canonical Version Metadata Policy

### I. Intent Integrity — pass

Clear decision: Node units use `package.json`, non-Node use
`release.toml`, one source per unit, semver mandatory. Solves the
mixed-ecosystem version source problem.

### II. Boundary Clarity — warn

**W3 (root package.json ambiguity):** The root `package.json` (v0.2.0)
currently serves dual roles: npm workspace definition and release version
source (release.yml verifies tags against it). If the root is a release
unit, its basename and relationship to child units (e.g., `nomos` at
v0.6.0) is undefined. If the root is NOT a release unit, the current
release pipeline's version check is invalidated.

**Fix:** Clarify whether the root `package.json` is a canonical version
source for a release unit, or purely a workspace manifest. If the former,
define which unit it represents.

### III. Cross-ADR Consistency — pass

Consistent with ADR-004 (version change gating) and ADR-005 (one
metadata file per unit). The `release.toml` choice is forward-looking
and non-contradictory.

### IV. Decision Stability — pass

Stable unless a third ecosystem type requires a different metadata file,
which would be a natural extension via amendment.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that each
   release unit has exactly one canonical version source (`package.json`
   for Node, `release.toml` for non-Node), with semver mandatory.
2. **Primary risk:** The root `package.json` role is ambiguous — it
   currently functions as both workspace manifest and release version
   source, which is not addressed by the ADR.
3. **Cross-ADR observation:** None beyond the root ambiguity.

---

## ADR-003 --- Tagging Convention

### I. Intent Integrity — pass

Clear, minimal decision: tags are `<basename>_v<version>`, basenames are
directory names, globally unique.

### II. Boundary Clarity — warn

**W4 (nested unit basenames undefined):** The rule "`<basename>` MUST
equal unit directory basename" is clear for top-level directories
(`nomos`, `loki`). For nested structures like `oracle/apps/am-i-done-web`,
the "directory basename" would be `am-i-done-web`. This should be
explicit — does it mean the leaf directory name?

**Fix:** Add: "Basename is the leaf directory name of the unit root
(e.g., `oracle/apps/am-i-done-web` → basename `am-i-done-web`)."

### III. Cross-ADR Consistency — fail

**F1 (tag format contradicts deployed system):** As noted in ADR-000 W1,
the entire existing tag history uses `v<version>` format (e.g., `v0.2.0`).
The release pipeline triggers on `v*` and validates `v${version}`.
CLAUDE.md mandates `vX.Y.Z`. This ADR mandates `<basename>_v<version>`.

This is the most significant cross-document inconsistency in the ADR set.
Without a migration strategy, deploying these ADRs creates an immediate
contradiction with the running system and with CLAUDE.md.

**Fix:** One of:
- (a) Document `v<version>` as the legacy/root-unit tag format and
  `<basename>_v<version>` as the multi-unit format, with a migration
  timeline.
- (b) Add a Supersedes or Migration section acknowledging that adoption
  requires updating `release.yml` and CLAUDE.md.

### IV. Decision Stability — pass

The `<basename>_v<version>` convention is sound for a multi-unit monorepo.
Stable unless basenames are allowed to contain underscores (which would
create parsing ambiguity with the `_v` separator).

**Observation:** If a unit basename ever contains an underscore (e.g.,
`my_service`), the tag `my_service_v1.0.0` becomes ambiguous: is the
basename `my_service` or `my`? Consider documenting that basenames MUST
NOT contain underscores, or switch to a different separator.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that git
   tags follow `<basename>_v<version>` where basename equals the unit's
   directory name, and basenames are globally unique.
2. **Primary risk:** Direct contradiction with the existing `v*` tag
   format used by release.yml and CLAUDE.md. This is a blocking
   inconsistency for adoption.
3. **Cross-ADR observation:** Potential parsing ambiguity if basenames
   contain underscores.

---

## ADR-004 --- Release Detection Algorithm

### I. Intent Integrity — pass

Clear decision: detect releases via last-tag diff + version change
gating. Solves the idempotent detection problem.

### II. Boundary Clarity — warn

**W5 (first release edge case):** The rule "Base commit MUST be last
matching tag for unit" does not define behavior when no matching tag
exists (first release of a new unit). Is the base the repo root commit?
The beginning of the unit's path history? Undefined behavior on first
release is a practical gap.

**Fix:** Add a rule: "If no matching tag exists, the base MUST be [the
initial commit / the commit that introduced the unit / empty tree]."

### III. Cross-ADR Consistency — pass

Consistent with ADR-003 (tag lookup via `<basename>_v*` glob) and
ADR-002 (canonical version as gating signal). Logically sound chain:
discovery (ADR-005) → tag lookup (ADR-003) → detection (ADR-004) →
release.

### IV. Decision Stability — pass

Stable. Content-based detection is explicitly a Non-Goal, which prevents
the most likely source of future complexity.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that release
   detection compares files and version against the last matching tag,
   requiring both path changes and version changes to trigger a release.
2. **Primary risk:** No defined behavior for first-ever release of a
   unit (no prior tag exists).
3. **Cross-ADR observation:** None.

---

## ADR-005 --- Release Unit Discovery & Validation

### I. Intent Integrity — pass

Clear decision: config-driven discovery via `release-units.config.toml`,
committed manifest via `release-units.toml`, CI drift detection.

### II. Boundary Clarity — pass

Non-Goal ("Fully dynamic discovery") cleanly prevents auto-discovery
drift. Rules are precise: configured prefixes, committed output, CI
validation.

### III. Cross-ADR Consistency — pass

Consistent with ADR-002 (each unit has exactly one canonical metadata
file) and ADR-003 (basename uniqueness invariant). The discovery →
validation → detection chain is logically coherent.

### IV. Decision Stability — pass

Stable. The generator pattern accommodates new unit types without
architectural change.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that release
   units are discovered via a config-driven generator producing a
   committed manifest, with CI enforcing drift detection.
2. **Primary risk:** Low. The config-driven approach is well-bounded.
3. **Cross-ADR observation:** None.

---

## ADR-006 --- Docker Image Tagging Policy

### I. Intent Integrity — pass

Clear decision: two tags per image (semver + git SHA) for rollback and
traceability.

### II. Boundary Clarity — warn

**W6 (applicability unclear):** The current release pipeline deploys to
Cloudflare Workers and Pages — no Docker images are built or pushed. The
ADR does not state which units it applies to. Only Nomos (which has a
`docker-compose.yml`) appears to be a Docker-based unit.

**Fix:** Add a Scope or Applicability section: "This policy applies to
release units that produce Docker images (e.g., units with a Dockerfile
in their root)."

### III. Cross-ADR Consistency — pass

The rule "Git tag MUST correspond to `<basename>_v<version>`" is
consistent with ADR-003. The "Image version MUST match canonical semver"
aligns with ADR-002.

### IV. Decision Stability — pass

Stable. Multi-arch build is explicitly excluded as a Non-Goal.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that Docker
   images are tagged with both the semver version and the git commit SHA.
2. **Primary risk:** No statement of which units this applies to. Without
   scoping, it reads as applying to all units, most of which do not
   produce Docker images.
3. **Cross-ADR observation:** None.

---

## Cross-Forest Summary

### Findings requiring resolution before merge

| ID | Severity | ADR | Finding |
|----|----------|-----|---------|
| F1 | fail | 003 | Tag format `<basename>_v<version>` contradicts existing `v*` tags, release.yml, and CLAUDE.md |

### Findings recommended for resolution

| ID | Severity | ADR | Finding |
|----|----------|-----|---------|
| W1 | warn | 000 | No migration acknowledgment for tag format change |
| W2 | warn | 001 | Monolithic pipeline contradicts independent release claim |
| W3 | warn | 002 | Root `package.json` dual role (workspace manifest vs. version source) undefined |
| W4 | warn | 003 | Nested unit basename derivation rule unclear |
| W5 | warn | 004 | First release (no prior tag) behavior undefined |
| W6 | warn | 006 | Applicability to Docker-producing units not scoped |

### Structural observation

The ADR forest describes a target architecture that differs materially
from the current running system. The ADRs are internally consistent as a
design, but the gap between design and deployed state needs to be
acknowledged — either via a migration ADR, a transition section in
ADR-000, or explicit "Status: Proposed" markers on each ADR.

### Overall verdict

The architectural design is sound and internally coherent. The primary
blocker is the tag format contradiction (F1), which affects ADR-003 and
ripples into ADR-000. The five warnings are addressable with small,
targeted edits. Once F1 is resolved and warnings are addressed, the ADR
set is ready for adoption.
