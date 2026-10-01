# ADR-007: An advisor decides open build questions

- **Status:** Proposed
- **Date:** 2026-10-01
- **Scope:** who answers a question that stops the work, and where the
  answer is kept
- **Decision type:** Process

## Context

The review judge rules `owner` on an item whose evidence holds but whose
answer is a trade-off, and each such item stops the work until the owner
answers. Many are build questions that the recorded decisions already
answer. Observed: "may this change also change the agent instructions it
depends on?", which [ADR-004](004-join-on-completed-nodes.md) implies.
The judge cannot see that: it reads no decisions and has
no tools. Verger ran the same loop with an advisor that decided build
questions and recorded each decision, and an owner who ruled on policy
only (LAB-12).

## Decision

### 1. An advisor decides build questions; policy stays the owner's

A question is **policy** if any of its options changes or contradicts an
accepted ADR, the project's rules (`AGENTS.md`), the scope of the issue, a
security boundary (permissions, policies, permission mappings), or a cost
limit. Every other question is a **build** question.

The advisor draws the line, before it decides: it is the one that reads
the recorded decisions. It answers a policy question with `owner` and the
reason, and decides nothing. In doubt, the question is policy. The judge's
rulings do not change: `owner` now means "not the reviewers' or the
judge's to settle", and the advisor is asked first.

### 2. The advisor sees the question, its options and the recorded decisions

The advisor is a process. Its inputs are a question file and a checkout of
a committed revision, read-only, in which it reads the ADRs, the
`AGENTS.md` files and the decisions file (rule 3). The question file holds
who asked, the question and the options, and nothing else: no lean, no
argument, no review. For a judge's item it is the item's `action`,
unedited, with the workflow run and item it came from.

The advisor's output is either `owner`, or a decision: the option chosen,
the options excluded and why, the recorded decisions it rests on, and the
follow-ups. A decision that rests on no recorded decision says so.

### 3. Each decision is a record in the repository

A decision is appended to `agister/docs/decisions.md` as `D-<n>`: status,
who asked, the question, the options, what was excluded, the decision, what
it rests on, the follow-ups, and the advisor's run ID. A follow-up that
changes code names the test that proves it. The record is the advisor's
output, unedited, and is committed with the change it unblocks, so a later
run reads it in its checkout.

Records are not edited. A later decision on the same question is a new
record that names the one it supersedes; the earlier record gains only
`Superseded by D-<n>`. An `owner` answer leaves no record: the question
goes to the owner as before.

### 4. The owner reviews decisions in the pull request and overrides by superseding

A record's status is `Provisional (advisor)` until the owner rules. The
work goes on. The pull request's description lists the provisional records
it adds, so the owner reviews them where the change is reviewed. The owner
confirms a record by setting its status to `Confirmed`, or overrides it
with a superseding record whose status is `Owner`; the override's
follow-ups go to a fresh `implement` run. An owner's record is superseded
only by the owner.

### 5. The mechanism is one process, one prompt and one file

An `advisor` process with its agent, a read-only policy, a prompt and an
output schema, run once per question:
`agister run advisor --param question=<file> --param revision=<rev>`.
Whoever acts on the judge's rulings writes the question file, runs the
advisor and appends the record; `agister/AGENTS.md` says so in place of
"owner items to the owner".

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

## Open for the owner

1. **A build question no recorded decision bears on.** (a) The advisor
   decides it and the record says "rests on: none"; (b) it goes to the
   owner. Recommended: (a); those records are the ones the owner reads
   first, and (b) stops the work again for most new questions.
2. **Merging with provisional records.** (a) A pull request may merge with
   provisional records and the owner overrides afterwards; (b) it waits
   for the owner to confirm each. Recommended: (a); policy questions never
   reach a record, and (b) moves the stop without removing it.
3. **How the advisor reads the recorded decisions.** (a) A read-only
   checkout, where it reads them itself; (b) each document as a `file`
   input, no tools, as the judge has. Recommended: (a); (b) lists every
   ADR in the process and must change with each new one. (a) also lets the
   advisor read code, which the prompt tells it not to decide from.
4. **One file or one file per decision.** (a) `agister/docs/decisions.md`,
   appended; (b) `agister/docs/decisions/D-<n>-<title>.md`. Recommended:
   (a) until the file is too long to read in one call.
5. **The advisor's model.** (a) A model family other than the judge's
   (Codex, as the reviewers); (b) the judge's. Recommended: (a); the
   advisor then does not share the judge's leanings.
