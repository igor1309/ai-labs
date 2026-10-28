# AGENTS (mizan-ble)

Issues are in the Multica workspace `ai-labs` (parent of v0.0.1: LAB-625).

## Architecture

- [ARCHITECTURE.md](ARCHITECTURE.md) is the shape of the code: its
  grounding rules, components, modules, data flow, GATT layout and
  settings. Re-read the grounding before designing, specifying or building.
- A new component, module or dependency changes `ARCHITECTURE.md` and its
  diagram in the same commit, and gets its spec folder before its code.
- No component imports another. Only the UI modules import `DesignSystem`.
  Only the app target knows concrete types.

## Specs

How behaviour is specified before it is built, after audelin's process.

- One folder per component under `docs/spec/`, named as in the
  architecture, holding a `SPEC.md` and a `QA.md` and nothing else.
  `docs/spec/SPEC.md` is the user's.
- **A spec over 100 lines is a design defect:** the component does too
  much. Split it in the architecture before writing on.
- **One observer,** named before the first scenario: the user for the top
  level and the UI modules, the client that calls it for everything else.
- **Gherkin only:** one `Feature`, scenarios `S-<n> <name>` whose ids, once
  committed, are never renumbered or reused, one line per step.
- **`Then` is a capability** the observer gains or loses: what it can see,
  read or do. Never a state, an event or an effect.
- **One scenario, one case.** A step that reads "A or B" is two scenarios.
- **No types, fields or values in a scenario** unless the component's job
  is that value (the codec's bytes, the picker's thresholds).
- **No duplication across levels.** A spec names the spec that owns a
  behaviour instead of restating it.
- **Oracle:** `docs/poc.md`, `NOTES.md`, the design and the owner's
  rulings; for a component, also the user spec and its client's spec.
- **Gaps are the agent's, not the owner's.** Where the oracle is silent,
  research, have Codex challenge the proposal, decide, and write one line
  in `## Decided` with its grounds. Never hand a gap to the owner as a
  question.
- **Every `## Decided` line is challenged by Codex** before it is
  committed. Repeat until a round finds nothing new.
- **Every wait and failure the user can see is a scenario.**
- **`QA.md`** has one row per scenario: how it is driven and what evidence
  proves it, or `Evidence: Missing`. A drive must be able to fail its
  scenario: it reads back what the `Then` promises, not that a call was
  made. Verdicts go in run reports, never in `QA.md`.

## Running the work

How any component, core, adapter or UI module, goes from issue to trunk.

- One component per issue and per brief for Codex (`codex-sol-61` through
  agister's implement process): intent, a numbered "Done when", "Out of
  scope", sources and decisions. Name in "Out of scope" every neighbouring
  component, the root and any follow-up issue; a brief that leaves one out
  gets it built. Say that the step writes its own component's log line
  only; a run that sees siblings missing from the log adds theirs too.
- Start every component whose dependencies are on trunk at once, each on
  its own branch and worktree with its own Codex run. Do not wait for a
  PR's CI to start the next; stack a branch on the unmerged one it needs.
- Code two components would both carry belongs in neither. No component
  imports another, so where it goes is an architecture change, made the
  first time a second component needs it; UI modules share through
  `DesignSystem`.
- Review each Codex run before committing, and fix by hand what needs no
  rerun.

### Merging stacked branches

- Sibling branches all touch the same lists: `ios/Package.swift`,
  `ios/PreviewApps/Package.swift`, the READMEs' rows and `docs/log.md`.
  Union-merge the log only. Write a manifest or a README row fresh from
  what the branch has; a union of two manifests does not compile.
- After every merge, check that the branch has both trunk and the branch
  beneath it (`git merge-base --is-ancestor <ref> HEAD`). A merge whose
  resolution changes no file still needs its commit; without one, the next
  merge reuses the stale `MERGE_HEAD`.
- A PR that conflicts with trunk gets no CI run; the watch only reports
  that no run exists. Merge trunk in and push again.
- Turn on auto-merge for the bottom PR only. When it merges, merge trunk
  into the next branch, push, and turn on auto-merge for that PR. With
  every PR on auto-merge, a higher PR would merge the lower ones' changes
  under its own issue.

## Building cores and adapters

- A core's or adapter's "Done when" is its spec's scenarios, each proved
  as its `QA.md` row says.
- Cores and adapters are built test-first: each test is run red before
  the code exists, failing on its assertion (the API stubbed first), and
  the red run is shown with the green one.
- A core is tested with fakes of its interfaces and a fake clock. No test
  proves something did not happen by sleeping; it asserts the state that
  says so.
- An adapter is a thin binding over the system API plus the translation it
  owns; the translation is tested through a fake of the binding. Core
  Bluetooth is never the thing under test; the user spec on a real iPad and
  iPhone proves the binding.
- Each Codex run on a core or adapter is reviewed with agister's review
  processes before it merges. Name the app spec in the review goal: its
  `## Decided` fixes how the model orders events, effects and results, and
  a reviewer without it reports interleavings the loop cannot produce.
- A change to behaviour, a fix included, goes spec change, then build, then
  review.

## UI modules

- A UI module renders a state it is given and sends the person's taps
  through an event closure it owns. It implements no scenario: the
  scenarios are its machines' behaviour, proved by their tests and the
  user spec.
- The first step for a UI module is its state shape: a value type that can
  express every situation its spec's scenarios name, with all text already
  formatted. The view, its events and its previews follow from it.
- No observable objects (`ObservableObject`, `@Observable`) in a UI module,
  and no logic: the view reads the state and calls the closure.
- No tests in a UI module. Each one has previews that render every state
  exactly as its design frame draws it; a UI module is verified by matching
  its preview snapshots with the design, and gets no Agister review.
- Each UI module has a macOS preview app in `ios/PreviewApps`, built as
  its own issue after the module, never in the module's step. It shows
  the module's preview states, the events they send, and exports them to
  PNGs; that is where the module is matched with the design. Driving a
  screen live with its real machines, timers and Bluetooth stubbed, is
  later work, once the machines exist. The no-logic rule binds the UI
  module, not its preview app; the app copies no feature code and has no
  tests.

### Building the next UI module

- A UI brief's "Done when" is the state shape, events, view, previews,
  package target, README and log line. Name the frames by node id with
  their exported dark and light PNGs, and the frames' copy as a text file
  to use exactly. Its "Out of scope" names the preview app and the
  machines.
- A type two UI modules need (a step, a glyph, an amount) goes into
  `DesignSystem`, `Equatable` and `Sendable`.
- In a UI module's Codex run, look for raw sizes, fonts, colours and
  stroke widths (use the nearest token); a `DesignSystem` view rebuilt
  inside the module (give the component an option instead); and frame copy
  bent to force a line break.
- The preview app is the next issue. It shows the module's `previews`
  list with a state picker, light and dark and an event log, and
  `swift run <App>Preview --export <folder>` writes the PNGs; pass
  `devices:` for a one-device screen. Compare the PNGs with the frames
  yourself, fix the module in the same PR, and send the owner each
  difference that the design causes, with the fix you suggest.

## Design

- [docs/design/README.md](docs/design/README.md) indexes `mizan-ble.pen`
  and holds its rules: `mz-*` tokens only, `DS /` components only, a value
  nobody set marked "Proposed, not decided".
- Open, edit and save the `.pen` only as the repo's `AGENTS.md` § Designing
  in pen.dev says.
- A token change in the `.pen` ships with the regenerated Swift in one
  commit; CI fails when they differ.
- A screen built in code matches its frame; a screen with no frame says so
  in its spec's `## Decided` as proposed.
