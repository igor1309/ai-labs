# Audelin

A native macOS companion for the owner's calls (Zoom, Telemost,
Meet) in Russian with English professional terms. It records both sides as
two tracks, shows a smooth, selectable live transcript in a floating panel,
and, from v2, explains a selected term in Russian through bb.

Status: the menu bar app records detected calls, shows the live transcript and
opens native Settings. Recording and recognition stay local. Optional call notes
are off by default; Settings discloses both configured destinations and their
subscription/API/local-compute costs. Models, CLI path, API base URL and credential
variable names are editable. Credential values are resolved only for requests and
are never stored or displayed. A Finder-launched app may lack shell variables;
validation reports that without sending a transcript or making a paid request.

Eligible final transcripts create durable jobs without holding the next call.
Calls shows waiting, preparation, success/warning and failure/interruption status;
notes are saved as `summary.md` beside the original transcript and audio. Pending
jobs resume with their saved configuration; interrupted running requests are never
automatically replayed. Claude CLI requires supported isolation controls, preserves
subscription authentication and remains subject to managed organization policy.
Provider availability, quota and factual faithfulness are not guaranteed by
configuration checks or structural validation.

Build: `cd audelin/macos && sh scripts/bundle.sh`.
Install: `sh audelin/macos/scripts/install.sh` builds, quits a running copy, replaces
`/Applications/Audelin.app`, opens it, and adds the LaunchAgent
`~/Library/LaunchAgents/dev.igor1309.audelin.login.plist` that opens it at login.
Turn start at login off by deleting that file. macOS asks for microphone and
audio-capture access on first use; the first launch downloads and compiles the models.
Components: `macos/`; composer, app, rehearsal and their integration tests: `macos/App/`.
Build and test each package from its directory with `swift build --build-tests` and `swift test`.
Reading exposes its complete state, including rendered lines, the stored `log`,
rendering indexes and per-reduction work counts. Public initializers retain the supplied
values; reduction keeps `log` coherent with the lines and status. Construct a
`ReadingReducer(recordingTime:lineTime:span:)` to inject rendering closures, or use
`ReadingReducer.reduce` with the production functions in `ReadingFormatting`.

Run: `open .build/Audelin.app` from `audelin/macos`.
Logs: `log stream --predicate 'subsystem == "dev.igor1309.audelin"'`.
Profile: from `audelin/macos`, `scripts/profile-rehearsal.sh capture --capture-after 120 --capture-for 30 --minutes 20 --speed 1`
records only that wall-clock window and summarizes CPU, hangs and signpost intervals in `macos/profiles/`.
Endurance: `scripts/profile-rehearsal.sh endurance --minutes 180 --speed 1` runs without Instruments and keeps only the rehearsal report.
Recognisers are fakes: lag is pipeline backlog, and speeds above 1× measure saturation.

Optimized load tests: from each of `audelin/macos` and `audelin/macos/App`, run `swift build --build-tests -Xswiftc -O`,
then, in the same directory, `audelin/scripts/swift-test-bounded.sh 120 -Xswiftc -O --filter LoadTests`.

| Path | What it holds |
|---|---|
| [docs/log.md](docs/log.md) | What changed for the product, newest first |
| [docs/spec-process.md](docs/spec-process.md) | How behaviour is specified: one SPEC.md and QA.md per component, at most 100 lines, tracked in Multica |
| [docs/audelin-naming-brief.md](docs/audelin-naming-brief.md) | The name: Audelin, CLI `audelin`, data in `~/.audelin` |
| [docs/design/README.md](docs/design/README.md) | Glass Ledger design: tokens, components, Screens 1–8 in `visual-language.pen` |
| [docs/mvp.md](docs/mvp.md) | The product vision as first written: not grounds for any spec or technical choice |
| [docs/research/](docs/research/) | Research, the Parakeet spike and naming rounds |

CLI `audelin`, data folder `~/.audelin`, calls in `~/Recordings/Audelin`.

`python3 -I audelin/scripts/slow-tests.py` runs the tests of all three
packages three times and writes every test, ranked by its median duration
with its file and line, to `slow-tests-report.json` and `.md` in the current
directory. The weekly `audelin-slow-tests` workflow runs it on macOS and
hands the ranking to the slow-test hunter autopilot. Tests listed in
`scripts/slow-tests.skip` (one test id per line, `#` for the reason) are
marked as skipped there.
