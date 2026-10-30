# AGENTS (mizan-ble)

Issues are in the Multica workspace `ai-labs` (parent of v0.0.1: LAB-625).

## Architecture

- [ARCHITECTURE.md](ARCHITECTURE.md) is the shape of the code: its
  grounding rules, components, modules, data flow, GATT layout and
  settings. Re-read the grounding before designing, specifying or building.
- A new component, module or dependency changes `ARCHITECTURE.md` and its
  diagram in the same commit, and gets its spec folder before its code.
- No component imports another. Only the UI modules import `DesignSystem`.
  Only the root (`ios/App/`) knows concrete types.
- Only the apps (main, preview, rehearsal) import `SystemClock`, and only it
  and its tests read or wait on real time; every other module and test takes
  time through an interface it owns. `scripts/tests/test_clock_boundary.py`
  checks this.

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
The `build-component` skill is the procedure: its brief templates, the
agister runs, fix rounds and stacked merges.

- One component per issue and per brief for Codex (`codex-sol-61` through
  agister's implement process). Name in "Out of scope" every neighbouring
  component, the root and any follow-up issue; a brief that leaves one out
  gets it built. The step writes its own component's log line only; a run
  that sees siblings missing from the log adds theirs too.
- Start every component whose dependencies are on trunk at once, each on
  its own branch and worktree with its own Codex run. Do not wait for a
  PR's CI to start the next; stack a branch on the unmerged one it needs.
- Code two components would both carry belongs in neither. No component
  imports another, so where it goes is an architecture change, made the
  first time a second component needs it; UI modules share through
  `DesignSystem`.
- Review each Codex run before committing, and fix by hand what needs no
  rerun.
- A stack of PRs merges from the bottom, with auto-merge on the bottom PR
  only. With every PR on auto-merge, a higher PR would merge the lower
  ones' changes under its own issue.

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
  owns; the translation is tested through a fake of the binding. A binding
  that is local and cheap, as `UserDefaults` is, is driven for real
  instead, in a store made for each test and removed after it. Core
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
  PNGs; that is where the module is matched with the design. A screen
  driven live by its real machines is the rehearsal app's job. The
  no-logic rule binds the UI
  module, not its preview app; the app copies no feature code and has no
  tests.
- Screen snapshots in `ios/Tests/UISnapshotTests` render whole screens on
  the devices they ship to, outside the UI modules. A change that moves a
  pixel on a snapshotted screen fails them. When the change is intended,
  rerun `ios/scripts/snapshot-tests.sh` with `SNAPSHOT_RECORD=1`, look at
  each new image, and commit them in the same PR so its diff shows the
  before and after. Never record to make an unintended change pass.

### Building the next UI module

- A type two UI modules need (a step, a glyph, an amount) goes into
  `DesignSystem`, `Equatable` and `Sendable`.
- A UI module uses the nearest token, never a raw size, font, colour or
  stroke width; it gives a `DesignSystem` component an option rather than
  rebuild it; and it uses the frames' copy exactly, never bent to force a
  line break.
- The preview app is the next issue. It shows the module's `previews`
  list with a state picker, light and dark and an event log, and
  `swift run <App>Preview --export <folder>` writes the PNGs; pass
  `devices:` for a one-device screen. Compare the PNGs with the frames
  yourself, fix the module in the same PR, and send the owner each
  difference that the design causes, with the fix you suggest.

## The rehearsal app

The rehearsal app is the real app with its radios replaced by a script,
driven by Maestro on simulators. It proves the wiring before any device.

- It is built from the `MizanBLE Rehearsal` scheme. That scheme links
  `ScriptedRadio` in place of `HostRadio` and `ClientRadio`; everything
  else, the flows, crypto, codec, picker, screens and logging, is the
  shipping code. The device scheme never links `ScriptedRadio`, and the
  root's only difference between the two is which radio pair it builds.
- `ScriptedRadio` is a spy that reads its settings from disk, as a fake
  in a test does from its setup. A JSON file says which hosts the client
  sees and at what signal, what the other side answers at each step, where
  it fails and how long it waits. It lives at `Documents/scripted-radio.json`
  in the app's container, or at `-scriptedRadio <path>`. It is read at
  launch and on each change, and each serve or scan keeps the settings it
  started with, so a lane changes behaviour by changing the file, never by
  a rebuild.
- Each side runs on its own simulator against a scripted other side: the
  host on an iPad, the client on an iPhone. Nothing connects the two
  simulators. Two real parties meet only on devices.
- A lane is a folder under `maestro/lanes/`, one per user-spec scenario.
  Its `lane.json` lists parts, one per side or Examples row: a flow, a
  settings file, the device kind and the log lines the part must leave.
  It checks what the person sees through Maestro, and what the app did
  through its own log:
  `xcrun simctl spawn <udid> log show --predicate 'subsystem == "mizan-ble"'`.
  There is no other record.
- The log never holds an amount, a key, a nonce, a message's plaintext or
  ciphertext, or a peer or device identifier, in any form. Every lane
  searches its run's log for the secret values in its settings file and
  fails on a match.
- Every wiring change is proven in the rehearsal app before a device. The
  device check is left with what a script cannot show: real Bluetooth,
  signal strength and range, and two real parties paying each other.

### Running and adding a lane

- `maestro/run.sh [S-n ...]` builds once, clones a fresh simulator per
  part, puts the settings into its container and writes
  `maestro/runs/<stamp>.md`. Commit the passing report with the change;
  its sibling folder of screenshots and logs stays out of git. A full run
  takes about half an hour; while fixing, run only the failing lanes.
  CI does not run the lanes, so a change to the wiring or a screen runs
  them before its PR.
- Run lanes yourself. Codex's sandbox cannot reach CoreSimulator, so an
  implement run can write lanes and the runner but cannot prove them.
- To add a lane, copy the nearest one, rename its folder `S-<n>-<name>`
  after the scenario, write its settings and flow, and list the log lines
  that prove the app did the work. Then add the scenario, and its part
  count, to the set `ios/scripts/tests/test_lane_run.py` checks every
  lane against.
- Tap a keypad key by its id (`id: "key 4"`, `id: "key \\."`), never by
  its text: a text selector is a regex over every element, hidden ones
  too, and a digit also matches the rail's step numbers.
- Every screen must fit an iPad in portrait. iPadOS 26 ignores the app's
  orientation limits on iPad, so a sheet or column that fits landscape
  can squeeze to nothing there; a lane on the iPad catches it, a preview
  does not.
- A failure's first error and end-screen screenshot are in the report;
  the part's Maestro output in the sibling folder names the failing step.
  `--keep` leaves the failed clone booted to look at.

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

## Installing on the owner's devices

- The project turns signing off and names no team, so pass both on the
  build. Run it from the repo root with the sandbox off:

  ```sh
  xcodebuild -project mizan-ble/ios/App/MizanBLE.xcodeproj -scheme MizanBLE \
    -configuration Debug -destination 'generic/platform=iOS' \
    -derivedDataPath /tmp/mizan-device-dd -allowProvisioningUpdates \
    CODE_SIGNING_ALLOWED=YES CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=VRVJ9YNRQU build
  ```

- Install the app on each device with
  `xcrun devicectl device install app --device <udid> /tmp/mizan-device-dd/Build/Products/Debug-iphoneos/MizanBLE.app`:
  iPhone 15 Pro `00008130-000E60D411D8001C`, iPad Pro 11"
  `00008103-0006285A3E07001E`. `xcrun devicectl list devices` shows
  whether they are available.
- "Integrity could not be verified" means the app was built unsigned.
