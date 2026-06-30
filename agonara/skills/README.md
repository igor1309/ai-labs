# Agonara Skills

Parent directory for Agonara's **operator-facing BYOA skills** — one subfolder
per skill.

Agonara is operated "bring your own agent" (BYOA): instead of a bundled UI or
chat, an operator points the agent they already use at an Agonara instance and
loads the skill for the job they are doing. The skill is the portable operating
surface; the [OpenAPI contract](../docs/api/openapi.yml) is the substrate.

Implemented shape (per-role skills over shared foundations) and rationale:
[`../docs/plans/implemented/byoa-operator-skills.md`](../docs/plans/implemented/byoa-operator-skills.md).

## Implemented skills

Shared foundations every role skill builds on:

- [`agonara-api-access/`](agonara-api-access/SKILL.md) — connect, authenticate
  (the `agonara_session` cookie), send CSRF-protected and idempotent mutations,
  and read the `accepted`/`rejected`/`fault` envelope.
- [`agonara-membership/`](agonara-membership/SKILL.md) — the role-neutral program
  participation model: read your memberships and invitations, act on invitations,
  inspect effective participation and membership history.

Per-role skills build on the foundations above.

The **curator bucket** — per-role skills for a Program Curator's assistant (the
agent does the API work on the human curator's behalf; the curator owns the
program and its decisions):

- [`agonara-curator-corpus/`](agonara-curator-corpus/SKILL.md) — create a program
  and control the draft↔accepted boundary for topics, concepts, materials, and
  navigation.
- [`agonara-curator-assessment/`](agonara-curator-assessment/SKILL.md) — author
  open-answer, quick, and readiness checks plus assessment criteria, keeping
  answer keys curator-only.
- [`agonara-curator-research/`](agonara-curator-research/SKILL.md) — record
  external sources, read coverage gaps, and review LLM-assisted curation
  suggestions as drafts.
- [`agonara-curator-participation/`](agonara-curator-participation/SKILL.md) —
  manage admission policy, invitations, and participants for a curated program.

The **student** skill:

- [`agonara-student/`](agonara-student/SKILL.md) — assist a human Student (the
  agent works on the learner's behalf; the student owns their learning and
  answers): discover and preview programs without creating state,
  self-join/leave/rejoin
  and act on invitations, resume learning and follow the next step, study
  accepted concepts and materials, take quick/open/readiness checks, and read
  feedback, results, and the evidence behind progress — seeing only accepted
  corpus and the student's own state.
- [`agonara-coach/`](agonara-coach/SKILL.md) — the *explaining* half of student
  coaching: explain a concept at the depth asked for, diagnose *why* a weak area is
  weak from its evidence before re-teaching, teach prerequisites first, and split
  confusable concepts by their discriminating feature — grounded in accepted
  materials, holding the teaching-side of the assessment boundary, and handing off to
  the drill skills for practice (carrying the two-contour intent).

The **admin** skill:

- [`agonara-admin/`](agonara-admin/SKILL.md) — operate a private instance:
  bootstrap the first Admin, administer identities and local-password
  credentials, grant/revoke Admin authority while preserving the last-admin
  invariant, inspect access and audit events, and perform exceptional membership
  recovery/revocation without becoming the normal participation operator.

The previous developer-facing `agonara-api` skill was removed — it served an
agent *building* Agonara's codebase, not an operator *using* the product, which
is the wrong consumer for this directory.

## Authoring constraints

Each skill is **deployed independently** — only the skill *folder* ships to a
runtime; `research/`, `docs/`, `backlog/`, and sibling buckets in another role
plugin are **not** present there — per the packaging model in
[`operator-skill-packaging_pre_adr.md`](operator-skill-packaging_pre_adr.md). So
author every skill to stand on its own:

- **No links a deployed bot can't resolve.** Do not reference `../../research/…`,
  `../../docs/…`, or another *role's* skill from inside `SKILL.md` — those paths
  dangle on the bot. A `agonara-curator-*` skill linking `agonara-student` (or
  vice versa) is the canonical mistake: the two never co-install. Keep design
  rationale and citations in `research/`/`docs/` (repo-only); the skill states the
  rule plainly without linking out.
- **Links that *do* resolve are fine.** The shared foundations
  (`agonara-api-access`, `agonara-membership`) arrive via `agonara-core`, and
  skills in the *same* role bucket (e.g. `agonara-curator-corpus` ↔
  `agonara-curator-assessment`) co-deploy — so foundation and same-bucket links
  are safe.
- **Duplicate shared cross-boundary content verbatim, then guard it.** When two
  skills in *different* buckets must enforce the same rule (e.g. the MCQ
  item-quality bar in `agonara-curator-assessment` and `agonara-student`), copy it
  byte-for-byte rather than linking, and add a parity test so the copies can't
  silently diverge — see
  [`../tests/operator-skill-contract.test.js`](../tests/operator-skill-contract.test.js).

## Concern ownership (student drill/practice cluster)

The student skill set also carries authored-practice/drill skills —
`button-quiz-loop`, `assistant-authored-study-drills`, `oral-exam-drills` —
alongside `agonara-student`. These **co-install with `agonara-student`**, so each
concern has one owner and the others point to it (no restatement):

| Concern | Owner |
|---|---|
| Explanation craft (depth ladder, cause-diagnosis, prerequisites, confusables) | `agonara-coach` |
| MCQ item quality | `agonara-student` |
| Authored assess-then-advance loop + assessment boundary | `agonara-student` |
| Button / `clarify` delivery | `button-quiz-loop` |
| Authored-MCQ orchestration | `assistant-authored-study-drills` |
| Oral / free-response drills | `oral-exam-drills` |

Add a behavioral rule to its owner and reference it from the others — **within
this co-installing set only**. Cross-*bucket* sharing (e.g. curator↔student) still
follows the duplicate-and-guard rule above, since those skills never co-install.

## Deploying these skills

This repo is the **source of truth for skill content** only. How the skills reach
a live agent — pushing copies, update cadence, restart behavior — is the
**consuming runtime's** concern, owned wherever that concrete deployment lives,
not here. Edit and commit the skill in this repo; each deployment pulls from it.

## Packaging & distribution design

Skill discovery and publishing were deliberately out of scope while the skills
were built. The packaging *shape* is now explored here:

- [`operator-skill-packaging_pre_adr.md`](operator-skill-packaging_pre_adr.md) —
  pre-ADR: role-scoped plugins (`agonara-curator`/`-student`/`-admin`) over a
  shared `agonara-core`, with the `agonara-` prefix carried by the plugin name
  so skill folders drop it. **Verified for Claude Code only**; cross-runtime
  portability is an open question.
- [`claude-code-plugin-system.md`](claude-code-plugin-system.md) — the verified
  Claude Code plugin/skill mechanics (plugin dependencies, namespacing, the
  visibility matrix, symlink dedup) the pre-ADR rests on, with doc URLs.

The distribution model (instance-shipped vs. standalone marketplace) and the
remaining open questions are tracked in the pre-ADR.

Forward-looking design exploration of the operator-skill surface (e.g. a
self-describing API with runtime discovery and follow-up hints) lives with the
backlog it informs: [`../backlog/agenticops-affordances.md`](../backlog/agenticops-affordances.md).
