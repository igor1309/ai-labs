---
date: 2026-06-30
model: claude-opus-4-8
status: accepted
description: "Producer-side decision to publish Agonara's operator skills as a deterministic, privacy-scrubbed, provenance-stamped projection from the single upstream agonara/skills/ into a public agonara-skills repo shaped as two source-owned role subfolders (student/, curator/), resolving the distribution question in operator-skill-packaging_pre_adr.md."
---

# ADR-025 — Public Agonara-Skills Projection (Role-Scoped)

## Executive Summary

Agonara's operator skills live in `agonara/skills/` with no published
distribution surface. This ADR decides the **producer half**: a deterministic
publish projection generates a **public** `agonara-skills` repo from the single
upstream `agonara/skills/`, shaped as two **source-owned, flat role subfolders**
— `student/` and `curator/` — so the partition of which skill belongs to which
role is a structural property of the source, never re-derived by a consumer. The
projection **excludes user-specific reference content from the published output**
and **stamps provenance**
(upstream commit SHA + per-skill-tree content hash) so a consumer can install
from an immutable, verifiable release. `agonara/skills/` stays the only edit
point; the public repo is generated, never hand-authored.

Scope boundary: this ADR owns *what is published and how it is shaped, scrubbed,
stamped, and released*. How a consumer installs, seals, reconciles, or advances
its pinned ref is out of scope. This ADR resolves the distribution question
parked in `../skills/operator-skill-packaging_pre_adr.md`; the current consumer's
decisions are recorded separately in
`inventory/vps/Hermes/adr/adr-001-canonical-skill-distribution.md`.

## Context

### Problem

The operator skills are correct and in-repo, but there is no published surface an
operator can install from. The only path onto a running agent today is a hand-run
copy that applies no role filter, so curator content has reached the student
surface. The role partition exists only as a naming convention plus a
`skills/README.md` rule — documented, not structural.

Two facts frame the producer decision:

- **The role partition is a source-of-truth decision.** Which skills make up the
  curator surface versus the student surface is Agonara's role ontology. A
  consumer that re-derives that partition owns a decision it has no business
  owning — and re-derivation is exactly what let curator skills reach the student
  surface.
- **`agonara/skills/` must remain the single edit point.** Any published copy is a
  projection; authoring in two places invites the drift this effort exists to
  remove.

### Constraints

- Consumers pull the artifact without authenticating, so the published repo MUST
  be **public**.
- The canonical tree currently carries **user-specific reference files** —
  `assistant-authored-study-drills/references/user-calibration-notes.md` (a
  recorded "71/100"), `…/user-specific-preferences.md`,
  `…/button-flow-failures.md`, `agonara-coach/references/routing-calibration.md`.
  Publishing these to a public repo would leak personal data.
- A deployed skill folder ships **alone**: a shipped `SKILL.md` MUST NOT reference
  another role's skill or a repo-only `research/`/`docs/` path
  (`agonara/skills/README.md`). Cross-bucket shared rules are
  duplicated-and-guarded, not linked.
- A consumer installs skill folders as **real files** (not symlinks) and scopes to
  a role subfolder, so the published on-disk shape MUST be stable role subfolders.

### Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Flat published repo; consumer buckets via install lists** | Leaks the role-partition decision to the consumer; is how curator skills reached the student surface. The partition belongs in the source. |
| **Two separate repos (one per role)** | Two repos to publish, permission, and keep in lockstep, for no gain over two subfolders a consumer can scope into independently. |
| **Mirror all of `agonara/skills/` verbatim** | Publishes `agonara-admin`, repo-only meta docs, and the user-specific reference files — admin surface and personal data on a public repo. |
| **Author the public repo directly / push by hand** | Two edit points → drift; loses provenance and determinism. The repo MUST be generated from a pinned upstream commit. |
| **Publish the mutable head as the install source** | Gives a consumer no pinned, verifiable artifact. The projection emits an immutable, provenance-stamped release. |

## Decision

### 1. One public repo, two source-owned role subfolders

A deterministic publish projection generates a **public** repo `agonara-skills`
from the single upstream `agonara/skills/`, shaped as two flat subfolders, each
carrying only its bucket:

- `student/`: `agonara-api-access`, `agonara-membership`, `agonara-student`,
  `agonara-coach`, `button-quiz-loop`, `assistant-authored-study-drills`,
  `oral-exam-drills`.
- `curator/`: `agonara-api-access`, `agonara-membership`,
  `agonara-curator-corpus`, `agonara-curator-assessment`,
  `agonara-curator-research`, `agonara-curator-participation`.

Bucket membership is declared by a **source-owned publish manifest** in ai-labs
and realized structurally by the subfolders. `agonara-coach` is in the
**student** bucket (the explaining half of student; co-installs with
`agonara-student` per `skills/README.md`). `agonara-admin` is **not published**
until its placement is decided (Open Questions).

### 2. Shared foundations: one source, projected into both

`agonara-api-access` and `agonara-membership` are authored once in
`agonara/skills/` and copied into both subfolders by the projection as real
files, so the two published copies cannot independently drift and there remains a
single upstream edit point.

### 3. Privacy is owned by the publish boundary

User-specific / personal reference content (calibration notes, recorded scores,
personal preferences, host/instance details) MAY remain in `agonara/skills/` for
the private/self deployment that consumes it, but MUST NOT reach the public
projection. The boundary is drawn by the projection, not by removing content from
source: a single default-deny allowlist publishes only declared skill files —
everything else in a skill folder, the personal reference files included, simply
stays in source unpublished; and personal sections inside an otherwise-shipped
`SKILL.md` are scrubbed from the published copy. An output content scan is the
backstop, not the mechanism of record.

Rationale for keeping the files in source: the allowlist already makes publication
exact — an undeclared file cannot leak — so relocating personal files out of the
tree adds no publication safety while breaking the private deployment that
legitimately reads them. The residual risk the allowlist does not cover is personal
prose *inside a shipped `SKILL.md`*; that is closed by the section scrub, not by
moving files.

### 4. Deterministic, provenance-stamped release

The projection is a pure function of a specific upstream commit. Each release
records the upstream commit SHA and a per-skill-tree content hash, so a consumer
can install from an immutable pinned ref and verify it. Provenance is emitted
unconditionally as a verifiable contract; whether a consumer enforces
verification is the consumer's decision. The public repo is push-only output of
this projection — never edited in place.

### 5. Producer push; consumer pull

The projection is pushed to the public repo from ai-labs CI using a repo PAT
(producer-side outbound push); consumers pull. This ADR owns creating each
immutable, provenance-stamped release; advancing a consumer's pinned ref to a new
release is the consumer's concern.

## Rules / Invariants

- **P1 (single upstream, deterministic projection).** `agonara/skills/` MUST be the
  only edit point. The `agonara-skills` repo MUST be a deterministic projection of
  a specific ai-labs commit and MUST NOT be hand-authored. The projection MUST
  rebuild from a clean staging tree each run and MUST verify the output equals
  exactly the manifest allowlist projection (each bucketed skill's `SKILL.md` plus
  its declared shipped files, foundations in both buckets) — failing if a declared
  skill is absent from source or any file outside the allowlist appears in the
  output (mechanism in the spec/plan).
- **P2 (source-owned partition).** Role-bucket membership MUST be declared by a
  source-side manifest in ai-labs and realized as the `student/` / `curator/`
  subfolder structure. A consumer MUST NOT be required to re-derive it.
- **P3 (bucket membership).** `student/` MUST contain exactly the student bucket
  (incl. `agonara-coach` and the three drill skills); `curator/` exactly the
  curator bucket. No curator/admin skill MAY appear in `student/`. `agonara-admin`
  MUST NOT be published until its placement is decided.
- **P4 (shared foundations).** `agonara-api-access` and `agonara-membership` MUST
  be authored once upstream and projected into both subfolders as **real files**
  (no symlinks); the two published copies MUST be byte-identical to the single
  upstream source.
- **P5 (public, content-scoped).** The published repo MUST be public. Its **role
  payload subfolders** (`student/`, `curator/`) MUST contain only runtime-agnostic
  product content — no host details, IPs, keys, repo-only meta docs, or
  `agonara-admin`. Repository-level metadata is limited to a closed, declared set
  (the P7 provenance manifest, plus `LICENSE`/`README`); nothing else.
- **P6 (privacy, publish boundary).** The boundary MUST be drawn by the projection
  over content that MAY remain in source, by a **single allowlist** — no second
  denylist. (1) **Files:** the projection MUST publish only allowlisted files (each
  skill's `SKILL.md` plus its declared shipped files) and MUST publish nothing else
  under a skill folder; every other file, the personal reference files included,
  stays in source and is not published, by the same default-deny rule. (2)
  **Content:** declared personal sections inside a shipped `SKILL.md` MUST be
  scrubbed from the published copy, so no personal prose and no reference to an
  unpublished file survives in shipped content. (3) **Backstop:** the projection
  MUST scan the staged output and fail the publish if personal data reaches it — the
  backstop, not the mechanism of record (mechanism in the spec/plan).
- **P7 (provenance).** Each release MUST record the upstream commit SHA and a
  per-skill-tree content hash in a machine-readable location in the published repo.
  The exact path, schema, and hash algorithm are pinned by the spec (top-level
  `provenance.json`, `sha256`); P7 requires only that the record exist and be
  machine-parseable.
- **P8 (projection-only, enforced).** The public repo MUST be written only by the
  projection (push), never edited in place, and the producer push MUST NOT require
  an inbound deploy key on any consumer. Write access MUST be restricted to the
  projection's CI identity, with protected branches/tags and a publish-time
  rejection of target history not descended from the last release (mechanism in
  the spec/plan).
- **P9 (projection contract checks).** A publish MUST be gated by checks over the
  **generated output**, not only the existing in-repo parity test: projected
  directory names MUST match the source manifest (P3); both shared-foundation
  copies MUST be byte-identical to upstream (P4); the duplicate-and-guard parity
  and route-citation guarantees MUST hold on the projected trees; and every shipped
  `SKILL.md` link MUST resolve within its own role subfolder (P10). The existing
  `agonara/tests/operator-skill-contract.test.js` MUST also pass but is not
  sufficient alone (mechanism in the spec/plan).
- **P10 (no dangling links in shipped skills).** A projected `SKILL.md` MUST NOT
  reference another role's skill or a repo-only `research/`/`docs/` path.
- **P11 (atomic, pinned publish).** Publication MUST be atomic: the projection
  validates the manifest + per-tree hashes in staging, commits them with the
  payload, and publishes an immutable, protected tag at that commit. That
  tag/commit is the release identity a consumer pins to and MUST NOT be moved after
  publication.
- **P12 (withdrawn — 2026-07-01 revision).** The earlier first-publish precondition
  (relocate the four user-specific reference files out of `agonara/skills/` before
  first publish) is withdrawn. Under the P6 publish boundary the files MAY remain in
  source — the private deployment consumes them — and are excluded from publication
  by the allowlist, so no relocation is required. See Revision history.

## Consequences

- The role partition becomes a structural property of the source; a consumer stops
  bucketing and cannot mis-route a role's skills. This closes the
  curator-into-student drift path at its origin.
- Distribution becomes release-driven, provenance-pinned, and machine-independent.
  The hand-run copy path is superseded.
- No upstream hygiene pass or source relocation is required: the four user-specific
  reference files remain in `agonara/skills/` for the private deployment and are
  excluded from the public projection by the P6 allowlist, while the projection
  scrubs the personal section that references them from the published `SKILL.md`.
- Publishing depends on a new repo PAT secret in ai-labs CI and an existing public
  `agonara-skills` repo (created out of band).
- Future extension: a third bucket for `agonara-admin` if it is decided to reach a
  consumer; the manifest + subfolder pattern extends to it without reshaping the
  projection.

## Non-Goals

- **Consumer install, seal, reconciliation, rollback, migration, and pin
  advancement** — the consumer's concern (for the current consumer, inventory
  ADR-001).
- **`agonara-admin` placement** — deferred; not published here.
- **Memory durability / off-host backup** — separate, held companion ADR.
- **A Claude Code plugin marketplace** (`marketplace.json`, prefix-dropping) — the
  public repo is a set of role-scoped skill folders, not an installable plugin
  marketplace.
- **Changing skill content or the role ontology.** The canonical `agonara/skills/`
  tree is not edited; the projection transforms only the published copy (the
  declared section scrub).

## Open Questions

All three are **resolved in the spec**
([`../specs/agonara-skills-public-projection.md`](../specs/agonara-skills-public-projection.md));
recorded here with their resolutions for provenance.

1. **Publish trigger / cadence.** *Resolved:* CI on push to `trunk` over the full
   projection-input set (skill folders, the bucket manifest, the projector, the
   allowlist manifest, the provenance schema, and the workflow itself) plus a
   `workflow_dispatch` path, emitting a pinned provenance-stamped release (spec R12).
2. **Provenance location / format.** *Resolved:* a single top-level `provenance.json`
   carrying the upstream commit SHA and per-tree `sha256` hashes (spec R7).
3. **Shared-foundation dedup mechanics.** *Resolved:* the projection copies the one
   upstream foundation folder into both subfolders as byte-identical real files
   (no symlinks), verified by tree-hash equality (spec R4).

## Revision history

- **2026-07-01 — privacy model shifted from source-relocation to publish-boundary.**
  The original ADR required the four user-specific reference files to be relocated
  out of `agonara/skills/` before the first publish (P12) and framed the upstream
  authoring rule as the primary privacy mechanism (P6 gate 1). On review this was
  redundant given the default-deny allowlist — which already makes publication
  exact — and it broke the private/self deployment that legitimately reads those
  files. P6 was reframed as a publish boundary (allowlist for files + section scrub
  for personal prose inside a shipped `SKILL.md` + output-scan backstop), P12 was
  withdrawn, and the "one-time hygiene pass" consequence was removed. Net effect:
  the files stay in source; nothing personal reaches the public projection. Edited
  in place per the ADR review standard (§6 applies to accepted ADRs).
- **2026-07-01 — accepted after review.** Reviewed against the arch-doc-review
  checklist and the ADR review standard's five dimensions. Two findings fixed before
  acceptance: P1 still described "upstream minus the explicit exclusion set" (stale
  two-list language) — reworded to the single-allowlist projection to match P6/spec
  R1; and the three Open Questions were marked resolved with pointers to the spec
  (P7 no longer defers provenance format to an open question). Status `proposed →
  accepted`.
