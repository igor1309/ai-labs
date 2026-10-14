# ADR-015: A broken document refuses only what uses it

- **Status:** Accepted
- **Date:** 2026-10-02
- **Scope:** what a problem in the settings stops: which commands and calls
  it refuses, and what `check` says of it
- **Decision type:** Architecture
- **Amends:** [ADR-010](010-a-process-names-its-verification.md) rule 4
  (its last paragraph) and its explicit non-decision on a broken document

## Context

Every command except `init` checks the composed settings first and stops on
any problem (README, Settings; the gate in `internal/app/gate.go`). Only
`check` itself, cancelling a run and following a run already admitted are
exempt. So one broken document stops every call, every listing and every
run view, in every repository that sees it.

The global settings in `~/.agister` are seen by every repository. A
runtime mapping there that no process uses, for example one that names an
adapter the installed binary does not know, is still a problem `check`
reports. So an unused global runtime mapping stops every command in every
repository, though no call would read it.

[ADR-010](010-a-process-names-its-verification.md) rule 4 already made the
narrower choice for one case: a missing named verification refuses the
calls of the process that names it, not the settings. It left a document
that exists but is invalid as a problem of the settings, and left open "how
a broken document other than this reference limits what is refused".

A call already reads only the documents it uses, and refuses before the
first turn when one of them is missing or invalid
([ADR-001](001-agister-cli-architecture.md) rule 7, `Resolver.resolve`).
`check` already attributes every problem to a subject document (`agent x`,
`runtime mapping y`, `process z`) and records what each document uses and
is used by (`check --tree`).

## Decision drivers

- A broken document stops nothing that does not use it.
- A call that uses a broken document never runs: it is refused before its
  first turn, as ADR-001 rule 7 has it.
- The problem is as easy to find as it is today: `check` still fails, and
  every refusal names the document and its problem.
- Where it cannot be said what a problem stops, it stops everything.

## Decision

A problem `check` attributes to one document refuses the calls that depend
on that document, and only them. A problem it cannot attribute still stops
every command, as today.

## Rules

### 1. A call depends on what it resolves

A process call depends on the service settings, its process, and what the
process uses as the call resolves it (ADR-010 rule 3): its agent (the
caller's `--agent` when given), that agent's runtime mapping, its policy,
its output schema, its named verification and the prompts its inputs name
([ADR-014](014-prompts-are-settings.md)). A workflow run depends on its
workflow and on what each of its nodes' calls depends on.

A document depends on what it uses in the same way, so a problem reaches
every call through any chain of uses: a broken runtime mapping refuses the
calls of every process whose agent runs on it, and every workflow with a
node on such a process.

A document that cannot be parsed uses nothing that can be known; it
refuses only what depends on it.

### 2. A problem belongs to the document it is about, or to the call

A problem of the document itself is that document's: an invalid or
unparsable document, an unknown adapter, contract or schema, a reference
to a document that does not exist, a limit that does not compose. It
refuses what depends on that document (rule 1), and nothing else.

A problem that depends on the agent is not the process's own: the agent
the process names does not exist, its session cannot hold the process's
repairs, or the process cannot be planned on its runtime. Such a problem is
evaluated against the resolved call, with the agent the call selects (the
caller's `--agent` when given), as rule 1 has it. It refuses a call whose
selected agent has it, and not a call whose `--agent` selects an agent
without it. `check` reports it on the process, for the agent the process
names.

A document with problems that nothing uses refuses nothing.

### 3. A refused call names the document and its problem

A call that depends on a document with a problem, or whose resolved agent
has a problem with its process (rule 2), is refused before its first turn
(ADR-001 rule 7) and recorded like any refusal. The refusal names the
document, its path and each of its problems, and, when the call reaches it
through another document, the chain: `process implement: agent
opencode uses runtime mapping opencode: unknown adapter "opencode"`.

A workflow is refused before any of its nodes' turns when a document any
node depends on, or any node's resolved call, has a problem. A node on a process whose named
verification is missing is still refused at that node (ADR-010 rule 4):
that is not a problem of the settings.

Listings and views run, and show each process and workflow a problem
refuses with the refusal. A write is refused if it adds a problem, as
today; problems that are there already do not stop it. Commands that use
no document, such as listing and showing runs, run.

### 4. What cannot be attributed stops every command

These problems still stop every command but `init`, `check`, cancelling a
run and following an admitted run, as today:

- **The service settings** are missing, unreadable or invalid. Every call
  depends on them, and the permission vocabulary and the limits every other
  document is checked against are theirs, so nothing else can be checked.
- **A document whose kind or name cannot be read**: a file name that is not
  a valid name, a settings directory that cannot be listed. Nothing can
  name such a document, so it would refuse nothing and stay unseen except
  in `check`.
- **A name defined twice**: a workflow and a process of the same name.
  `agister run <name>` cannot tell which is meant, and the two documents
  are equally at fault.

These are rare and are fixed by repairing one file or renaming one.

### 5. `check` reports every problem and what it refuses

`check` still reports every problem in every document and still exits
non-zero when there is any. Each problem says which processes and
workflows it refuses, or that it refuses none, and each problem of rule 4
says that it stops every command.

`check`'s warnings, among them ADR-010's missing verification, stay
warnings.

## Amendments

- **ADR-010 rule 4**, last paragraph: a named verification that exists but
  is invalid is still a problem, reported by `check`; it refuses the calls
  of the processes that name it and the workflows with a node on them, not
  every command. The rest of rule 4 is unchanged.
- **ADR-010, explicit non-decisions:** "how a broken document other than
  this reference limits what is refused" is decided here.
- **ADR-001:** no rule's text changes. The whole-settings gate is not one
  of its rules; rule 7 already governs the refusals this ADR makes, and
  rule 1 (checks are about whether settings compose and can be enforced)
  is unchanged.
- **README**, Settings: "checks the composed settings first and stops on
  any problem" no longer holds; a problem stops what uses the document it
  is in, and only the problems of rule 4 stop every command.

`agister pages` is not behind the gate (ADR-009) and is unchanged.

## Consequences

- An unknown adapter, a typo in one agent or a broken schema stops only
  the calls that use it; other processes and workflows, in this repository
  and every other, keep running.
- A broken global document a repository does not use no longer stops that
  repository.
- A broken document is easier to miss: other calls keep working, and only
  `check` and the refused calls say anything. So `check` still exits
  non-zero, and every refusal names the document, its path and its problem
  rather than only the call it refused.
- The gate needs, for each call, the documents it depends on, which `check`
  already records as uses.
- Settings that pass with a broken, unused document behave differently in
  an older binary, which still stops every command on it.

## Alternatives considered

- **Keep stopping every command on any problem.** Rejected: one document
  no call uses, such as an unused global runtime mapping, stops every
  command in every repository that sees it.
- **Report every problem as a warning.** Rejected: `check` would pass on
  settings that refuse calls, and a broken document would go unnoticed
  until a call is refused.
- **Attribute every problem, the service settings included.** Rejected:
  the service settings are what every call and every other check depends
  on (rule 4).
- **Skip a broken document and run as if it were absent.** Rejected: a
  process would run on another agent, policy or verification than the one
  it names, and ADR-001 rule 7 asks for a refusal.

## Explicit non-decisions

How the gate computes what a call depends on; the wording and format of
`check`'s report; whether `check --tree` marks what each problem refuses.
