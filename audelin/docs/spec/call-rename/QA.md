---
date: 2026-10-22
model: claude-opus-5-5
description: "Call rename — QA"
---

# Call rename — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `dff6ca24486e6306b18048212401a0cf37798f41` |
| driven by | the user, through the calls list, the call screen and Finder |
| where | the release build on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Renaming in the calls list

- Drive: click a call's title, type «Planning», press Enter.
- Expect: the list reads «Planning» with the same time; Finder shows «<same timestamp> Planning».
- Evidence: Missing.

### S-2 Cancelling a rename

- Drive: start editing a title, type, press Esc.
- Expect: the old title; the folder unchanged.
- Evidence: Missing.

### S-3 Renaming on the call screen

- Drive: open a call; edit its title to «Retro»; press Enter.
- Expect: the screen and the calls list read «Retro»; Finder shows «<same timestamp> Retro».
- Evidence: Missing.

### S-4 Renaming a call while it records

- Drive: rename the recording call to «Live» in the calls list.
- Expect: the list reads «Live»; the recording's time keeps advancing and its audio has no gap.
- Evidence: Missing.

### S-5 Renaming to a title taken in the same minute

- Drive: two hand-started calls in one minute; rename the second to the first's title.
- Expect: the second reads «<title> 2».
- Evidence: Missing.

### S-6 An empty title

- Drive: clear a call's title; press Enter.
- Expect: the old title; the folder unchanged.
- Evidence: Missing.

### S-7 Renamed in Finder

- Drive: rename a call folder's title in Finder; reopen the calls list.
- Expect: the same call, playable and readable, under the new title.
- Evidence: Missing.

### S-8 Renamed in Finder without the start time

- Drive: rename a call folder to «Demo» alone in Finder.
- Expect: the list shows «Demo» under its recording date and time.
- Evidence: Missing.
