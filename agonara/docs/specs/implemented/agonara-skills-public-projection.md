---
date: 2026-07-01
model: claude-opus-4-8
description: "Contract for the producer-side deterministic projection that publishes Agonara's operator skills from agonara/skills/ into the public agonara-skills repo as role-scoped student/ and curator/ subfolders, privacy-scrubbed and provenance-stamped (realizes ADR-025)."
---

# Spec — Agonara-Skills Public Projection (Producer)

## Goal

A deterministic projector (owned by the Agonara producer side, in ai-labs) that
renders `agonara/skills/` into a staged `agonara-skills` tree — two role
subfolders `student/` and `curator/`, privacy-scrubbed, provenance-stamped — and
fails the publish on any invariant breach, so the public repo is a verifiable,
release-pinned projection with a single upstream edit point.

Realizes [ADR-025](../../adr/adr-025-public-agonara-skills-projection.md): rules
R1–R11 realize ADR invariants P1–P11 one-to-one; R12 realizes ADR Open Question 1
(publish trigger), which has no P. (ADR P12 is withdrawn — the privacy model draws
the boundary at publish, not by relocating source; see ADR Revision history.)

## Resolved open questions

The three questions ADR-025 delegated to "the spec/plan", pinned here:

1. **Publish trigger** — CI on push to `trunk` over the full projection-input set,
   plus manual dispatch (ADR Open Q1 lean). See [R12](#r12-publish-trigger).
2. **Provenance location/format** — a single top-level `provenance.json`, hash
   algorithm `sha256`. See [R7](#r7-provenance).
3. **Shared-foundation dedup** — the projector copies the one upstream foundation
   folder into both subfolders as real files (ADR Open Q3 lean). See
   [R4](#r4-shared-foundations).

## Privacy model (why nothing is relocated)

Personal reference content (calibration notes, per-user preferences) stays in
`agonara/skills/` — the private/self deployment reads it. It never reaches the
public projection because the projector draws the boundary at publish (ADR P6):

- **Files** are published by a **single default-deny allowlist** — only `SKILL.md` +
  declared `ship[]`. Everything else under a skill folder, the four personal
  reference files included, simply is not published; there is no second list. The
  output is exactly the allowlist projection, pinned by tests (R1).
- **Personal prose inside a shipped `SKILL.md`** (the `## References` section that
  describes the unshipped files) is removed by a declared **`scrub`** — so no
  personal text and no pointer to an unpublished file survives in shipped content.
- An **output scan** is the backstop, not the mechanism of record.

## Non-Goals

- Consumer install, seal, reconciliation, rollback, pin advancement — the
  consumer's concern (ADR Non-Goals; current consumer's `inventory` ADR-001).
- `agonara-admin` placement/publication — deferred (ADR Non-Goals; R3 forbids it).
- Changing skill content or the role ontology. The projector transforms only the
  **published copy** (the declared `scrub`); `agonara/skills/` is not edited.
- A Claude Code plugin marketplace (`marketplace.json`, prefix-dropping).

## Public interface

### Inputs

- **Upstream tree** — `agonara/skills/` at a specific ai-labs commit.
- **Upstream commit SHA** — the release identity (`--upstream-sha`), full 40-char.
- **Publish manifest** — `agonara/skills-publish-manifest.json`, source-owned,
  the sole declaration of bucket membership, the per-file ship allowlist, and
  per-skill section scrub:

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
    "scrub": {
      "assistant-authored-study-drills": ["## References"]
    }
  }
  ```

  - `sharedFoundations` are projected into **both** buckets.
  - `ship[skill]` lists skill-relative product files published **in addition to**
    `SKILL.md` (always published). Nothing else in a skill folder is copied
    (single default-deny allowlist) — the personal reference files, being absent
    from `ship`, are simply not published; they need no separate declaration.
  - `scrub[skill]` lists Markdown section headings to remove from that skill's
    **published** `SKILL.md` (see R6.2). The source `SKILL.md` is unchanged.

- **Repo-level assets** — `agonara/publish-assets/README.md` and
  `agonara/publish-assets/LICENSE`, copied verbatim to the staged tree root. Static
  inputs; part of the determinism contract (R1) and the trigger input set (R12).

### CLI

```
node agonara/scripts/project-public-skills.mjs \
  --upstream-sha <sha> \
  --skills-dir agonara/skills \
  --manifest agonara/skills-publish-manifest.json \
  --assets agonara/publish-assets \
  --openapi agonara/docs/api/openapi.yml \
  --out <staging-dir> \
  --report <report.json | -->
```

- **Behavior:** rebuilds `<staging-dir>` from empty, projects per the manifest
  (allowlist copy + section scrub), copies repo-level assets, writes
  `provenance.json`, then runs every gate in [Behavior rules](#behavior-rules).
- **Exit codes:** `0` — all gates pass; `1` — one or more gate breaches; `2` —
  usage or I/O error. Fail-closed.
- **Report:** on every run the projector writes a JSON result to `--report` (a path,
  or `-` for stdout):
  `{ "ok": <bool>, "failures": [ { "rule": "R6", "kind": "personal-marker", "detail": "<path>" }, … ] }`.
  `kind` distinguishes failure modes so a caller can assert a specific one
  (`personal-marker` = R6.3; `not-descendant` = R8; `dangling-link` = R10; …). A
  gate breach lists every failure it found, not only the first.
- **Purity:** for a fixed (upstream tree, manifest, assets, SHA) the staged bytes —
  `provenance.json` included — are identical across runs and machines. No
  wall-clock, hostname, filesystem-ordering, or other environment input.

### Output (staged `agonara-skills` tree)

```
student/<skill>/SKILL.md            # published copy (scrubbed per scrub[]) + ship[] files
curator/<skill>/SKILL.md            # published copy (scrubbed per scrub[]) + ship[] files
provenance.json                     # R7
README.md                           # copied from agonara/publish-assets/
LICENSE                             # copied from agonara/publish-assets/
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
(pushed with a repo PAT) and publishes an immutable annotated tag. Modeled on
`.github/workflows/sync-skills-public.yml`.

## Behavior rules

Each rule is a publish gate; a breach fails the projector with exit `1` (rules
marked *(workflow)* are enforced in the CI job around the projector, not by the
projector process). Rules R1–R11 map one-to-one to ADR invariants P1–P11.

### R1 — deterministic projection

- The staging dir is emptied before each run; a stale entry from a prior run MUST
  NOT survive.
- Re-running the projector on the same inputs MUST produce byte-identical output.
- The set of projected skill folders (de-bucketed, foundations counted once) MUST
  equal the manifest's declared skills. A manifest skill absent from source, or a
  declared skill that fails to reach the staged output, MUST fail. A source skill
  folder in **no** bucket and not a shared foundation is ignored (e.g.
  `agonara-admin`, R3) — but MUST NOT appear in output.
- The staged output MUST equal exactly the manifest projection: for each bucketed
  skill, exactly the published `SKILL.md` + `ship[skill]`, plus the two foundations
  in both buckets, plus the closed repo-level set (R5). No file outside that set.

### R2 — source-owned partition

- Bucket membership is read **only** from the manifest. The projector MUST NOT
  infer a skill's bucket from its name, path, or `SKILL.md` content. A skill whose
  name suggests one role but is declared under the other is projected per the
  declaration.

### R3 — bucket membership

- `student/` MUST contain exactly `sharedFoundations ∪ buckets.student`; `curator/`
  exactly `sharedFoundations ∪ buckets.curator` — the staged subfolder set MUST
  match the manifest declaration, no more, no fewer.
- A skill declared in **both** non-foundation buckets, or present in a staged
  subfolder without being declared for that bucket, MUST fail.
- `agonara-admin` (declared in no bucket) MUST NOT appear in either subfolder.

### R4 — shared foundations {#r4-shared-foundations}

- `agonara-api-access` and `agonara-membership` are copied from the single upstream
  folder into both subfolders as **real files** (no symlinks). Foundations have no
  `scrub` entry, so the copies are verbatim.
- For each foundation, the R7 tree hash of `student/<foundation>`,
  `curator/<foundation>`, and the upstream `<foundation>` folder MUST be equal
  (byte-identical copies).

### R5 — public, content-scoped

- Each `student/<skill>` and `curator/<skill>` MUST contain only `SKILL.md` plus
  that skill's declared `ship[]` files. No `research/`, `docs/`, `backlog/`,
  unshipped reference files, or other repo-only content.
- Repository-level entries are limited to the closed set
  `{provenance.json, README.md, LICENSE}` plus the two role subfolders. Any other
  top-level entry in the staged tree MUST fail.

### R6 — privacy publish boundary (three gates)

1. **Allowlist copy (mechanism of record).** For each bucketed skill the projector
   publishes **only** `SKILL.md` + `ship[skill]` and copies **nothing else** under
   the skill folder. Every other file — the personal reference files included — is
   left in source, unpublished, by this one default-deny rule; there is no second
   denylist to keep in sync. The staged output is therefore exactly the allowlist
   projection, pinned by R1's allowlist-exact check.
2. **Section scrub.** For each `scrub[skill]` heading, the projector MUST remove that
   Markdown section — the heading line through the line before the next heading of
   the same or higher level (or end of file) — from the **published** `SKILL.md`
   only. After scrub, the published `SKILL.md` MUST NOT contain the removed heading
   or any reference to an unshipped `references/` file. The source `SKILL.md` is
   untouched.
3. **Output scan (backstop).** A heuristic content scan over the staged output MUST
   fail (`kind: personal-marker`) on: a recorded score matching `/\b\d{1,3}\/100\b/`;
   a match of `/\buser-specific\b/i` or `/\bcalibration\b/i`; or any string in a
   small declared host-identifier denylist (concrete instance hostnames/IPs — not
   the bare words "instance"/"host"). This backstops gates 1–2; false positives are
   resolved by review, not by relaxing it silently.

### R7 — provenance {#r7-provenance}

- `provenance.json` MUST exist at the staged tree root, be valid JSON, and carry
  `upstreamCommit` (the passed 40-char SHA), `hashAlgo: "sha256"`, and `trees`.
- `trees` MUST have one entry per projected skill tree keyed by its bucket-relative
  POSIX path (`student/<skill>`, `curator/<skill>`), value = the tree content hash
  computed over the **published** (post-scrub) files.
- **Tree content hash** — deterministic and filesystem-order-independent:
  1. List every regular file in the tree; compute its path relative to the tree
     root using `/` separators (POSIX).
  2. Sort those relative paths ascending by their UTF-8 byte sequence.
  3. For each, in sorted order, append the UTF-8 bytes of
     `<relpath> + " " + <sha256hex(fileBytes)> + "\n"`, where `sha256hex` is
     **lowercase** hex of the raw file bytes.
  4. The tree hash is the lowercase hex `sha256` of that concatenation.
- **`provenance.json` serialization** MUST be byte-deterministic: UTF-8, LF line
  endings, two-space indent, top-level keys in the fixed order
  `upstreamCommit, hashAlgo, trees`, `trees` keys sorted ascending by UTF-8 bytes,
  and no wall-clock or host field.

### R8 — projection-only, enforced *(workflow)*

- The public repo MUST be written only by the projection's CI identity via push;
  it MUST NOT be edited in place, and the push MUST NOT require an inbound deploy
  key on any consumer.
- Before publishing, the workflow MUST verify the fetched public-repo HEAD is a
  descendant of the last release tag (`git merge-base --is-ancestor <lastTag>
  <fetchedHead>`); a HEAD not descended from the last release MUST reject the
  publish (`kind: not-descendant`) — no rewrite/force between releases.
- `trunk` (the public repo's default branch) and release tags on `agonara-skills`
  MUST be ruleset-protected to the CI identity. Verified by config inspection —
  `gh api repos/<owner>/agonara-skills/rulesets` MUST show branch/tag rulesets
  restricting pushes/tag-creation to the projection identity (see
  [Done criteria](#done-criteria)).

### R9 — projection contract checks over generated output

Run over the **staged (published) trees**, not source:

- Projected directory names MUST match the manifest (R3).
- Both shared-foundation copies byte-identical to upstream (R4).
- **Route citations:** every `GET|POST|PUT|PATCH|DELETE /path` cited in any
  published `SKILL.md` MUST exist in `agonara/docs/api/openapi.yml` (the source
  OpenAPI, available in the ai-labs publish job). Reuses the citation-extraction
  and OpenAPI-route logic of `agonara/tests/operator-skill-contract.test.js`.
- **Item-quality parity:** the guarded shared block MUST be byte-identical between
  `curator/agonara-curator-assessment/SKILL.md` and
  `student/agonara-student/SKILL.md` on the staged trees (same block boundaries as
  `operator-skill-contract.test.js`). Neither skill is scrubbed, so the block is
  unaffected by R6.2.
- Every published `SKILL.md` link MUST resolve within its own role subfolder (R10).
- `agonara/tests/operator-skill-contract.test.js` MUST also pass on source but is
  not sufficient alone.

### R10 — no dangling links in shipped skills

- For each **published** `SKILL.md`, every Markdown link target `[text](path)` with
  a relative `path` MUST resolve to a file present **within the same role subfolder**
  (a same-bucket skill or a shared foundation, both co-present); otherwise fail
  (`kind: dangling-link`). A link to `../../research/…`, `../../docs/…`, or a skill
  in the other role subfolder MUST fail.
- Because R6.2 scrubs the personal `## References` section before this check runs,
  the published `SKILL.md` carries no pointer to an unshipped `references/` file to
  dangle.

### R11 — atomic, pinned publish *(workflow)*

- Publication MUST be atomic: the projector validates the manifest and per-tree
  hashes in staging; the workflow then commits the payload **and** `provenance.json`
  in a **single** commit on the public repo's default branch (`trunk`), and creates an **annotated**
  tag `release/<upstream-short-sha>` at that commit.
- The tag/commit is the release identity a consumer pins to and MUST NOT be moved
  after publication. Re-running for the same upstream SHA MUST be a no-op if the tag
  already exists (idempotent), never a tag move.

### R12 — publish trigger {#r12-publish-trigger}

- The workflow MUST trigger on push to `trunk` filtered to the full projection
  input set — `agonara/skills/**`, `agonara/skills-publish-manifest.json`,
  `agonara/publish-assets/**`, the projector script, `agonara/docs/api/openapi.yml`,
  and the workflow file itself — and MUST also expose `workflow_dispatch`. A change
  to any publication input MUST NOT leave the public repo stale.

## Tests (required)

Cases run against a `makeUpstreamTree(...)` helper (a temp sample tree + manifest +
assets); the projector is invoked via its CLI and its `--report` JSON is asserted.
Cases marked *(workflow)* assert over the parsed workflow YAML or a scripted git
fixture. Personal-data cases use synthetic markers, never real user data.

1. **R1 clean rebuild** — a stray file pre-seeded in the staging dir is absent after
   a run; two runs on identical inputs yield byte-identical trees (compare a
   recursive `path→sha256` map).
2. **R1 allowlist-exact output** — the staged file set equals exactly the published
   `SKILL.md` + `ship[]` per bucketed skill + both foundations in both buckets +
   `{provenance.json, README.md, LICENSE}`; no unshipped reference file and no extra
   file.
3. **R1 missing/extra skill** — a manifest skill absent from source fails
   (`ok:false`); `agonara-admin` present in source but in no bucket is absent from
   output and does **not** fail.
4. **R2 no inference** — a skill whose name suggests curator but is declared under
   `buckets.student` is projected to `student/` (partition follows manifest).
5. **R3 bucket integrity** — staged `student/` set equals `foundations ∪
   buckets.student` and `curator/` likewise; a skill declared in both non-foundation
   buckets fails; `agonara-admin` absent from both.
6. **R4 byte-identical foundations** — the R7 tree hash of `student/agonara-api-access`,
   `curator/agonara-api-access`, and upstream are equal; mutating one staged copy
   fails the R4 check; no symlink exists in output.
7. **R5 content scope** — a stray `research/` file under a source skill is not
   copied; an unshipped reference file is absent from output; an unexpected top-level
   staged entry (e.g. `notes.md`) fails; a root of exactly
   `{provenance.json, README.md, LICENSE, student/, curator/}` passes.
8. **R6.1 allowlist-only** — a personal reference file present in source (e.g.
   `agonara-coach/references/routing-calibration.md`) is not published and does
   **not** fail; only `SKILL.md` + `ship[]` appear for each skill; adding a file to
   `ship[]` publishes it, removing it from `ship[]` drops it — no second list is
   consulted.
9. **R6.2 section scrub** — a scrubbed `## References` section (and everything under
   it up to the next same/higher heading) is absent from the published `SKILL.md`;
   content before and after the section is intact; no unshipped `references/` file
   name remains in the published `SKILL.md`; the source `SKILL.md` is unchanged.
10. **R6.3 output scan** — a synthetic marker (`71/100`, `user-specific`, a
    denylisted host string) surviving into staged output fails with
    `kind: personal-marker`; clean product content passes.
11. **R7 provenance shape** — `provenance.json` parses; `upstreamCommit` == passed
    SHA; `hashAlgo == "sha256"`; one `trees` entry per projected tree with keys
    sorted ascending; each recorded hash equals an independent recomputation by the
    R7 algorithm over the published files.
12. **R7 determinism** — `provenance.json` bytes identical across two runs; keys in
    fixed order; no wall-clock/host field.
13. **R9 route citations** — a published `SKILL.md` citing a route absent from the
    sample OpenAPI fails; all-cited-routes-present passes.
14. **R9 item-quality parity** — divergent guarded blocks between staged
    `curator/agonara-curator-assessment` and `student/agonara-student` fail;
    byte-identical passes.
15. **R10 link resolution** — a published `SKILL.md` with a Markdown link
    `[x](../../research/x.md)` fails (`kind: dangling-link`); one linking another
    role's skill fails; a same-bucket or foundation link that resolves within the
    subfolder passes; the scrubbed skill has no dangling `references/` link.
16. **R11 atomic + idempotent tag** *(workflow)* — the publish step commits payload
    + provenance in one commit and creates the annotated `release/<short-sha>` tag;
    a re-run for an already-published SHA is a no-op and never moves the tag.
17. **R8 ancestry guard** *(workflow)* — over a two-commit git fixture, the guard
    rejects (`kind: not-descendant`) a public HEAD not descended from the last
    release tag and accepts a descendant.
18. **R12 trigger** *(workflow)* — the workflow's `on.push.paths` includes each
    input listed in R12 and `workflow_dispatch` is present (assert over parsed YAML).

## Done criteria

- **Interface:** `project-public-skills.mjs` exists with the CLI above; a green run
  emits the [output tree](#output-staged-agonara-skills-tree) including
  `provenance.json` and the copied `README.md`/`LICENSE`, and an `ok:true` report; a
  breach exits `1` with a `failures[]` entry naming the rule and kind.
- **Manifest & assets:** `agonara/skills-publish-manifest.json` (sole
  bucket/ship/`scrub` declaration, R2/R6) and
  `agonara/publish-assets/{README.md,LICENSE}` exist.
- **Tests:** all cases in [Tests](#tests-required) pass —
  `./scripts/run_silent.sh "tests" npm test` (Node 22 per `agonara/CLAUDE.md`) and
  `./scripts/run_silent.sh "build" npx tsc --noEmit`.
- **Privacy boundary proven (R6):** the published
  `student/assistant-authored-study-drills/SKILL.md` contains no `## References`
  section and no unshipped `references/` file name, while `agonara/skills/` is
  unchanged (no relocation).
- **Workflow:** `.github/workflows/agonara-skills-publish.yml` triggers per R12 and
  publishes atomically per R11.
- **Repo protection (R8) — verifiable by inspection, not by an in-repo test:**
  `gh api repos/<owner>/agonara-skills/rulesets` shows branch/tag rulesets
  restricting push and tag-creation on `trunk` and `release/*` to the projection CI
  identity. This requires the out-of-band repo to exist, so it is checked post-repo
  creation rather than in the ai-labs test suite; it is inspectable, not
  Unverifiable.
