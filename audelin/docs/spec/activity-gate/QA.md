---
date: 2026-10-22
model: claude-opus-5-5
description: "Activity gate — QA"
---

# Activity gate — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `4e736f6137170635bd705a40e0525830e31403b6` |
| driven by | unit tests of the gate with stub holders |
| where | `swift test` on this Mac, the race case run 10 000 times |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 A free gate

- Drive: request as a recording.
- Expect: granted.
- Evidence: Missing.

### S-2 A recording refuses a move

- Drive: hold as a recording; request as a move.
- Expect: refused, reason recording.
- Evidence: Missing.

### S-3 A move refuses a recording

- Drive: hold as a move; request as a recording.
- Expect: refused, reason moving.
- Evidence: Missing.

### S-4 Catch-up yields

- Drive: three runs, each with a fresh gate held by catch-up: request as a recording, as a move, as a delete.
- Expect: in each run catch-up gets a yield; the request is not granted before catch-up releases and is granted right after.
- Evidence: Missing.

### S-5 Release

- Drive: hold as a recording with catch-up waiting; release.
- Expect: catch-up is granted.
- Evidence: Missing.

### S-6 Two requests at once

- Drive: from two threads, request as a recording and as a move behind a shared barrier, 10 000 times.
- Expect: every run grants exactly one; the other is refused naming the holder; the granted one is the one whose request was recorded first.
- Evidence: Missing.

### S-7 A delete during a recording

- Drive: hold as a recording; request a delete of another call.
- Expect: granted; the recording still holds.
- Evidence: Missing.

### S-8 A move refuses a delete

- Drive: hold as a move; request a delete.
- Expect: refused, reason moving.
- Evidence: Missing.

### S-9 A delete releases during a recording

- Drive: hold as a recording and as a delete of another call; catch-up waits; release the delete, then the recording.
- Expect: catch-up is not granted after the delete's release; it is granted right after the recording's.
- Evidence: Missing.

### S-10 Catch-up waits out a move

- Drive: hold as a move; request as catch-up; release the move.
- Expect: catch-up is not granted while the move holds; it is granted right after the release.
- Evidence: Missing.
