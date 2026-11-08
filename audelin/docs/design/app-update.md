# Brief: installed update in the menu bar

Frames: "Screen 7b — Installed update" in
[visual-language.pen](visual-language.pen), with an export in
[exports/screen-7b-installed-update.png](exports/screen-7b-installed-update.png).
Logic: [../spec/app-update/SPEC.md](../spec/app-update/SPEC.md).

## What the owner sees

- **No update.** The menu bar item and the menu are those of Screen 7.
- **Update available.** A 6 pt dot in the accent colour (`me`) at the end
  of the menu bar item, after the glyph or after the recording time. The
  menu opens with «Перезапустить для обновления» (Restart to update), with
  a matching dot in the check column, and then a separator.
- **Update during a call.** While recording, or while the final transcript
  is still being saved, the item is shown disabled in `gutter`, with
  «Доступно после звонка» (Available after the call) under it in the small
  size. It becomes active by itself when the call ends. The dot stays until
  the restart.
- Picking the item quits Audelin and opens the installed copy. A launch
  resumes pending note jobs as usual.

## Width classes and input

Audelin is a macOS menu bar app only, so there are no compact or medium
widths, no touch and no safe area. The item works with the mouse and with
menu keyboard navigation; it has no shortcut, so it cannot be triggered
by accident.

## Proposed, not decided

- The dot's colour and place, the item at the top of the menu, and the
  Russian wording.
