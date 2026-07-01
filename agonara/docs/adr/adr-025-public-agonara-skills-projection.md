---
date: 2026-06-30
model: claude-opus-4-8
status: proposed
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
projection **strips user-specific reference content** and **stamps provenance**
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

### 3. Privacy is owned upstream, with a publish-time backstop

User-specific / personal reference content (calibration notes, recorded scores,
personal preferences, host/instance details) MUST NOT enter the canonical
`agonara/skills/` tree — the upstream authoring rule is the primary mechanism.
The projection additionally scans and fails the publish if any such content
reaches the output — the backstop, not the mechanism of record.

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
  upstream minus the explicit exclusion set — detecting removed skills and failing
  on any unexpected exclusion (mechanism in the spec/plan).
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
- **P6 (privacy, three gates).** (1) User-specific/personal reference data MUST NOT
  be authored into `agonara/skills/`, enforced by an upstream check that fails on
  forbidden content in the source. (2) The projection MUST copy only explicitly
  allowlisted files. (3) The projection MUST scan the staged output and fail the
  publish if any personal data reaches it. A source-minus-output file set that
  differs from the explicit exclusion manifest MUST fail for review (mechanism in
  the spec/plan). The four files named in Context are the current known
  exclusions.
- **P7 (provenance).** Each release MUST record the upstream commit SHA and a
  per-skill-tree content hash in a machine-readable location in the published repo.
  The exact path, schema, and hash algorithm are pinned by the spec/plan (Open
  Questions); P7 requires only that the record exist and be machine-parseable.
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
- **P12 (first-publish precondition).** Repository creation and the first push MUST
  be blocked until the upstream privacy check (P6 gate 1) passes — specifically,
  the four user-specific reference files named in Context MUST be absent from
  `agonara/skills/`. The upstream-hygiene relocation is a prerequisite, not a
  follow-up.

## Consequences

- The role partition becomes a structural property of the source; a consumer stops
  bucketing and cannot mis-route a role's skills. This closes the
  curator-into-student drift path at its origin.
- Distribution becomes release-driven, provenance-pinned, and machine-independent.
  The hand-run copy path is superseded.
- A one-time upstream hygiene pass is required: relocate the four named
  user-specific reference files out of the canonical tree before the first publish,
  so P6's upstream rule holds rather than relying on the scan.
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
- **Changing skill content or the role ontology** beyond relocating personal
  reference files out of the canonical tree.

## Open Questions

1. **Publish trigger / cadence.** CI-on-push to `trunk` versus a manual /
   release-gated publish. The trigger's input set MUST cover the full projection
   inputs — the projected skill folders, the bucket manifest, the projector, the
   privacy allowlist, the provenance schema, and the workflow itself — plus a
   manual-dispatch path, so a change to publication logic cannot leave the public
   repo stale. *Lean:* CI on push to `trunk` over that full input set, emitting a
   pinned provenance-stamped release.
2. **Provenance location / format.** Where the commit SHA and per-tree hashes live
   in the published repo (top-level manifest, per-subfolder file, or release
   metadata) and the hash algorithm.
3. **Shared-foundation dedup mechanics.** How the projection copies the two
   foundations into both subfolders from one source while keeping P4's
   byte-identical guarantee.
