# Profiling Audelin

Research date: 2026-10-29. Recommendation: protect audio capture first, measure
live latency second, then optimize resource use against a paired call-only
control. A fast offline recognizer is insufficient evidence of a healthy live
pipeline. This note proposes instrumentation and experiments; no new Audelin
performance measurements were taken for it.

## Current evidence and its limits

The current app records calls; the live panel and settings are not connected.
Recognition and panel experiments therefore need their existing harnesses
until end-to-end composition exists. Term explanation through bb is future
work: its benchmark is a proposed scenario, not an available feature.

Historical results recorded in `tests.md` (2026-10-22):

| Experiment | Observed result | Interpretation limit |
|---|---|---|
| Run 4, 263 s input, two shared-model Parakeet streams, ten repeats | 3.61–3.73 s wall time; 6.1–6.9 CPU seconds; 133–136 MB peak memory | Unpaced spike, not live capture or UI. Hardware is not identified in this experiment; other Mac load was ~6. “3% engine capacity” is an inference, not measured ANE utilization. |
| Run 8, 94 s two-track replay, two-pass | Shown median ~0.8 s; final median 4.3 s, p90 5.3–5.7 s, max 5.9–6.0 s; compute/audio 3.2–3.8% | Delay uses audio fed minus word timestamp; compute is additional. No p95 or render timestamp. One compressed private call; not a device-wide baseline. |
| Run 9, M3 Max preview | First-build model load: Nemotron 15.8–16 s, Parakeet 14–17 s; subsequent loads 0.2 s and 0.1–0.5 s | Log observations, not controlled cold-cache trials; first inference warm-up not separately timed. |

Do not extrapolate these figures to lower-memory Macs or label replay delay as
capture-to-screen latency. Existing replay feeds 0.1 s chunks as quickly as the
recognizer accepts them. Its compute/audio report is useful for throughput,
not realistic scheduling, capture faults, or contention with a call app.

## Prioritized metrics

P0 blocks reliable recording/live use. P1 diagnoses sustainability and interactive
quality. P2 supports optimization. All latencies use a monotonic host clock;
wall-clock UTC is metadata only. Record both tracks separately and together.

| Priority / metric | Definition and units | Collection | Why |
|---|---|---|---|
| P0 audio loss | Missing source frames / expected frames (%), gap count, longest gap (ms), dropped buffers (count) | Host/sample timestamps and sequence continuity at ingress and writer; stream yield/drop results; device error/overload events | Distinguishes capture loss from ASR loss. Silence/RMS zero is not proof of a dropout. Count route changes separately. |
| P0 deadline / overrun | Callback duration / buffer period; deadline misses and ring/queue overflows (count) | Preallocated timestamp/counter telemetry, Audio System Trace | Buffer period = frames / sample rate; exposes deadline risk even before audible loss. |
| P0 first partial latency | First partial containing an aligned word minus acoustic word end (ms), p50/p95/max | Source timestamp → recognition event → UI application → render evidence | Report recognizer emission and screen presentation separately; measures actual waiting. |
| P0 final latency | Final word/segment emission and settled UI presentation minus acoustic word/segment end (ms), p50/p95/max | Same correlation IDs; independent reference word ends for fixtures | Captures silence-tail stalls and stabilization costs. Word and segment distributions must remain distinct. |
| P0 capture-to-transcript | Capture arrival → partial/final emission and visible update (ms), p50/p95 | Stage timestamps correlated by audio range | Operational path metric without forced alignment; excludes audio already delayed upstream of capture. Do not substitute it for acoustic latency. |
| P0 backlog | Queued audio duration and oldest-item age (s), high-water mark; slope (s/min) | Enqueue/dequeue counters per capture, writer, recognizer and UI boundary | A bounded average RTF can conceal bursts and unbounded buffering. Record dropped work. |
| P0 synchronization | Relative mic/system offset (ms) and change over time; drift = offset change / elapsed time × 10^6 (ppm) | Shared host-clock anchors plus known simultaneous test markers in both paths | Sample counts alone cannot align independent devices. Separate constant offset from drift; reset fit after route/rate changes. |
| P0 call interference | Call app CPU change (percentage points), audio glitch count, call latency/jitter/loss changes (ms, %, where app exposes them) | Paired same-device call-only vs Audelin scenarios; call diagnostics and external loopback reference | Audelin must leave the actual conversation healthy; network variation is a confounder. |
| P1 throughput | Wall processing seconds / unique audio seconds (RTF); throughput = 1/RTF | Unpaced replay, excluding load; paced test reports occupied time separately | RTF <1 is necessary for one serial stream, not sufficient for two tracks or bounded queues. Count overlap windows only once in input duration. |
| P1 load/warm-up | App launch → capture ready; model request → ready; first prediction; subsequent prediction p50/p95 (ms) | Load and inference intervals, separate fresh process vs reused process vs fresh model install | Separates compilation/cache effects and avoids hiding first-call delay in steady state. |
| P1 CPU | CPU seconds / wall seconds ×100 (%; 100%=one core); mean/p95 of 1 s bins | Time Profiler, Activity Monitor, process counters | Locate hot paths; include child bb process and inspect call app/coreaudiod separately. |
| P1 memory | Physical footprint and RSS (MiB), peak, post-warm-up slope (MiB/h), post-stop residual | VM Tracker/Activity Monitor or footprint; Allocations generations; memory graph/Leaks | RSS, allocation bytes and footprint are different measures. Retained text or queues can grow without a detected leak. |
| P1 ML/GPU | Prediction latency (ms), compute-unit placement, GPU/ANE activity during inference | Core ML instrument and Xcode model report; Metal System Trace for GPU | Verify actual acceleration rather than infer it from low CPU; shared unified memory means no independent “VRAM budget.” |
| P1 UI | Input→visual response p50/p95 (ms), hangs (count/duration), frame hitch duration (ms) | Hangs/Time Profiler, SwiftUI and Animation Hitches when supported, scripted selection/scroll | Smooth text must remain selectable while updates arrive; test growing transcripts and glass rendering. |
| P1 disk | Logical bytes/s, writes/s, write p95/max (ms), physical I/O and flush/close duration | File Activity plus writer/flush intervals and resulting track lengths | Identify tiny writes, blocked serialization, and end-of-call drain; logical and physical writes differ. |
| P1 thermal/energy | Thermal-state durations, CPU frequency trend, subsystem estimated power (W), energy (J), wakeups/s | ProcessInfo thermal notifications; powermetrics; Activity Monitor Energy | Relate warm-session slowdowns to heat and power. Energy Impact is a relative score, not watts. |
| P2 explanation | Selection→first visible token and completion p50/p95 (ms), tokens/s, peak memory, audio/ASR regression during request | Root decorator around bb launch/request/output/render, include child process | Tests a competing local model without sacrificing P0 audio. Fixed prompt and response-length policy. |
| P2 quality guardrail | WER on aligned reference, English-term recall, partial revision rate, final-then-changed count | Fixed Russian/English-term corpus; replay outputs compared with reference | Faster results are not improvements if words disappear, terms degrade, or final text changes. |

For percentiles retain raw observations, report sample count, failures/timeouts
and exclusions. Use nearest-rank p95 on sorted values (index ceil(0.95N)); do
not average track percentiles. Give per-track, per-run results and aggregate
raw samples only within the same configuration. Record missing words as
missing coverage, never silently exclude them to improve latency. Model word
timestamps are estimates; use an independently annotated fixture for acoustic
latency and retain timestamp uncertainty.

## Tools and diagnostic workflow

- **Time Profiler + Hangs + signposts:** first pass for hot work and latency
  correlation. High main-thread CPU suggests expensive work; low CPU during a
  hang suggests waiting. Use **System Trace** for blocked threads, scheduling,
  locks and I/O, and **Swift Concurrency** for task/executor contention. Apple's
  [hang tutorial](https://developer.apple.com/tutorials/instruments/getting-started-with-hang-analysis)
  explains this distinction.
- **Audio System Trace:** reproduce callback deadline misses with the call app
  active. Correlate overloads with callback duration, conversions and writer
  stalls. Apple's [audio workgroups explanation](https://developer.apple.com/documentation/audiotoolbox/understanding-audio-workgroups)
  connects missed I/O deadlines to playback interruptions. This does not imply
  Audelin needs a workgroup change before measurement.
- **Allocations**, with generations at warm-up, 10 min, 60 min and stop, finds
  surviving allocations; **Leaks** and Xcode's memory graph investigate leaked
  allocations/retain cycles. **VM Tracker**, `vmmap` and `footprint` help with
  mapped models and non-heap memory. A clean Leaks report cannot establish
  bounded memory: reachable unused objects still consume space ([Apple memory guidance](https://developer.apple.com/documentation/xcode/making-changes-to-reduce-memory-use)).
- **Core ML** template for current recognizers; compare supported compute-unit
  configurations in Xcode's model performance report. Placement is a runtime
  decision, not guaranteed by model compatibility ([Apple model profiling](https://developer.apple.com/documentation/coreml/analyzing-a-core-ml-model-s-performance-in-xcode)).
  Use **Metal System Trace** for GPU scheduling/contention with the call app or
  a Metal-backed bb model. Core ML timings omit decoding/feature preparation
  outside the framework, so retain whole-request intervals. Core AI tooling
  documents a different framework: do not assume it instruments Core ML calls.
- **File Activity** separates filesystem calls from physical disk behavior
  ([Apple disk profiling](https://developer.apple.com/documentation/xcode/reducing-disk-writes)).
  Trace model reads separately from continuous audio/transcript writes and
  close/flush. Keep real-time callbacks free of blocking disk work.
- **Energy:** Activity Monitor's [Energy Impact](https://support.apple.com/guide/activity-monitor/view-energy-consumption-actmntr43697/mac)
  supports relative comparisons. Use local `man powermetrics` and
  `powermetrics --help` for supported samplers and bounded sampling. Its manual
  warns subsystem watts are estimates unsuitable for cross-device comparison;
  ANE/GPU activity is system-wide, not exclusive attribution to Audelin. Compare
  paired same-machine controls. Do not assume a listed Power Profiler template
  supplies macOS power attribution: Apple's [Power Profiler documentation](https://developer.apple.com/documentation/xcode/measuring-your-app-s-power-use-with-power-profiler)
  specifies iPhone/iPad availability.

## Instrumentation proposal

Keep metrics in composition-root interface decorators, matching the current
architecture; do not add logging imports to domain components. Existing
`Compose/LoggingCapture.swift` counts pieces/frames but does not establish
callback deadlines, loss or queue bounds. `LiveAudio/AudioStatistics.swift`
provides audio timeline/RMS information, not a dropout detector.

Use [OSSignposter](https://developer.apple.com/documentation/os/ossignposter)
under subsystem `dev.igor1309.audelin`, category `performance`. Give each
session, track, audio range and request a correlation ID; pair every interval
on success, failure and cancellation. Proposed intervals/events:

1. Capture request, device/tap start, first buffer, route/rate change, stop.
   Preserve native host time, source frame position, rate and frame count at
   adapter ingress. Callback duration and ring overflow need adapter-level
   probes; a downstream decorator cannot reconstruct them. Only bounded,
   preallocated counters/timestamps in callbacks; emit summaries off-thread.
2. Capture delivery, conversion start/end, record enqueue/dequeue/write,
   recognition enqueue/dequeue, feature preparation, inference, decoder output.
   Measure duration-weighted backlog and stream drop results, including any
   AsyncStream buffering. Do not create another unbounded metrics stream.
3. Shared model request/actual load completion, first inference and reused
   inference. Distinguish concurrent waiters from duplicate physical loads;
   preserve shared-model ownership rather than changing it for telemetry.
4. Partial/final recognizer emission, LiveText settle, transcript persistence,
   panel state application, next presentation observation. State assignment
   is not proof of pixels on screen: validate rendering with a display-linked
   probe or timestamped screen recording using a visible fixture marker.
5. Explanation selection, bb child launch/model-ready, first token, completion,
   display, cancellation. Sample the process tree and both model loads.
6. Session drain/flush/close and after-stop resource snapshot. Export compact
   numeric JSONL off the hot path; include schema version, build/config IDs,
   errors and counter totals. No transcript text or audio in performance logs.

## Reproducible collection

1. Record git SHA, dirty state, macOS/Xcode/SDK versions, chip/core counts/RAM,
   power mode/AC state/battery level, display refresh/brightness, audio routes,
   sample rates/buffer sizes, call app/version/settings, model hashes/SDK
   versions/compute units/chunk/context sizes, fixture hash and ambient/load
   conditions. Retain release symbols/dSYMs for the exact binary.
2. Build the release app with `sh scripts/bundle.sh` from `audelin/macos`.
   Grant normal audio permissions before timed runs. Profile without debugger,
   sanitizers or verbose text logging; run separate diagnostic builds if needed.
   Pre-stage models: downloading is a separate onboarding experiment.
3. Inventory tools on the actual benchmark Mac; template availability changes.
   These commands were checked against the installed CLI for this note:

   ```sh
   xcodebuild -version
   sw_vers
   system_profiler SPHardwareDataType
   xcrun xctrace list templates
   xcrun xctrace help record
   ```

4. Launch the bundled app normally, find its exact PID in Activity Monitor,
   then replace 12345 below. Store traces in a private results directory,
   outside the repository. Use a fresh output name for each run:

   ```sh
   xcrun xctrace record --template 'Time Profiler' --attach 12345 \
     --time-limit 60s --output run-01-cpu.trace
   ```

   Repeat the same scripted workload in separate runs with `Audio System Trace`,
   `Core ML`, `File Activity`, `Allocations`, `Leaks`, `Metal System Trace`,
   `SwiftUI` or `System Trace` as the question requires. In Instruments add
   signposts/Hangs to a saved custom template where supported; save its version.
   Use all-process recording for short contention investigations. Attach misses
   startup: use App Launch or launch the executable from Instruments for load
   traces, checking permissions/bundle context remain equivalent.
5. For energy, inspect `powermetrics --help`, then use supported samplers with
   `sudo powermetrics -i 1000 -n 60 -o run-01-power.txt`. Authentication is a
   local profiling prerequisite. Do not run privileged sampling as part of
   normal app operation. Preserve sampler/version metadata; integrate watts
   over elapsed sample time for joules, and subtract paired call-only energy
   only as an estimate of incremental demand.
6. For replay, build release in `docs/research/replay`, then use its existing
   executable with a private result directory and an authorized two-channel
   fixture, `--split --only two-pass`. Repeat separately for `parakeet` and
   `nemotron`. Record existing summary/TSV outputs. Add a true monotonic
   real-time pacing mode before claiming live replay latency; current replay
   is a throughput/algorithm harness. Real capture tests remain necessary.
7. Capture a low-overhead counter-only control for each scenario. Compare it
   with traced runs to quantify observer overhead; stack sampling, allocation
   stacks and GPU traces may perturb deadlines. Never run every instrument
   together for the headline baseline. Short diagnostic traces complement
   long counter-only sessions; do not collect multi-hour heavy traces by default.
8. Export raw counters, summaries and configuration together. Validate recorded
   track durations, known marker offsets and end-of-call tail preservation.
   Keep call audio, transcripts and traces private; only anonymized aggregate
   tables belong in the repository. Traces may contain paths and process data.

## Baseline and benchmark plan

Start on the available M3 Max as a reference, then prioritize a fanless M1/M2
MacBook Air with 8 GB and a 16 GB base-series Mac; add a newer Pro/Max as a
headroom comparison. These are proposed test tiers, not a claim of access or
supported minimum hardware. Record exact machines before comparing results.
Use the current Parakeet, Nemotron and two-pass model configurations; evaluate
alternative compute units only where supported and keep production defaults as
one explicit configuration. Pair one-track and two-track runs to expose sharing.

| Scenario | Duration/repeats | Workload and comparison |
|---|---|---|
| Idle | 10 min ×3 | No call; panel hidden/visible; models unloaded vs retained after stop; compare app closed. |
| Recording only | 15 min ×3 | Two tracks, no ASR; built-in mic/output then USB and Bluetooth routes. Call-only paired control. |
| Live recognition | 15 min ×3 per model | Same Russian/English-term fixture, overlapping speech, pauses, quiet remote speaker; panel hidden/visible and selection/scroll while updates arrive. |
| Explanation during call | 15 min ×3 once wired | Fixed term/prompt, short and long context; issue request at fixed minutes; serial then concurrent ASR/LLM. Include child resources and cancellation. Mark unavailable today. |
| Cold/load | 5 fresh-process and 5 warm trials | Separate fresh model compilation from cache-warm relaunch and first inference. Do not purge shared system caches. Fresh installation test uses isolated model assets. |
| Extended call | 2 h ×3 on minimum/reference tiers | Dense speech/silence mixture; compare first/last 15 min, footprint slope after warm-up, backlog, thermal state, power mode, post-stop release. |
| Recovery | 3 controlled repeats each | Device/rate change, Bluetooth reconnect, call restart and disk contention on test data; record resets, losses and recovery time. |

Use a deterministic two-track fixture with known marker times at start, every
10 minutes and end; include ±overlap, English terms and silence tails. Test
actual call capture in Zoom first, then Meet and Telemost separately. For
interference, alternate call-only and Audelin runs on the same network and
hardware with fixed video settings and remote endpoint. Record app-provided
jitter/loss where available and an external reference for glitches; capture
telemetry alone cannot establish what the other caller heard. Mark unavailable
call diagnostics explicitly. Repeat AC and battery/default low-power settings
on the minimum tier; record ambient conditions and allow comparable thermal
starting states. Controlled thermal tests must not be mixed with cold baselines.

### Proposed initial budgets — not measurements or accepted requirements

| Metric | Starting proposal | Decision after baseline |
|---|---|---|
| Recording correctness | Zero unexplained lost frames, queue overflow and tail loss | Any repeatable failure blocks rollout; deliberate route interruptions reported separately. |
| Partial acoustic→visible | p50 ≤1 s, p95 ≤2 s for two-pass draft | Validate terms/coverage and screen measurement; compare with current replay only as context. |
| Final acoustic→visible | p95 ≤6 s for two-pass | Tune separately for streaming-only; silence tails included. |
| Throughput/backlog | Combined two-track session RTF ≤0.5; no sustained positive queue slope, oldest queued audio ≤1 s in steady state | RTF denominator is session wall audio duration, not sum of both tracks. Gives proposed 2× headroom; report bursts separately. |
| Callback | p99 duration <50% of buffer period; zero misses | Tail/max and Audio System Trace remain necessary; p99 alone cannot prove safety. |
| Drift | Offset change ≤20 ms over 60 min, with constant route offset reported | Requires marker/timestamp validation; not a promise to align human conversation acoustically. |
| UI | p95 selection response ≤100 ms; no app hang ≥250 ms | Measure actual presentation; inspect short hitches on target refresh rate. |
| Long-call memory | ≤10 MiB/h unexplained growth after warm-up; bounded queue memory | Separate expected retained transcript from leaks. Set absolute memory ceiling only after low-RAM tests; report swap/pressure meanwhile. |
| Call interference | No new repeatable audible glitches; call latency p95 increase ≤10 ms in paired controlled test | Network variance may prevent attribution; label inconclusive rather than pass. |
| CPU / energy / disk / load | Establish per-device baseline first | No defensible universal watts, CPU%, file throughput or cold-load ceiling yet. Flag >10% regression against paired baseline for investigation, not automatic rejection when noise overlaps. |

Publish results as: configuration and sample counts; measured p50/p95/max and
coverage; baseline vs candidate deltas; uncertainties; budget status
(pass/fail/unmeasured). Three repeats establish an initial range, not a robust
confidence interval. Expand repeats for noisy results before setting a gate.
A p95 needs enough word/events; five startup trials give a range, not a stable
startup p95. Treat cross-machine results as separate populations.

## Follow-up implementation work

1. Add clock/correlation metadata and bounded per-track counters at capture,
   conversion, queues and writers; export summaries through root decorators.
   Verify missing-frame and overflow accounting with synthetic input, including
   rate changes. Preserve the real-time callback constraints.
2. Extend replay with real-time pacing, raw timestamp export, independent
   fixture alignment, coverage and p50/p95 reporting. Keep throughput mode and
   name both modes explicitly; test percentile, clock and missing-word handling.
3. Instrument shared loading and recognizer stages without changing model
   sharing. Add concurrent-track and cancellation/drain fixture runs.
4. When live UI is composed, add state-to-presentation correlation and scripted
   scroll/selection on a two-hour transcript. Add bb request/child-process
   instrumentation when explanation exists.
5. Run the matrix, store private traces and publish anonymized baselines. Only
   then agree device-specific budgets and lightweight regression gates. No
   app telemetry, benchmark implementation or follow-up issues were created by
   this research task.
