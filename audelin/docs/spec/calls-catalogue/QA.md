---
date: 2026-10-22
model: claude-opus-5-5
description: "Calls catalogue — QA"
---

# Calls catalogue — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `f8ef8864b09b8401b8329391efb204961114ef4f` |
| driven by | tests of the catalogue through a fake call store holding call folders, and a fake folder watcher |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Calls newest first

- Drive: the fake store holds calls started 12, 17, 20 and 21 October with durations.
- Expect: the list is 21, 20, 17, 12 October, each with its date, title and duration.
- Evidence: Missing.

### S-2 A recording call

- Drive: a fake session reports a recording into one of the folders.
- Expect: that call is listed as recording.
- Evidence: Missing.

### S-3 A stopped call is listed at once

- Drive: the fake session stops a recording whose catch-up is still pending.
- Expect: the call is in the list on the stop event, before catch-up ends.
- Evidence: Missing.

### S-4 A call folder that cannot be read

- Drive: one folder's `meta.json` is corrupt JSON.
- Expect: the call is listed as unreadable with its folder path; the rest list normally.
- Evidence: Missing.

### S-5 A call without call audio

- Drive: `meta.json` audio status says the call audio was not captured.
- Expect: the call lists as only «я».
- Evidence: Missing.

### S-6 A call folder removed in Finder

- Drive: the fake watcher reports a folder gone.
- Expect: the call leaves the list without a relaunch.
- Evidence: Missing.

### S-7 A call renamed in Finder

- Drive: rename a folder in the fake store, keeping its timestamp and id; the watcher reports it.
- Expect: the same call id lists under the new title.
- Evidence: Missing.

### S-8 Renamed in Finder without the start time

- Drive: rename a folder to «Планёрка» alone.
- Expect: the call lists as «Планёрка» under the start date in `meta.json`.
- Evidence: Missing.

### S-9 A call cut short by a crash

- Drive: a folder whose `meta.json` has no duration and whose audio files end early.
- Expect: the call lists, its duration taken from the audio written.
- Evidence: Missing.

### S-10 A call's text

- Drive: a folder with a segment log holding both sides, a gap, minutes added later, «я» marked incomplete from 200 s and live text off from 300 s.
- Expect: the first call's text comes in time order with the gap, the added-later and incomplete marks, and 300 s on marked only recorded.
- Evidence: Missing.

### S-11 A call without the microphone

- Drive: `meta.json` audio status says the microphone was not captured.
- Expect: the call lists as only «они».
- Evidence: Missing.

### S-12 A call's folder

- Drive: ask for a listed call's folder; rename it in the fake store and ask again.
- Expect: the folder's current path both times.
- Evidence: Missing.

### S-13 A call without live text

- Drive: a folder with audio and `meta.json` saying live text was off throughout, and no segment log.
- Expect: the call opens as having no live text, its minutes only recorded.
- Evidence: Missing.
