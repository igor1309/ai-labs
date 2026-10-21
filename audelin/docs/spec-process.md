---
date: 2026-10-22
model: claude-opus-5-5
description: "How Audelin is specified: one SPEC.md and QA.md per observer, a tree that follows ADR-001's modules, tracked as Multica issues"
---

# Spec process

How Audelin's behaviour is specified before it is built. It replaces the
single v1 spec (`spec-001-v1.md`), which grew past 1,100 lines because it
was written for no observer and mixed contracts, mechanics, invented values
and test lists.

## The tree

One folder per observer, under `audelin/docs/spec/`. Each holds a `SPEC.md`
and a `QA.md`, and nothing else.

```text
spec/
  SPEC.md, QA.md             the user: the owner, or an agent running the app
  live-session-ui/           client: the user
  calls-ui/                  client: the user
  setup-ui/                  client: the user
  live-session-core/         client: LiveSessionUI and the composition root
  calls-core/                client: CallsUI
  setup-core/                client: SetupUI
  call-domain/               client: the Cores that name, find and read calls
  activity-gate/             client: LiveSessionCore and CallsCore
  transcript-core/           client: LiveSessionCore
  audio-capture/  recorder/  fluid-audio-asr/  call-detector/
  file-call-store/  settings-store/  model-store/
                             client: the Core whose port each implements
```

The folders follow [ADR-001](adr-001-v1-architecture.md)'s module layout. A
module gets a folder only if it has an observer; the app target composes and
has none of its own.

## SPEC.md

- **One observer**, named before the first scenario. The top level is
  written for the user; every other spec for its client.
- **Gherkin only:** one `Feature`, scenarios `S-<n> <name>` with ids never
  renumbered or reused, and `Given`/`When`/`Then` steps of one line each.
- **`Then` is a capability** the observer gains or loses: what it can see or
  do. Never a state, an event or an effect.
- **One scenario, one case.** A step that reads "A or B" is two scenarios.
- **No types, fields, file layouts or values** in a scenario. Interfaces
  live in code; how modules compose lives in ADR-001.
- **No duplication across levels.** A spec references the spec that owns a
  behaviour instead of restating it. The top level states what the user can
  do across the app and refers to the UI specs for what each screen offers.
- **Oracle:** [mvp.md](mvp.md), [the design](design/README.md), ADR-001 and
  the owner's rulings, plus the client's spec for a component. Every
  scenario traces to it.
- **Gaps are the agent's to close, not the owner's.** Where the oracle is
  silent or ambiguous — a threshold, a limit, a title, a choice between two
  readings — the agent researches it (the docs, the platform, comparable
  apps), has Codex challenge its proposal, decides and writes the scenario.
  Each such decision is one line in `## Decided`, above the scenarios, with
  its grounds, so the owner can overturn it. A gap is never handed to the
  owner as an open question (owner, 2026-10-22).

## QA.md

One row per scenario, headed by its id and name from `SPEC.md`: how the
scenario is driven and what evidence proves it. Cores are driven through
fake ports and recorded fixtures, adapters for real on this Mac, and the
user spec on a real call. A row has evidence or reads Missing. Verdicts go
to run reports, never into `QA.md`.

## Order and review

1. Top-down: the user spec first, then each UI, each Core and each adapter.
   A component's scenarios are exactly what its client needs to keep its own
   scenarios.
2. Each spec is reviewed against its oracle and its client's spec only:
   observer, capabilities, traceability in both directions (every scenario
   traces to the oracle; every behaviour the oracle names is a scenario, a
   reference or a non-goal) and `## Decided`. A finding that
   asks for mechanism is out of scope.
3. A spec is done when the review is clean.

## Tracking

In Multica, project Audelin:

- **LAB-400** is the parent of the spec tree. It is done when every spec
  child is done.
- **One child issue per spec**, covering its `SPEC.md` and `QA.md`. It names
  the observer and the spec it follows ("after LAB-…").
- **Decisions** the agent took for a spec are listed in its issue's closing
  comment. The owner overturns one by commenting; the spec changes and the
  issue reopens.
- **Build issues** (LAB-401 to LAB-407) stay as feature slices. Each names
  the specs whose scenarios it implements, and is done when those scenarios
  pass their `QA.md` rows. LAB-408 runs the user spec on a real call.

`spec-001-v1.md` is kept only as a checklist of behaviours to cover, and is
deleted when the last spec child closes.
