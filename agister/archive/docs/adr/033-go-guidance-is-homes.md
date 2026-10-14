# ADR-033: Go guidance is home's, given by default

- **Status:** Accepted
- **Date:** 2026-10-12
- **Scope:** where the Go guidance prompts are kept, and which processes
  are given them
- **Decision type:** Architecture
- **Amends:** [ADR-028](028-settings-are-layered-by-field.md), "Replaced
  and amended", on ADR-027 rule 2 (the `implement*` processes name no Go
  prompt) and rule 5 (the Go prompts stay in `prompts/`; they do not
  move); [ADR-027](027-homes-settings-have-one-source-in-git.md) rules 5
  and 6
- **Source:** LAB-162; the owner's choice, 2026-10-12, of the Go
  guidance on by default with a non-Go repository opting out

## Context

Agister works on any repository, but its Go rules,
`go-architecture` and `go-testing-seams`, live in this repository's
`prompts/`, which only this repository's layer lists (ADR-028 rule 9). A
layer lists folders inside its own repository only, so no other
repository can reach them. Two repositories with Go code and an Agister
layer, `vpn` and `inventory`, run every implement and review without the
Go rules; giving them the rules means copying the files, which drift.

The rules name nothing of this repository: they are about Go.

## Decision

### 1. The Go prompts are home's

`go-architecture.md` and `go-testing-seams.md` move, with their history,
from `prompts/` to `agister/home/prompts/`, their one source, and
`agister install` gives them to every home. `prompts/` holds them no
more. `prompts/go-process-supervision.md`, which no process names, stays
in `prompts/`.

### 2. Home's processes are given them

Home's processes set `guidance` as this repository's layer set it
(LAB-161):

- `implement`, `architecture_review` and `adversarial_review`:
  `[go-testing-seams, go-architecture]`;
- `tests_review`: `[go-testing-seams]`;
- every other process: none.

### 3. A repository without Go code opts out

A repository whose code is not Go sets `guidance: []` in its layer for
each process of rule 2 (ADR-028 rule 4: a layer sets fields). A
repository with Go code sets nothing. A project directory opts out the
same way.

### 4. This repository's layer gives no guidance

Its four process documents, which set only `guidance`, and its
`layer.yaml`, which listed `prompts/` for the Go prompts alone, are
removed.

## Consequences

- Every repository with Go code gets the Go rules after one install,
  with no setting of its own.
- A repository without Go code that does not opt out is given Go rules
  on every implement and review, and nothing fails. Each such repository
  opts out when its layer is made; today that is iFora's `ios.config`.
- The Go rules change with home's settings: a change to them is a change
  of `agister/home/`, installed as any other.

## Alternatives considered

- **Keep the prompts in this repository** (ADR-028 as it was): rejected;
  every other Go repository runs without them or copies them.
- **Home ships the prompts, and each Go repository's layer opts in:**
  rejected; each Go repository repeats the per-process guidance, and one
  that forgets runs without the rules.
- **Guidance by the language of the change:** rejected; Agister knows no
  language, and a rule for it is a mechanism this does not need.
