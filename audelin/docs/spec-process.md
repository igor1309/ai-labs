---
date: 2026-10-22
model: claude-opus-5-5
description: "How Audelin is specified: one SPEC.md and QA.md per component, at most 100 lines each, tracked as Multica issues"
---

# Spec process

How Audelin's behaviour is specified before it is built. It replaced the
single v1 spec (`spec-001-v1.md`, deleted 2026-10-22), which grew past
1,100 lines because it was written for no observer and mixed contracts,
mechanics, invented values and test lists.

## Spec folders

One folder per component, under `audelin/docs/spec/`, named after the
component. The architecture decides what the components are and what they
are called; this process only specifies them. A component has one
responsibility and one observer: the user for the top level and the UI
components, the client that calls it for everything else. Each folder holds
a `SPEC.md` and a `QA.md`, and nothing else.

**A spec over 100 lines is a design defect,** not a writing one: the
component does too much. Stop, and split the component in the architecture
before writing on (owner, 2026-10-22).

## SPEC.md

- **One observer**, named before the first scenario. The top level is
  written for the user; every other spec for its client.
- **Gherkin only:** one `Feature`, scenarios `S-<n> <name>` with ids never
  renumbered or reused once committed, and `Given`/`When`/`Then` steps of one line each.
- **`Then` is a capability** the observer gains or loses: what it can see or
  do. Never a state, an event or an effect.
- **One scenario, one case.** A step that reads "A or B" is two scenarios.
- **No types, fields, file layouts or values** in a scenario. Interfaces
  live in code.
- **No duplication across levels.** A spec references the spec that owns a
  behaviour instead of restating it. The top level states what the user can
  do across the app and refers to the UI specs for what each screen offers.
- **Oracle:** [mvp.md](mvp.md), [the design](design/README.md) and
  the owner's rulings, plus the client's spec for a component. Every
  scenario traces to it.
- **Gaps are the agent's to close, not the owner's.** Where the oracle is
  silent or ambiguous — a threshold, a limit, a title, a choice between two
  readings — the agent researches it (the docs, the platform, comparable
  apps), has Codex challenge its proposal, decides and writes the scenario.
  Each such decision is one line in `## Decided`, above the scenarios, with
  its grounds, so the owner can overturn it. A gap is never handed to the
  owner as an open question (owner, 2026-10-22).
- **The shape comes from [ARCHITECTURE.md](../ARCHITECTURE.md),** not from
  another app. Before drafting, check the component against its rules: it
  owns the interfaces it depends on and names no other component, only an
  adapter touches the outside world, only the root wires, and retries and
  logging are decorators at the root (owner, 2026-10-22: "amanu is not an
  oracle, my approach is").
- **Prior art is evidence, read before a decision.** Read how the open-source
  apps in `docs/research/` do it, from their source, for facts about the
  platform and its failures: what an API does, what broke and why. Cite
  them in the line. They never decide a component's structure or wiring,
  and a departure from them needs evidence, not a preference (owner,
  2026-10-22: "do grounding first").
- **Every `## Decided` line is challenged by Codex** before the spec is
  committed, including lines added to a spec already done. Repeat until a
  round finds nothing new.
- **A number cites the run that measured it** (`docs/research/tests.md`),
  or it is a decision with its own grounds.
- **Every wait and failure the user can see is a scenario:** loading,
  catching up, a missing track. Model loading was found only in a live
  trial (2026-10-22).

## QA.md

One row per scenario, headed by its id and name from `SPEC.md`: how the
scenario is driven and what evidence proves it. Cores are driven through
fake ports and recorded fixtures, adapters for real on this Mac or through
a fake of their system binding (§ Building), and the user spec on a real
call. A row has evidence or reads Missing. Verdicts go
to run reports, never into `QA.md`. A row's drive must be able to fail its
scenario: it reads back the sound, word or text the `Then` promises, not a
call that was made.

## Building

Every change to behaviour goes the same way, a fix to a component already
built included: spec change, brief, `agister run implement_tested`, then
`code_review`, then one commit for its findings. A hand-built change skips
the red runs, and its review finds the missing tests afterwards (six on
2026-10-22).

A review runs on a detached worktree at the candidate commit, and nothing
is committed to the reviewed branch while it runs.

A hands-on trial, such as a preview app, states before it runs what it can
and cannot show: the live text preview heard only the microphone, which
was said after the trial.

Code is built test-first: each test is run red before the code exists,
failing on its assertion rather than a compile error (the API is stubbed
first), and the red run is shown with the green one (owner, 2026-10-22).

An adapter is tested against the real thing it wraps, in temp places only,
never the user's own folders: a Trash test uses a disk image's Trash. When
the real thing is hardware or system state (audio devices, permissions,
sleep), the adapter is a thin binding over the system API plus the
translation it owns, and the translation is tested through a fake of the
binding. Apple's frameworks are never the thing under test, and no row needs
hardware the owner does not have; the binding is proven by the user spec on
a real call (owner, 2026-10-22). A Core
is tested with fakes of its ports and a fake clock. No test proves that
something did not happen by sleeping; it asserts the state that says so
(owner, 2026-10-22).

## Order and review

1. Top-down: the user spec first, then each UI component, each Core and each adapter.
   A component's scenarios are exactly what its client needs to keep its own
   scenarios. A spec whose client has none yet traces each of its needs to
   the user spec and names the missing client, and that client is next.
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
