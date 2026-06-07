---
date: 2026-06-07
model: claude
description: "Implementation plan: reposition Agonara as bring-your-own-agent (BYOA) across Product Intent, user stories, README (project + repo-root row), landing, architecture, and brand docs — a refinement of the existing API-first intent, propagated with a traceability pass."
---

# Agonara BYOA Repositioning Implementation Plan

Implements the handoff in
[`agonara-byoa-repositioning-handoff.md`](agonara-byoa-repositioning-handoff.md).
This is a **Product Intent refinement** that makes Agonara's intended operating
model explicit — **bring-your-own-agent (BYOA)**: the product is the API plus a
set of per-role operator skills, driven by an operator's own agent, with the
existing `/learn` and `/admin` UIs retained as first-class clients of the same
contract. The product itself does not change; only how its intent is stated.

The sibling skills-structure job is already done
([`byoa-operator-skills.md`](byoa-operator-skills.md)); this plan covers the
**product and docs** consequence.

## Goal

State the BYOA operating model explicitly and consistently across Agonara's
intent, README, landing, architecture, and brand docs — leading with intent,
keeping mechanics in the contract and architecture docs — while preserving the
accepted Product Intent stories (INT-01…07 and the curator/student/admin
catalogs), the five-module ownership story, and all accepted ADRs. The result
reads as a refinement: Agonara's purpose (curated programs, learner
progression, human-owned curriculum, AI as assistant not author) is recognizably
unchanged.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption — and one plan-defined decision gate: the §4 ADR call in Phase 0 (record the decision and proceed; do not block on it).
Push policy: push at closeout

## Execution lock

Worktree mode: create new
Expected worktree: `worktrees/agonara-byoa-repositioning`
Expected branch: `agonara-byoa-repositioning` (dedicated repositioning branch, separate from the skills-structure work, per handoff §0 and §6.1)
Preflight check: [ ] done
Implementation preflight: before Phase 1 and before every later phase, run `git worktree list --porcelain` and `git branch --show-current`; continue only when the current worktree and branch match the expected values above. (This plan document itself was authored on `claude/agonara-repositioning-plan-awaNm`; the repositioning execution branch is separate.)

## Scope guardrails

Out of scope for this plan (explicit exclusions; several restate handoff §7
constraints and §3 boundaries):

- **Do not touch the module ownership story.** The five-module split (Corpus
  Storage, Program Membership, Curator Workspace, Student Workspace, Identity &
  Role Management) and ADR-004…018 are the builder's view and remain correct.
  `docs/module_responsibility_map.md` is not edited except where it would
  contradict the BYOA operator-facing framing (it should not — verify, do not
  rewrite).
- **Do not reverse or demote the product.** BYOA is a refinement of the existing
  API-first intent, not a pivot. Do not rewrite the product definition, the
  problem statement, the actors, or the boundaries/non-goals beyond what makes
  the operating model explicit.
- **Do not demote or deprecate the `/learn` and `/admin` UIs** (handoff §5,
  resolved). They stay as first-class surfaces. No doc may read as if the UIs are
  deprecated, demoted to examples, or gone. Reposition the narrative as
  "BYOA-first, UIs alongside."
- **Do not let BYOA read as "the agent owns the curriculum."** Curation stays
  human-owned; AI/agent owns the *operating*, not the content decisions.
- **Do not import implementation detail into intent docs.** No route lists,
  schemas, request/response shapes, or mechanics in `docs/intent/`,
  `README.md`, or `brand_brief*.md`. Those live in `docs/api/openapi.yml` and
  `architecture.html`.
- **Do not build or modify operator skills, code, `src/`, tests, CI, the
  OpenAPI contract, or any runtime/config artifact.** This is a docs-only
  repositioning. If a non-doc/config/CI/generated artifact would change, stop —
  it is out of scope.
- **Do not break EN/RU parity** for the brand briefs.
- **Do not start a phase if implementation preflight reports a different
  worktree or branch.**

## Backward-traceability obligation (handoff §4)

Product Intent is upstream of ADRs and specs. The following ADRs cite Product
Intent and/or the user-story catalogs and must be checked against the refined
BYOA framing during Phase 1 and re-verified in Phase 6. The BYOA framing changes
the operator-facing surface narrative only; it must **not** contradict any
accepted decision (module ownership is unaffected). State the check result
flatly per ADR; do not edit ADRs unless an actual contradiction is found.

The table below is a **survey snapshot** taken while authoring this plan, not an
authoritative list. At execution time (Phase 1), re-derive the set by grepping
`agonara/docs/adr/` for citations of Product Intent and the user-story catalogs
(e.g. `intent`, `user stor`, `INT-0`, `CUR-`, `STU-`, `ADM-`, actor names), since
ADRs may have been added since this snapshot; check every ADR the grep returns,
not only the rows below.

| ADR | Cites |
|---|---|
| adr-001-internal-identity-as-agonara-ownership-subject | admin user stories |
| adr-002-role-authority-scope-model | Product Intent, admin user stories |
| adr-003-admin-recovery-invariant | admin user stories |
| adr-005-program-membership-state-and-first-admission-policy | student / curator / admin stories |
| adr-010-corpus-storage-and-curator-acceptance-boundary | Product Intent, curator stories |
| adr-011-accepted-checks-and-student-assessment-boundary | Product Intent, curator + student stories |
| adr-012-student-workspace-open-answer-attempt-lifecycle | Product Intent, student stories |
| adr-013-student-workspace-open-answer-evaluation-governance | Product Intent, student stories |
| adr-016-quick-check-assessment-boundary | Product Intent, student stories |

## Product intent traceability

This plan refines how intent is *stated*; it preserves every accepted story. The
table records what each phase must keep intact while repositioning.

| Story set | Phase obligation |
|---|---|
| INT-01…07 (keystone intent) | Phase 1 preserves actor, capability, outcome, acceptance signal, and boundary for every accepted story; adds the BYOA operating model without altering the stories' meaning. |
| Curator catalog (CUR-01…18) | Phase 2 keeps all stories role/job framed; survey found no UI-only assumptions — verify and preserve, do not invent UI coupling to "fix." |
| Student catalog (STU-01…23) | Phase 2 preserves stories as access-path agnostic. |
| Admin catalog (ADM-01…15) | Phase 2 preserves stories as access-path agnostic. |
| "Membership governed outside my workspace" framing | Phases 1–2 keep this load-bearing framing (it underpins the shared-membership operator skill). |

## Exact change inventory

Documents to adapt (handoff §3). Each is a reposition, not a mechanical rewrite.

- `agonara/docs/intent/intent_learning_program_app.md` — keystone. Add the BYOA
  operating model explicitly (how the product is *operated*); keep the *what*
  (curated programs + learner progression) unchanged. Bump the doc `version`.
- `agonara/docs/intent/curator_user_stories.md` — verify no UI-only access
  assumptions; add operator stories only if BYOA introduces genuinely new
  operator jobs (e.g., "as a curator I drive curation from my own agent").
- `agonara/docs/intent/student_user_stories.md` — verify access-path agnostic.
- `agonara/docs/intent/admin_user_stories.md` — verify access-path agnostic.
- `agonara/README.md` — lead with BYOA; reframe the "Product surfaces / how
  humans and agents reach it" one-liner (currently line ~15, "API-first…future
  agent skills") to BYOA-first with UIs alongside.
- `README.md` (repo root) — update the `agonara` Components-table row
  (line 50) to the repositioned one-liner per CLAUDE.md doc-maintenance.
- `agonara/index.html` — `#surfaces` section ("How humans and agents reach it")
  and the hero ("agent-ready backend contracts"): make the agent + role skill
  path the lead, UIs retained first-class. Consider a "Bring your own agent"
  hero/section. (The dead `agonara-api` skill card is already removed — confirm,
  no cleanup expected.)
- `agonara/architecture.html` — surfaces/runtime narrative; specifically the
  deployment-section line stating "the network web UI remains the primary human
  interface" (line ~523–526) must be repositioned to BYOA-primary with UIs as
  equal first-class clients. Module ownership map narrative stays.
- `agonara/docs/brand/brand_brief.md` — check "Product Fit"/"Positioning"
  (lines ~26–45); add BYOA if it strengthens the "AI as assistant, not author" +
  "human-owned curriculum" story.
- `agonara/docs/brand/brand_brief_ru.md` — mirror EN edits (EN/RU parity).
- `agonara/AGENTS.md` — revisit once intent lands; it already states BYOA and
  references the operator-skill design, so expect a light touch or no change.
- `agonara/docs/adr/<new>.md` — **only if** Phase 0 concludes an ADR is
  warranted (optional per handoff §4).
- `agonara/docs/log.md` — closeout entry (Phase 7).
- `docs/log.md` (repo root) — only if the change is judged genuinely repo-wide
  (the repo-root Components-row edit may warrant a one-line entry).
- `agonara/docs/plans/implemented/agonara-byoa-repositioning.md` — archived plan
  (Phase 7).

## Phase tracker

- [x] Phase 0 — Positioning / ADR decision
- [x] Phase 1 — Product Intent keystone edit + backward-traceability check
- [x] Phase 2 — User-stories pass
- [x] Phase 3 — README (project + repo-root row)
- [ ] Phase 4 — Landing (`index.html`)
- [ ] Phase 5 — Architecture (`architecture.html`)
- [ ] Phase 6 — Brand briefs (EN + RU) + traceability review
- [ ] Phase 7 — Logs, gates, dashboard, archive

## Execution log

### Phase 0 — Positioning / ADR decision

**Decision: no ADR — refinement only.** Judged against the `adr-governance`
criteria (Intent Integrity, Boundary Clarity, Cross-ADR Consistency, Decision
Stability, Mechanism Feasibility): the BYOA repositioning introduces **no new
architectural boundary or invariant**. The five-module ownership split and
ADR-004…018 are unchanged; the operator-facing surface narrative is sharpened,
not the builder's decision structure. The load-bearing positioning decision
("BYOA primary, `/learn` + `/admin` retained as first-class clients") is already
recorded in [`byoa-operator-skills.md`](byoa-operator-skills.md) §"Positioning
decision (resolved)" and is being stated directly in Product Intent. Recording a
separate ADR for a pure intent refinement that changes no boundary would be
over-recording. Decision recorded here and in `agonara/docs/log.md`; intent
editing proceeds.

### Phase 1 — Product Intent keystone edit + backward-traceability check

Added an "Operating model — bring-your-own-agent (BYOA)" section to
`intent_learning_program_app.md` (the product is the API + per-role operator
skills, driven by the operator's own agent, `/learn` + `/admin` retained as
first-class clients), kept all INT-01…07 stories, actors, problem, boundaries,
ownership, and the corpus/student-state separation intact, kept curation
human-owned and the LLM/agent as assistant-not-author, and pushed mechanics to
the contract and architecture docs. Bumped `version` 0.3.0 → 0.4.0 and recorded
the operating-model edit class in the doc's Change review.

**Backward-traceability check (re-derived at execution time).** Grepping
`agonara/docs/adr/` for `intent`, `user stor`, `INT-0`, `CUR-`, `STU-`, `ADM-`,
and actor names returned 13 ADRs: adr-001, 002, 003, 005, 006, 009, 010, 011,
012, 013, 014, 015, 016. Checked each against the BYOA framing:

- **No contradiction in any of the 13.** Every one explicitly lists UI as a
  non-goal ("does not decide … UI") — the BYOA framing only sharpens the
  operator-facing *surface narrative*, which sits below every ADR's decision
  scope.
- The two ADRs that mention a web UI at all describe it as a client of an
  API-first backend: adr-008 ("dockerized private self-hosted instance with a
  network web UI, API-first backend") and adr-017 ("The backend is API-first
  with a network web UI"). Both are consistent with "BYOA primary, UIs
  first-class" — neither claims the UI is the primary or only surface.
- Module ownership (five-module split, ADR-004…018) is unaffected; no ADR
  edited.

### Phase 2 — User-stories pass

Reviewed `curator_user_stories.md`, `student_user_stories.md`, and
`admin_user_stories.md` for "UI is the only access path" assumptions. **None
found** — every story is role/job framed and outcome-based (a grep for
`UI|screen|browser|/learn|/admin|click|button` returned only false positives such
as "started programs" and "easy to confuse"). The "membership governed outside my
workspace" framing is present in each catalog's Terms table and is preserved.

**No new stories added.** BYOA is a new *access path* to the existing role jobs
(CUR-01…18, STU-01…23, ADM-01…15), not a new job; the operating-model statement
now lives at the Product Intent level and applies across all roles. Adding
per-role "drive X from my own agent" stories would duplicate the access-path
agnostic framing and trigger speculative scope creep the plan guards against, so
the catalogs are verified and preserved unchanged. No story added/removed, so the
intent "Change review" story-catalog trigger does not fire.

### Phase 3 — README (project + repo-root row)

Reframed `agonara/README.md`: the lead one-liner and the "Product surfaces"
paragraph now state BYOA as the primary operating model (API + per-role operator
skills driven by the operator's own agent), with `/learn`, `/admin`, and the
operator CLI retained as first-class clients of the same contracts. The
implementation snapshot is untouched and accurate; no UI is presented as deferred
or demoted. Updated the repo-root `README.md` `agonara` Components row (per
`.agents/doc-maintenance.md`) to the repositioned one-liner, kept consistent with
the project README lead.

Update tracker checkboxes only after a phase's required verification passes and
its commit is created; commit the tracker-only status update before starting the
next phase. Phase 7 archives the plan instead of leaving an active tracker copy.

**Per-phase review discipline (applies to every phase).** Each phase's
Validation includes a self-review against the handoff (§2, §3, §5, §7, §8) and
the My Way "lead with intent / intent docs stay about intent" rules, followed by
a post-implementation **adversarial review** against the relevant skill
(`doc-drift-audit` for factual drift, `traceability-review` for intent↔ADR↔spec
links, `arch-doc-review` for the architecture/landing narrative, `adr-governance`
if Phase 0 produces an ADR). Fix every fail or warn and rerun the affected checks
before the phase commit; commit only on a clean review.

## Phase 0 — Positioning / ADR decision

**Objective**: settle the one open governance decision (handoff §4) — whether to
record the BYOA operating-model refinement as an ADR — before editing intent.
(§5, the fate of the UIs, is already resolved: UIs stay, BYOA primary not
exclusive.)

**Key work items**:

- Consult `../docs/my-way/` and the `adr-governance` skill to judge whether a
  refinement of this size warrants an ADR. It is a refinement, not a reversal, so
  the ADR is **optional**, not forced.
- Record the decision in the plan log and `agonara/docs/log.md`: either (a) draft
  an ADR for the operating-model intent (UIs retained), or (b) record a short
  "no ADR — refinement only" rationale.
- If (a): create the ADR under `agonara/docs/adr/` with the next sequential
  number, following the accepted ADR template/format, citing Product Intent.

**Dependencies**: this plan committed.

**Risks**: over-recording (forcing an ADR for a pure refinement) or
under-recording (a genuine positioning decision left untraceable). Resolve by the
adr-governance criteria, not by default.

**Validation**: decision recorded; if an ADR is created, it passes the
`adr-governance` checks and front-matter/link checks.

**Completion signal**: the ADR question is answered and recorded; intent editing
can proceed.

**Commit**: commit the decision (and ADR draft if any) with a short imperative
message.

## Phase 1 — Product Intent keystone edit + backward-traceability check

**Objective**: reframe `intent_learning_program_app.md` around BYOA as the
*operating model*, keeping curated programs + learner progression as the *what*,
and confirm no accepted ADR is contradicted.

**Key work items**:

- Add an explicit BYOA operating-model statement to Product Intent: the product
  is the API + per-role operator skills, driven by the operator's own agent, with
  `/learn` and `/admin` retained as first-class UI clients of the same contract.
  Lead with intent; keep mechanics out.
- Preserve every accepted story (INT-01…07), the actors, problem, boundaries,
  ownership, and the corpus/student-state separation. Keep "AI/LLM as assistant,
  not author" and "human-owned curriculum" intact and, if anything, strengthened.
- Keep the "membership governed outside my workspace" framing load-bearing.
- Run the **backward-traceability check** against every ADR in the table above:
  for each, state flatly whether the BYOA framing contradicts it (expected: no —
  module ownership and decision boundaries are unaffected). Record results in the
  plan log. Edit an ADR only if an actual contradiction is found (none expected).
- Bump the Product Intent `version` in front matter.
- Update the intent doc's own "Change review" / downstream-traceability notes if
  the edit class requires it (an operating-model statement is more than editorial
  wording — note the review performed).

**Dependencies**: Phase 0 complete.

**Risks**: overreach into a rewrite or a new direction (guardrail: if it reads as
a pivot, it has overreached); importing route/schema mechanics into intent;
accidentally implying the agent owns curriculum content.

**Validation**: self-review against handoff §2, §3.1, §7, §8; front-matter/link
checks; backward-traceability results recorded with no unresolved contradiction.

**Completion signal**: Product Intent states the BYOA operating model explicitly
and consistently and still reads as a refinement; all cited ADRs verified
non-contradicted.

**Commit**: commit after green validation with a short imperative message.

## Phase 2 — User-stories pass

**Objective**: ensure no user story assumes a UI as the only access path, and add
BYOA operator stories only where a genuinely new operator job exists.

**Key work items**:

- Review `curator_user_stories.md`, `student_user_stories.md`,
  `admin_user_stories.md` for "UI is the only access path" assumptions. (Survey
  found none — they are already role/job framed and outcome-based. Verify and
  preserve; do not manufacture UI coupling to then "generalize.")
- Generalize any found UI-only phrasing to "via my agent / the API"
  (none expected).
- Add operator stories only if BYOA introduces new operator jobs (e.g.,
  "as a curator I want to drive curation from my own agent"); if added, give them
  acceptance signals and wire downstream traceability per the intent doc's
  conventions. Adding/removing an accepted story triggers the intent doc's
  "Change review" (story catalogs, module responsibility map, affected
  Pre-ADR/spec) — perform it if any story is added.
- Keep the "membership governed outside my workspace" framing.

**Dependencies**: Phase 1 complete.

**Risks**: scope creep via speculative new stories; breaking the role/job framing
that the operator skills depend on.

**Validation**: self-review confirming no UI-only assumptions remain; if stories
were added, the intent "Change review" is performed and recorded;
front-matter/link checks.

**Completion signal**: user stories contain no "UI is the only access path"
assumptions; any new operator stories are traceable.

**Commit**: commit after green validation with a short imperative message.

## Phase 3 — README (project + repo-root row)

**Objective**: lead with BYOA in the project README and update the repo-root
Components-table one-liner.

**Key work items**:

- `agonara/README.md`: reframe the "Product surfaces / how humans and agents
  reach it" narrative to BYOA-first (agent + role skill over the API as the lead)
  with `/learn` + `/admin` retained as first-class clients. Keep the
  implementation snapshot accurate; do not present UIs as deferred or demoted.
- `README.md` (repo root): update the `agonara` Components row (line 50) to the
  repositioned one-liner, per `.agents/doc-maintenance.md`.

**Dependencies**: Phase 1 (intent language to mirror).

**Risks**: the repo-root row drifting from the project README one-liner;
implying the UIs are gone.

**Validation**: project README and repo-root row are consistent; doc-maintenance
Components-table rules satisfied; link/markdown checks.

**Completion signal**: both READMEs present BYOA as the primary operating model
with UIs first-class.

**Commit**: commit after green validation with a short imperative message.

## Phase 4 — Landing (`index.html`)

**Objective**: make the BYOA story front and center on the landing, UIs retained.

**Key work items**:

- Reposition the `#surfaces` section ("How humans and agents reach it") so the
  agent + role skill path leads; keep the `/learn`, `/admin`, HTTP API, OpenAPI,
  and CLI cards as first-class clients of the same contract.
- Reframe the hero ("agent-ready backend contracts") toward BYOA; consider a
  "Bring your own agent" hero/section.
- Confirm the dead `agonara-api` skill card is already removed (expected — no
  cleanup); the remaining work is narrative repositioning, not deletion.

**Dependencies**: Phase 1, Phase 3 (consistent narrative).

**Risks**: turning the landing into a pivot announcement; demoting the UI cards;
introducing implementation detail better left to architecture.

**Validation**: visual/structure review of the `#surfaces` section and hero;
links intact; no UI demotion. (Landing is not Node/TS — no test suite, but verify
the page still renders/validates as HTML.)

**Completion signal**: the landing presents BYOA as primary with UIs alongside.

**Commit**: commit after green validation with a short imperative message.

## Phase 5 — Architecture (`architecture.html`)

**Objective**: make the surfaces/runtime narrative consistent with BYOA; keep the
module ownership map (builder's view) unchanged.

**Key work items**:

- Reposition the deployment-section statement that "the network web UI remains
  the primary human interface" (line ~523–526) to BYOA-primary with `/learn`,
  `/admin`, CLI, and operator skills as first-class clients of the same contract.
- Verify the rest of the surfaces/runtime narrative is consistent with BYOA.
- Leave the five-module ownership map and ADR-backed boundaries intact (handoff
  §7) — this is the builder's view and is correct.

**Dependencies**: Phase 1 (intent), Phase 4 (landing narrative to mirror).

**Risks**: editing the module ownership story (forbidden); leaving a stale
"primary human interface" claim that contradicts the repositioned landing.

**Validation**: structure review; module ownership map unchanged; HTML renders;
links intact.

**Completion signal**: architecture surfaces/runtime narrative is BYOA-consistent
with ownership map preserved.

**Commit**: commit after green validation with a short imperative message.

## Phase 6 — Brand briefs (EN + RU) + traceability review

**Objective**: keep the brand "Product Fit"/"Positioning" framing holding under
BYOA (EN/RU parity), then run the intent → ADR → spec traceability pass.

**Key work items**:

- `brand_brief.md`: confirm "Product Fit" still holds; add BYOA where it
  strengthens "AI as assistant, not author" + "human-owned curriculum." Keep it
  positioning, not mechanics.
- `brand_brief_ru.md`: mirror the EN edits exactly (EN/RU parity).
- Run the `traceability-review` skill over intent → ADR → spec to catch any
  divergence the reframe introduced; re-confirm the Phase 1 backward-traceability
  results. Reconcile any drift found (expected: none in module ownership; the
  reframe is operator-facing).

**Dependencies**: Phases 1–5 complete (intent and downstream docs settled).

**Risks**: EN/RU drift; the traceability review surfacing real intent↔ADR↔spec
drift that needs reconciliation before closeout.

**Validation**: EN/RU parity verified; `traceability-review` run with findings
recorded and drift reconciled; front-matter/link checks.

**Completion signal**: brand briefs are BYOA-consistent in both languages; the
traceability review is clean (or drift is reconciled).

**Commit**: commit after green validation with a short imperative message.

## Phase 7 — Logs, gates, dashboard, archive

**Objective**: record the change set, run repo gates, and archive the plan in the
same change as the implementation.

**Key work items**:

- Add a closeout entry to `agonara/docs/log.md`; add a repo-root `docs/log.md`
  entry only if the change is genuinely repo-wide (the repo-root Components-row
  edit may warrant one line).
- Run repo verification gates. The repositioning is docs/landing-mostly; if **no**
  Node/TS/config/CI/generated artifact was touched, the Node test/build suite is
  not required (landing/README/intent/brand are not Node/TS). If any such artifact
  was touched (e.g., an ADR index or generated file), run
  `./scripts/run_silent.sh "tests" npm test` and
  `./scripts/run_silent.sh "build" npx tsc --noEmit`.
- If documentation movement is substantial, refresh `docs/loc-dashboard.html`
  with `./scripts/loc-dashboard.sh --sort=name` and verify summary cards, table
  footer, `data` array, and `Last updated` line match the script output.
- Run `git diff --check`.
- Move this plan to `agonara/docs/plans/implemented/agonara-byoa-repositioning.md`
  (`git mv`), shipping the move in the same PR as the implementation.

**Dependencies**: Phases 0–6 complete and reviewed clean.

**Risks**: archiving before traceability is clean; skipping the dashboard refresh
after substantial doc movement; leaving the plan in `docs/plans/` so trunk sees
"implementation in, plan still to-do."

**Validation**: logs updated; applicable gates green; `git diff --check` clean;
plan archived; (if applicable) dashboard refreshed and matching script output.

**Completion signal**: change set logged, gated, and the plan archived under
`implemented/`.

**Commit**: commit the closeout (including the archive move) with a short
imperative message.

## Done criteria

- Product Intent states the BYOA operating model explicitly and consistently and
  reads as a refinement — the product's purpose is recognizably unchanged
  (handoff §8).
- README (project + repo-root row), landing, and architecture present BYOA as the
  primary way to operate Agonara, with the `/learn` and `/admin` UIs retained as
  first-class clients (handoff §5).
- User stories contain no "UI is the only access path" assumptions.
- Intent/README/brand docs stay about intent — no implementation detail imported
  that belongs in the contract or architecture docs.
- The five-module ownership story and all accepted ADRs are unchanged and
  uncontradicted; backward-traceability checked.
- intent ↔ ADR ↔ spec traceability is clean (review run, drift reconciled).
- An ADR for the operating-model refinement exists **iff** Phase 0 concluded one
  is warranted (optional, not required).
- EN/RU brand parity preserved.
- `agonara/docs/log.md` updated; applicable repo gates green.

## Final closeout

Final gates: front-matter/link/markdown checks for every touched doc; HTML
render/validation for `index.html` and `architecture.html`; `traceability-review`
clean; `git diff --check`. Run `./scripts/run_silent.sh "tests" npm test` and
`./scripts/run_silent.sh "build" npx tsc --noEmit` **only if** a
Node/TS/config/CI/generated artifact was touched. If documentation movement is
substantial, refresh `docs/loc-dashboard.html` via `./scripts/loc-dashboard.sh
--sort=name` and verify it matches script output.
Archive plan: move to `agonara/docs/plans/implemented/agonara-byoa-repositioning.md`
Commit archive move: yes (same PR as the implementation)
Push/PR: follow push policy (push at closeout); open a PR into trunk only if
explicitly requested, per repo conventions (merge commit; `--auto
--delete-branch`).
