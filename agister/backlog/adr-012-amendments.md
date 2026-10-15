---
date: 2026-10-15
model: claude-opus-5-5
description: "Backlog: the amendments ADR-012 needs: one kind of step, bash a runtime, and one name per definition and per execution"
---

# ADR-012 amendments

ADR-012 (proposed) makes a step, a process bound to an agent, the one
leaf of a workflow, and bash a runtime. It names definitions apart from
executions: a run executes a workflow, a call executes a step. Its
consequences name the ADRs it amends: 001, 002, 003, 004, 006, 010 and
011. ADR-005 and ADR-007 are superseded and stay as they are; ADR-008
and ADR-009 are untouched.

## Plan

1. **Review ADR-012 and this plan** with Codex, then fold the findings.
2. **The owner decides the open points** below and accepts ADR-012.
3. **Write the amendments**, one ADR per commit, in place, each with
   "Amended by: ADR-012 (<date>)". Design only (agister/AGENTS.md).
4. **Review** with the `adr_review` workflow, then merge.
5. **Rewrite `docs/settings-implementation.md`** (ADR-011's step 5, now
   after this).
6. **Specify the kinds** in `settings/documents`: steps in a workflow,
   bash agents and processes.

## Open points for the owner

1. **An unknown cost spends no budget** (ADR-012, rule 5). The other
   choices: refuse at resolve a step whose runtime reports no cost under
   a cost budget, which keeps bash out of any workflow with one; or
   count it as zero, which invariant 3 forbids.
2. **A read-only bash process warns on every check** (ADR-012, rule 4
   and consequences). Proposed: accept it; the warning is true.
3. **Where a script lives.** ADR-012 makes a script a prompt, and
   `settings/layout` maps prompts to `prompts/<name>.md`
   (`layout.go:296`); `docs/settings-implementation.md` says "Scripts
   are not settings". Proposed: a prompt's file extension becomes
   syntax, so a script keeps its own; ADR-002, rule 1 says so, and
   `settings/layout` follows in the amendments' PR, as `verify` did for
   ADR-011.
4. **"Step" for the leaf.** Accepted by the owner (2026-10-15).

## The amendments

Words: "primitive", "agent invocation" and "invocation" become **step**
where a definition is meant and **call** where an execution is; "command
execution" goes; an operating-system process is a **program**. A "tool
command" an agent runs keeps its name.

### ADR-001

- Decision and invariant 1: Agister runs workflows of steps; no second
  primitive.
- Rule 5, `--continue`: a run whose workflow is one step; a binding
  continues an earlier call's session.
- Invariant 3: every call and every run ends in one result shape;
  completed means the runtime produced its output (valid against the
  schema where the process names one; exit code, stdout and stderr on
  bash); the session a call held.
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
- Parts: `runtime/<name>` lists bash; `supervisor` joins the wrappers.
- `settings/resolve`: plans each step's permissions; runtime facts
  include output, tool calls, cost and sessions.
- Core: "run command" becomes "run request" (what core takes);
  `core/workflow`'s port is "call a step"; `core/admit` admits a call
  against its process and its runtime; `core/session` becomes
  `core/call`; `core/command` goes; `core/inputs` resolves a call's
  inputs; the composition chains `inputs`, `admit` and `call`.
- Reaping: the supervisor ends what a dead owner left; the hold is then
  released.

### ADR-002

- Rule 1: a prompt's file extension is syntax (open point 3).
- Rule 5: a workflow's children are steps and workflows; a step binds a
  process to an agent; nothing but a step chooses an agent.

### ADR-003

- Scope, decision, rules 4, 5 and 7: resolve plans each step; "an
  invocation that needs what its runtime cannot do" becomes a step.
- Rule 3: a mapping may grant with no option (ADR-012, rule 4).
- Rule 7: the facts include output against a schema, tool calls and
  cost.

### ADR-004

- Decision: a call is the execution of a step; "an agent invocation or a
  command execution" goes.
- Rules 2, 3 and 7: "process or command" becomes the process.
- Rule 3: a workflow's calls; nothing holds the worktree between them.
- Rule 5: a binding continues an earlier call's session.

### ADR-006

- Decision and rules 2 and 3: `core/session` becomes `core/call`; "with
  its processes" becomes its programs.
- Rule 1: a tool-call or tool-command limit needs a runtime that reports
  tool calls (ADR-012, rule 3); no-output and no-event are one limit.

### ADR-010

- Scope, context, decision and rules 1, 3, 4 and 5: "primitive" becomes
  call; a workflow and a process declare inputs; "a command its own"
  goes.
- Rule 1: "an agent receives … a command receives …" becomes: the
  runtime takes them in its own way (ADR-012, rule 2).

### ADR-011

- Decision: a workflow is a step or a composition of workflows; one leaf.
- Rule 1: "Primitives execute work" becomes "A step executes work": a
  call returns its output and, on a runtime that keeps one, a session;
  the command execution paragraph goes, its fields to the process.
- Rules 3, 5 and 6: "primitive" becomes call; "a command that exits
  normally" becomes a call on bash; `core/workflow` declares one port.
- Executive summary and consequences: the same words.

### Outside the ADRs

- `settings/layout`: the prompt extension, if open point 3 is taken.
- `docs/settings-implementation.md`: rewritten at step 5.
- The shipped settings in `agister/home` and `agister/.agister`, read by
  the installed Agister: unchanged.
