# Audelin design — Glass Ledger

The design lives in one file, [visual-language.pen](visual-language.pen).
This page indexes it: the locked design system, the components, and where
each frame sits. The app it draws is specified, as far as it is yet, in
[../spec/](../spec/). How
to edit and save the file headless with the `pen` CLI (`pen interactive`) is
in the repo's `AGENTS.md` § Designing in pen.dev.

## Design system

Glass Ledger is Ledger Mono's time gutter, arrows and footnote card on Night
Glass's blurred floating panel. Its tokens are the file's variables. The frame
"Glass Ledger — design system" shows them.

Rules for new frames:

- Use a token for every colour, font, size, radius and gap. Use a raw value
  only for what has no token: window traffic lights and the grey annotation
  text around a mockup.
- A value off the scale snaps to the nearest token; a tie goes to the larger
  one (radius 4 → `radius-control` 6, gap 10 → `space-12`). Add a token only
  when the owner decides the scale needs it.
- Build from the components below and override their text. Do not redraw a
  button, row or banner by hand.
- Draw Light first. The Dark version is a copy of the Light frame with
  `theme: {mode: "dark"}`. Every token switches, so nothing is recoloured by
  hand.
- A value neither the spec nor the owner set goes in the frame's "Open" line
  as "Open: …". The file states what a frame is, not who decided it or when.
- Change a screen in place. Git keeps the history; the file holds only
  current frames.

### Colour

Each colour has a light and a dark value on the theme axis `mode`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `glass` | `#FFFFFFE6` | `#15171CEB` | Live panel background (blurred) |
| `win` | `#F7F8FA` | `#17191E` | Window background |
| `side` | `#EEF0F3` | `#1C1F25` | Title bar |
| `surface` | `#FFFFFF` | `#22252C` | Fields, options, rows |
| `text` | `#16181D` | `#E8EAED` | Main text |
| `sub` | `#5A606A` | `#A3A9B3` | Secondary text |
| `gutter` | `#686E78` | `#7C828D` | Time gutter, hints, the timestamp prefix; 4.5:1 on `win` |
| `them` | `#C27A06` | `#F5B454` | The other side's speech; the first remote speaker |
| `them-2` | `#6E56CF` | `#B4A2FF` | The second remote speaker |
| `them-3` | `#2F6FDB` | `#82AAFF` | The third remote speaker |
| `them-4` | `#C2417F` | `#F28CC0` | The fourth remote speaker; a fifth takes `them` again |
| `me` | `#0E9F92` | `#4FD1C5` | The owner's speech, accent, links |
| `selBg` | `#0E9F92` | `#4FD1C5` | Selected term background |
| `selText` | `#FFFFFF` | `#0B1F1D` | Selected term text |
| `card` | `#F1F3F6` | `#262A33` | Footnote card |
| `cardText` | `#3A3F48` | `#C9CDD3` | Footnote card text |
| `rule` | `#0000001A` | `#FFFFFF14` | Dividers and borders |
| `chip` | `#00000026` | `#FFFFFF26` | Progress track, chips |
| `rec` | `#E5484D` | `#F2555A` | Recording, destructive actions, errors |
| `warn` | `#B56A00` | `#F5B454` | Warning text |
| `warnBg` | `#C27A061A` | `#F5B4541F` | Warning banner |
| `errBg` | `#E5484D14` | `#F2555A1F` | Error banner, Delete button |
| `hit` | `#FFD84D8C` | `#E0B0207A` | A search match's highlight |
| `okBg` | `#0E9F9214` | `#4FD1C51F` | Info banner, selected option |
| `shadow` | `#00000040` | `#00000080` | Window and panel shadow |
| `btn` | `#0000000D` | `#FFFFFF14` | Secondary button, file chips |
| `segTrack` | `#0000000F` | `#FFFFFF14` | Segmented control track |
| `segThumb` | `#FFFFFF` | `#FFFFFF38` | Selected segment |
| `segShadow` | `#00000033` | `#00000066` | Selected segment's shadow |
| `dis` | `#0000000A` | `#FFFFFF0F` | Disabled button |
| `disText` | `#A9AEB6` | `#5C626C` | Disabled text |
| `back` | `#E3E5E8` | `#1F2228` | Desktop behind a mockup window |
| `tile` | `#C9CDD3` | `#33373E` | On the sheet; no screen uses it yet |

### Type, radius, spacing

| Group | Tokens |
|---|---|
| Fonts | `font-data` IBM Plex Mono (transcript, times, paths, sizes); `font-ui` IBM Plex Sans (labels, titles) |
| Type sizes | `type-caption` 11, `type-small` 12, `type-body` 13, `type-title` 18; weights normal and 600 only |
| Line height | `line-body` 20 for running text on `type-body` (summary preview notes) |
| Radius | `radius-bar` 2, `radius-thumb` 5 (selected segment), `radius-control` 6, `radius-card` 10, `radius-panel` 16 |
| Spacing | `space-2`, `-4`, `-6`, `-8`, `-12`, `-16`, `-20`, `-24`, `-28`, `-32`, `-40` |

UI code takes every font from `tokens.ui`, `tokens.data`, `tokens.nsUi` or
`tokens.nsData` with a `type-*` size. `macos/scripts/check-font-tokens.py`
rejects system fonts, text styles and raw `NSFont` outside the GlassLedger
module, and CI runs it.

The app's tokens are generated from [tokens.json](tokens.json), a snapshot of
this file's variables. A token change in the design ships in the same commit
as the refreshed snapshot and the regenerated Swift:

1. With `pen interactive --in visual-language.pen`, run `execute` with
   `Print(JSON.stringify(GetVariables()))`.
2. Write the printed JSON to `tokens.json` with a 2-space indent and a final
   newline, so the diff shows only the changed tokens.
3. In `audelin/macos`, run `python3 -I scripts/generate-tokens.py`. It writes
   `Sources/GlassLedger/GlassLedger+Tokens.swift`; `--check` exits 1 when
   that file is stale.

## Components

The frame "Glass Ledger — components" holds them, with a dark mirror built
from instances.

| Component | Id | Override |
|---|---|---|
| Button/Primary, /Secondary, /Destructive, /Disabled | `f7Y4eS`, `wmGeO`, `dkiMi`, `DcBEh` | `Label` |
| Option/Default, /Selected | `t93RQp`, `swhTa` | `Name`, `Note`, `Where`, `Size` |
| Progress | `GQV4X` | `Done` width |
| Path field | `e8UQV2` | `Path` |
| Pin/Off, /On | `w24st`, `S5zLs` | — |
| Title bar | `H1efZf` | `Title` |
| Banner/Error, /Warn, /Info | `qAImO`, `XK4si`, `jjhu5` | `H`, `Sub` |
| Entry/Me, /Them, /Pending | `Nescm`, `ysZuS`, `Dl07G` | `Time`, right-aligned so the symbols line up, then `Symbol` (`microphone.fill` for me, `speaker.wave.3.fill` for them ; stand-in vectors redrawn to match, the app draws the SF Symbols) on the time's first baseline in the same `me` or `them` colour, `Confirmed`; Pending adds `Pending` |
| Footnote card | `bMU2S` | `Term`, `Hint`, `Text` |
| Panel header/Idle, /Recording | `MaM9e`, `rVa43` | `Status` |
| File chip | `U4MdJG` | `Name` |
| Rename field | `MsvSg` | `Prefix` (the fixed `yyyy.MM.dd-HHmm `), `Title` |
| Summary | `yCxLj` | `Line 1`–`Line 3`, `Show more`; hide a line with `enabled: false` |
| Hotkey field | `ysLzd` | `Keys` |
| Alert | `OCKfD` | `H`, `Body`; buttons "Primary action" (destructive by default; swap for Button/Primary when the action is not destructive) and "Cancel" |
| Calls row, /Hover | `yFtkD`, `uMMD6` | `Date`, `Title`, `Duration`, `Audio`, `Dot`, pin; Hover adds the row tint and shows Delete (a Button/Destructive in the error tint) |
| Segment/Selected, /Selected focused, /Default; Segmented/First, /Second, /Third | on the board "Glass Ledger — call notes components" | each segment's `Label`; the variant names the selected segment. Settings tabs, Language, Appearance and the debug chunk size all use them ([general settings brief](general-settings.md)) |
| Settings row | `W8h2bZ` | `Name`; replace `Control` with the row's control |
| Live panel | `c0qJn` | The glass panel shell; replace `Body` with the header, banners and log |
| Added late | `HIqfu` | `Late label`; the group of minutes filled in after live text is switched on mid-call |
| Checkbox/On, /Off | `ufHXu`, `zhXsW` | `Label` |
| Eye, /Active, /Disabled; Calls row/Selected; Summary preview | on the board "Glass Ledger — summary preview components" | see [summary preview brief](summary-preview.md); Calls row has a hidden `Eye cell` |
| Sheet | `w9b9LL` | Scrim with a centred Alert; set x, y and size to the window under the title bar, and override the Alert through `Alert/<id>` |

## Frames

| Where | Frames |
|---|---|
| Top, y < 0 | Glass Ledger — design system, Glass Ledger — components |
| x = 0, y ≥ 0 | One frame each, Light and Dark: Glass Ledger — window sizes (how the resizable panel adapts), Glass Ledger — no footnote (the panel before any term is selected), Screens 1–8, then "Later — term chips" |
| Right of Screen 4, x = 4100 | Screen 4b — Summary preview: an eye button and floating preview window that are not built; the calls window replaced them. Its typography is the calls window's detail ([brief](summary-preview.md)) |
| Below everything, y ≥ 24476 | Calls window: list beside the selected call's summary, its states in Light and Dark, the boards "Calls window — shared components" and "Calls window — components" ([brief](calls-list.md)) |
| Right of Screen 7, x = 2160 | Screen 7b — Installed update: a badge and restart item, not built; Audelin relaunches into an installed update by itself once idle ([brief](app-update.md)) |

Current screens:

While dragging in the live transcript, use AppKit's unemphasized selection
background and foreground together. The panel cannot become key; an accent
foreground paired with the system's inactive background makes text unreadable.
The drag mockups approximate the native gray with `chip`; the rendered colors
follow the system appearance. Mouse release still holds the excerpt and fades
the selection out.

Held selections use the `card` fill, `rule` border and `radius-card`, with
`space-8` horizontal and `space-2` vertical padding, and `space-8` gaps.
A `type-caption` pin sits in a 16 × 24 slot;
the release control has a 24 × 24 target. The excerpt uses `font-data` at
`type-small`, with `space-4` above it to align with the controls, without added quotation marks, and wraps to three lines before
truncating at the end. Hover and accessibility expose the complete excerpt.
Cards are separated by `space-8` in both appearances.

| Screen | States |
|---|---|
| 1 — First-launch setup | This Mac, nothing chosen; fresh Mac, models downloading and recording blocked |
| 2 — Launch blocker | Model missing; model downloading; both block recording |
| 3 — Live panel states | Not recording; recording; getting ready, recording while the models load; live text off; live text switched off mid-call, with the text so far kept; text filled in after live text is switched on; settling; selections held, each let go on its own; sent to bb with each card step |
| 4 — Calls list | Hover; confirm delete; renaming inline |
| 5 — Call after it ends | Final pass running; failed; summary pending; done; renaming the title |
| 6 — Settings | Tabs General, Recording, Call summaries. General: language System, English fallback, English forced, Russian forced; see [general settings brief](general-settings.md). Recording: release, debug, confirm move, moving, move failed, during recording. Call notes: off, on, local, invalid, unavailable, validating, saving, save failed, saved, loading, load failed; see [settings brief](call-notes-settings.md) |
| 7 — Menu bar item | Waiting for a call; recording started by the call; recording without live text |
| 8 — Errors | No call audio; no microphone; disk full; call silent (written but zeros while the user talks) |
| 9 — App icon | Three frames: the ledger icon (not chosen); "two tracks", the chosen flat design; and its Liquid Glass edition, whose Icon Composer layers (me, them, rec) are exported to `macos/AppIcon/Audelin.icon` |

Earlier frames are in git history: the four proposals and the brief at
d5542163, the original Screens 1–8 at 32626465, v2 at dbd22607, v3 at
a724a1c8 and v4 at fa2dc19f. Check out one of those commits to open them;
build only from the current file. Screens 1 and 2 keep their one-off containers (setup blocks,
the blocker card) hand-drawn; everything repeated is a component instance.
"Later — term chips" is the Live panel with a terms footer drawn in tokens.

## Live panel recording problems

The panel shows the same microphone, call-audio and failed-track faults as
recording's menu state, plus the current silent-call warning. Under its
header, each active problem has a banner, newest first, while captured
text remains visible. A failed track leaves the REC header running; only
that track stops.

- Missing call audio: “Нет звука звонка”, with “Пишется только «я».
  Проверьте разрешение «Звук звонка».”
- Missing microphone: “Нет микрофона”, with “Пишутся только «они».
  Проверьте устройство ввода и разрешение «Микрофон».”
- Disk failure: “Диск заполнен — дорожка остановлена”, with “Всё до
  <time> сохранено. Освободите место, чтобы продолжить.”
- Silent call: “Звонок не слышен”, with “5 минут тишины со стороны «они»,
  пока вы говорите. Проверьте разрешение «Звук звонка».”

The first two banners use warning colours, disk failure uses error colours,
and silence uses informational colours. “Открыть настройки macOS” opens
Microphone privacy for a microphone fault, or the privacy pane containing
System Audio Recording for call-audio faults and silence. “Открыть папку”
on disk failure opens the current calls folder, as the menu does.

Missing audio leaves a small muted log row on its side: “— нет звука звонка
с <time> —” or “— нет микрофона с <time> —”. A disk fault leaves “— диск
заполнен с <time> —” on the failed side. Each first-seen fault uses the
panel's recording clock and the log's elapsed minute format, including
when speech for that time arrives later. Faults remain until recording
ends. Silence has no gap row and its banner disappears when the Session
warning clears.
