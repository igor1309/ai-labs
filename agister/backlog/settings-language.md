---
date: 2026-10-15
model: claude-opus-5-5
description: "Backlog: the settings language: the owner's decisions on research/borrowed-from-build-systems.md, what plan step 6 takes from it, and operators against needs"
---

# The settings language

Inputs to specifying the kinds in `settings/documents` (ADR-012
amendments, plan step 6), from `research/borrowed-from-build-systems.md`.
Syntax only: no ADR changes unless a decision below says so.

## Decisions (2026-10-15)

| Point | Decision |
|---|---|
| 1. The path is the name | Taken: a document states no `name` or `type`; its file gives both (ADR-002, rule 1). |
| 2. One format | Rejected by the owner: agents stay TOML. |
| 3. Inline first | Taken for steps only: a step is written in its workflow. Processes stay named documents, so they can be blocked, extended, checked and recorded by name (ADR-002, rules 4, 7 and 8). |
| 4. Defaults | Rejected by the owner: no default agent (ADR-002, rule 5), and no default acceptance of a bash call (ADR-012, rule 2). |
| 5. Familiar words | Taken: inputs, steps, outputs; `fan_out`, `join`, `node` and `call` go. |
| 6. `needs` | A discussion: below. |
| 7. `if` on a step | Taken by the owner, as the syntax of a branch, which keeps ADR-011's rule: the first child whose condition holds, or the default. |
| 8. A step's output by path | Taken: a binding or a condition reads `steps.<name>.outputs.<field>`. |
| 9. No string templating | Taken: a value is a reference, never text spliced in; a script reads its inputs from its environment (ADR-012, rule 2). |
| 10. One level of `extends` | Rejected by the owner: chains stay (ADR-002, rule 4); inspect shows where each field came from. |
| 11. Quote-safe YAML | Holds for booleans: `no` and `on` decode as strings. A number where a string is wanted (`1.10`) is a type problem, never formatted back. |
| 12. No anchors | Holds: the tree decoder refuses an alias. |
| 13, 14, 16 | Later: listing workflows with a description, a dry run, a JSON Schema per kind. |
| 15. Errors point at the line | A problem has its file, line and field; a refusal shows it with the chain. |

## For step 6

- A workflow, a process and an agent state no name or type; `schema`
  keeps the version.
- A workflow's steps are written in it, each named, unique in its
  workflow; a step names a process and an agent.
- A reference reads `params.<name>`, `inputs.<name>`, `state.<name>` or
  `steps.<name>.outputs.<field>`. A child workflow's step is read through
  its output contract alone (ADR-011, rule 3).
- The shipped settings' `${…}` splices become references: `rev:
  "${param.base}"` is `rev: {from: params.base}`.
- Seven of the ten shipped workflows are one step, there to bind a
  process to an agent. Whether a request may name a step itself, a
  process and an agent with no workflow file, is the owner's: it changes
  what a request names (ADR-002, rule 6).

## Operators against `needs`

ADR-011 composes by four operators: sequence, parallel, branch, bounded
repetition. `needs` composes by dependency: a step names the steps it
waits for, and what waits on nothing starts at once. How much each can
say:

| Shape | Operators | `needs` |
|---|---|---|
| one step | a workflow of one step | one step |
| fan-out and join (`code_review`) | a sequence of a parallel and the judge | the judge needs every reviewer |
| A, then B, then C | a sequence | a chain |
| C after A; D after A and B | not exactly: C waits for B, or D for C | C needs A; D needs A and B |
| exactly one of several, or a default | a branch | `if` on each, exclusive by hand; resolve cannot prove it |
| implement, verify, repair until green | a bounded repetition | none: a loop construct still |
| a join that reads failed children | a parallel gives every child's status | a failed step skips what needs it; the join needs an "always" |

What the comparison says:

- The operators say every shape Agister ships or plans: one step,
  fan-out and join, the repair loop.
- `needs` says one thing they cannot: an ordering that is not nested,
  the fourth row. The operators say it at a cost in time, never in
  meaning: a step waits for one it does not need.
- `needs` cannot replace branch or repetition: exactly one of several
  and a loop are not dependencies. A language of `needs` alone would
  still carry both, so it is a fifth operator, not fewer.
- It changes what failure means: under ADR-011 a child that does not
  complete ends its sequence, and a parallel reports every child; under
  `needs` a failure skips its dependents, and a join over failures needs
  a rule of its own.
- Data flow is checked as well either way: "concurrent children cannot
  consume each other's outputs" (ADR-011, rule 3) becomes "a step reads
  only what it needs, transitively".
- Reading: nesting shows the shape in the file; a flat list of `needs`
  leaves it to the reader, and grows better than nesting past a handful
  of steps.

Three ways forward:

1. **Keep the operators.** ADR-011 as it is. A non-nested ordering waits
   longer than it must.
2. **`needs` inside a parallel.** A parallel's children may name
   siblings they need; sequence, branch and repetition stay. It says the
   fourth row, and keeps exactly one and loops. It amends ADR-011,
   rules 2 and 3.
3. **`needs` with `if` and a loop, no operators.** Familiar from GitHub
   Actions, but a branch loses exactly one and its default, and failure
   gets new rules.

**Decided by the owner (2026-10-15): 1, keep the operators.** 2 stays
available for when a workflow needs an ordering that is not nested.

## The runtime mapping (2026-10-15)

Decided by the owner: top-level `grants`, what the runtime grants with
no option; top-level `select`, `one` or `any`; and `options`, each by
name with its `grants` and `verified`. Bash writes neither `select` nor
`options`. The documents core branch takes it, and migrates
`home/runtimes/*.yaml` in its PR: the installed Agister reads none of
them.
