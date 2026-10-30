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
- **The rehearsal profile** (`audelin/macos/scripts/profile-rehearsal.sh`) runs a
  paced call through the real panel under Time Profiler and summarises the
  trace: self and inclusive time by frame, main-thread share, hangs, and
  peak memory. It is the only check that sees the whole app. Its
  recognisers are fakes, and it is usually run faster than real time, so
  its numbers are diagnostic only (see below).

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

## Four questions, four measurements

One long run at 10× under Time Profiler gave a number for each of the
questions below and answered none of them: the speed multiplied the
update rate, the fake recognisers made lag a pipeline backlog, and the
profiler cannot see memory. Ask each question on its own.

| Question | Measurement | Speed and length | Where |
|---|---|---|---|
| Does an update cost more as the call grows? | Count tests of every kind of work that could grow (traversal, mapping, comparisons, copied text, rows built), and ratio tests at fixed sizes (20, 800, 6,000 entries) preloaded, through the whole path to the laid-out panel. Time Profiler only on a short window at a large preloaded size. | no call played; seconds | every PR |
| Does the app keep up in real time? | Real speech through the real recognisers on both sides. Per stage: decoding time over new audio length, backlog, latency from capture to on-screen and to final, with the recognisers' built-in delay apart from queue growth. Continuous samples, read at minutes 1, 30, 90 and 180. | 1×, 3 hours | nightly, self-hosted Mac |
| Does memory grow, and what holds it? | Footprint over time against entries and text bytes held; repeated calls in one process release the session and panel. Allocations generations only to explain growth the footprint cannot. | 1×, long; preloaded sizes for retained cost per entry | nightly; lifetime test every PR |
| Does the main thread hang? | The Hangs recording over a short window at a large preloaded size, while updates arrive and the reader selects, scrolls and resizes. Thread states where samples do not explain a hang. | 1×, short windows | before a release, and when the text path changes |

Running faster than 1× is a separate experiment, named as one: it finds
where the app saturates.

A preloaded state honestly answers what one update costs at a size, and
what that size holds in memory. It misses what only a long call
accumulates: allocation history, queues, model caches, recogniser
revisions, file growth, teardown and lifecycle transitions. The long
1× run covers those.

Numbers are compared only between runs that match in workload, build,
models, machine and instrumentation.

## Recommendation

| Layer | What | Cost | When |
|---|---|---|---|
| 1 | Count tests: work per update does not grow with the call | ms, no noise | every PR (in CI now) |
| 2 | Ratio tests on the real path, late vs early, ≤ 3× | seconds | every PR (in CI now) |
| 3 | Short profiled windows at a large preloaded size, CPU and hangs, at 1×, compared with the last kept summary | minutes, on this Mac | PRs touching the text path, by hand |
| 4 | 3-hour real-model run at 1×, no profiler: lag and memory over time | hours, self-hosted Mac | nightly, and before a release |
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

- Split the profile script into bounded CPU-and-hangs windows and runs
  with no profiler. Signpost the panel update, the transcript write and a
  hearing, and compare two summaries.
- Preload the session and panel to a given size, and gate cost per
  update on the whole path at those sizes.
- A real-speech, real-recogniser rehearsal at 1× with per-stage latency.
- Memory over a call against entries held, and release across repeated
  calls.
- Nightly long runs on the self-hosted Mac.
