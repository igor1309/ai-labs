# ADR-007: An advisor decides open build questions

- **Status:** Accepted
- **Date:** 2026-10-01
- **Scope:** who answers a question that stops the work, and where the
  answer is kept
- **Decision type:** Process

## Context

The review judge rules `owner` on an item whose evidence holds but whose
answer is a trade-off, and each such item stops the work until the owner
answers. Many are build questions that the recorded decisions already
answer. The judge cannot see that: it reads no decisions and has no
tools. So a question the recorded decisions already answer still stops
the work for the owner's input.

## Decision

### 1. An advisor decides build questions; policy stays the owner's

A question is **policy** if any of its options changes or contradicts an
accepted ADR, the project's rules (`AGENTS.md`), the scope of the issue, a
security boundary (permissions, policies, permission mappings), or a cost
limit. Every other question is a **build** question.

The advisor draws the line, before it decides: it is the one that reads
the recorded decisions. It answers a policy question with `owner` and the
reason, and decides nothing. In doubt, the question is policy. A build
question no recorded decision bears on is still the advisor's to decide.
The judge's rulings do not change: `owner` now means "not the reviewers' or the
judge's to settle", and the advisor is asked first.

### 2. The advisor sees the question, its options and the recorded decisions

The advisor is a process. Its inputs are a question file and a checkout of
a committed revision, read-only, in which it reads the ADRs, the
`AGENTS.md` files and the decisions file (rule 3). The checkout holds the
code too; the advisor does not decide from it. The question file holds
who asked, the question and the options, and nothing else: no lean, no
argument, no review. For a judge's item it is the item's `action`,
unedited, with the workflow run and item it came from.

The advisor's output is either `owner`, or a decision: the option chosen,
the options excluded and why, the recorded decisions it rests on, and the
follow-ups. A decision that rests on no recorded decision says so.

### 3. Each decision is a record in the repository

A decision is appended to the one file `agister/docs/decisions.md`, for as
long as it can be read in one call, as `D-<n>`: status, who asked, the
question, the options, what was excluded, the decision, what it rests on,
the follow-ups, and the advisor's run ID. A follow-up that changes code
names the test that proves it. The record is the advisor's output,
unedited, and is committed with the change it unblocks, so a later run
reads it in its checkout.

Records are not edited. A later decision on the same question is a new
record that names the one it supersedes; the earlier record gains only
`Superseded by D-<n>`. An `owner` answer leaves no record: the question
goes to the owner as before.

### 4. The owner reviews decisions in the pull request and overrides by superseding

A record's status is `Provisional (advisor)` until the owner rules. The
work goes on, and a pull request may merge with provisional records. Its
description lists the provisional records it adds, so the owner reviews
them where the change is reviewed. The owner
confirms a record by setting its status to `Confirmed`, or overrides it
with a superseding record whose status is `Owner`; the override's
follow-ups go to a fresh `implement` run. An owner's record is superseded
only by the owner.

### 5. The mechanism is one process, one prompt and one file

An `advisor` process with its agent, of a model family other than the
judge's, a read-only policy, a prompt and an output schema, run once per
question:
`agister run advisor --param question=<file> --param revision=<rev>`.
Whoever acts on the judge's rulings writes the question file, runs the
advisor and appends the record; `.claude/skills/deliver/SKILL.md` says so
in place of "owner items to the owner".

It needs no code. The core knows no advisor and no decision
([ADR-001](001-agister-cli-architecture.md) rule 1); the process, prompt and schema are settings (rule 2); an `owner`
answer is a completed call, not a status (rule 6); the decisions file is a
file in the user's repository, not Agister's state (rule 9); the advisor
reads a committed file, never another run's evidence (rule 12).

Left out: the advisor as a workflow node (ADR-003 has one shape, fan-out
then join, and no step after the join); the core routing an `owner` item
by itself; any check that the question file carries nothing but the
question; questions from sources other than the judge, which may use the
same process but are not required to.

## Consequences

- The owner is stopped for policy only; a build question costs one call.
- The work can rest on a decision the owner later overrides; the override
  then costs a further change.
- The line between build and policy is the advisor's judgement. A wrong
  call shows in the record's "rests on" and is corrected by an override.
- Decisions accumulate as precedent that every later advisor call reads.
- The question file's form is a convention, kept by whoever writes it.

## Alternatives considered

- **The judge draws the line** (a fifth ruling): rejected; the judge reads
  no decisions, so it cannot tell what they imply.
- **Give the judge the decisions and let it decide:** rejected; it would
  rule on evidence and decide trade-offs in one call, and see the reviews'
  arguments while deciding.
- **Decisions kept in run evidence only:** rejected; agents cannot reach
  evidence (ADR-001 rule 9), so no later run could read them.
- **A build question no recorded decision bears on goes to the owner:**
  rejected; it stops the work again for most new questions.
- **A pull request waits for the owner to confirm each provisional
  record:** rejected; it moves the stop without removing it.
- **Each recorded document as a `file` input, no tools, as the judge
  has:** rejected; the process would list every ADR and change with each
  new one.
- **One file per decision:** rejected while one file can be read in one
  call.
- **The judge's model for the advisor:** rejected; the advisor would share
  the judge's leanings.
