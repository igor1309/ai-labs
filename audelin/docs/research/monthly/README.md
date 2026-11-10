# Monthly check of new calls

`check.py` runs the owner's newest calls through the label-free parts of the
enhancement and diarization measurements. It flags what those reports did
not expect, so a full rerun or hand labelling is done when the calls call
for it, not on a calendar.

What it flags, for each call:

| Flag | When | What it means |
|---|---|---|
| `bleed` | 3 or more far-side words a minute leak into the microphone transcript | another call to test echo removal on; the first 18 calls had one |
| `one-vs-many` | VBx and Nemotron disagree on whether there is more than one remote speaker | a call worth hand-labelling; they agreed on all of the first 16 |
| `slots` | Nemotron fills all eight speaker slots with speakers of 5 % or more, or VBx finds more than eight | more remote speakers than Nemotron can label |

Recordings under a minute or with fewer than 20 words on the call track
(test clips, silent or muted far sides) get no flag.

## Running it

From `audelin/docs/research`, with the sandbox off (it fetches models on
first use and writes FluidAudio's caches):

    uv run --project diarization python monthly/check.py [--days 31] [--recordings DIR]

It builds `spike/` if needed, reads `~/Recordings/Audelin` without changing
it, and writes 16 kHz copies, transcripts and speaker segments under
`monthly/work/` (ignored), and the summary to `monthly/work/check.json`. An
hour of calls takes about two minutes.

A bb automation in the ai-labs project, "Audelin monthly call check", runs
it on the 1st of each month at 22:00 UTC in a fresh worktree from trunk. It
sends one ntfy push when a call is flagged and none otherwise.
