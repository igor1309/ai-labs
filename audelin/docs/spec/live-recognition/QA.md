---
date: 2026-10-22
model: claude-opus-5-5
description: "Live recognition — QA"
---

# Live recognition — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `97e0b404552cd5efbc7425d7c3b797f05d28f38c` |
| driven by | tests of the recognition core through a fake recogniser replaying Parakeet v3 output recorded once, a fake recorded-audio reader, segment log and clock |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Words arrive live

- Drive: the fake reader exposes 8 s of «я» audio; the fake recogniser returns its recorded words.
- Expect: the client gets the words as a live tail within 3 s of fake time after each word's end.
- Evidence: Missing.

### S-2 The live tail settles

- Drive: continue S-1 until a later window covers those words with full right context.
- Expect: the client gets them as committed segments within 10 s of fake time, at their audio times, replacing the tail.
- Evidence: Missing.

### S-3 Committed text is final

- Drive: run 600 s of recorded output; record every patch the client gets.
- Expect: no patch changes or removes a committed segment; the segment log only appends.
- Evidence: Missing.

### S-4 A capture gap ends the stream

- Drive: the fake reader marks an epoch end on «они» at 40 s, mid-sentence in the recorded output, a marked word just before it; the new epoch resumes with words that would finish that sentence.
- Expect: the marked word arrives committed; the client gets a gap at 40 s; while the new words are a tail and again once committed, no sentence runs from before 40 s to after it.
- Evidence: Missing.

### S-5 Stop keeps the last words

- Drive: stop while the last window's words are still a tail.
- Expect: after stop those words arrive committed; the watermark ends at the stop time.
- Evidence: Missing.

### S-6 A stalled recogniser recovers

- Drive: the fake recogniser stops answering at 60 s for 90 s of fake time, then answers.
- Expect: the attempt is dropped after 30 s; the new one commits from the watermark; against the script, the log has no word twice and none missing.
- Evidence: Missing.

### S-11 Text that cannot be saved

- Drive: the fake segment log fails writes on «я» from 50 s.
- Expect: the client gets «я» marked incomplete with its tail still shown; «они» keeps committing; the reader's audio is untouched.
- Evidence: Missing.

### S-12 Recognition of «я» keeps failing

- Drive: the fake recogniser fails every «я» window from 30 s.
- Expect: after the third failure the client gets «я» paused; «они» keeps committing.
- Evidence: Missing.

### S-13 Recognition of «они» keeps failing

- Drive: the fake recogniser fails every «они» window from 30 s.
- Expect: after the third failure the client gets «они» paused; «я» keeps committing.
- Evidence: Missing.

### S-14 Live text switched off mid-call

- Drive: at 90 s, with a marked word still in the live tail, switch live text off; keep feeding audio.
- Expect: the committed text up to 90 s stays and the marked word stays readable; no further window is sent to the recogniser; the client shows no new text.
- Evidence: Missing.

### S-15 A dropped attempt answers late

- Drive: from S-6, the dropped attempt replies with text marked «STALE» after the new attempt started.
- Expect: no «STALE» word reaches the client or the log.
- Evidence: Missing.
