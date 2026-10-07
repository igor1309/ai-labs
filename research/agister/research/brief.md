# The brief: the words a piece of work starts from

What a brief is, what the owner's method and practice already say about it,
what outside methods do, and the shape proposed for Agister. Collected on
2026-10-07 for Multica LAB-115. Relates to LAB-105 (intent reviewer) and
LAB-114 (a call works where it is called).

Paths are relative to the `ai-labs` repo unless marked `ios.config:` (the
repo at `~/Developer/Fora/iFora/iOS-app/ios.config`) or `bmad:` (BMAD
Method trunk, commit `bda3c592`, 2026-10-06,
`https://github.com/bmad-code-org/BMAD-METHOD/blob/main/<path>`). Quotes are
verbatim; every one was checked against its file.

**Owner** marks the owner's own decision or practice. **Outside** marks an
idea from another method.

## 1. Agister today

- The implementer takes a required file param `brief`
  (`~/.agister/processes/implement.yaml`, `.agister/processes/implement.yaml`).
  The review workflow takes a required file param `goal`, resolved once and
  given to every review node; the judge does not get it
  ([ADR-023](../../../agister/docs/adr/023-reviewers-know-the-goal.md)
  rule 1, ADR-003 rule 4).
- ADR-023 rule 2 (**Owner**): "A brief's claims are not binding". A
  scope exclusion is "the owner's": a reviewer may show it stops the goal,
  and the judge rules `owner`.
- The words are not kept. A `file` input records only its digest, and a
  value over `inlineInputChars = 2000` is dropped from the record
  (`agister/internal/app/calls.go:688`). Observed on 2026-10-07:
  - implement run `20261007T054525Z-566bc6` records
    `brief: agister/testdata/briefs/lab-114-step-1-works-where-called.md`,
    `sha256:bdbd…`, no value;
  - code_review workflow `20261007T053330Z-5121d0` was given
    `/tmp/dbsnew17617/review-r5/goal.md`; the workflow record holds a digest
    of a file that will not survive the host, while each node holds the full
    text by accident, because `source: param` takes the literal as identity.
- In practice (**Owner**) briefs are hand-written and committed one per
  run: 145 files in `agister/testdata/briefs/`, of three kinds — feature
  briefs (`lab-108-touched-and-denied.md`: Gap, Scope, Done when,
  Constraints, Check), goal files for review (`lab-114-goal.md`: the issue as
  filed, what changed since, done gates, dated owner decisions), and review
  round briefs (`lab-108-review-1.md`: the judge's fix items, "Change
  nothing else", a pointer to the parent brief). Section names drift: Check
  33 files, Tests 19, Wanted 8, Constraints 8, Out of scope 5, Done when 2.

## 2. The owner's method (my-way)

- There is no artifact named "brief". The words work starts from depend on
  size (`docs/my-way/00-product-intent/note.md:117-123`):
  - full work: **Product Intent** — Product outcome, Actors, User stories
    (each with "a stable identifier, acceptance signal, and status",
    `00-product-intent/structure.md:43`), Acceptance signals, Boundaries and
    non-goals, Open product questions, Downstream traceability, Change
    review;
  - minor feature: a "compact story statement or Product Intent reference…
    If existing Product Intent already covers the change, link to it instead
    of restating it" (`variants/minor-feature/structure.md:35`), and a
    Behavior delta, "the load-bearing section" (`:39`);
  - bug fix: Symptom ("No speculation about cause"), Reproduction, and
    `## Expected behavior source`: "If the source is missing or ambiguous,
    say so explicitly" (`variants/bug-fix/structure.md:31,43`).
- The intake skill writes the nearest literal brief, `format: intake-brief`
  (`dev-skills/public/intake/SKILL.md:63-96`): "No solution design in the
  brief. Intake establishes *what*, not *how*" (`:126`).
- Intent is the parent: "An ADR cannot contradict the intent. If it does,
  the ADR is wrong — not the intent" (`docs/my-way/informal-brief.md:43`).
  Intent can change, but the change "lands in the intent artifact first"
  (`00-product-intent/note.md:113`).
- Ceremony scales down by escalation triggers, not by default
  (`variants/minor-feature/note.md:109-117`, `variants/bug-fix/note.md:106-111`).
- Artifacts are committed with the code (`docs/my-way/pre-coding-phase.md:265`);
  "chat logs are where context goes to die" (`prior-art/xp-roots.md:26`,
  **Outside**, XP recast).
- The reviewer against intent is `dev-skills/public/traceability-review`:
  "The ground truth for every check is the upstream node, not the code"
  (`SKILL.md:22`); "Suggest, never apply" (`:97`).
- Intent debt (**Outside**, Osmani): the owner takes "vocabulary, not
  mechanism" (`docs/my-way/research/intent-debt-osmani.md:48`).
- Open: where artifacts live long-term is "intentionally undecided"
  (`docs/my-way/future-shape.md`); intent lifecycle statuses were left out on
  purpose.

## 3. The owner's practice in production (ios.config)

- A brief is one step, not one ticket: "One `agister run implement` call
  against the committed [SPEC.md]" (`ios.config:.claude/skills/ticket-folder/templates/BRIEF.md:9`).
  Sections: `## Covers` (SPEC scenario → the check that proves it),
  `## Acts on` (NOTES.md findings), `## Open` (`None.`). It has no intent
  prose of its own; intent lives in SPEC.md, which it links.
- "The seam is the brief: the caller states *what* correct means, the
  implementer derives *how* to prove it" (`ios.config:.claude/skills/ticket-implementation/SKILL.md:111-112`).
- Verification never trusts a brief: it maps every SPEC scenario to a
  brief, a check and its exit code (GATE.md Criteria); "a criterion with no
  passing check is declared open, never silently passed"
  (`ticket-verification/SKILL.md:28-30`).
- Rounds are append-only; "a round is never reopened"
  (`ticket-folder/scripts/seed-ticket-folder.sh:125`). The checker refuses an
  `## Open` that is not `None.` (`check-ticket-folder.py:89-101`).
- What failed:
  - brief-handoff drift: "A restatement is exactly the drift that rotted the
    brief handoff" (`ticket-orchestrator/backlog/de-encapsulation-rulings.md:26`);
  - orchestrator-written text leaking into review prompts
    (`dispatch-and-gate/research/failure-modes.md`); stages now get "the
    prompt file's **text**, not its path" (`dispatch-and-gate/SKILL.md:49`);
  - a stage amending its own charter, so "the run edits its own measuring
    stick" (`dispatch-and-gate/backlog/backlog.md:10-11`), still open.
- Oversized briefs (`research/orchestration/oversized-brief-design-options.md`):
  no option was chosen; the skills now split in the delegate phase into
  steps "each small enough for one implementer run". Research puts the
  split in a planning step before execution
  (`decomposition-ownership.md:23`).

## 4. Agister's own research

- Caller seam (`research/agister/adversarial-cycle/adr/caller-seam.md:111`):
  "Brief down, receipt up — the only execution boundary." The receipt pins
  the brief's blob SHA. "A bad brief is rejected, never repaired."
  Persistence is the caller's.
- Verger lessons (`research/agister/research/verger/lessons/`):
  "Briefs cause bugs too, so a script writes them" (L7); "Split in the
  tracker, never inside a brief"; rules added to briefs by hand are lost — a
  brief rule exists only in its template; rules kept in /tmp die with the
  host (L132).
- `research/workflows/review.md` held the opposite view (reviewers with no
  spec, the judge with context); ADR-023 settled it the other way.

## 5. Outside methods

| Source | Starting words | Scaling | Reviewer reads |
|---|---|---|---|
| BMAD Build plan (`bmad:src/skills/bmad-build/plan-template.md`) | a `<frozen-after-approval reason="human-owned intent">` block: Intent (Problem, Approach), Boundaries & Constraints (Always / Never), I/O & Edge-Case Matrix; agent-owned Tasks & Acceptance (Given/When/Then), append-only logs | route `oneshot` (≤100 lines) drops all but Intent; scope 900–1600 tokens | Intent Alignment Auditor gets only "the verbatim intent this work started from" and the diff (`bmad:src/skills/bmad-code-review/customize.toml`) |
| BMAD story (`bmad:src/skills/bmad-ticket/assets/story-template.md`) | Description, Acceptance Criteria (one `Verify:` line, or numbered Given/When/Then), Boundaries ("name behavior, not files"), References | bug adds Reproduction, Cause Hypothesis | — |
| GitHub Spec Kit (`templates/spec-template.md`) | user stories with Given/When/Then, functional requirements, success criteria, at most 3 `[NEEDS CLARIFICATION]` | one fixed set | `/analyze` checks artifacts against each other |
| Kiro (https://kiro.dev/docs/specs/) | `requirements.md` in EARS ("WHEN … THE SYSTEM SHALL …"), `bugfix.md` for bugs | requirements-first or design-first | tasks trace to requirements |
| Shape Up (https://basecamp.com/shapeup/1.5-chapter-06) | Problem, Appetite, Solution, Rabbit Holes, No-gos | appetite fixes time, not scope | — |

BMAD's triage (`bmad:src/skills/bmad-build/step-04-review.md`) routes a
finding whose cause is in the frozen intent as `intent_gap` (to the human,
code reverted), and one outside it as `bad_plan` or `patch`; a finding is out
of scope "only when the intent itself excludes it". Commit messages and the
plan go to one lens as claims: "The narrative is the author's testimony,
not evidence".

## 6. Where they agree and differ

All sources agree on four parts: what should be true and why; observable
done-checks; explicit exclusions; open questions kept apart from decisions.
All keep the *how* out of the starting words.

Owner-specific choices, not found in BMAD:
- intent is linked, never restated (my-way, ios.config R1, ADR-023);
- the brief is a committed file the caller owns (caller seam, my-way);
- `## Open` must be `None.` before work starts (ios.config checker);
- verification maps each criterion to a passing check, not a verdict.

Where BMAD differs and is worth taking:
- one file with an owner-owned frozen part and agent-owned appended parts
  (the owner splits these across SPEC / BRIEF / RECORD files instead);
- the descriptive auditor: readings of the intent, which one the diff
  implements, where the surfaces diverge — LAB-105 already borrows it;
- `intent_gap` versus `bad_plan` routing.

Not worth taking for Agister: personas, the PRD → epic → story chain,
sprint status, context stuffing into stories (BMAD itself moved off it),
finding quotas.

## 7. Proposed shape

Agister is an orchestrator grown in small, isolated steps (ADR-025); it does
not plan. So this step defines the brief as an interface: the shape and
protocol of what a run takes in, the definition of ready to the
implementer's definition of done (`schemas/implementation.json`). Writing a
brief stays outside Agister for now; keeping it and handing it on is
Agister's.

### Two layers

1. **The goal**: what a piece of work is for, in the owner's words or by
   reference to them. Every reviewer receives it as `goal` (ADR-023,
   unchanged). One per issue is the usual case, not a rule.
2. **The step brief**: one implementer run. Which of the goal's criteria it
   makes true, and a reference to the goal. A review round's brief is a
   step brief whose items are the judge's fixes, and it names the judgement
   it comes from. A one-step change needs no step brief: the goal is passed
   as the brief.

This is the split the owner already practises: SPEC.md and BRIEF.md in
ios.config, `lab-<n>-goal.md` and `lab-<n>-*.md` in
`agister/testdata/briefs/`.

### The goal's contract

A small common contract with conditional parts, not one fixed form at every
size (§2: ceremony scales down).

| Part | When | Notes |
|---|---|---|
| Intent | always | prose, or a reference to the upstream artifact that states it (Product Intent, SPEC, issue); a reference is preferred to a restatement (§3: restatement drift) |
| Done when | always | observable criteria; reuse upstream story or scenario ids where they exist, number them only where none do |
| Expected behaviour, source, reproduction | bug fix | the expected behaviour comes first with its source, or an explicit "source missing"; the failing-then-passing test is the evidence, not the criterion |
| Out of scope | always, may be `None.` | the owner's, and challengeable: a reviewer may show an exclusion stops the goal, and the judge rules `owner` (ADR-023 rule 2) |
| Sources | when correctness depends on an upstream artifact | references, not copies |
| Decisions | when the owner has ruled | dated; a change of intent lands upstream first (§2), then here |
| Open | always | must read `None.` for every run that receives it, not only the first |

### The step brief's contract

- Goal: the goal's reference (below).
- Covers: the criteria this step makes true. The implementer derives the
  check that proves each, unless the goal already names one (§3: the caller
  says *what* correct means, the implementer *how*).
- Acts on: findings or judge items, when there are any.
- Constraints: only what the goal does not already say.
- Open: `None.`

### Where it lives

Owner's rule: a SPEC and its QA belong to the repository, as its truth;
plans, briefs and goals do not. They are disposable as content and worth
keeping as research and audit material. Committing them wins only until the
PR; then a cleanup is due, which is easy to skip and, when done, leaves an
audit to dig through history.

So a brief lives outside the repository:

- **In the run.** Agister stores the bytes it was given in the run's
  evidence (`artifacts/brief.md`, `artifacts/goal.md`) with their digest.
  This is the durable copy, for audit, and makes ADR-001 rule 10 ("Anything
  needed to understand a call is evidence") true for briefs.
- **In /tmp, as a working copy.** The run records it in a field whose name
  says it is ephemeral, such as `tmp_link`. Later runs reuse the link while
  the host has not rebooted. When the file is gone, the run's copy is the
  source.
- **Linked explicitly.** A run that serves a goal records the goal's run
  artifact and digest, not only a path. Nothing is found by searching runs.

A goal's text never changes inside a run. The stored copy is written once
and the input digest guards it: a later run given different bytes records a
different goal. A change of intent is a new goal, with the reason in its
Decisions.

### How processes and reviewers get it

- The implementer: `brief`, as today.
- Every review node: `goal`, as today (ADR-023). Not the step brief: its
  claims are testimony.
- The intent auditor (LAB-105): one more fan-out node in `code_review` with
  the same `goal`, and its own prompt and duties (the descriptive readings,
  implemented reading and divergence). Its premise that the other reviewers
  stay blind no longer holds.
- The judge stays blind (ADR-003 rule 4, ADR-023).

### Checks at the entry

- Structural, by Agister or the caller skill: the goal resolves, its
  references resolve, the conditional parts are present, Open reads
  `None.`. A normal contract check.
- Semantic, whether the brief is right: an optional caller process, not
  Agister's ("A bad brief is rejected, never repaired", caller seam).

## 8. Follow-ups

Drafted for Multica (not yet filed):

1. **ADR: the brief.** The thin handoff: goal and step brief, their
   contracts, the caller writes, the run keeps, the repository does not.
   Detailed templates stay in settings.
2. **Keep inputs' words in the run's evidence.** A `file` input whose text
   exceeds 2000 characters is recorded as a digest only, and a /tmp path is
   lost (both observed, §1). Store the bytes as a run artifact for process
   and workflow inputs alike; stop `source: param` copying the goal into
   every node's identity.
3. **The ephemeral working copy and the link.** `tmp_link` (or similar) in
   the record, reuse across runs, fall back to the run's copy; a run records
   the goal it serves by artifact and digest; a repair round records the
   judgement it answers.
4. **Templates in settings and the structural check.** Conditional parts,
   resolved references, Open `None.`; no semantic judgement.
5. **Re-scope LAB-105 after ADR-023.** The intent auditor is one more review
   node with `goal`; drop "the other reviewers still do not see the brief".

Settled, not reopened: the judge does not see the goal (ADR-023).
