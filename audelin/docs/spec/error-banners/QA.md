---
date: 2026-10-22
model: claude-opus-5-5
description: "Error banners — QA"
---

# Error banners — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `8c045b7a00c89330a81f6f5b08ef2c68a1a88a4e` |
| driven by | the user, through the panel, with Zoom on a second device |
| where | the release build on this Mac (the debug build where a row says so) |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 No call audio

- Drive: revoke system audio recording for Audelin; start a recording.
- Expect: the banner says only «я» is recorded; its link opens System Settings at the system audio recording pane.
- Evidence: Missing.

### S-2 No microphone

- Drive: revoke microphone access for Audelin; start a recording.
- Expect: the banner says only «они» is recorded; its link opens System Settings at the microphone pane.
- Evidence: Missing.

### S-3 Disk full

- Drive: set the calls folder on a small disk image; record until it fills.
- Expect: the banner says recording failed and the time it stopped; «Открыть папку» opens the call's folder in Finder; its audio plays and its text reads up to that time.
- Evidence: Missing.

### S-4 No new recording on a full disk

- Drive: after S-3, look at the panel and the menu.
- Expect: Начать and «Начать запись» are disabled.
- Evidence: Missing.

### S-5 Room on the disk again

- Drive: after S-4, delete a large file from the image.
- Expect: Начать is enabled again.
- Evidence: Missing.

### S-6 Call audio lost mid-call

- Drive: mid-call, revoke system audio recording for Audelin.
- Expect: the banner says only «я» is recorded from that time; its link opens the system audio recording pane; the recording's time keeps advancing.
- Evidence: Missing.

### S-7 Microphone lost mid-call

- Drive: mid-call, revoke microphone access for Audelin.
- Expect: the banner says only «они» is recorded from that time; its link opens the microphone pane; the recording's time keeps advancing.
- Evidence: Missing.

### S-8 The microphone switches device

- Drive: record on a USB headset's microphone; unplug it; keep speaking.
- Expect: no banner; the recording's time keeps advancing; the built-in microphone's speech appears under «я».
- Evidence: Missing.

### S-11 The calls folder vanishes

- Drive: set the calls folder on a disk image; mid-call, eject the image with `hdiutil detach -force`.
- Expect: the banner says recording failed and the time it stopped.
- Evidence: Missing.

### S-12 A banner leaves the text readable

- Drive: after a minute of text, revoke microphone access (S-7's banner); scroll the panel to its top.
- Expect: every line from before the banner is visible and selectable.
- Evidence: Missing.
