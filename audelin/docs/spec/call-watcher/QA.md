---
date: 2026-10-22
model: claude-opus-5-5
description: "Call watcher — QA"
---

# Call watcher — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `a99759bfc1adc876896b3486ae706045f1960a39` |
| driven by | tests of the watcher through a fake call-detection port and a fake clock |
| where | `swift test` on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 A call app takes the microphone

- Drive: the fake port reports `us.zoom.xos` taking the microphone; in a second case Telemost.
- Expect: the client gets a call-started event titled «Zoom», and «Telemost» in the second case.
- Evidence: Missing.

### S-2 A browser takes the microphone

- Drive: the fake port reports each listed browser in turn: Safari, Chrome, Arc, Firefox, Edge, Yandex Browser, Brave, Opera.
- Expect: each gives a call-started event titled after that browser.
- Evidence: Missing.

### S-3 Another app takes the microphone

- Drive: the fake port reports Voice Memos and Dictation taking the microphone.
- Expect: no event.
- Evidence: Missing.

### S-4 The call ends

- Drive: from S-1, the port reports Zoom releasing the microphone; advance the fake clock 30 s.
- Expect: a call-ended event at 30 s, none at 29 s.
- Evidence: Missing.

### S-5 The app is back within the call-end time

- Drive: from S-1, Zoom releases, and takes the microphone again at 20 s; advance to 60 s.
- Expect: no call-ended event and no second call-started event.
- Evidence: Missing.

### S-6 Two call apps

- Drive: from S-1, Chrome takes the microphone; ask for a title; Zoom releases; 30 s pass; then Chrome releases; 30 s pass.
- Expect: the title is «Zoom» while both are on; one call-ended event, 30 s after Chrome released.
- Evidence: Missing.

### S-7 A title with a call app on the microphone

- Drive: from S-1, ask for a title.
- Expect: «Zoom».
- Evidence: Missing.

### S-8 A title with no call app on the microphone

- Drive: ask for a title with no call on; then, from S-1, Zoom releases and a title is asked 10 s later.
- Expect: «Звонок» both times; the call is still on the second time.
- Evidence: Missing.

### S-9 The first app leaves, the second stays

- Drive: Zoom, then Chrome take the microphone; Zoom releases; ask for a title.
- Expect: «Chrome».
- Evidence: Missing.
