---
date: 2026-10-22
model: claude-opus-5-5
description: "Call store — QA"
---

# Call store — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `8e03f22dd84506844516ddf4f7ddf18c169cd20b` |
| driven by | integration tests of the adapter over temporary folders on this Mac, small disk images for S-5, S-8 and S-9, so nothing touches the user's Trash |
| where | `swift test` in `audelin/macos` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Creating a call

- Drive: create a call titled «Zoom» at 2026-10-21 14:30 local time.
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

- Drive: rename one call through the store and another with `mv` in the shell.
- Expect: each id is found at its new path.
- Evidence: Missing.

### S-5 Trashing a call

- Drive: trash a call whose calls folder is on a disk image.
- Expect: the folder is in that volume's Trash; the listing no longer has it.
- Evidence: Missing.

### S-6 Changes from Finder

- Drive: watch; `mv` a call folder.
- Expect: a change event within 2 s naming the call's id.
- Evidence: Missing.

### S-7 Copying a call

- Drive: copy a call with audio to a second folder; flip one byte in the copy before the check in a second run; rename the source between the check and the delete in a third.
- Expect: the clean copy checks whole and the source can be deleted; the flipped copy fails the check and the source stays; the renamed source is found by its id and deleted.
- Evidence: Missing.

### S-8 A failed copy

- Drive: copy a 20 MB call into a 5 MB disk image. Second run: copy into a folder that already holds that call's folder.
- Expect: a disk-full error; the source is byte-identical; no folder remains in the target. In the second run the copy is refused and the folder already there is unchanged.
- Evidence: Missing.

### S-9 A call removed in Finder

- Drive: watch; move a call folder on a disk image into that volume's Trash, as Finder's Move to Trash does.
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
