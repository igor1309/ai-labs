---
date: 2026-10-22
model: claude-opus-5-5
description: "Call screen — QA"
---

# Call screen — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `b9f334806d58346e0e348d80e9a45859654f0744` |
| driven by | the user, through the calls list and a call's screen |
| where | the release build on this Mac (the debug build where a row says so), seeded and freshly recorded calls |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Opening a call

- Drive: open a stopped call with live text.
- Expect: its title, date, duration, folder and text, the text matching its script.
- Evidence: Missing.

### S-2 Showing the call in Finder

- Drive: press «Показать в Finder».
- Expect: Finder shows the call's folder selected.
- Evidence: Missing.

### S-3 A call still catching up

- Drive: stop a call recorded while the model downloaded, as catch-up starts; open it.
- Expect: the screen says the text is catching up and shows the text so far.
- Evidence: Missing.

### S-4 The text completes on the open screen

- Drive: keep S-3's screen open.
- Expect: the text grows to the whole call without reopening; the catching-up note goes.
- Evidence: Missing.

### S-5 A new recording interrupts catch-up

- Drive: as S-3, then record a new two-minute call at once; stop it; open the earlier call.
- Expect: its text completes and matches its script, no word twice or missing.
- Evidence: Missing.

### S-6 A folder move interrupts catch-up

- Drive: as S-3, then move the calls folder; open the earlier call.
- Expect: the move completes; the call's folder is in the new place and its text completes and matches its script.
- Evidence: Missing.

### S-7 A call recorded without live text

- Drive: record with «Живой текст» unticked; open the call.
- Expect: the screen says the call has no live text.
- Evidence: Missing.

### S-8 A gap in a past call

- Drive: record a call with `pmset sleepnow` and wake mid-call; open it.
- Expect: the text shows a gap line at the sleep.
- Evidence: Missing.

### S-9 Late text in a past call

- Drive: record two minutes with «Живой текст» unticked, tick it, talk on, stop; open the call.
- Expect: the first minutes are marked «дописано позже».
- Evidence: Missing.

### S-10 Text that could not be saved

- Drive: mid-call make the segment log read-only; stop; open the call.
- Expect: the text is marked incomplete.
- Evidence: Missing.

### S-11 Copying from a past call

- Drive: select two lines across «я» and «они»; ⌘C; paste into TextEdit.
- Expect: the pasted text matches the two lines.
- Evidence: Missing.

### S-12 Live text switched off mid-call

- Drive: record with live text; read a marked phrase; untick «Живой текст»; talk two minutes; stop; open the call.
- Expect: the text ends with the marked phrase, followed by a note that the rest was only recorded.
- Evidence: Missing.
