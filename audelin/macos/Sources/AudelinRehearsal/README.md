# AudelinRehearsal

A long synthetic call through the real Audelin session and panel, to
profile. It is a development tool and is not shipped.

It records both tracks, runs Live text, writes the transcript and shows
the panel in a window, as a call does. The audio is generated and the two
recognisers are fakes that speak in sentences, so it needs no models,
devices or permissions, and it runs faster than real time.

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

    swift run -c release AudelinRehearsal --minutes 180 --speed 10

| Option | Default | Meaning |
|---|---|---|
| `--minutes` | 180 | the call's length in audio minutes |
| `--speed` | 10 | audio seconds fed each wall-clock second |
| `--monologue-every` | none | every this many seconds my side talks without a pause |
| `--monologue-length` | 120 | how long each monologue lasts, in seconds |
| `--keep` | off | keep the recorded call folder instead of deleting it |
| `--report FILE` | none | append the progress lines to FILE too |

It prints a line every 10 audio minutes, with how far the slower
recogniser trails what was fed and the footprint, and a last line with
the words each side said and the peak footprint. A 3-hour call writes
about 1 GB of audio per track to a temporary folder, deleted at the end
unless `--keep` is given.

## Profile

    scripts/profile-rehearsal.sh --minutes 180 --speed 10

builds a release, records the whole rehearsal under Time Profiler, and writes
`summary.txt` with the heaviest frames, the app's heaviest functions and
the main-thread hangs into `profiles/<date>/`, next to the trace.
`--out DIR` picks the folder. It needs a logged-in GUI session, as the
panel is on screen. The Allocations template does not start the app, so
memory comes from the rehearsal's own footprint. A whole 3-hour run at
10× records 18 minutes: a trace of about 300 MB, whose export takes tens
of minutes. Profile short windows instead.

## Not covered

- Real recognisers, audio devices and the menu bar app.
- Transcript entries whose id returns, which only a real recogniser's
  revisions produce.
