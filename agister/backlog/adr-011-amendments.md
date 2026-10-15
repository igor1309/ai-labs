---
date: 2026-10-15
model: claude-opus-5-5
description: "Backlog: the amendments ADR-011 needs before process, verify and workflow settings can be specified"
---

# ADR-011 amendments

ADR-011 is accepted and supersedes ADR-005 and ADR-007. Its consequences
name the amendments it needs: ADR-001, 002, 003, 004, 006 and 010. Until
they are written, `settings/documents` types no process, verify or
workflow.

## Plan

1. **List the conflicts.** For each of ADR-001, 002, 003, 004, 006 and
   010, the rules ADR-011 contradicts or leaves open. Reading only.
2. **Decide the open points.** Each with a proposed answer and its reason;
   a change to an ADR-001 rule is the owner's.
   - Whether `verify` stays a kind, as a named command execution.
   - Where a pinned revision and a clean worktree are asked for: the
     process, the command or the workflow.
   - Whether a process's `session` stays, or a binding continues a
     session (ADR-004).
   - Process inputs from bindings: workflow inputs, earlier results,
     repetition state; whether `workflow.collection` goes (ADR-010).
   - The kinds, and each operator's shape: sequence, parallel, branch,
     bounded repetition (ADR-002).
   - The first conditions (ADR-011, rule 4) and their settings syntax,
     which ADR-011 leaves out.
   - The core parts replacing `core/attempts` and the ADR-007 runner
     (ADR-001), and recovery across nested workflows (ADR-006).
3. **Write the amendments.** First decide the form: an amendments section
   in each ADR, or new ADRs superseding the rules changed. Design only
   (agister/AGENTS.md), one ADR per commit.
4. **Review** with the `adr_review` workflow, then merge.
5. **Update `docs/settings-implementation.md`**: kinds, steps, where each
   check sits.
6. **Specify process, verify and workflow** in `settings/documents`.

## Step 1: the conflicts

What each ADR says that ADR-011 contradicts (✗) or leaves open (?).

### ADR-001

- ✗ Invariant 1: Agister runs "the verification a process declares". Now
  it runs primitives (an agent invocation, a command execution) and
  compositions of them.
- ✗ Invariant 3: "Completed means output valid against its contract". A
  command completes whatever its exit code, and its output is exit code,
  stdout and stderr (ADR-011, rule 5).
- ✗ Invariant 6: the record is per call. It now also keeps parent and
  child, iterations, condition values, branch choices, state transitions
  and stopping reasons (ADR-011, rule 6).
- ✗ Invariant 8: "a join receives its own workflow's outcomes". Now
  bindings from earlier results, and a continued session by a binding.
- ✗ Core: `core/workflow` runs `call` or `fan_out` then `join`;
  `core/attempts` repairs; `core/verify` runs a verification; the
  composition chains `inputs`, `admit`, `session`, `attempts`. Now
  `core/workflow` owns composition, conditions and repetition state,
  with one port for an agent invocation and one for a command execution.
- ✗ Settings: resolve plans "each node"; it now also checks boundaries,
  bindings, acyclic references, and unselected branches.
- ? Rule 5, `--continue`: how a caller's continuation relates to a
  continued session bound inside a workflow.

### ADR-002

- ✗ Rule 5: "A process names … its verification". A process names none.
- ? Rule 1: whether `verifies/` stays a kind, and what kind a command
  execution is.
- ? Rule 5: a node binds a process to an agent; what a node that uses a
  workflow or a command names.
- ? The workflow document: inputs, output contract, an output mapping per
  terminal path, operators, bindings, conditions. ADR-011 leaves its
  syntax out.

### ADR-003

- ✗ Rule 7: refuses "a repair (ADR-005)" on a runtime that cannot
  resume. A repair is now a bound continuation of a session.
- ? A command execution's authority: no permission plan. ADR-005,
  rule 8 (the caller's authority) is superseded with nothing in its place.

### ADR-004

- ✗ Rule 3: a hold lasts "for the whole call", and a workflow's nodes are
  calls. Now each primitive holds and ends its holds; nothing holds the
  worktree between primitives.
- ✗ Rule 5: a continuation is the caller's `--continue`. Now also a
  binding of an earlier invocation's session inside a workflow, with no
  hold between.
- ✗ Rule 7: the process sets the call's limits. Now limits belong to every
  primitive, and enclosing budgets cover all descendants.
- ? Rule 2: whether a command execution pins a revision and asks for a
  clean worktree (ADR-005, rule 2 required it of a verification).
- ? Rules 3 and 4: whether a command execution is a reader or a writer,
  and whether its end records the content and a patch.

### ADR-006

- ✗ Rule 5: a recovery turn "spends no verification attempt".
- ? Rule 3: a recovery turn's budget against the enclosing budgets of
  a workflow (ADR-011 names recovery accounting).

### ADR-010

- ✗ Rule 1: "A join takes no input from the caller (ADR-007, rule 5)".
- ✗ Rule 3: inputs resolved once per call "or once for a fan-out's
  nodes". Now fixed before each primitive; parallel children's shared
  inputs resolved once; later work may resolve new values.
- ? Rule 1: a workflow and a command execution declare inputs too, and
  bindings (workflow inputs, earlier results, repetition state) are a
  kind of source or something else; whether `workflow.collection` goes.

### Outside the ADRs

- `docs/settings-implementation.md`: the `verifies` kind and a process's
  verification.

## Step 2: decisions

### The owner's (2026-10-15)

- **`verifies` is out.** Implement and verify is a sequence of an agent
  invocation and a command execution; repair is a bounded repetition
  whose body runs the command and, while it fails, an agent invocation
  continuing the implementer's session by a binding.
- **A command runs best effort**, as everything Agister runs (ADR-001,
  invariant 10). No permission plan for it; nothing new to state.
- **A command is admitted and held as a call is** (ADR-004): it pins a
  revision, asks for a clean worktree, is a reader or a writer, and
  records its content at its end, by the same rules. Agister does no git
  for it either.
- **Recovery counts as any turn.** Enclosing budgets cover every
  descendant (ADR-011, rule 6); a recovery turn needs time and cost left
  under all of them. No rule of its own.
- **Inputs are per workflow.** Each workflow declares its inputs at its
  boundary (ADR-011, rule 3); primitives get values by bindings. A source
  resolves a declared input; `workflow.collection` goes, a parallel's
  results are bound instead.
- **`docs/settings-implementation.md` is rewritten** after the
  amendments (plan, step 5).

### Proposed, accepted by the owner (2026-10-15)

- **Result shape (ADR-001, invariant 3):** ADR-011, rule 5 in its place.
  Completed means the primitive produced its output: an agent's valid
  against its contract, a command's its exit code, stdout and stderr.
- **Core parts (ADR-001):** `core/workflow` runs operators, conditions
  and repetition state, with a port to invoke an agent and one to run a
  command. `core/attempts` goes. `core/verify` becomes `core/command`.
  The composition chains `inputs`, `admit`, `session` into an agent
  invocation, and `inputs`, `admit`, `command` into a command execution.
- **The record (ADR-001, invariant 6):** one per primitive, and one per
  workflow holding its children, iterations, conditions, branch choices
  and stopping reason, as ADR-011, rule 6.
- **`--continue` (ADR-001, rule 5; ADR-004, rule 5):** continues a run
  whose workflow is one agent invocation, as today; continuation inside a
  workflow is a binding. Resuming a composed workflow is ADR-011's
  non-goal.
- **Kinds (ADR-002, rule 1):** agents, processes, workflows, runtimes,
  briefs, schemas, prompts, skills. A command execution is declared in a
  workflow; a named workflow packages one for reuse (ADR-011, decision).
- **A child (ADR-002, rule 5):** an agent invocation (a process and an
  agent), a command execution, or a named workflow by reference.
- **A runtime that cannot resume (ADR-003, rule 7):** resolve refuses a
  bound continuation on it, as it refused a repair.
- **Syntax and conditions:** ADR-011 leaves them out of ADRs. They are
  the settings file format, a contract (ADR-001, rule 6): specified in
  `settings/documents`' feature files, drafted by rewriting the shipped
  `implement_*` (sequence and repetition) and `code_review` (parallel and
  a join) workflows.
- **Form of the amendments:** each ADR edited in place, with a line
  "Amended by ADR-011 (2026-10-15)". They are a day old. Of what is
  merged, only `settings/layout` rests on a changed rule: its kind
  `verify` (`layout.go:51`) goes, with its scenarios and tests, in the
  same PR as ADR-002's amendment.
