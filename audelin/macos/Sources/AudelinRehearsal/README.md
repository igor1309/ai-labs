# AudelinRehearsal

A long synthetic call through the real Audelin session and panel, to
profile. It is a development tool and is not shipped.

It records both tracks, runs Live text, writes the transcript and shows
the panel in a window, as a call does. The audio is generated and the two
recognisers are fakes that speak in sentences, so it needs no models,
devices or permissions, and it runs faster than real time.

Status: used for the first 3-hour profile (LAB-772). Main-thread hangs and
how far the recognisers trail are its main signals; memory is its own
footprint, sampled every second.

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

builds a release, records the rehearsal under Time Profiler, and writes
`summary.txt` with the heaviest frames, the app's heaviest functions and
the main-thread hangs into `profiles/<date>/`, next to the trace.
`--out DIR` picks the folder. It needs a logged-in GUI session, as the
panel is on screen. The Allocations template does not start the app, so
memory comes from the rehearsal's own footprint.

## Not covered

- Real recognisers, audio devices and the menu bar app.
- Transcript entries whose id returns, which only a real recogniser's
  revisions produce.
