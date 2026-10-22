---
date: 2026-10-22
model: claude-opus-5-5
description: "Menu bar — QA, driven as the user on the built app"
---

# Menu bar — QA

## Oracle pin

| Field | Value |
|---|---|
| oracle | `SPEC.md` — blob `4278e782e40b3f7e45c7a069ddf8bb4f288ded58` |
| driven by | the user, through the menu bar item |
| where | the release build on this Mac; a Zoom call to a second device where a call is needed |

## Scenarios

Verdicts live in run reports under `runs/`. A row has evidence or reads Missing.

### S-1 Waiting for a call

- Drive: auto-record ticked, nothing recording; open the menu.
- Expect: the first line reads «Ждёт звонка».
- Evidence: Missing.

### S-2 Auto-record off

- Drive: auto-record unticked, nothing recording; open the menu.
- Expect: the first line reads «Не записывает».
- Evidence: Missing.

### S-15 Nothing recording shows in the bar

- Drive: during a recording, choose «Остановить запись»; close the menu; bring Safari to the front.
- Expect: the icon shows the idle state, with no recording mark or time.
- Evidence: Missing.

### S-13 Recording by hand with auto-record off

- Drive: auto-record unticked, no call app open; choose «Начать запись».
- Expect: the icon shows the recording mark and a running time; a new call folder appears.
- Evidence: Missing.

### S-14 Recording by hand while waiting for a call

- Drive: auto-record ticked, no call app open; choose «Начать запись».
- Expect: the icon shows the recording mark and a running time; a new call folder appears.
- Evidence: Missing.

### S-3 A recording is visible from any app

- Drive: a recording of a Zoom call; bring Safari to the front.
- Expect: the menu bar icon shows the recording mark and a running time that advances.
- Evidence: Missing.

### S-4 Stopping from the menu

- Drive: as S-3; open the menu, choose «Остановить запись».
- Expect: the first line read «Запись · Zoom · <time>» before; after, nothing records.
- Evidence: Missing.

### S-5 Recording without live text

- Drive: untick «Живой текст»; start a recording; open the menu.
- Expect: the bar shows the recording mark and time; the menu's first line reads «Запись без текста · <time>», the time advancing.
- Evidence: Missing.

### S-7 The menu opens the calls list

- Drive: choose «Звонки…».
- Expect: the calls list window comes to the front.
- Evidence: Missing.

### S-8 The menu opens the calls folder

- Drive: choose «Открыть папку звонков».
- Expect: Finder shows the calls folder set in Settings.
- Evidence: Missing.

### S-9 The menu opens the live panel

- Drive: close the panel; choose «Показать панель».
- Expect: the panel is visible.
- Evidence: Missing.

### S-10 The menu opens Settings

- Drive: choose «Настройки…».
- Expect: the Settings window comes to the front.
- Evidence: Missing.
