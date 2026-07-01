---
date: 2026-07-01
model: claude-opus-4-8
description: "Contract for the producer-side deterministic projection that publishes Agonara's operator skills from agonara/skills/ into the public agonara-skills repo as role-scoped student/ and curator/ subfolders, privacy-scrubbed and provenance-stamped (realizes ADR-025)."
---

# Spec — Agonara-Skills Public Projection (Producer)

Realizes [ADR-025](../adr/adr-025-public-agonara-skills-projection.md). This spec
pins the three open questions ADR-025 delegated to "the spec/plan":

1. **Publish trigger** — CI on push to `trunk` over the full projection-input set,
   plus manual dispatch (ADR Open Q1 lean, adopted). See
   [Behavior rules → R11](#r11-publish-trigger).
2. **Provenance location/format** — a single top-level `provenance.json`, hash
   algorithm `sha256`. See [Behavior rules → R7](#r7-provenance).
3. **Shared-foundation dedup** — the projector copies the one upstream foundation
   folder into both subfolders as real files (ADR Open Q3 lean, adopted). See
   [Behavior rules → R4](#r4-shared-foundations).

## Goal

A deterministic projector (owned by the Agonara producer side, in ai-labs) that
renders `agonara/skills/` into a staged `agonara-skills` tree — two role
subfolders `student/` and `curator/`, privacy-scrubbed, provenance-stamped — and
fails the publish on any invariant breach, so the public repo is a verifiable,
release-pinned projection with a single upstream edit point.

## Non-Goals

- Consumer install, seal, reconciliation, rollback, pin advancement — the
  consumer's concern (ADR Non-Goals; current consumer's `inventory` ADR-001).
- `agonara-admin` placement/publication — deferred (ADR Non-Goals; R3 forbids it).
- Changing skill content or the role ontology beyond relocating the four
  user-specific reference files out of the canonical tree (that relocation is a
  precondition, R12 / [Done criteria](#done-criteria), not this component's work).
- A Claude Code plugin marketplace (`marketplace.json`, prefix-dropping).

## Public interface

### Inputs

- **Upstream tree** — `agonara/skills/` at a specific ai-labs commit.
- **Upstream commit SHA** — the release identity (`--upstream-sha`).
- **Publish manifest** — `agonara/skills-publish-manifest.json`, source-owned,
  the sole declaration of bucket membership and per-file ship/exclude:

  ```json
  {
    "sharedFoundations": ["agonara-api-access", "agonara-membership"],
    "buckets": {
      "student": ["agonara-student", "agonara-coach", "button-quiz-loop",
                  "assistant-authored-study-drills", "oral-exam-drills"],
      "curator": ["agonara-curator-corpus", "agonara-curator-assessment",
                  "agonara-curator-research", "agonara-curator-participation"]
    },
    "ship": {
      "agonara-curator-corpus": ["concept-extraction.md"],
      "oral-exam-drills": ["references/question-quality-and-grading.md"]
    },
    "excludeFromSource": [
      "assistant-authored-study-drills/references/user-calibration-notes.md",
      "assistant-authored-study-drills/references/user-specific-preferences.md",
      "assistant-authored-study-drills/references/button-flow-failures.md",
      "agonara-coach/references/routing-calibration.md"
    ]
  }
  ```

  - `sharedFoundations` are projected into **both** buckets.
  - `ship[skill]` lists skill-relative product files to publish **in addition to**
    `SKILL.md` (always shipped). Nothing else in a skill folder is copied
    (default-deny allowlist).
  - `excludeFromSource` lists source-relative paths that MUST NOT ship and MUST be
    absent from source after the R12 hygiene pass; it is the denylist for the
    review-diff (R6) and the target of the upstream scan (R6 gate 1).

### CLI

```
node agonara/scripts/project-public-skills.mjs \
  --upstream-sha <sha> \
  --skills-dir agonara/skills \
  --manifest agonara/skills-publish-manifest.json \
  --openapi agonara/docs/api/openapi.yml \
  --out <staging-dir>
```

- **Behavior:** rebuilds `<staging-dir>` from empty, projects per the manifest,
  writes `provenance.json`, then runs every gate in [Behavior rules](#behavior-rules).
- **Exit code:** `0` only if the staged tree passes **all** gates; non-zero with a
  diagnostic on the first breach (fail-closed).
- **Purity:** for a fixed (upstream tree, manifest, SHA) the staged bytes —
  `provenance.json` included — are identical across runs and machines. No
  wall-clock, hostname, ordering-nondeterminism, or environment input.

### Output (staged `agonara-skills` tree)

```
student/<skill>/SKILL.md            # + declared ship[] files
curator/<skill>/SKILL.md            # + declared ship[] files
provenance.json                     # R7
README.md                           # repo-level, static
LICENSE                             # repo-level, static
```

`provenance.json`:

```json
{
  "upstreamCommit": "<full 40-char sha>",
  "hashAlgo": "sha256",
  "trees": {
    "student/agonara-student": "<hex>",
    "curator/agonara-curator-corpus": "<hex>"
  }
}
```

### CI workflow

`.github/workflows/agonara-skills-publish.yml` — runs the projector, and on a
green staging tree commits it into a checkout of the public `agonara-skills` repo
(pushed with a repo PAT) and publishes an immutable tag. Modeled on
`.github/workflows/sync-skills-public.yml`.

## Behavior rules

Each rule is a publish gate; a breach fails the projector non-zero (R11 publish
context noted where the gate is workflow-level). Rule Rn realizes ADR invariant Pn.

### R1 — deterministic projection

- The staging dir is emptied before each run; a stale entry from a prior run MUST
  NOT survive.
- Re-running the projector on the same inputs MUST produce byte-identical output.
- The set of projected skill folders (de-bucketed, foundations counted once) MUST
  equal the manifest's declared skills. A manifest skill missing from source, or a
  source skill in a declared bucket that is absent from the staged output, MUST
  fail. A source skill folder that is in **no** bucket and is not a shared
  foundation is ignored (e.g. `agonara-admin`, R3) — but MUST NOT appear in output.

### R2 — source-owned partition

- Bucket membership is read **only** from the manifest. The projector MUST NOT
  infer a skill's bucket from its name, path, or `SKILL.md` content.

### R3 — bucket membership

- `student/` MUST contain exactly `{sharedFoundations} ∪ buckets.student`;
  `curator/` exactly `{sharedFoundations} ∪ buckets.curator` — no more, no fewer.
- No `curator`/admin skill MAY appear under `student/` and vice versa.
- `agonara-admin` MUST NOT appear in either subfolder (it is in no bucket).

### R4 — shared foundations {#r4-shared-foundations}

- `agonara-api-access` and `agonara-membership` are copied from the single upstream
  folder into both subfolders as **real files** (no symlinks).
- For each foundation, `sha256(student/<foundation> tree)`,
  `sha256(curator/<foundation> tree)`, and `sha256(upstream <foundation> tree)`
  MUST be equal (byte-identical copies). Tree hash defined in R7.

### R5 — public, content-scoped

- Each `student/<skill>` and `curator/<skill>` MUST contain only `SKILL.md` plus
  that skill's declared `ship[]` files. No host details, IPs, keys, `research/`,
  `docs/`, `backlog/`, or other repo-only content.
- Repository-level entries are limited to the closed set
  `{provenance.json, README.md, LICENSE}` plus the two role subfolders. Any other
  top-level entry in the staged tree MUST fail.

### R6 — privacy (three gates)

1. **Upstream scan.** Every path in `excludeFromSource` MUST be **absent** from
   `agonara/skills/` (the R12 hygiene precondition). If any is present, the publish
   MUST fail. (Primary mechanism of record — personal content never in source.)
2. **Allowlist copy.** For each bucketed skill the projector copies **only**
   `SKILL.md` + `ship[skill]`. Any source file under a bucketed skill that is in
   neither `ship[skill]` (nor implicitly `SKILL.md`) nor `excludeFromSource` MUST
   fail the publish **for review** — an undeclared new file is never silently
   shipped nor silently dropped.
3. **Output scan.** A content scan over the staged output MUST fail on personal-data
   markers (a recorded score like `NN/100`, "calibration", "user-specific",
   host/instance identifiers). This is a backstop, not the mechanism of record.

### R7 — provenance {#r7-provenance}

- `provenance.json` MUST exist at the staged tree root, be valid JSON, and carry
  `upstreamCommit` (the passed SHA), `hashAlgo: "sha256"`, and `trees`.
- `trees` MUST have one entry per projected skill tree keyed by its bucket-relative
  path (`student/<skill>`, `curator/<skill>`), value = the tree's content hash.
- **Tree content hash** = `sha256` over the canonical serialization of the tree:
  for every file in the tree in ascending byte order of its tree-relative POSIX
  path, append `"<relpath> " + sha256hex(fileBytes) + "\n"`; hash the
  concatenation. Deterministic and independent of filesystem ordering.
- `provenance.json` MUST be byte-deterministic: keys emitted in a fixed order,
  `trees` keys sorted ascending, no wall-clock field.

### R8 — projection-only, enforced (workflow/ops)

- The public repo MUST be written only by the projection's CI identity via push;
  it MUST NOT be edited in place, and the push MUST NOT require an inbound deploy
  key on any consumer.
- Before publishing, the workflow MUST verify the fetched public-repo HEAD is a
  descendant of the last release tag; target history not descended from the last
  release MUST reject the publish (no rewrite/force between releases).
- `main` and release tags on `agonara-skills` MUST be branch/tag-protected to the
  CI identity. (Verified by branch-protection config inspection — see
  [Done criteria](#done-criteria) Unverifiable note.)

### R9 — projection contract checks over generated output

Run over the **staged trees** (not only source):

- Projected directory names MUST match the manifest (R3).
- Both shared-foundation copies byte-identical to upstream (R4).
- **Route citations:** every `GET|POST|PUT|PATCH|DELETE /path` cited in any
  projected `SKILL.md` MUST exist in `agonara/docs/api/openapi.yml` (the source
  OpenAPI, available in the ai-labs publish job). Reuses the logic of
  `agonara/tests/operator-skill-contract.test.js`.
- **Item-quality parity:** the guarded shared block MUST be byte-identical between
  `curator/agonara-curator-assessment/SKILL.md` and
  `student/agonara-student/SKILL.md` on the staged trees.
- Every shipped `SKILL.md` link MUST resolve within its own role subfolder (R10).
- `agonara/tests/operator-skill-contract.test.js` MUST also pass on source but is
  not sufficient alone.

### R10 — no dangling links in shipped skills

- For each projected `SKILL.md`, every relative link/path MUST resolve to a file
  present **within the same role subfolder** (same-bucket skill or a shared
  foundation, both co-present). A link to `../../research/…`, `../../docs/…`, or a
  skill in the other role subfolder MUST fail.

### R11 — publish trigger {#r11-publish-trigger}

- The workflow MUST trigger on push to `trunk` filtered to the full projection
  input set — `agonara/skills/**`, `agonara/skills-publish-manifest.json`, the
  projector script, `agonara/docs/api/openapi.yml`, and the workflow file itself —
  and MUST also expose `workflow_dispatch`. A change to publication logic MUST NOT
  leave the public repo stale.

### R12 — first-publish precondition

- Repository creation and the first push MUST be blocked until R6 gate 1 passes:
  the four `excludeFromSource` files MUST be absent from `agonara/skills/`. This
  relocation is a prerequisite, performed before the projector runs, not a
  follow-up.

### R11′ — atomic, pinned publish (workflow/ops)

Realizes P11. Publication MUST be atomic: the projector validates manifest +
per-tree hashes in staging; the workflow commits them **with** the payload in a
single commit and publishes an immutable, protected tag at that commit. That
tag/commit is the release identity and MUST NOT be moved after publication.

## Tests (required)

Node `node:test` against a `makeUpstreamTree(...)` helper (a temp sample tree +
manifest), unless marked *(workflow)*. Personal-data helpers use synthetic
markers, never real user data.

1. **R1 clean rebuild** — a stray file pre-seeded in the staging dir is gone after
   a run; two runs on identical inputs yield byte-identical trees (compare a
   recursive `path→sha256` map).
2. **R1 missing/extra skill** — a manifest skill absent from source fails; a source
   skill in a bucket that fails to reach output fails; `agonara-admin` present in
   source but in no bucket is absent from output and does **not** fail.
3. **R2 no inference** — a skill whose name suggests curator but is declared under
   `buckets.student` is projected to `student/` (partition follows manifest, not
   name).
4. **R3 exact buckets** — `student/` set equals `{foundations} ∪ buckets.student`;
   `curator/` likewise; an admin/curator skill injected into `student/` fails;
   `agonara-admin` absent from both.
5. **R4 byte-identical foundations** — `student/agonara-api-access`,
   `curator/agonara-api-access`, and upstream share one tree hash; mutating one
   staged copy fails the check; no symlink exists in output.
6. **R5 content scope** — a stray `research/` file under a source skill is not
   copied; an unexpected top-level staged entry (e.g. `notes.md`) fails; only
   `{provenance.json, README.md, LICENSE, student/, curator/}` at root passes.
7. **R6 gate 1** — an `excludeFromSource` path present in source fails the publish;
   all four absent passes.
8. **R6 gate 2 allowlist** — an undeclared new file under a bucketed skill (not in
   `ship[]`, not `excludeFromSource`) fails **for review**; adding it to `ship[]`
   ships it; a declared `ship[]` file is present in output.
9. **R6 gate 3 output scan** — a synthetic personal marker (`71/100`,
   `user-specific`) reaching the staged output fails; clean product content passes.
10. **R7 provenance shape** — `provenance.json` parses, has `upstreamCommit` ==
    passed SHA, `hashAlgo == "sha256"`, one `trees` entry per projected tree with
    sorted keys; the recorded hash equals an independent recomputation.
11. **R7 determinism** — `provenance.json` bytes identical across two runs; no
    wall-clock/host field present.
12. **R9 route citations** — a projected `SKILL.md` citing a route absent from the
    sample OpenAPI fails; all-cited-routes-present passes.
13. **R9 item-quality parity** — divergent guarded blocks between staged
    `curator/agonara-curator-assessment` and `student/agonara-student` fail;
    byte-identical passes.
14. **R10 link resolution** — a projected `SKILL.md` linking `../../research/x.md`
    fails; one linking another role's skill fails; a same-bucket or foundation link
    that resolves within the subfolder passes.
15. **R11 trigger** *(workflow)* — the workflow's `on.push.paths` includes each
    input in R11 and `workflow_dispatch` is present (assert over the parsed YAML).
16. **R11′ atomic tag / R8 ancestry** *(workflow)* — the publish step commits
    payload + provenance in one commit and creates a tag; the ancestry guard
    rejects a public HEAD not descended from the last release tag (scripted check
    over a two-commit fixture repo).

## Done criteria

- **Interface:** `project-public-skills.mjs` exists with the CLI above; a green run
  emits the [output tree](#output-staged-agonara-skills-tree) including
  `provenance.json`; a breach of any R-rule exits non-zero with a diagnostic.
- **Manifest:** `agonara/skills-publish-manifest.json` exists and is the sole
  bucket-membership declaration (R2).
- **Tests:** all cases in [Tests](#tests-required) pass —
  `./scripts/run_silent.sh "tests" npm test` (Node 22 per `agonara/CLAUDE.md`) and
  `./scripts/run_silent.sh "build" npx tsc --noEmit`.
- **Precondition (R12):** the four `excludeFromSource` files are absent from
  `agonara/skills/` before the first publish (relocated by the ADR-consequences
  hygiene pass); R6 gate 1 green proves it.
- **Workflow:** `.github/workflows/agonara-skills-publish.yml` triggers per R11 and
  publishes atomically per R11′.
- **Unverifiable (stated limitation):** R8 branch/tag protection and PAT-scoped
  write access are GitHub repo-settings on the out-of-band `agonara-skills` repo —
  confirmable only by inspecting that repo's protection config, not by a test in
  this repo. The projector-side ancestry guard (test 16) is verifiable; the server
  enforcement is not.
