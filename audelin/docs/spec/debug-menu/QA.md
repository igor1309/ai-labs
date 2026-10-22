---
date: 2026-10-22
model: claude-opus-5-5
description: "Debug menu — QA"
---

# Debug menu — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `1a6d4489c8839fb8901a9be27e02dc4a34b3abd0` |
| driven by | the user of a debug build, through the menu |
| where | a debug build and the release build on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 A debug build offers the test triggers

- Drive: open the debug build's menu.
- Expect: it lists the hold-recogniser, race, fail-«они», fail-«я», fail-text-saves and switch-microphone triggers.
- Evidence: Missing.

### S-2 A release build has none

- Drive: open the release build's menu.
- Expect: no test trigger is listed.
- Evidence: Missing.

### S-3 Holding the recogniser

- Drive: debug build, a recording with live text; choose hold-recogniser; read a marked passage.
- Expect: the trigger shows a checkmark; the marked passage does not appear in the panel.
- Evidence: Missing.

### S-4 Releasing the recogniser

- Drive: from S-3, choose the trigger again; read a second marked passage.
- Expect: the checkmark is gone; the second passage appears live.
- Evidence: Missing.

### S-5 The race trigger

- Drive: debug build, nothing running; choose the race trigger once.
- Expect: one choice produced both requests: one of a recording and a folder move runs, and the other is shown refused.
- Evidence: Missing.

### S-6 Failing the other side's recognition

- Drive: debug build, a recording with live text, both sides talking; choose fail-«они».
- Expect: the trigger shows a checkmark; «они» lines stop appearing while «я» lines go on.
- Evidence: Missing.

### S-7 Ending the failure

- Drive: from S-6, choose the trigger again.
- Expect: the checkmark is gone; new «они» lines appear.
- Evidence: Missing.

### S-8 Failing text saves

- Drive: debug build, a recording with live text; choose fail-text-saves; then read a marked passage aloud; stop after a minute; open the call's folder.
- Expect: the trigger shows a checkmark; the recording's time keeps advancing; the folder's text ends where the trigger was chosen and lacks the marked passage.
- Evidence: Missing.

### S-9 Failing the owner's recognition

- Drive: debug build, a recording with live text, both sides talking; choose fail-«я».
- Expect: the trigger shows a checkmark; «я» lines stop appearing while «они» lines go on.
- Evidence: Missing.

### S-10 Switching the microphone

- Drive: debug build, a recording with live text; say a marked word mid-sentence and choose switch-microphone at once; keep talking.
- Expect: the call's `я` track holds a new section from that moment; the recording's time keeps advancing.
- Evidence: Missing.
