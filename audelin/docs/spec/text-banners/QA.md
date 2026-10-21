---
date: 2026-10-22
model: claude-opus-5-5
description: "Text banners — QA"
---

# Text banners — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `4da1d5e10094288af1b28722a27fac5ea9eaaf24` |
| driven by | the user, through the panel, with Zoom on a second device |
| where | the debug build on this Mac |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Live text paused for «они»

- Drive: the debug build; choose the fail-«они» trigger; both sides keep talking.
- Expect: the banner says live text is paused for «они»; «я» keeps appearing.
- Evidence: Missing.

### S-2 Live text paused for «я»

- Drive: the debug build; choose the fail-«я» trigger; both sides keep talking.
- Expect: the banner says live text is paused for «я»; «они» keeps appearing.
- Evidence: Missing.

### S-3 The text cannot be saved

- Drive: the debug build; mid-call, choose the fail-text-saves trigger.
- Expect: the banner says the text is incomplete; the recording's time keeps advancing.
- Evidence: Missing.
