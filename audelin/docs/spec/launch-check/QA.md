---
date: 2026-10-22
model: claude-opus-5-5
description: "Launch check — QA"
---

# Launch check — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `7ebbf747773bad42d2b964c01c5d0b4b52449a21` |
| driven by | the user, opening Audelin after setup |
| where | the release build on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Everything in place

- Drive: after setup, quit and open Audelin; start a recording from the menu.
- Expect: no window opens at launch; the recording runs.
- Evidence: Missing.

### S-2 The live model is gone

- Drive: delete the live model's folder; open Audelin.
- Expect: a window says the live model is missing, before any call.
- Evidence: Missing.

### S-3 A reused model is gone

- Drive: set up reusing FluidAudio's cache; delete that cache; open Audelin.
- Expect: the window says the live model is missing.
- Evidence: Missing.

### S-4 Downloading from the launch check

- Drive: from S-2, start the offered download; start a recording.
- Expect: the progress advances; the recording runs while it does.
- Evidence: Missing.

### S-5 The calls folder is gone

- Drive: rename the calls folder in Finder to elsewhere; open Audelin; recreate it. Then remove it again, open Audelin, and choose another folder.
- Expect: the window says the calls folder is missing; recreating makes an empty folder at the old path; choosing another sets it in Settings.
- Evidence: Missing.

### S-6 The calls folder cannot be written

- Drive: `chmod a-w` the calls folder; open Audelin.
- Expect: the window says calls cannot be saved there because it is read-only.
- Evidence: Missing.

### S-7 A failed download from the launch check

- Drive: from S-4, cut the network mid-download; start a recording; restore the network; press Retry.
- Expect: the window says the download failed and why; the recording runs; Retry resumes the download to done.
- Evidence: Missing.
