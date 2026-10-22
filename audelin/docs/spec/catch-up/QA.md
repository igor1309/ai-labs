---
date: 2026-10-22
model: claude-opus-5-5
description: "Catch-up — QA"
---

# Catch-up — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `11a2434460424d08d868e0833e6d8f02374af264` |
| driven by | tests of catch-up through a fake recogniser replaying Parakeet v3 output recorded once, a fake recorded-audio reader, segment log, activity gate and clock |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Catch-up after the call

- Drive: a stopped call with 300 s unrecognised, then 100 s recorded with live text off; the gate is free.
- Expect: catch-up takes the gate, commits all 300 s and marks the call complete; the 100 s stay only recorded and are never sent to the recogniser.
- Evidence: Missing.

### S-2 Oldest audio first

- Drive: a stopped call with unrecognised ranges at 0–60 s and 200–260 s.
- Expect: every segment of 0–60 s is committed before any of 200–260 s.
- Evidence: Missing.

### S-3 A recording interrupts catch-up

- Drive: from S-1 mid-way, a recording takes the gate.
- Expect: catch-up releases the gate; the rest stays marked unrecognised; committed text is kept.
- Evidence: Missing.

### S-4 Catch-up resumes after the recording

- Drive: from S-3, the recording stops.
- Expect: catch-up takes the gate again and commits only after the watermark; the earlier call ends complete.
- Evidence: Missing.

### S-5 Catch-up resumes after a folder move

- Drive: from S-1 mid-way, a move takes the gate, moves the call and releases.
- Expect: catch-up resumes on the call at its new path; it ends complete; nothing is written to the old path.
- Evidence: Missing.

### S-6 Deleting a call in catch-up

- Drive: from S-1 mid-way, a delete takes the gate for that call.
- Expect: catch-up releases the gate and drops the call; nothing is written to its folder after.
- Evidence: Missing.

### S-7 Catch-up after a crash

- Drive: a segment log with a watermark at 300 s and 420 s of audio; open a new core.
- Expect: catch-up commits only words after 300 s; against the script, no word twice and none missing.
- Evidence: Missing.

### S-8 A cancelled attempt answers late

- Drive: from S-3, the fake recogniser replies to the cancelled window with text marked «STALE».
- Expect: no «STALE» word reaches the client or the log.
- Evidence: Missing.

### S-9 Text that cannot be saved

- Drive: the fake segment log fails writes from 120 s of a 300 s range.
- Expect: the client gets the call's text incomplete; the range from 120 s stays marked unrecognised; the audio is untouched.
- Evidence: Missing.

### S-10 Quitting during catch-up

- Drive: from S-1 mid-way, shut the core down as a quit does; open a new core on the same fake store.
- Expect: catch-up resumes after the watermark; against the script, no word twice and none missing; the call ends complete.
- Evidence: Missing.

### S-11 A gap in catch-up

- Drive: a stopped call with «они» unrecognised from 0 s to 300 s and a capture gap from 100 s to 110 s; the fake recogniser's script runs a sentence across 100 s; the gate is free.
- Expect: no committed segment spans 100–110 s; the words before 100 s and after 110 s commit in their own epochs; the gap stays in the log.
- Evidence: Missing.
