# Profiling as part of development

The live panel's cost per update grew with the call, and nothing caught it
until a 3-hour rehearsal profile. This note picks what checks run when, so
the next such growth is caught on the PR that adds it.

## What exists

- **Count tests**: cheap, exact, and immune to a busy machine. They check
  how much work an update does: rows built, characters replaced. Example:
  an update to the newest entry builds one row of 800.
- **Ratio tests** time an update late in a long call against one early and
  fail when the late one costs over 3×. They catch growth without a
  baseline, but only for the path they drive. The view's load test used to
  propose a fixed height, so it missed the `sizeThatFits` cost the panel
  actually paid.
- **The rehearsal profile** (`audelin/scripts/profile-rehearsal.sh`) runs a
  paced call through the real panel under Time Profiler and summarises the
  trace: self and inclusive time by frame, main-thread share, hangs, and
  peak memory. It is the only check that sees the whole app, and a 3-hour
  call takes hours.

## Tools weighed

- **XCTest performance metrics** (`measure(metrics:options:)` with
  `XCTClockMetric`, `XCTCPUMetric`, `XCTMemoryMetric`,
  `XCTOSSignpostMetric`) exist in the installed Xcode. Their baselines are
  kept per machine by Xcode and compared by `xcodebuild`. The audelin
  tests are Swift Testing under `swift test`, and the installed Swift
  Testing module has no measuring API. Adopting them means a second test
  runner, plus baselines that mean nothing on GitHub's shared
  `macos-latest` runners. Not worth it here.
- **ordo-one/package-benchmark** runs under SwiftPM on macOS and Linux and
  compares a PR against a stored baseline with per-benchmark thresholds,
  reporting percentiles. It counts mallocs, ARC traffic and syscalls as
  well as time; its README gives no figures for run-to-run noise. Its
  baseline format is not public API. It is the right tool if wall-clock
  baselines are ever needed. Counts in ordinary tests give most of that
  without a new dependency.
- **`xctrace` from the command line** records and exports traces as XML.
  `xctrace triage --style hangs` lists a trace's hangs. Small open-source
  tools turn the export into JSON summaries (scooorpion/Xctrace-analysis)
  or compare two traces with pass/fail thresholds
  (carloshpdoc/memorydetective). None publishes how stable the numbers are
  from run to run, and no source covered running it on a hosted CI runner.
  Our own summariser already does what these do.
- **`os_signpost` intervals** around panel updates, transcript writes and
  hearings would show up as named spans in every trace. That would make
  two profiles comparable by span instead of by stack frame, which changes
  with inlining.
- **MetricKit** hang reports come from real use and arrive late. They are a
  signal after release, not a check.

## Recommendation

| Layer | What | Cost | When |
|---|---|---|---|
| 1 | Count tests: work per update does not grow with the call | ms, no noise | every PR (in CI now) |
| 2 | Ratio tests on the real path, late vs early, ≤ 3× | seconds | every PR (in CI now) |
| 3 | Short rehearsal profile (e.g. 20 min at high speed) with a diff of the summary against the last kept one | minutes, on this Mac | PRs touching the text path, by hand |
| 4 | Full 3-hour rehearsal profile | hours, on this Mac | before a release |
| 5 | Hang reports from real use | none | after release |

- Layers 1 and 2 are the gate. A growth found by layers 3 and 4 becomes a
  count or ratio test in the fix's PR, so it is gated from then on.
- Layers 3 and 4 stay off GitHub's hosted runners: they need Instruments
  and a quiet machine, and their numbers would not compare across hosted
  machines.
- Each test must drive the path the app takes, with the same proposals and
  composition. A test that skips part of that path passes while the app is
  slow.

## Follow-ups

- Signpost the panel update, the transcript write and a hearing, and have
  the profile summary report each span's count, total time and longest
  instance.
- Teach `summarize-trace.py` to compare two summaries and print what grew,
  so a layer 3 run is read against the last one in seconds.
