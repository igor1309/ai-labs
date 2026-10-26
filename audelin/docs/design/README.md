# Audelin design — Glass Ledger

The design lives in one file, [visual-language.pen](visual-language.pen).
This page indexes it: the locked design system, the components, and where
each frame sits. The app it draws is specified, as far as it is yet, in
[../spec/](../spec/). How
to open, edit and save the file through the pencil MCP is in the repo's
`AGENTS.md` § Designing in pen.dev.

## Design system

Glass Ledger is Proposal 4 (owner, 2026-10-21): Ledger Mono's time gutter,
arrows and footnote card on Night Glass's blurred floating panel. Its tokens
were locked on 2026-10-21 as the file's variables. The frame
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
  as "Proposed, not decided".
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
| `gutter` | `#8A909A` | `#7C828D` | Time gutter, hints, the timestamp prefix |
| `them` | `#C27A06` | `#F5B454` | The other side's speech |
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
| `okBg` | `#0E9F9214` | `#4FD1C51F` | Info banner, selected option |
| `shadow` | `#00000040` | `#00000080` | Window and panel shadow |
| `btn` | `#0000000D` | `#FFFFFF14` | Secondary button, file chips |
| `dis` | `#0000000A` | `#FFFFFF0F` | Disabled button |
| `disText` | `#A9AEB6` | `#5C626C` | Disabled text |
| `back` | `#E3E5E8` | `#1F2228` | Desktop behind a mockup window |
| `tile` | `#C9CDD3` | `#33373E` | On the sheet; no screen uses it yet |

### Type, radius, spacing

| Group | Tokens |
|---|---|
| Fonts | `font-data` IBM Plex Mono (transcript, times, paths, sizes); `font-ui` IBM Plex Sans (labels, titles) |
| Type sizes | `type-caption` 11, `type-small` 12, `type-body` 13, `type-title` 18; weights normal and 600 only |
| Radius | `radius-bar` 2, `radius-control` 6, `radius-card` 10, `radius-panel` 16 |
| Spacing | `space-2`, `-4`, `-6`, `-8`, `-12`, `-16`, `-24`, `-40` |

The app's tokens are generated from [tokens.json](tokens.json), a snapshot of
this file's variables. A token change in the design ships in the same commit
as the refreshed snapshot and the regenerated Swift:

1. Through the pencil MCP, run `execute` on this file with
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
| Entry/Me, /Them, /Pending | `Nescm`, `ysZuS`, `Dl07G` | `Time`, `Who`, `Confirmed`; Pending adds `Pending` |
| Footnote card | `bMU2S` | `Term`, `Hint`, `Text` |
| Panel header/Idle, /Recording | `MaM9e`, `rVa43` | `Status` |
| File chip | `U4MdJG` | `Name` |
| Rename field | `MsvSg` | `Prefix` (the fixed `yyyy.MM.dd-HHmm `), `Title` |
| Summary | `yCxLj` | `Line 1`–`Line 3`, `Show more`; hide a line with `enabled: false` |
| Hotkey field | `ysLzd` | `Keys` |
| Alert | `OCKfD` | `H`, `Body`; buttons "Primary action" (destructive by default; swap for Button/Primary when the action is not destructive) and "Cancel" |
| Calls row, /Hover | `yFtkD`, `uMMD6` | `Date`, `Title`, `Duration`, `Audio`, `Dot`, pin; Hover adds the row tint and shows Delete (a Button/Destructive in the error tint) |
| Settings row | `W8h2bZ` | `Name`; replace `Control` with the row's control |
| Live panel | `c0qJn` | The glass panel shell; replace `Body` with the header, banners and log |
| Added late | `HIqfu` | `Late label`; the group of minutes filled in after live text is switched on mid-call |
| Checkbox/On, /Off | `ufHXu`, `zhXsW` | `Label` |
| Sheet | `w9b9LL` | Scrim with a centred Alert; set x, y and size to the window under the title bar, and override the Alert through `Alert/<id>` |

## Frames

| Where | Frames |
|---|---|
| Top, y < 0 | Glass Ledger — design system, Glass Ledger — components |
| x = 0, y ≥ 0 | One frame each, Light and Dark: Glass Ledger — window sizes (how the resizable panel adapts), Glass Ledger — no footnote (the panel before any term is selected), Screens 1–8, then "Later — term chips" |

Current screens:

| Screen | States |
|---|---|
| 1 — First-launch setup | This Mac, nothing chosen; fresh Mac, models downloading and recording blocked |
| 2 — Launch blocker | Model missing; model downloading; both block recording |
| 3 — Live panel states | Not recording; recording; getting ready, recording while the models load; live text off; live text switched off mid-call, with the text so far kept; text filled in after live text is switched on; settling; selections held, each let go on its own; sent to bb with each card step |
| 4 — Calls list | Hover; confirm delete; renaming inline |
| 5 — Call after it ends | Final pass running; failed; summary pending; done; renaming the title |
| 6 — Settings | Release build; debug build; confirm move; moving; move failed; during a recording |
| 7 — Menu bar item | Waiting for a call; recording started by the call; recording without live text |
| 8 — Errors | No call audio; no microphone; disk full |
| 9 — App icon | Three frames: the ledger icon (not chosen); "two tracks", the chosen flat design (owner, 2026-10-26); and its Liquid Glass edition, whose Icon Composer layers (me, them, rec) are exported to `macos/AppIcon/Audelin.icon` |

Earlier frames are in git history: the four proposals and the brief at
d5542163, the original Screens 1–8 at 32626465, v2 at dbd22607, v3 at
a724a1c8 and v4 at fa2dc19f. Check out one of those commits to open them;
build only from the current file. Screens 1 and 2 keep their one-off containers (setup blocks,
the blocker card) hand-drawn; everything repeated is a component instance.
"Later — term chips" is the Live panel with a terms footer drawn in tokens.
