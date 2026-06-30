---
date: 2026-06-30
model: claude-opus-4-8
status: proposed
description: "Producer-side decision to publish Agonara's operator skills as a deterministic, privacy-scrubbed, provenance-stamped projection from the single upstream agonara/skills/ into a public agonara-skills tap repo shaped as two source-owned role subfolders (student/, curator/), resolving the distribution question in operator-skill-packaging_pre_adr.md; counterpart to the consumer-side inventory ADR-001."
---

# ADR-025 — Public Agonara-Skills Projection (Role-Scoped Tap)

## Executive Summary

Agonara's operator skills live in `agonara/skills/` with no published distribution
surface — `operator-skill-packaging_pre_adr.md` parked "where do the skills get
published and how does an operator obtain them" as its open question. The Hermes
deployment that consumes them resolved its half in
`inventory/vps/Hermes/adr/adr-001-canonical-skill-distribution.md`: install the
skills as a managed **tap** from a public `agonara-skills` GitHub repo, with the
host bucketing nothing.

This ADR decides the **producer half**: a deterministic **publish projection**
generates the public `agonara-skills` repo from the single upstream
`agonara/skills/`. The repo is shaped as two **source-owned, flat role
subfolders** — `student/` and `curator/` — so the "which skill belongs to which
role" partition is a structural property of the source of truth, never re-derived
on the host. The projection **strips user-specific reference content** (no
personal data on a public repo) and **stamps provenance** (the upstream commit
SHA + per-skill-tree content hash) so the host can install from a pinned, verified
release. `agonara/skills/` stays the only edit point; the public repo is generated,
never hand-authored.

Scope boundary: this ADR owns *what is published and how it is shaped, scrubbed,
and stamped*. Host install, the management-interface seal, reconciliation, and
migration are owned by inventory ADR-001. This ADR supersedes the distribution
question in `operator-skill-packaging_pre_adr.md`.

## Context

### Problem

The operator skills are correct and in-repo, but there is no way for an operator
(or the Hermes bots) to *obtain* them except a hand-run `scp` push
(`inventory/vps/Hermes/scripts/deploy-agonara-skills.sh`). That push copies
**every** skill to **every** profile tree with no role filter, which is how curator
content drifted into the student tree. The role partition exists only as a naming
convention plus a `skills/README.md` rule — documented, not structural.

Two facts frame the producer decision:

- **The role partition is a product/source-of-truth decision.** Which skills make
  up the curator surface vs the student surface is Agonara's role ontology. A
  consumer that re-derives that partition (e.g. a flat skill pile plus per-profile
  install lists) owns a decision it has no business owning — and that re-derivation
  is exactly what let curator skills reach the student bot.
- **`agonara/skills/` must remain the single edit point.** Any published copy is a
  projection; authoring in two places invites drift, which is the failure this
  whole effort exists to remove.

### Constraints

- The consuming host has **no git auth** and pulls outbound only (inventory D6/D7),
  so the published repo MUST be **public**.
- The canonical tree currently carries **user-specific reference files** —
  `assistant-authored-study-drills/references/user-calibration-notes.md` (a recorded
  "71/100"), `…/user-specific-preferences.md`, `…/button-flow-failures.md`,
  `agonara-coach/references/routing-calibration.md`. Publishing these to a public
  repo would leak personal data.
- A deployed skill folder ships **alone**: a shipped `SKILL.md` MUST NOT reference
  another role's skill or a repo-only `research/`/`docs/` path
  (`agonara/skills/README.md`). Cross-bucket shared rules are duplicated-and-guarded,
  not linked.
- The host installs by **tap**, which needs real skill files in the published repo
  (not symlinks) and a stable on-disk shape it can scope per profile.

### Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Flat published repo; host buckets via install lists** | Leaks the role-partition decision to the consumer; is how curator skills reached the student tree. The partition belongs in the source. |
| **Two separate repos (one per role)** | Two repos to publish, permission, and keep in lockstep, for no gain over two subfolders in one repo. Retained only as the fallback if Hermes cannot scope a tap to a subfolder (Open Questions). |
| **Mirror all of `agonara/skills/` verbatim** | Publishes `agonara-admin`, repo-only meta docs (`operator-skill-packaging_pre_adr.md`, `claude-code-plugin-system.md`, `README.md` repo-only sections), and the user-specific reference files — admin surface and personal data on a public repo. |
| **Author the public repo directly / push-on-demand by hand** | Two edit points → drift; loses provenance and determinism. The repo MUST be generated from a pinned upstream commit. |
| **Track the mutable head as the install source** | Gives the host no pinned, verifiable artifact. The projection emits a pinned, provenance-stamped release (consumed under inventory D8). |

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

Bucket membership is declared by a **source-owned publish allowlist/manifest** in
ai-labs and realized structurally by the subfolders. `agonara-coach` is in the
**student** bucket (the "explaining half" of student; co-installs with
`agonara-student` per `skills/README.md`). `agonara-admin` is **not published**
until its placement is decided (Open Questions; inventory Open Q #3).

### 2. Shared foundations: one source, projected into both

`agonara-api-access` and `agonara-membership` are authored once in
`agonara/skills/` and **copied into both subfolders by the projection** as real
files, so the two published copies cannot independently drift and there remains a
single upstream edit point.

### 3. Privacy is owned upstream, with a publish-time backstop

User-specific / personal reference content (calibration notes, recorded scores,
personal preferences, host/instance details) MUST NOT enter the canonical
`agonara/skills/` tree — this is an **upstream authoring rule**, the primary
mechanism. The projection additionally runs a **publish-time allowlist + scan**
that excludes such files and **fails the publish** if any are detected in the
output — the backstop, not the mechanism of record.

### 4. Deterministic projection, pinned and provenance-stamped

The projection is a pure function of a specific upstream commit. Each published
release records the **ai-labs commit SHA** it was projected from and a
**per-skill-tree content hash**, so the host can install from an immutable pinned
ref and verify it before activation (inventory D1/D8). The public repo is push-only
output of this projection — never edited in place.

### 5. Producer push; consumer pull

The projection is pushed to the public repo from ai-labs CI using a repo PAT
(producer-side outbound push). This does not require, and MUST NOT introduce, any
**inbound** key on the Hermes host — the host pulls (inventory D7). The host-side
tap registration, seal, reconciliation, and migration are out of scope here and
owned by inventory ADR-001.

## Rules / Invariants

- **P1 (single upstream, deterministic projection).** `agonara/skills/` MUST be the
  only edit point. The `agonara-skills` repo MUST be a deterministic projection of a
  specific ai-labs commit and MUST NOT be hand-authored.
- **P2 (source-owned partition).** Role-bucket membership MUST be declared by a
  source-side manifest in ai-labs and realized as the `student/` / `curator/`
  subfolder structure. The consumer MUST NOT be required to re-derive it.
- **P3 (bucket membership).** `student/` MUST contain exactly the student bucket
  (incl. `agonara-coach` and the three drill skills); `curator/` exactly the
  curator bucket. No curator/admin skill MAY appear in `student/`. `agonara-admin`
  MUST NOT be published until its placement is decided.
- **P4 (shared foundations).** `agonara-api-access` and `agonara-membership` MUST be
  authored once upstream and projected into both subfolders as **real files**
  (no symlinks); the two published copies MUST be byte-identical to the single
  upstream source.
- **P5 (public, content-only).** The published repo MUST be public and MUST contain
  only runtime-agnostic product content — no host details, IPs, keys, repo-only
  meta docs, or `agonara-admin`.
- **P6 (privacy owned upstream + backstop).** User-specific/personal reference data
  MUST NOT be authored into `agonara/skills/`. The projection MUST additionally
  exclude such files by allowlist/scan and MUST fail the publish if any reach the
  output. The known files to exclude are the four named in Context.
- **P7 (provenance).** Each release MUST record the upstream commit SHA and a
  per-skill-tree content hash, in a defined, machine-readable location in the
  published repo.
- **P8 (projection-only, outbound-only).** The public repo MUST be written only by
  the projection (push), never edited in place; the producer push MUST NOT require
  an inbound deploy key on the consuming host.
- **P9 (parity gate).** `agonara/tests/operator-skill-contract.test.js` MUST pass
  before a publish; the projection MUST NOT break the duplicate-and-guard parity or
  route-citation guarantees.
- **P10 (no dangling links in shipped skills).** A projected `SKILL.md` MUST NOT
  reference another role's skill or a repo-only `research/`/`docs/` path.

## Consequences

- The role partition becomes a **structural property of the source**; the host
  stops bucketing and cannot mis-route a role's skills. This closes the
  curator-into-student drift path at its origin.
- Distribution becomes release-driven, provenance-pinned, and Mac-independent. The
  hand-run three-tree `scp` push is superseded (its retirement is staged by
  inventory ADR-001 §6, after the managed path is proven).
- A **one-time upstream hygiene pass** is required: relocate the four named
  user-specific reference files out of the canonical tree (to memory/host or
  anonymize) before the first publish, so P6's upstream rule holds rather than
  relying on the scan.
- Publishing depends on a **new repo PAT secret** in ai-labs CI and an existing
  public `agonara-skills` repo (created out of band).
- Future extension: a third bucket for `agonara-admin` if/when it is decided to
  reach a live profile (Open Questions); the manifest + subfolder pattern extends
  to it without reshaping the projection.

## Non-Goals

- **Host install, the `skills`/`skill_manage` seal, reconciliation, rollback, and
  migration** — owned by inventory ADR-001.
- **`agonara-admin` placement** — deferred (inventory Open Q #3); not published here.
- **The Hermes subfolder-tap capability decision** — verified on the host
  (inventory gate 1a); this ADR builds for one-repo-two-subfolders with a two-repo
  fallback (Open Questions).
- **Memory durability / off-host backup** — separate, held companion ADR.
- **A Claude Code plugin marketplace** (`marketplace.json`, prefix-dropping) — the
  public repo is a tap of skill folders, not an installable plugin marketplace.
- **Changing skill *content* or the role ontology** beyond relocating personal
  reference files out of the canonical tree.

## Open Questions

1. **Publish trigger / cadence.** CI-on-push to `trunk` with a `paths:` filter over
   the projected skill folders (mirroring `.github/workflows/sync-skills-public.yml`)
   vs a manual/release-gated publish. *Lean:* CI on push to trunk, filtered to the
   projected paths, emitting a pinned provenance-stamped release. Coordinates with
   inventory Open Q #2 (host-pull interval).
2. **Provenance location/format.** Where the commit SHA + per-tree hashes live in
   the published repo (top-level manifest, per-subfolder file, or release metadata).
3. **Output shape.** One repo with `student/`/`curator/` subfolders (preferred) vs
   two repos (fallback), gated on the Hermes subfolder-tap capability (inventory
   gate 1a / Open Q #7). Build behind a single output-shape switch.
4. **Shared-foundation dedup mechanics.** How the projection copies the two
   foundations into both subfolders from one source while keeping P4's
   byte-identical guarantee (inventory Open Q #6).
