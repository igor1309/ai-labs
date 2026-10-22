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

## The tree

One folder per component, under `audelin/docs/spec/`. A component is one
responsibility with one observer: the user for the top level and the UI
components, the client that calls it for everything else. Each folder
holds a `SPEC.md` and a `QA.md`, and nothing else.

```text
spec/                        the user: journeys across the app, and references
  menu-bar/                  the user: the menu's status and commands (Screen 7)
  switches/                  the user: the two checkmarks, in the menu and Settings
  auto-record/               the user: when recordings start and stop on their own
  call-titles/               the user: what a call is titled, and renaming it
  debug-menu/                the user of a debug build: test triggers
  quit/                      the user: quitting without losing a call
  live-panel/                the user: the panel window and its header (Screen 3)
  live-text-states/          the user: live text waiting, off, switched mid-call
  error-banners/             the user: capture or disk failed, what still records (Screen 8)
  text-banners/              the user: live text failed while the call records
  transcript-view/           the user: reading the call in the panel
  transcript-gaps/           the user: time a side was not captured
  selection/                 the user: a selection while the text changes
  calls-list/                the user: finding and opening calls (Screen 4)
  call-rename/               the user: renaming a call, in the app or Finder
  call-delete/               the user: deleting a call
  call-screen/               the user (Screen 5, v1 part)
  setup-screen/              the user: first launch (Screen 1)
  launch-check/              the user: a missing model or folder at launch (Screen 2)
  settings-window/           the user: what Settings shows (Screen 6)
  calls-folder-change/       the user: moving the calls folder (Screen 6)
  recording-session/         live-panel, menu-bar, quit: start, stop, keep the audio
  recording-faults/          error-banners: capture or disk failing mid-call
  live-recognition/          transcript-view, transcript-gaps, live-text-states, text-banners:
                             text from the audio as the call goes on
  catch-up/                  call-screen, calls-list, call-delete, quit: completing text later
  late-text/                 live-text-states, transcript-view, call-screen: minutes added later
  call-watcher/              auto-recorder, recording-session: call apps on the microphone
  auto-recorder/             auto-record, calls-folder-change: recordings for calls
  calls-catalogue/           calls-list, call-screen, call-rename: the calls and their state
  call-changes/              call-rename, call-delete: rename, delete
  folder-move/               calls-folder-change: move the calls folder
  setup/                     setup-screen, launch-check: first run, launch check
  live-model/                setup-screen, launch-check, settings-window, live-text-states: the model
  preferences/               switches, settings-window: switches, chunk size
  call-folder-names/         calls-catalogue, call-changes, recording-session
  activity-gate/             recording-session, auto-recorder, catch-up, call-changes, folder-move
  stabilizer/                live-recognition, catch-up: words to committed segments
  transcript/                live-recognition, calls-catalogue: text from segments
  mic-capture/  system-audio-capture/  recorder/  fluid-audio-asr/
  call-detector/  call-store/  segment-log/  settings-store/  model-store/
                             the Core whose port each implements
```

The components live in [ADR-001](adr-001-v1-architecture.md)'s modules; a
module may hold several. The app target composes and has no spec.

**A spec over 100 lines is a design defect,** not a writing one: the
component does too much. Stop, split it by responsibility, and update this
tree before writing on (owner, 2026-10-22).

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

## Building

Code is built test-first: each test is run red before the code exists,
failing on its assertion rather than a compile error (the API is stubbed
first), and the red run is shown with the green one (owner, 2026-10-22).

An adapter is tested against the real thing it wraps, in temp places only,
never the user's own folders: a Trash test uses a disk image's Trash. A Core
is tested with fakes of its ports and a fake clock. No test proves that
something did not happen by sleeping; it asserts the state that says so
(owner, 2026-10-22).

## Order and review

1. Top-down: the user spec first, then each UI component, each Core and each adapter.
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
