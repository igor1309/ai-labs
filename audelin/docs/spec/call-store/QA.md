---
date: 2026-10-22
model: claude-opus-5-5
description: "Call store — QA"
---

# Call store — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `c3cf11eaa6f7d60a6af2ed3496ff7ee402f245ca` |
| driven by | integration tests of the adapter over temporary folders on this Mac, a small disk image for S-8 |
| where | this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Creating a call

- Drive: create a call titled «Zoom» at 2026-10-21 14:30.
- Expect: a folder «2026.10.21-1430 Zoom» with a `meta.json` holding its id and start.
- Evidence: Missing.

### S-2 Listing calls

- Drive: three fixture call folders; list through the store.
- Expect: three entries whose ids, starts, titles, durations and captured sides equal the fixtures'.
- Evidence: Missing.

### S-3 Unreadable details

- Drive: of three fixture calls, truncate one `meta.json` to half; list through the store.
- Expect: that call comes back unreadable with its folder path; the other two list with their details.
- Evidence: Missing.

### S-4 Renaming keeps the call

- Drive: rename through the store, then with `mv` in the shell.
- Expect: both times the same id is found at the new path.
- Evidence: Missing.

### S-5 Trashing a call

- Drive: trash a call.
- Expect: the folder is in `~/.Trash`; the listing no longer has it.
- Evidence: Missing.

### S-6 Changes from Finder

- Drive: watch; `mv` a call folder.
- Expect: a change event within 2 s naming the call's id.
- Evidence: Missing.

### S-7 Copying a call

- Drive: copy a call with audio to a second folder; flip one byte in the copy before the check in a second run.
- Expect: the clean copy checks whole and the source can be deleted; the flipped copy fails the check and the source stays.
- Evidence: Missing.

### S-8 A failed copy

- Drive: copy a 20 MB call into a 5 MB disk image.
- Expect: a disk-full error; the source is byte-identical; no folder remains in the target.
- Evidence: Missing.

### S-9 A call removed in Finder

- Drive: watch; move a call folder to `~/.Trash` with Finder's scripting.
- Expect: a removal event within 2 s naming the call's id.
- Evidence: Missing.

### S-10 Updated details

- Drive: save a call's duration 1 832 s and microphone not captured; open a new store; list.
- Expect: the call lists with 1 832 s and only the call audio captured.
- Evidence: Missing.

### S-11 The size of the calls

- Drive: three fixture calls of 1, 2 and 3 MB of files; ask for the total.
- Expect: the byte sum of the three folders' files.
- Evidence: Missing.
