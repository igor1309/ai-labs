# ADR-029: The investigator grounds a task

- **Status:** Proposed
- **Date:** 2026-10-08
- **Scope:** who finds out what a task's work rests on in the code
  before an implementer starts, what that run returns, when a later run
  accepts it, and what a brief is made of
- **Decision type:** Architecture
- **Amends:** [ADR-026](026-the-brief-is-a-runs-input-contract.md) rules
  1, 4, 6, 8 and 9
- **Relates to:** [ADR-001](001-agister-cli-architecture.md) rules 1, 2,
  6 and 7, [ADR-003](003-fan-out-and-join-workflow.md),
  [ADR-006](006-a-call-gets-its-repository-instructions.md),
  [ADR-007](007-an-advisor-decides-open-questions.md),
  [ADR-023](023-reviewers-know-the-goal.md) rule 1,
  [ADR-025](025-a-call-works-where-it-is-called.md),
  [ADR-028](028-a-run-keeps-its-output.md)
- **Source:** LAB-129; LAB-126 and LAB-127
  (`research/agister/research/pre-implementation-investigation.md`); the
  owner's decisions on them, 2026-10-08: a brief is what the implementer
  gets, the task and the onboarding; the investigator's output is the
  onboarding part and is not called a brief; it is task-scoped and stays
  in the run that produced it; the investigator takes this work out of
  the orchestrator's context; an ADR that stands in the way is changed.
  The name, the planning step and one grounding per task are the
  orchestrator's proposal on LAB-129, for the owner to rule on.

## Context

Before an implementer changes code, someone finds out where the work
lives, which pattern applies, what constrains the change and which
earlier decisions bear on it. Agister has no step for that: none of the
processes in `agister/home/processes/` reads a repository before a
change.

The work is done all the same, by the orchestrating agent, each time it
writes a brief. Of the 218 briefs in `agister/testdata/briefs/`, 150 cite
code paths and 47 carry a `## Constraints` part. Each investigation
fills the orchestrator's context, and its result exists only inside a
brief.

The implementer is given the brief, the instruction files its runtime
loads (ADR-006), the optional prompts of its process and the
repository's check. It is not given the recorded decisions: the advisor
reads the ADRs and `decisions.md`, after work has already stopped on a
question (ADR-007). The implementer then finds its own way, and a large
share of its run's tool calls come before its first edit.

Existing solutions fall into three families: standing documentation of
the repository, written once and loaded every time; context computed for
each request; and an investigation per task, in a context of its own,
that returns a compact result. Documentation of a whole repository is
expensive to write and goes stale. A measurement of instruction files
found that repository overviews did not help, and that such files raised
cost by over 20%. A file read on every task and updated by hand has
nothing that checks it against the code.

ios.config already has investigation as a phase with a contract. A
finding is one sentence, with the scenarios it serves and a citation of
path and symbol. Only facts that locate the work, expose a gap or
identify something existing that changes the work needed are kept.
Nothing restates the SPEC or proposes a solution. An absence claim is
checked against the owning code and other names. An unresolved decision
goes to Open with its source and who owes the answer, and a checker
refuses an Open that does not read `None.`.

Multi-step work runs each step at the previous step's commit. The
candidate moves away from the revision an investigation read, by design.

ADR-026 says the caller writes the brief, and gives it no part for what
the code holds.

## Decision drivers

- The investigation leaves the orchestrator's context, and so does its
  result: the orchestrator passes a reference.
- Investigate a task, not a repository. A result made for one task has
  little to go stale.
- Facts can be checked; a recommendation cannot.
- A missing part fails a check. A stale or unfinished result is refused,
  never repaired.
- The checks are deterministic and come before the first turn (ADR-001
  rule 7, ADR-026 rule 8).
- Agister does not plan (ADR-025): the investigator is settings (ADR-001
  rules 1 and 2).
- Ceremony scales down: a small change needs no investigation.
- One pass first; narrow readers only when one prompt proves unreliable.
- An ADR that stands in the way is changed.

## Decision

### 1. The investigator is a process the caller runs

The investigator is a process in settings. The caller runs it, as it
runs an implementer or a review. The binary does not investigate, and
nothing starts an investigation but a call (ADR-025: Agister does not
plan).

It works per task, in a context of its own. It is given the task, not
"document the repository". Its inputs are:

- the task, by reference: the caller names the file that holds it and
  does not restate it;
- the candidate;
- the depth the caller asks for, so that a small change does not pay for
  a full investigation. What depths there are is the process's to say.

Its process pins the candidate and needs a clean worktree (ADR-025 rules
2 and 3), so what it reads is the content of the revision it records.

It is one process to start. It becomes a workflow of narrow readers
(where the code is, how it works, which pattern to follow) with a join
only if one prompt proves unreliable.

### 2. It reads and does not write

It may read, search, diff, read history and run commands that do not
write. Home's read-only review policy, `codex-review`, already grants
that. It may not write, to the worktree or to history.

It reads the repository's instruction files (`AGENTS.md`, `.agister/`)
and its recorded decisions (the ADRs, a `decisions.md`), and reconciles
them with the code. Nothing else gives the implementer the decisions
that bear on its change.

It uses tools for structure (files, symbols, dependencies) and spends
its judgement on intent and conventions.

### 3. It describes what exists

The investigator describes what exists. It proposes neither a solution
nor a way to prove a criterion: the implementer derives each check
(ADR-026 rule 4). A result of facts can be checked. One that recommends
cannot, and it takes the planner's and the implementer's work.

It checks an absence claim against the owning code and other names. A
search that finds nothing does not show that something is missing.

### 4. Its output is the grounding

The investigator's output is the **grounding**: the facts in the code
that the task's work rests on. It is not called a brief (rule 8).

- It is task-scoped: made for one task, not as standing documentation of
  the repository.
- It is a JSON output under a schema, as the implementer's result is
  (`schemas/implementation.json`), so that a missing part fails the
  output check.
- Each finding is tied to a criterion of the task, a path and a symbol.
  Never a line number: it goes stale with the first edit.
- It holds only facts that locate the work, show a gap, or name
  something already there that changes the work needed. It does not
  restate the task or catalogue what was read.

### 5. The grounding's parts

1. The task it serves by reference, the repository, the revision and
   branch read, and the depth asked for.
2. Where the work lives: one sentence per finding, tied to a criterion
   of the task.
3. Boundaries touched: the modules involved, and what is shared with
   code outside the change.
4. Patterns to follow: a pointer to the rule, prompt or ADR that owns
   each, with one example file.
5. Dependencies of the touched code, internal with direction and
   external.
6. Entry points: the build, test and verify commands for the touched
   area, each with the file that defines it.
7. Constraints, pitfalls and prior decisions that bear on the change,
   and any contradiction between an instruction file and the code.
8. Coverage: what was searched, what was excluded, and the files the
   findings rest on.
9. Open questions, each with its source and who owes the answer.

Part 6 names the commands that exist, not the one that proves a
criterion (rule 3). Part 9 may be empty, and only then is the grounding
accepted (rule 7).

### 6. The grounding stays in its run

The grounding stays in the run that produced it, as that run's output
(ADR-028 rule 1). It reaches a later run by reference (ADR-028 rule 3).
The orchestrator passes the run's ID and never reads the grounding: its
context is what the investigator relieves.

### 7. Two checks at the entry

A call that is given a grounding makes two checks before its first turn.
Both are deterministic, and failing either refuses the call (ADR-001
rule 7). A grounding is refused, never repaired.

- **The revision check.** The grounding's revision is the candidate or
  an ancestor of it, and none of the files its findings rest on (part 8)
  changed between the two. Requiring the same revision would refuse
  every step after the first.
- **The gate on open questions.** A grounding with an open question
  (part 9) is not accepted.

The investigator's run completes with open questions: they are what it
found, not its failure (ADR-001 rule 6). Each goes to who owes the
answer. The answers are recorded where decisions are, in the task's
Decisions or in the repository's recorded decisions (ADR-026 rule 3,
ADR-007 rule 3), and the investigator runs again with them.

The core knows no grounding (ADR-001 rule 1): a process that takes one
names the checks in settings.

### 8. A brief is the task and the grounding

A brief is what the implementer gets. It has two parts, the task and the
grounding. ADR-026 is amended:

- **Rule 1:** a brief has two parts, the task and the grounding. The
  task is rule 2's goal or step brief. "The caller writes it" holds for
  the task part only; the grounding is a run's output. Agister still
  writes, plans and repairs neither.
- **Rule 4:** a step brief's Constraints hold only what neither the goal
  nor the grounding says.
- **Rule 6:** the grounding belongs to the run too: to the run that
  produced it, and to each run that receives it, which keeps the bytes
  it was given. It is not the repository's truth, and is not committed.
- **Rule 8:** the grounding's two checks (rule 7) join the checks at the
  entry. Whether a grounding is right is not Agister's to check, as for
  a brief.
- **Rule 9:** the implementer receives the brief's two parts as two
  inputs, side by side, as it receives a brief and its guidance prompts
  today. They are never merged into one file. The grounding is optional:
  a change small enough to need none runs as today. Every review node
  still receives the goal (ADR-023 rule 1) and not the grounding, and
  the judge neither. A grounding is another agent's account of the code,
  and a reviewer reads the code.

The caller writes the task, or refers to the issue. It no longer writes
where the code is, which pattern applies or what constrains the change:
those are the grounding's.

### 9. One grounding per task

One grounding is made per task, for its goal (ADR-026 rule 2), and the
task's steps share it. The steps are not known until the task is split,
and the split reads the grounding (rule 10), so a grounding per step
cannot come first. A step brief names the criteria it covers (ADR-026
rule 4), and the findings that bear on it are those tied to them.

When the revision check refuses the grounding, because an earlier step
changed a file it cites, the investigator runs again for the same task
at the new candidate. Within one task a grounding is used for as long as
the check passes. It is not used for another task.

### 10. A planning step splits a multi-step task

In multi-step work a planning step of its own splits the task: a process
in settings that takes the task and the grounding by reference and
returns the step briefs. So the grounding stays out of the
orchestrator's context, and proposals stay out of the grounding.

Like the investigator it is a process the caller runs: Agister does not
plan (ADR-025). Its own contract is LAB-133. Until it exists a caller
splits a task as it does today.

### 11. Left out

Each comes in its own issue:

- The output artifact, its cache copy and the reference, which rule 6
  rests on (ADR-028): LAB-130.
- The investigator process and the grounding's schema: LAB-131.
- The grounding as an input of `agister/home/processes/implement.yaml`,
  with its two checks and how settings name them: LAB-132.
- The planning step: LAB-133.
- What standing instruction files hold, which this ADR does not decide:
  LAB-134.

A change among these that alters what the CLI or the settings offer has
the done gates of `agister/AGENTS.md`.

Until LAB-132 lands a caller works as `agister/AGENTS.md` says today: it
writes the brief to a file, which is the task, and gives no grounding.

## Consequences

- The orchestrator's context holds neither the investigation nor its
  result. It writes the task and passes run IDs.
- The implementer gets the decisions that bear on its change before it
  starts, not after it has stopped on a question.
- A task costs one more run, and one more each time the revision check
  refuses the grounding or an open question is answered. The depth, and
  a grounding that may be left out, keep a small change from paying.
- A step brief gets shorter: its Constraints part is seldom needed.
- The word "brief" changes its meaning. `implement`'s param `brief`
  holds what this ADR calls the task.
- The checks prove a grounding's form and freshness, never its truth. A
  wrong grounding that is well formed, fresh and without an open
  question is accepted. The owner reads the first groundings for that
  reason; after that the gate on open questions is the check.
- A change to a file no finding rests on does not refuse a grounding,
  even when it changes what a finding means.
- Nothing checks that a grounding is given with the task it was made
  for. It names its task (part 1), and the caller keeps rule 9.
- Until the planning step exists, a caller that splits a task still
  reads the code or the grounding to do it.
- Whether this works shows in two figures: the orchestrator's context
  spent per brief, and the implementer's tool calls before its first
  edit. The baseline for the second is in
  `research/agister/research/pre-implementation-investigation.md`
  section 4. Its count includes reading the brief and running the tests
  once: it is a baseline, not a measure of waste.
- Standing instruction files stay as they are (LAB-134).

## Alternatives considered

- **The name "onboarding":** rejected; it names what happens to a
  newcomer, and suggests the standing repository documentation this
  decision avoids.
- **The name "orientation":** rejected; it suggests an overview or a
  map, which a grounding may not hold.
- **The orchestrator splits the task from the grounding's findings:**
  rejected; it would have to read the grounding, and so take back the
  context the investigator relieves.
- **The investigator splits the task:** rejected; it would then propose,
  and a grounding that proposes cannot be checked.
- **One grounding per step:** rejected; the steps are not known until
  the task is split, and the split reads the grounding.
- **A grounding used again for a later task:** rejected; its findings
  are tied to one task's criteria, and it would become standing
  documentation.
- **Accept a grounding only at the revision it was made at:** rejected;
  each step runs at the previous step's commit, so every step after the
  first would be refused.
- **The orchestrator investigates** (today): rejected; each
  investigation fills its context, and the result exists only inside a
  brief.
- **The orchestrator reads the grounding in order to pass it on:**
  rejected; that is the context the investigator relieves.
- **The binary investigates before an implementer starts:** rejected;
  Agister does not plan (ADR-025).
- **Whole-repository documentation as a step before work:** rejected; it
  is expensive and goes stale, and BMAD built it and deprecated it.
- **Memory read on every task and updated by hand:** rejected; nothing
  checks it against the code, and a wrong file is followed faithfully.
- **An investigator that also recommends the solution:** rejected; it
  takes the planner's and the implementer's work, and its output can no
  longer be checked.
- **An investigator that skips the repository's rules**, for speed:
  rejected; reconciling them with the code is part of its work.
- **A workflow of narrow readers from the start:** rejected for now; one
  pass was enough where it is practised. It is taken up when one prompt
  proves unreliable (rule 1).
- **A grounding as free text:** rejected; a missing part would fail no
  check, and the two checks at the entry read its parts.
- **Findings cited by `path:line`:** rejected; a line number goes stale
  with the first edit, and a symbol does not.
- **The task and the grounding merged into one file:** rejected; someone
  would have to read the grounding to merge it, and the two parts have
  different authors and different checks.
- **The grounding committed to the repository:** rejected; it belongs to
  the run (ADR-026 rule 6), and a committed one outlives its task.
