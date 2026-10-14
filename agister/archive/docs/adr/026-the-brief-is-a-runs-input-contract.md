# ADR-026: The brief is a run's input contract

- **Status:** Accepted
- **Amended by:** [ADR-029](029-the-investigator-grounds-a-task.md)
  (rules 1, 4, 6, 8 and 9)
- **Date:** 2026-10-07
- **Scope:** what a run is given to start from, in which layers, who
  writes it, where it is kept and who receives it
- **Decision type:** Architecture
- **Relates to:** [ADR-001](001-agister-cli-architecture.md) rules 1, 2
  and 10, [ADR-003](003-fan-out-and-join-workflow.md) rule 4,
  [ADR-014](014-prompts-are-settings.md),
  [ADR-023](023-reviewers-know-the-goal.md) rules 1 and 2,
  [ADR-025](025-a-call-works-where-it-is-called.md)
- **Source:** LAB-115 (`research/agister/research/brief.md`), LAB-116

## Context

The implementer takes a required file param `brief`. A review workflow
takes a required file param `goal`, resolved once and given to every
review node; the judge does not get it (ADR-023 rule 1, ADR-003 rule 4).
Nothing says what either holds.

In practice the caller's agent writes briefs and commits one per run: 145
files in `agister/testdata/briefs/`. They are of three kinds: feature
briefs, goal files for review, and review round briefs that carry the
judge's fix items and point to the parent brief. Their section names
drift: Check in 33 files, Tests in 19, Done when in 2.

The words are not kept. A `file` input records only its digest, and a
value over 2000 characters is dropped from the record. One observed review
was given a goal under `/tmp`: the workflow record holds the digest of a
file that will not outlive the host.

The owner's method has no artifact named "brief". What work starts from
depends on its size: a Product Intent for full work, a compact story or a
link to existing intent for a minor feature, and for a bug its symptom,
reproduction and the source of the expected behaviour. Ceremony scales
down, and intent is linked, not restated.

In ios.config a brief is one step, not one ticket: one implementer run
against the committed SPEC, with what it covers, what it acts on and an
Open section that must read `None.`. Its intent lives in the SPEC, which
it links. A restatement there is "exactly the drift that rotted the brief
handoff".

Agister's own research says the same at its boundary: "Brief down,
receipt up"; "A bad brief is rejected, never repaired"; persistence is
the caller's.

Outside methods (BMAD, Spec Kit, Kiro, Shape Up) agree on four parts: what
should be true and why, observable done-checks, explicit exclusions, and
open questions kept apart from decisions. All keep the *how* out of the
words work starts from.

Agister is grown in small, isolated steps and does not plan (ADR-025).
What it lacks is the interface: the shape of what a run takes in, and
where those words are kept.

## Decision drivers

- A run's input has a contract, as its output does.
- Intent is linked, not restated: a restatement drifts.
- Ceremony scales down with the size of the work.
- The caller writes the brief; Agister does not plan, write or repair it.
- Anything needed to understand a call is evidence (ADR-001 rule 10).
- The repository holds its truth, not the scaffolding that produced it.
- Reviewers know the goal; the judge stays blind (ADR-023).
- Templates are settings, not code (ADR-001 rule 2, ADR-014).

## Decision

### 1. A brief is a run's input contract

A brief says what a run must make true, as the implementer's result
(`schemas/implementation.json`) says what it did: the definition of ready
to its definition of done. The caller writes it, the owner or the caller's
agent. Agister does not write, plan or repair a brief (ADR-025; "a bad
brief is rejected, never repaired").

### 2. Two layers

- **The goal:** what a piece of work is for, in the owner's words or by
  reference to them. Every review node receives it as `goal` (ADR-023,
  unchanged). One goal per issue is usual, not a rule.
- **The step brief:** one implementer run. It names the goal's criteria
  it makes true and refers to the goal. A review round's brief is a step
  brief whose items are the judge's fix items, and it names the judgement
  it answers.

A one-step change needs no step brief: the goal is passed as the brief.

### 3. The goal's contract

A small common part with conditional parts, not one fixed form at every
size:

- **Intent**, always: prose, or a reference to the upstream artifact that
  states it (Product Intent, SPEC, issue). A reference is preferred.
- **Done when**, always: observable criteria. They reuse upstream story
  or scenario ids where those exist.
- **Expected behaviour**, for a bug fix: the behaviour with its source, or
  an explicit "source missing", and the reproduction. The test that fails
  and then passes is the evidence, not the criterion.
- **Out of scope**, always, may be `None.`: the owner's, and challengeable
  (ADR-023 rule 2).
- **Sources**, when correctness depends on an upstream artifact:
  references, not copies.
- **Decisions**, when the owner has ruled: dated.
- **Open**, always: reads `None.` for every run that receives the goal,
  not only the first.

### 4. The step brief's contract

- **Goal:** the goal's reference.
- **Covers:** the criteria this step makes true. The implementer derives
  the check that proves each, unless the goal names one.
- **Acts on:** the findings or judge items, when there are any.
- **Constraints:** only what the goal does not already say.
- **Open:** `None.`

### 5. The headings and templates are settings

The exact headings and templates are settings, not code (ADR-001 rules 1
and 2, ADR-014). This ADR names the parts, not their Markdown.

### 6. A brief belongs to the run, not to the repository

A SPEC and its QA are the repository's truth. Plans, briefs and goals are
not: they are disposable as content, and kept as research and audit
material.

- The run keeps the durable copy of the bytes it was given, with their
  digest (ADR-001 rule 10).
- A disposable working copy may sit under `~/.agister/cache/`, in a record
  field whose name says it is disposable. The cache may be cleared at any
  time; then the run's copy is the source.
- Nothing is found by searching runs. A run records the goal it serves by
  reference and digest.

A goal's text does not change inside a run. A change of intent is a new
goal, with its reason in its Decisions.

### 7. Two conditions

- **Decisions go upstream.** A goal's owner decisions also land in the
  SPEC or the issue. A ruling kept only in a run is lost to the next SPEC
  change.
- **Runs need an export.** The run store is one host, not replicated as a
  repository is. Audit needs an export of runs to a durable place.

### 8. Checks at the entry

A structural check is a normal contract check: the goal resolves, its
references resolve, the conditional parts are present, Open reads `None.`.
Whether a brief is right is an optional caller process, not Agister's.

### 9. Who receives what

- The implementer: `brief`.
- Every review node: `goal`, not the step brief. A step brief's claims are
  testimony.
- The judge: neither. It stays blind (ADR-003 rule 4, ADR-023); this is
  not reopened.

### 10. Left out

Each comes in its own issue, after this ADR is reviewed:

- How the bytes are stored in the run: LAB-117.
- The working copy and the link from a run to its goal and judgement:
  LAB-118.
- The templates in settings and the structural check: LAB-119.
- The intent reviewer: LAB-120, which re-scopes LAB-105.
- The export of runs: LAB-121.

## Consequences

- Briefs and goals get one vocabulary. The section names stop drifting
  once the templates are settings.
- The caller writes two kinds of file, not one per run of any shape. A
  one-step change still writes one.
- The run becomes a brief's home, not `agister/testdata/briefs/`. Until
  LAB-117 lands, a run keeps only a digest of a long brief, so briefs are
  committed as today until then.
- A run's record becomes enough to read what the run was asked to do,
  for as long as the host keeps it; past that, only an export keeps it.
- Owner decisions are written twice, in the goal and upstream. The goal's
  copy is for the run; the upstream one is the truth.
- Agister checks a brief's structure, never its meaning. A wrong brief
  that is well formed runs.

## Alternatives considered

- **Commit briefs to the repository** (today's `agister/testdata/briefs/`):
  rejected; it wins only until the PR, then needs a cleanup that is easy
  to skip, and an audit digs through history.
- **A working copy under /tmp:** rejected; macOS clears old files there on
  a schedule, not only on reboot, and a run's inputs must not depend on it.
- **One fixed brief form at every size:** rejected; it contradicts scaling
  ceremony down.
- **Agister writes or reviews a brief's meaning:** rejected; Agister does
  not plan (ADR-025).
