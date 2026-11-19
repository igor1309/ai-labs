# Live tests

Each live test launches a built Audelin executable on a temporary folder of
fixture data, drives it through the accessibility API by element identifier and
checks what it shows and writes. They prove wiring inside the running app that
no component test reaches.

| Script (from `audelin/macos`) | Proves |
|---|---|
| `sh scripts/live-calls-summary.sh` | A call's template menu refreshes and makes notes; regeneration rotates or replaces versions; switching, keeping, edited templates, failure reasons and cancellation preserve the shown pair; a call whose transcript tells no origin reads with its notes; notes are made from the said words without the origin. |
| `sh scripts/live-calls-transcript-again.sh` | Transcript menu offers and disabled reasons for missing tracks and busy Audelin; a fixture run publishes both newly heard sides, keeps the old bytes as previous and restores them without changing notes. |
| `sh scripts/live-calls-merge.sh` | Merging calls in the calls window, end to end (below). |
| `sh scripts/live-calls-tags.sh` | Tags typed in the detail are written to the call's folder and shown in its row and the strip; a chip filters the list; merged calls keep both parts' tags. |
| `sh scripts/live-calls-rename.sh` | Renaming a call in the list: Return saves without opening the folder; clicking, right-clicking or arrowing to another row saves; Escape cancels (below). |
| `sh scripts/live-browser-names.sh` | A rehearsed call with recorded Telemost extension events names the remote speakers in the panel and the transcript. |
| `sh scripts/live-settings.sh` | The settings window stays 508 pt wide on every tab; pressing a switch turns it on and saves the preference. |

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

## Drivers on real calls

`real-daily-remake.swift` drives the installed Audelin on the user's own calls
(`sh macos/scripts/live/run-driver.sh macos/scripts/live/real-daily-remake.swift <call id>...`
from `audelin`). Any driver that can change real data follows these rules:

1. Before it acts on a call, it copies that call's notes files (`summary*.md`,
   `.summary-job.json`) to `~/.audelin/live-backups/<run>/<call folder>/`, outside
   the calls folder, with the calls folder's path in `<run>/calls-folder`. Audio and
   transcripts are left out because drivers never write them.
2. It checks every copy byte for byte, and stops with an error before acting if the
   backup failed or missed a file.
3. It prints `Backup: <run>` and a `Restore:` line;
   `sh macos/scripts/live/restore-live-backup.sh <run>` puts the run's files back
   exactly, removing notes files the run added, and compares each with its backup.
4. After the run it prints `PRESERVED:` or `LOST:` per call, comparing what the
   app kept (for notes, the receipt's Previous) with the backup, and fails on a loss.
5. It knows the app finished from the call's files: a new job/input receipt in the
   notes with no unfinished record proves success; failed or interrupted attempts
   retain their record. Notes already made with the same template look the same
   in the window before and after.

## Calls fixtures

`CallsRehearsal` shows the app's calls window with no audio devices. It takes
`--calls`, `--state` and `--trash` folders, so a run never touches the user's
calls, preferences or Trash; notes are made by a fake service that writes
`state/control/started-N` and answers once the driver writes `finish-N`.
An empty completion file returns the fixed notes; a nonempty one supplies the
notes for that request. `fail-N` produces a quota failure. `request-N.json`
records the fake service request, so edited template instructions can be checked.
The rehearsal never opens Finder. The templates action writes
`state/control/opened-templates` with its path; `fail-open-templates` makes
that binding fail. Opening a call's folder writes `state/control/opened-<uuid>`
holding the folder's path, so a driver can check that nothing was opened.
`--seed merge` writes calls through the app's own track and transcript writers
before launch: A at 10:00 and B at 10:06, one call cut off, each with two remote
speakers and notes, and each transcript's origin naming its own version; C, whose
transcript failed (a track, no transcript); and D, with a transcript that tells no
origin and no notes. `--seed interrupted-merge` writes the same calls as a crash
leaves a merge of A and B: B inside the merge's prepared folder. `--seed legacy-merge`
writes them as a merge of A and B made before transcripts told their origin.

## Merging calls

`live-calls-merge.sh` starts every scenario from a fresh seeded folder:

1. Merge with one call marked is disabled, and its accessibility value says why.
   B and C merged are refused because C has no transcript: the window says so and
   every call stays.
2. A and B merge into one call at A's start, its length the span to B's end. Its
   transcript holds A, a gap row, then B, with each part's remote speakers labelled
   apart. The parts' folders are kept whole inside it and nothing goes to the
   Trash. Its notes are made from the joined transcript. Its transcript tells A's
   and B's origins by their starts, in order, and the rehearsal's release as the
   merger. Merging it with D then lists A, B and D once each, D as unknown.
3. A and D, with calls between them, warn first; going back keeps the marks, and
   merging anyway merges.
4. With the calls folder read-only the merge fails, says why, and the calls stay.
5. While D's notes are being made, choosing to merge says Audelin is busy and
   merge mode does not open; once the notes are done it opens.
6. An interrupted merge is put back whole on launch: B returns to the list and the
   prepared folder is gone.
7. A merge made before origins, merged with D, lists A, B and D by their starts,
   each as unknown.

The run removes the seeded folders and keeps the screenshots and the merged
transcript.

## Renaming calls

`live-calls-rename.sh` starts each scenario from a fresh `--seed merge` folder and
renames A from its row's Return. The rename field is `calls.rename`; while it is open
its row (`calls.select.<id>`) is not a button, so the field is reachable through
accessibility.

1. Return saves: the folder becomes `<id> <title>`, A stays selected and no folder
   is opened.
2. Clicking B saves A's title and selects B.
3. Right-clicking B saves A's title and selects B. The right-click goes to the
   middle of B's accessibility frame, since the row's menu is AppKit's.
4. Up saves A's title and selects B, the row above it.
5. Escape closes the field and leaves the folder and nothing opened.

The scenarios fail if the list's key handler takes Return while a rename is open.
The run keeps screenshots of the editing, saved and cancelled states.
