# Live tests

Each live test launches a built Audelin executable on a temporary folder of
fixture data, drives it through the accessibility API by element identifier and
checks what it shows and writes. They prove wiring inside the running app that
no component test reaches.

| Script (from `audelin/macos`) | Proves |
|---|---|
| `sh scripts/live-calls-summary.sh` | A call's notes are made, shown and written, and a cancel leaves no notes or job file. |
| `sh scripts/live-calls-merge.sh` | Merging calls in the calls window, end to end (below). |
| `sh scripts/live-browser-names.sh` | A rehearsed call with recorded Telemost extension events names the remote speakers in the panel and the transcript. |

## Running

Run them in a logged-in macOS session, locally or on the self-hosted runner;
hosted CI has no session. `run-driver.sh` compiles the driver into
`~/Library/Application Support/Audelin/AudelinLiveDriver.app`, signs it and opens
it. Grant that app Accessibility and Screen Recording once in System Settings ›
Privacy & Security; the grant holds across rebuilds. A driver that lacks access
says so and fails.

A driver prints `Artifacts: <folder>` under `$TMPDIR`, a `Screenshot:` line per
step, and `PASS:` only when every scenario passed; otherwise `FAIL:` with the
accessibility tree at the failed wait, and a screenshot of the window then. Drivers
wait on accessibility and file notifications, never sleep, and use no screen
coordinates or OCR.

## Calls fixtures

`CallsRehearsal` shows the app's calls window with no audio devices. It takes
`--calls`, `--state` and `--trash` folders, so a run never touches the user's
calls, preferences or Trash; notes are made by a fake service that writes
`state/control/started-N` and answers once the driver writes `finish-N`.
`--seed merge` writes calls through the app's own track and transcript writers
before launch: A at 10:00 and B at 10:06, one call cut off, each with two remote
speakers and notes; C, whose transcript failed (a track, no transcript); and D,
with a transcript and no notes. `--seed interrupted-merge` writes the same calls as
a crash leaves a merge of A and B: B inside the merge's prepared folder.

## Merging calls

`live-calls-merge.sh` starts every scenario from a fresh seeded folder:

1. Merge with one call marked is disabled, and its accessibility value says why.
   B and C merged are refused because C has no transcript: the window says so and
   every call stays.
2. A and B merge into one call at A's start, its length the span to B's end. Its
   transcript holds A, a gap row, then B, with each part's remote speakers labelled
   apart. The parts' folders are kept whole inside it and nothing goes to the
   Trash. Its notes are made from the joined transcript.
3. A and D, with calls between them, warn first; going back keeps the marks, and
   merging anyway merges.
4. With the calls folder read-only the merge fails, says why, and the calls stay.
5. While D's notes are being made, choosing to merge says Audelin is busy and
   merge mode does not open; once the notes are done it opens.
6. An interrupted merge is put back whole on launch: B returns to the list and the
   prepared folder is gone.

The run removes the seeded folders and keeps the screenshots and the merged
transcript.
