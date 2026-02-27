# Review: Release Architecture ADRs (ADR-000 through ADR-006)

Date: 2026-02-27

---

## Scope

Review of all seven release architecture ADRs added in commit `a2f5f8d`.
Evaluated per the ADR Review Process for release architecture across
four dimensions: Intent Integrity, Boundary Clarity, Cross-ADR
Consistency, and Decision Stability.

Review scope is strictly the ADR documents themselves and their internal
consistency as an architectural design.

---

## ADR-000 --- Release Architecture Overview

### I. Intent Integrity — pass

The executive summary accurately reflects the decision: independent,
trunk-only, semver-based, tag-driven releases with deterministic CI
validation. The decision section matches. The rationale (deterministic,
automation-friendly, drift-resistant) is clear and well-motivated for a
multi-unit monorepo.

### II. Boundary Clarity — pass

Scope is system-level overview with explicit delegation to child ADRs
for details. Non-Goals are well-chosen (changelog enforcement, commit
conventions, signing/SBOM, deployment strategy) and prevent adjacent
policy creep.

### III. Cross-ADR Consistency — pass

Each rule maps to a specific child ADR. The references are accurate:
tag contract → ADR-003, release detection → ADR-004, discovery →
ADR-005. Terminology is consistent with child ADRs.

### IV. Decision Stability — pass

Stable under foreseeable evolution. Adding new unit types or ecosystems
extends the model without invalidating it. The only destabilizing change
would be abandoning independent releases for a global train, which the
Non-Goals exclude.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that the
   monorepo uses independent, trunk-only, semver-based, tag-driven
   releases with deterministic CI validation, delegating specifics to
   child ADRs.
2. **Primary risk:** Low. As an overview, it depends entirely on child
   ADR coherence. No independent risk surface.

---

## ADR-001 --- Independent Release Units & Trunk Policy

### I. Intent Integrity — pass

Summary matches decision: independent versioning per unit, trunk-only
releases. Solves a real tension — coupled release trains in a monorepo
introduce unnecessary blocking and coordination risk.

### II. Boundary Clarity — pass

Rules are precise and use enforceable language. "Release branches MUST
NOT be used" is unambiguous. "A version bump MUST be the explicit signal
of release intent" cleanly separates intent from detection mechanics
(which ADR-004 owns).

### III. Cross-ADR Consistency — pass

Consistent with ADR-000 (trunk-only, independent units), ADR-004
(version change as release signal), and ADR-002 (each unit owns its
version). No terminology drift.

### IV. Decision Stability — pass

Stable. The only invalidating change would be re-introducing a global
release train, which the Non-Goals explicitly exclude. Trunk-only is a
strong, well-understood constraint.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that each
   release unit is versioned and released independently, with releases
   occurring only from trunk and version bumps as the explicit release
   signal.
2. **Primary risk:** Low. The decision is well-bounded and
   self-consistent.

---

## ADR-002 --- Canonical Version Metadata Policy

### I. Intent Integrity — pass

Clear decision: Node units use `package.json`, non-Node use
`release.toml`, exactly one per unit, semver mandatory. Solves the
mixed-ecosystem version source problem without inventing a custom format.

### II. Boundary Clarity — pass

The mutual exclusion rule ("A unit MUST NOT contain both") eliminates
ambiguity about which file is canonical. Non-Goal ("Ecosystem-specific
publishing rules") prevents scope creep into npm/Docker publishing
details.

### III. Cross-ADR Consistency — pass

Consistent with ADR-004 ("Canonical version changed since base" — this
ADR defines what "canonical version" means), ADR-005 ("Each unit MUST
contain exactly one canonical metadata file" — same invariant), and
ADR-001 ("Each release unit MUST have its own version" — this ADR
defines where that version lives).

### IV. Decision Stability — pass

Stable unless a third ecosystem type requires a different metadata file,
which would be a natural extension via amendment rather than
invalidation.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that each
   release unit has exactly one canonical version source (`package.json`
   for Node, `release.toml` for non-Node), with semver mandatory and
   dual-source prohibited.
2. **Primary risk:** Low. The two-file-type model covers foreseeable
   ecosystem needs.

---

## ADR-003 --- Tagging Convention

### I. Intent Integrity — pass

Clear, minimal decision: tags follow `<basename>_v<version>`, basenames
equal directory basenames, globally unique. Solves the collision-free
namespace requirement for independent unit releases.

### II. Boundary Clarity — warn

**W1 (nested unit basename derivation):** The rule "`<basename>` MUST
equal unit directory basename" is clear for top-level directories. For
nested unit paths (e.g., `oracle/apps/am-i-done-web`), "directory
basename" could mean `am-i-done-web` (leaf) or something else. The
intent is likely leaf, but it should be explicit.

**Fix:** Add: "Basename is the leaf directory name of the unit root
path (e.g., `oracle/apps/am-i-done-web` → basename `am-i-done-web`)."

### III. Cross-ADR Consistency — pass

ADR-004 references "last matching tag for unit" with glob
`<basename>_v*` — consistent. ADR-005 enforces basename uniqueness —
consistent. ADR-006 references `<basename>_v<version>` for Docker git
tag correspondence — consistent.

### IV. Decision Stability — warn

**W2 (underscore separator ambiguity):** If a unit basename ever
contains an underscore (e.g., `my_service`), the tag
`my_service_v1.0.0` is ambiguous: basename `my_service` with version
`1.0.0`, or basename `my` with invalid remainder? The `_v` separator
only works unambiguously if basenames do not contain underscores.

**Fix:** Either: (a) add a rule "Basenames MUST NOT contain
underscores", or (b) document that the last `_v` occurrence is the
separator (rightmost match).

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that git
   tags follow `<basename>_v<version>` where basename equals the unit's
   directory name, and basenames are globally unique.
2. **Primary risk:** Underscore ambiguity in the `_v` separator if
   basenames contain underscores.
3. **Cross-ADR observation:** The glob `<basename>_v*` in ADR-004
   depends on basenames being underscore-free (or on rightmost-match
   parsing). This implicit assumption should be made explicit.

---

## ADR-004 --- Release Detection Algorithm

### I. Intent Integrity — pass

Clear decision: detect releases via last-tag diff and version change
gating. Solves the idempotent detection problem with a dual-condition
gate (path changed AND version changed).

### II. Boundary Clarity — warn

**W3 (first release edge case):** The rule "Base commit MUST be last
matching tag for unit" does not define behavior when no matching tag
exists (first release of a new unit). This is a practical edge case
every unit will hit exactly once.

**Fix:** Add a rule: "If no matching tag exists for a unit, the base
MUST be [empty tree / initial repo commit]" — whichever the intended
semantics.

### III. Cross-ADR Consistency — pass

Logically coherent chain: discovery (ADR-005) identifies units → tag
lookup (ADR-003 `<basename>_v*` glob) finds base → detection (this ADR)
compares path + version → release. ADR-002 defines what "canonical
version" means. No gaps.

### IV. Decision Stability — pass

Stable. Content-based change detection is explicitly a Non-Goal, which
prevents the most likely source of future complexity. The dual gate
(path + version) is a clean, well-understood pattern.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that
   release detection compares files and version against the last
   matching tag, requiring both path changes and version changes to
   trigger a release.
2. **Primary risk:** No defined behavior for first-ever release of a
   unit (no prior tag exists).

---

## ADR-005 --- Release Unit Discovery & Validation

### I. Intent Integrity — pass

Clear decision: config-driven discovery via `release-units.config.toml`,
committed manifest via `release-units.toml`, CI drift detection. Solves
the implicit auto-discovery drift problem.

### II. Boundary Clarity — pass

Non-Goal ("Fully dynamic discovery") cleanly prevents auto-discovery
drift. Rules are precise: configured prefixes, committed output, CI
validation, one metadata file per unit.

### III. Cross-ADR Consistency — pass

Consistent with ADR-002 (each unit has exactly one canonical metadata
file — same invariant restated as a discovery validation rule) and
ADR-003 (basename uniqueness — discovery enforces the same invariant
from the registration side). The discovery → detection chain is coherent.

### IV. Decision Stability — pass

Stable. The generator pattern accommodates new unit types, new
prefixes, and new metadata file types without architectural change.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that
   release units are discovered via a config-driven generator producing
   a committed manifest, with CI enforcing drift detection.
2. **Primary risk:** Low. The config-driven approach is well-bounded.

---

## ADR-006 --- Docker Image Tagging Policy

### I. Intent Integrity — pass

Clear decision: two tags per image (semver + git SHA) for rollback and
traceability. Solves the immutable reference requirement for container
deployments.

### II. Boundary Clarity — warn

**W4 (applicability not scoped):** The ADR does not state which units
it applies to. As written, it reads as applying to all release units.
Not all units will produce Docker images. The policy should scope itself
to units that produce images.

**Fix:** Add to section 2 (Context) or as a new Applicability section:
"This policy applies to release units that produce Docker images."

### III. Cross-ADR Consistency — pass

"Git tag MUST correspond to `<basename>_v<version>`" is consistent with
ADR-003. "Image version MUST match canonical semver" aligns with
ADR-002. No terminology drift.

### IV. Decision Stability — pass

Stable. Multi-arch build policy is explicitly excluded as a Non-Goal.
The two-tag model (version + SHA) is a well-understood industry pattern.

### Review Summary Block

1. **Decision restatement:** I understand this ADR to decide that Docker
   images are tagged with both the semver version and the git commit
   SHA for rollback safety and traceability.
2. **Primary risk:** Missing applicability scope — without it, the
   policy appears to apply to non-Docker units.

---

## Cross-Forest Summary

### All findings

| ID | Severity | ADR | Finding |
|----|----------|-----|---------|
| W1 | warn | 003 | Nested unit basename derivation rule implicit, not explicit |
| W2 | warn | 003 | Underscore in basenames creates `_v` separator parsing ambiguity |
| W3 | warn | 004 | First release behavior (no prior matching tag) undefined |
| W4 | warn | 006 | Applicability to Docker-producing units not scoped |

### Overall assessment

The ADR forest is **architecturally sound and internally consistent**.
The seven documents form a coherent chain: overview (000) → unit
independence (001) → version source (002) → tag namespace (003) →
release detection (004) → unit discovery (005) → image tagging (006).

Cross-ADR references are accurate. Terminology is consistent across
documents. No internal contradictions found. Non-Goals are well-chosen
and prevent adjacent policy creep.

The four warnings are minor precision gaps, each addressable with a
single sentence or rule addition. None are structural.

### Verdict

**Pass with four minor warnings.** The ADR set is ready for adoption
after addressing W1–W4.
