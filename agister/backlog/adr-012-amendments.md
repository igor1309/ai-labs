---
date: 2026-10-15
model: claude-opus-5-5
description: "Backlog: the amendments ADR-012 needs: one kind of step, bash a runtime, and one name per definition and per execution"
---

# ADR-012 amendments

ADR-012 (accepted) makes a step, a process bound to an agent, the one
leaf of a workflow, and bash a runtime. It names definitions apart from
executions: a run executes a workflow, a call executes a step. Its
consequences name the ADRs it amends: 001, 002, 003, 004, 006, 009, 010
and 011. ADR-005 and ADR-007 are superseded and stay as they are;
ADR-008 is untouched.

## Plan

1. **Review ADR-012 and this plan** with Codex, then fold the findings.
   Done (2026-10-15): three major and five minor findings, folded.
2. **The owner decides the open points** below and accepts ADR-012.
   Done (2026-10-15): accepted; open points decided as below.
3. **Write the amendments**, one ADR per commit, in place, each with
   "Amended by: ADR-012 (<date>)". Design only (agister/AGENTS.md).
   Done (2026-10-15): ADR-001, 002, 003, 004, 006, 009, 010 and 011.
4. **Review** the ADR set, then merge. Done (2026-10-15) with a Claude
   reviewer and Codex in place of `adr_review`, at the owner's word:
   three major and twelve minor findings folded; one (a script's file
   extension in ADR-002) left, as the owner left it to the
   implementation.
5. **Rewrite `docs/settings-implementation.md`** (ADR-011's step 5, now
   after this).
6. **Specify the kinds** in `settings/documents`: steps in a workflow,
   bash agents and processes.

## Open points, decided by the owner (2026-10-15)

1. **An unknown cost spends no budget** (ADR-012, rule 5). A cost budget
   then limits reported cost only: a model runtime that reports no cost
   spends without exhausting it. The alternative: refuse at resolve a
   step whose runtime reports no cost under a cost budget, which keeps
   bash out of any workflow with one unless bash's facts say its cost is
   none. Counting unknown as zero is what invariant 3 forbids. Either
   answer qualifies ADR-004, rule 7 and ADR-011, rule 6.
   **Decided:** an unknown cost spends no budget; a cost budget limits
   reported cost.
2. **Bash warnings** (ADR-012, rule 4). A bash process warns when the
   mapping grants more than it allows, which, with a mapping granting
   all its environment gives, is nearly every bash process. Proposed:
   accept it; the warning is true, and holds remain the process's
   declared access. **Decided:** accepted.
3. **Where a script lives.** ADR-012 makes a script a prompt, and
   `settings/layout` maps prompts to `prompts/<name>.md`
   (`layout.go:296`); `docs/settings-implementation.md` says "Scripts
   are not settings". Bash runs a script from a `.md` file as well, so
   nothing forces a change. Proposed: leave the extension as it is; a
   script's own extension is a settings decision for later, costing
   layout lookup, listing and tests that one name across extensions is
   one document. **Decided:** left to the implementation; no ADR states
   it.
4. **"Step" for the leaf.** Accepted by the owner (2026-10-15).

## The amendments

Words: "primitive", "agent invocation" and "invocation" become **step**
where a definition is meant and **call** where an execution is; "command
execution" goes; an operating-system process is a **program**. A tool
call or tool command an agent makes keeps its name. Each place is
listed: no global replacement, since "primitive" also names other
things (ADR-003's options).

### ADR-001

- Decision and invariant 1: Agister runs workflows composed of steps and
  workflows; no second primitive.
- Rule 5, `--continue`: continues a run whose workflow is one step, from
  the session's latest call (ADR-012, rule 1), checked against that
  call's worktree, repository, revision and end content; a binding
  continues an earlier call's session the same way.
- Invariant 3: every call and every run ends in one result shape;
  completed means the runtime produced its output (valid against the
  schema where the process names one; on bash, a script that exited
  normally); the session a call held.
- Invariant 4: inputs fixed before a call starts; how the runtime takes
  them is a runtime fact (ADR-012, rule 2), replacing the agent and
  command sentence.
- Invariant 6: the record per call and per run; the permission plan for
  every call.
- Invariant 7: each program and hold a call creates.
- Invariant 8: calls are independent.
- Invariant 10: a hold follows a process's declared access; a plan for
  every call; the sentence "a command execution has no permission plan"
  goes.
- Parts: `runtime/<name>` lists bash; `supervisor` joins the wrappers,
  with bounded output and its digest.
- `settings/resolve`: plans each step's permissions; runtime facts
  include output against a schema, tool calls, cost and sessions.
- Core: "run command" becomes "run request" (what core takes);
  `core/workflow`'s port is "call a step"; `core/admit` admits a call
  against its process and its runtime; `core/session` becomes
  `core/call`; `core/command` goes, its bounded head and tail and digest
  to the supervisor; `core/inputs` resolves a call's inputs; the
  composition chains `inputs`, `admit` and `call`.
- Reaping: the supervisor ends what a dead owner left; the hold is then
  released.
- The section "A call" (line 194) describes starting a run: renamed.

### ADR-002

- Rule 5: a workflow's children are steps and workflows; a step binds a
  process to an agent; nothing but a step chooses an agent.

### ADR-003

- Description (line 4): "mappings offer primitives" becomes options.
- Scope, decision, rules 4, 5 and 7: resolve plans each step; "an
  invocation that needs what its runtime cannot do" becomes a step.
- Decision and rules 3 and 4: a mapping names what its runtime grants
  with no option and its options; a plan accounts for both (ADR-012,
  rule 4).
- Rule 7: the facts include output against a schema, tool calls and
  cost.
- Context (line 23) and the first consequence (line 97): a process names
  no runtime option, yet reusing it across runtimes needs runtimes that
  read its prompt alike.

### ADR-004

- Decision: a call is the execution of a step; "an agent invocation or a
  command execution" goes.
- Rules 2, 3 and 7: "process or command" becomes the process.
- Rule 3: a workflow's calls; nothing holds the worktree between them.
- Rule 5: a continuation continues from the session's latest call, its
  worktree, repository, revision and end content; the record names the
  call continued.
- Rule 7: retitled; the process declares a call's limits, enclosing
  budgets cover it, a caller may tighten them; qualified by open
  point 1.

### ADR-006

- Decision and rules 2 and 3: `core/session` becomes `core/call`; "with
  its processes" becomes its programs.
- Rule 1: a tool-call or tool-command limit needs a runtime that reports
  tool calls (ADR-012, rule 3); no-output and no-event are one limit.
- Rule 2 (line 45): "a repeated call" becomes a repeated tool call.

### ADR-009

- Vocabulary only (lines 13, 19 and 38): an operating-system process is
  a program. Its testing rules stay.

### ADR-010

- Scope, context, decision and rules 1, 3, 4 and 5: "primitive" becomes
  call; a workflow and a process declare inputs; "a command its own"
  goes.
- Rule 1: "an agent receives … a command receives …" becomes: the
  runtime takes them in its own way (ADR-012, rule 2).

### ADR-011

- Decision and rule 2: a workflow composes steps and workflows; the
  step is the one leaf.
- Rule 1: "Primitives execute work" becomes "A call executes a step": it
  returns its output and, on a runtime that keeps one, a session. The
  command execution paragraph goes; of its fields, the inputs,
  environment and limits go to the process, the command to the prompt,
  and the working directory goes: every call works at the worktree root
  (ADR-004, rule 1).
- Rule 3: "before each primitive starts" becomes before each call; a
  binding continues an earlier call's session.
- Rule 5: calls and runs share a result shape; "a command that exits
  normally" becomes a bash call whose script exits normally.
- Rule 6: "primitive" becomes call; `core/workflow` declares one port;
  budgets qualified by open point 1.
- Executive summary and consequences: the same words.

### Outside the ADRs

- `docs/settings-implementation.md`: rewritten at step 5.
- The shipped settings in `agister/home` and `agister/.agister`, read by
  the installed Agister: unchanged.
