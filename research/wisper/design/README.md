# wisper design — Glass Ledger

The design lives in one file, [visual-language.pen](visual-language.pen).
This page indexes it: the locked design system, the components, and where
each frame sits. The app it draws is specified in [../mvp.md](../mvp.md). How
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
- Build from the components below and override their text. Do not redraw a
  button, row or banner by hand.
- Draw Light first. The Dark version is a copy of the Light frame with
  `theme: {mode: "dark"}`. Every token switches, so nothing is recoloured by
  hand.
- A value neither the spec nor the owner set goes in the frame's "Open" line
  as "Proposed, not decided".

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
| Banner/Error, /Warn, /Info | `qAImO`, `XK4si`, `jjhu5` | text |
| Entry/Me, /Them, /Pending | `Nescm`, `ysZuS`, `Dl07G` | `Time`, `Confirmed` |
| Footnote card | `bMU2S` | text |
| Panel header/Idle, /Recording | `MaM9e`, `rVa43` | — |
| Alert | `OCKfD` | `H`, `Body`; buttons "Primary action" (destructive by default; swap for Button/Primary when the action is not destructive) and "Cancel" |
| Calls row | `yFtkD` | `Date`, `Title`, `Duration`, `Audio`, `Dot`, pin, actions; Delete is hidden until hover |

## Frames

| Column | Frames |
|---|---|
| Top, y < 0 | Glass Ledger — design system, Glass Ledger — components |
| x = 0 | Brief, Proposals 1–4, window sizes, no footnote, Screens 1–8 (originals, raw colours, kept unchanged) |
| x = 2700 | v2: Screens 1–5 and 8 after the design review, plus "Later — term chips"; bound to the tokens |
| x = 6900 | v3, built from the components: Screen 1 (optional Calendar permission), Screen 4 (inline rename in the calls list), Screen 5 (call folder, its files, rename in the header), Screen 6 (moving the data folder) |

The newest version of a screen is the one to build from: v3 where it exists,
then v2, then the original. Screens 6 and 7 have no v2; Screen 7 is still
only the original.
