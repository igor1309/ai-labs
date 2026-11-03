# AudelinRehearsal

A long synthetic call through the app's own composition, to profile. It
is a development tool and is not shipped.

It is a thin main over `Composer`: the same `compose` the app runs, the
same floating panel window and panel view, the real disk in a temporary
folder. Only the boundary pieces are synthetic (`SessionRehearsal`):

- A scripted call app, Zoom as Core Audio would show it, opens its
  microphone. Call detection sees it and, with automatic recording on, the
  Recording machine starts the recording into a `… Zoom` call folder.
- Generated audio on both sides; recognisers that speak in sentences.
  Both tracks are recorded, Live text runs and the transcript is written.
- At the end the call app closes its microphone. Detection ends the call
  after its 30-second grace, in wall-clock time, and the Recording machine
  stops the recording.

So it needs no models, devices or permissions, and it runs faster than
real time.

Status: a diagnostic tool. It drives the real session and panel, so a
profile of it shows where the app's own CPU goes and which functions grow
with the call. It cannot answer every question:

- How far the recognisers trail is backlog in the pipeline the fakes
  feed, not how fast speech is recognised. Real recognition speed needs
  real recordings through the real models at 1×.
- Above 1×, every update arrives that many times as often. Hangs and lag
  in such a run show where the app saturates, not what a real call does.
- Footprint, sampled every second, shows how memory moves in one run. It
  does not tell retained transcript from a leak, and peaks from different
  runs or code are not comparable.

## Run

From `audelin/macos`:

    swift run --package-path App -c release AudelinRehearsal --minutes 180 --speed 10

| Option | Default | Meaning |
|---|---|---|
| `--minutes` | 180 | the call's length in audio minutes |
| `--speed` | 10 | audio seconds fed each wall-clock second |
| `--monologue-every` | none | every this many seconds my side talks without a pause |
| `--monologue-length` | 120 | how long each monologue lasts, in seconds |
| `--keep` | off | keep the recorded call folder instead of deleting it |
| `--report FILE` | none | append the progress lines to FILE too |
| `--recordings-dir DIR` | none | record into DIR, which the caller cleans |
| `--speech FILE` | none | feed FILE, looped, on both sides to real Parakeet v3 instead of the fakes |

It prints when the call is detected and when it ends, a line every 10 audio minutes, with how far the slower
recogniser trails what was fed and the footprint, and a last line with
the words each side said and the peak footprint. The last line's time is
the feeding time, without the 30-second wait for the call to end. A 3-hour call writes
about 1 GB of audio per track to a temporary folder, deleted at the end
unless `--keep` is given.

## Baseline over real Parakeet

With `--speech FILE` the two sides play the same speech file, looped, at
the file's own rate, and each side is heard by its own real Parakeet v3
recogniser; the call lasts the file's length unless `--minutes` says. It
needs Parakeet's models on disk. Besides the usual lines it reports the
model load, then every audio minute how far the newest word and the final
text trail what was fed, and at the end the time to the first text in the
panel, the time from the recording's end to its final transcript, process
CPU, and each track's length and the transcript's words per speaker.

    scripts/baseline-rehearsal.sh [--runs 3] [--minutes 5]

synthesises [the fixture](../../../../docs/research/baseline/fixture.txt)
with `say`, builds a release and runs it once after the build and then
`--runs` times warm, at 1×, keeping each run's report and transcript and
the machine, macOS and commit in `profiles/baseline-<date>/`. Results are
in [the baseline](../../../../docs/research/baseline/README.md).

## Profile

    scripts/profile-rehearsal.sh capture --capture-after 120 --capture-for 30 --minutes 20 --speed 1

Capture builds a release and records CPU, hangs and signposts only for the
30-second wall-clock window after 120 seconds, keeping the trace, readable
`summary.txt` and full-precision `summary.json`.

    scripts/profile-rehearsal.sh endurance --minutes 180 --speed 1

Endurance runs without Instruments and writes only `rehearsal.log`, the app's
own report. Both modes need a logged-in GUI session for the panel.

`--out DIR` picks a fresh folder instead of `profiles/<date>/`. Capture requires
a positive integer `--capture-for` in seconds; `--capture-after` defaults to zero.
The rehearsal continues to its own end after capture. Raw XML is removed on
success and failure. The script owns the rehearsal, offset timer and recorder
as separate process groups, so cancellation interrupts the wait and stops and
reaps the children. It checks the rehearsal is still alive after the offset
before attaching Instruments. An early exit makes the capture fail.

Both modes record into an invocation-owned temporary directory, passed with
`--recordings-dir`. The script removes it after reaping the rehearsal, including
on cancellation and failure; `--keep` preserves it. The report gives its path.

The summary labels the main thread's share of sampled CPU and lists complete
`PanelUpdate`, `TranscriptWrite` and `Hearing` intervals: count, total and longest.
PanelUpdate measures mapping a reading state and delivering it to the panel,
not SwiftUI's render; the sampled frames show the render's cost.
Compare summaries from matching workloads, builds, machines and instrumentation:

    python3 -I scripts/summarize-trace.py --compare OLD/summary.json NEW/summary.json

The comparison shows growth in frame self and inclusive time, main-thread share,
hangs and intervals. Older summaries must be regenerated with this format.

## Not covered

- Real recognisers, except with `--speech`; audio devices, Core Audio
  process notifications, permissions, call-audio access and the menu bar.
- More than one call app, apps coming and going, or a call that resumes
  within the grace period: the scripted app joins once and leaves once.
- Transcript entries whose id returns, which only a real recogniser's
  revisions produce.
