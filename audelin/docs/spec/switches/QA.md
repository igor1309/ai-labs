---
date: 2026-10-22
model: claude-opus-5-5
description: "Switches — QA, driven as the user on the built app"
---

# Switches — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `99e689a1b69b33d29f6cb8e5e31eb8d471c5c0ac` |
| driven by | the user, through the menu and Settings |
| where | the release build on this Mac, nothing recording |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Both switches start ticked

- Drive: a macOS account that never ran Audelin; complete setup; open the menu.
- Expect: both checkmarks are ticked; Settings shows both rows on.
- Evidence: Missing.

### S-2 Live text unticked in the menu

- Drive: untick «Живой текст» in the menu; open Settings.
- Expect: unticked in the menu and off in Settings.
- Evidence: Missing.

### S-3 Live text ticked in the menu

- Drive: from S-2, tick it in the menu; open Settings.
- Expect: ticked in the menu and on in Settings.
- Evidence: Missing.

### S-4 Auto-record unticked in the menu

- Drive: untick «Записывать звонки автоматически» in the menu; open Settings.
- Expect: unticked in the menu and off in Settings.
- Evidence: Missing.

### S-5 Auto-record ticked in the menu

- Drive: from S-4, tick it in the menu; open Settings.
- Expect: ticked in the menu and on in Settings.
- Evidence: Missing.

### S-6 Live text changed in Settings

- Drive: switch «Живой текст» off in Settings; open the menu.
- Expect: unticked in the menu.
- Evidence: Missing.

### S-7 Auto-record changed in Settings

- Drive: switch «Записывать звонки автоматически» off in Settings; open the menu.
- Expect: unticked in the menu.
- Evidence: Missing.

### S-9 Live text ticked in Settings

- Drive: from S-6, switch «Живой текст» on in Settings; open the menu.
- Expect: on in Settings; ticked in the menu.
- Evidence: Missing.

### S-10 Auto-record ticked in Settings

- Drive: from S-7, switch «Записывать звонки автоматически» on in Settings; open the menu.
- Expect: on in Settings; ticked in the menu.
- Evidence: Missing.

### S-8 The switches outlast a restart

- Drive: untick both; «Выйти»; open Audelin; open the menu and Settings.
- Expect: both unticked in the menu and off in Settings.
- Evidence: Missing.
