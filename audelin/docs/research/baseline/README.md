# Recording and live transcription baseline (LAB-667)

What the tests already show about recording and live text, what a person
checks on real devices, and how fast live text is through the app's own
composition with the real model. Observed values are a baseline to compare
against, not targets.

Result kinds below: **automated** (a test in the suite), **measured** (the
baseline command, run here), **manual** (a person on real devices),
**untested**.

## What the suite covers

| Requirement | Kind | Evidence |
|---|---|---|
| Real call audio, through the app's composition, Core Audio capture and real Parakeet, reaches `transcript.md` | automated, local only (needs devices, skipped on hosted CI) | `RealRecordingTranscriptTests.spokenCallAudioReachesTheTranscript` |
| Fixture speech through the composition and real Parakeet: both tracks whole, transcript has both speakers | measured | the baseline below: track lengths against audio fed, words per speaker |
| Stopping flushes the final text and closes both files | automated | `SessionTranscriptTests`, `SessionTextShutdownTests`, `CallSideFinalEntriesTests`; crash cases in `SessionCrashTests` |
| Microphone access denied: recording refused, not started | automated | `RecordingTests` (`conditionChanged(.microphoneAccess, available: false)`), `RecordingConditionsTests.startupAsksForTheMicrophoneOnceThenReadsTheAnswer` |
| A capture failing to start is a failure, not a recording | automated | `SessionEffectHandlerTests.startMicrophoneCaptureDeliversItsFailure`, `startCallCaptureDeliversItsFailure`, `SessionReducerFailureTests` |
| A capture failing mid-call shows in the panel; both failing ends the recording as "no track can record" | automated | `PanelProblemTests.aLostCaptureReachesThePanelOnItsRecordingClock`, `SessionRecordingTests.recordingWiringForwardsLaterFailureAndEndsTheSession` |
| The call side delivering only silence warns after 300 s while the microphone is active | automated | `SessionAudioWarningTests.captureStatisticsWarnAndNonzeroCallAudioClearsTheSessionWarning` |
| The call capture delivering **no pieces at all** | untested: no product decision | The session spec starts call silence at the first call piece, so a capture that never delivers never warns |
| The microphone delivering nothing, or only silence | untested: no product decision | No warning exists for the microphone side (the case LAB-638 met) |
| Call detection starts and ends the recording | automated, and in every rehearsal run | `CoreAudioProcessesTests`, `CallRecordingSubscriptionTests`; the rehearsal's scripted call app |

The two cases without a decision are filed as LAB-936 rather than given an
invented deadline.

## Smoke procedure on real devices (manual)

Opt-in and about five minutes; not part of CI. Needs the built app, Zoom (or
a browser call), microphone and call-audio access granted, and Parakeet's
models on disk.

1. Start Audelin with automatic recording on. Open a Zoom meeting alone.
2. Within a few seconds the menu bar icon turns red and the panel shows.
   If not, the call was not detected: note it and stop.
3. Say a sentence into the microphone. Play the other side through the
   speakers: `say -v Samantha "The meeting starts at noon. Please send the report by Friday."`
4. The panel shows the sentence as **Me** and the played one as **Them**
   within about 6 s each.
5. Leave the meeting. About 30 s later the recording stops.
6. In the calls folder, the call's folder has `microphone.caf` and
   `call.caf` of the call's length, each with its own side's speech when
   played, and `transcript.md` with both sentences under their speakers.
7. Start a second meeting and repeat steps 2–6 briefly: a second folder
   records whole.

Record the date, Mac, macOS, commit and each step's outcome. No run is
recorded here yet: **manual, untested**.

## Baseline command

From `audelin/macos/Benchmarks`:

    ./baseline.sh --runs 3 --minutes 5

It synthesises [`fixture.txt`](fixture.txt), an invented community-garden
planning call (no private content), with `say -v Samantha -r 170`, and runs
`AudelinBaseline` (`macos/Benchmarks/Baseline`): the rehearsal's run
([README](../../../macos/App/Sources/AudelinRehearsal/README.md)) with
`--speech`, in its own package so the app and the rehearsal never link the
model. The same speech plays on both sides, looped to 5 minutes,
at 1×, through the app's composition: call detection, the Recording
machine, both tracks recorded to disk, Live text, the transcript and the
panel. Each side has its own Parakeet v3 recogniser; both share one model
load. Recognition reads 4 s chunks with 2 s of context on each side, at
16 kHz mono after conversion.

Measures, from each run's report:

- **Model load**: `ParakeetRecognizer()` for both sides, before the call.
  Every run is a new process, so each loads the model from disk; the first
  run follows the build. A load after a reboot or a first download is not
  measured.
- **First text**: from the first audio fed to the first entry in the panel.
- **Newest word trails**: at each recogniser report, audio fed minus the
  newest word's end. It includes any pause after that word, so it is an
  upper bound.
- **Final text trails**: at each report, audio fed minus where the
  recogniser says words are final. Text has a distinct final state: words
  before `finalThrough` never change.
- **Backlog**: audio fed minus audio the slower recogniser has been given.
- **Stop to final transcript**: from the recording's end to its stop, with
  the transcript final. The call ends 30 s after the call app leaves, when
  detection's grace runs out; that wait is not counted.
- **CPU**: process user and system time over the 5 minutes fed.
- **Footprint**: physical footprint, sampled every second.
- **Lost audio**: each track's length against the audio fed.

## Results, 2026-11-03

Measured. Apple M3 Max (Mac15,10), 36 GB, macOS 26.6.2 (25G83), release
build of the baseline-mode commit before its rebase onto trunk
(`f4844d2c`, now `91a2fbdf`; the uncommitted changes were documentation only),
when the run was still inside `AudelinRehearsal`; the code it ran moved to
`Benchmarks/Baseline` unchanged in behaviour. Parakeet v3 (`parakeet-tdt-0.6b-v3`, FluidAudio's Core ML models,
its default compute units). Fixture: 135.4 s, mono 22,050 Hz 16-bit,
looped to 300 s, converted to 16 kHz for recognition. Each run's report is
in [2026-11-03/](2026-11-03/).

| Run | Model load | First text | Newest word trails, mean (range) | Final text trails, mean (range) | Backlog, most | Stop to final | CPU over 300 s | Peak footprint | Tracks of 300 s fed | Transcript words, Me / Them |
|---|---|---|---|---|---|---|---|---|---|---|
| first after build | 15.9 s | 6.1 s | 0.2–0.3 s (0.1–0.6) | 2.2–2.3 s (2.0–2.9) | 0.2 s | 0.1 s | 34.6 s, 12% | 296 MiB | 300.0 / 300.0 s | 1040 / 1039 |
| warm 1 | 0.1 s | 6.2 s | 0.2–0.3 s (0.1–0.7) | 2.2–2.3 s (2.0–2.9) | 0.1 s | 0.1 s | 43.9 s, 15% | 302 MiB | 300.0 / 300.0 s | 1040 / 1039 |
| warm 2 | 0.1 s | 6.2 s | 0.2–0.3 s (0.1–0.6) | 2.2–2.3 s (2.0–2.8) | 0.1 s | 0.1 s | 37.2 s, 12% | 313 MiB | 300.0 / 300.0 s | 1040 / 1039 |
| warm 3 | 0.1 s | 6.1 s | 0.2–0.3 s (0.1–0.7) | 2.2–2.3 s (2.0–2.9) | 0.2 s | 0.2 s | 33.5 s, 11% | 298 MiB | 300.0 / 300.0 s | 1040 / 1039 |

The lag columns give the range of the five per-minute means, then the
lowest and highest single report. CPU is a share of one core.

What the runs show:

- **The slowest stage is the recogniser's window, not compute.** First
  text takes about 6 s because Parakeet reads a 4 s chunk only once 2 s of
  audio after it has arrived; final text trails by about 2.2 s for the same
  reason. The recognisers stay within 0.2 s of the audio fed and use about
  12% of one core for two sides.
- **No growing backlog.** The per-minute backlog stayed at 0.0–0.1 s from
  the first minute to the fifth in every run.
- **No lost audio and no missing final text.** Both tracks hold all 300 s
  fed; the transcript has both speakers. The fixture loops to about 1,048
  words; Me and Them each have 1,039–1,040, and the two sides, fed the same
  audio, differ by one word.
- **Model load:** 15.9 s in the first process after the build, 0.1 s in
  each later one: the system keeps the compiled models between processes.
  A load after a reboot or a first download was not measured.
- **Stopping** took 0.1–0.2 s from the recording's end to its final
  transcript. The call itself ends 30 s after the app leaves, by detection's
  grace.
- The footprint dropped to 72–89 MiB around the fourth minute in every run
  and came back by the fifth; not investigated, and no leak shows in 5
  minutes.

Not measured: real devices and real call audio (the smoke procedure),
Russian speech, overlapping speakers, calls longer than 5 minutes at 1×.
Three warm runs on one Mac support no percentile claims. The machine's
load during these runs was not recorded.

## Other load moves the result

The command now writes `load before the run:` (`sysctl vm.loadavg`) at the
top of each run's log. Five 1-minute runs on the same Mac after the move to
`Benchmarks/Baseline`, while other work ran (an iOS simulator, builds,
other agents), on 2026-11-03:

| 1-minute load average before the run | Recognisers at most behind | Final text trails, mean | Stop to final |
|---|---|---|---|
| not recorded | 0.1 s | not reported | 0.2 s |
| not recorded | 11.9 s | not reported | 0.1 s |
| not recorded | 21.9 s | not reported | 0.4 s |
| 6.8 | 0.4 s | 2.3 s | 26.2 s |
| 33.2 | 17.7 s | 5.8 s | 0.4 s |

No audio was lost in any of them: both tracks held all 60 s and each side's
transcript had 208 words. The backlog cleared by each run's end. A busy
machine delays live text by up to about 20 s; it does not drop it. One stop
took 26.2 s against 0.1–0.4 s in every other run, in the run just before the
load average reached 33; that it was the same load is likely, not shown.
Compare runs only when the load before them is similar and low.
