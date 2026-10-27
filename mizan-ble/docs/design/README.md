# Mizan BLE design — Beacon · Exchange

The design lives in one file, [mizan-ble.pen](mizan-ble.pen). This page
indexes it: the locked design system, its components, and where each frame
sits. The app it draws is specified in [../spec/](../spec/). How to open,
edit and save the file through the pencil MCP is in the repo's `AGENTS.md`
§ Designing in pen.dev.

## Design system

Beacon · Exchange, locked on 2026-10-27: a dark ground, the host in orange
and the client in cyan, the mode switch in every header, and every screen
showing its own step and the other side's. The frame "Mizan · Design
System" shows the tokens, the type scale, spacing and radii, the Mizan sign
and the components.

The light appearance draws from the same tokens with `theme: {mode:
"light"}`: "Mizan · Design System · Light" and "Mizan · Paired Flow ·
Light" show it, the latter for five moments of the flow. Light accents are
darker than dark ones, so text on them and on the light ground keeps
4.5:1. Dark remains the reference design.

The app's `DesignSystem` module (`mizan-ble/ios/Sources/DesignSystem/`)
draws from the same tokens. It has the tokens, the Mizan sign, the amount,
the buttons, the mode header with its switch, the countdown ring and the
result mark and card so far, and its `DesignSystemGallery` shows them on
one page, to compare with the frame. The other `DS /` components below
(status bar, key, status pill, rail and stepper steps, chips, messages,
exchange strip, shells) are still to be built, by the sub-issues whose
screens use them.

Rules for new frames:

- Use an `mz-*` token for every colour, font, size, radius and gap. The
  file's other variables (`bg`, `host`, `ink` and the rest) belong to the
  explorations; never use them in a current frame.
- A value off the scale snaps to the nearest token; a tie goes to the
  larger one. Add a token only when the owner decides the scale needs it.
- Build from the `DS /` components and override their text. Do not redraw
  a button, step or mark by hand.
- A value neither the spec nor the owner set goes in the frame's note as
  "Proposed, not decided".
- Change a frame in place. Git keeps the history; the file holds only
  current frames and the Explorations area.

### Tokens

| Group | Tokens |
|---|---|
| Ground and surfaces | `mz-ground` #16181D, `mz-rail` #111317, `mz-raised` #20232A, `mz-raised-2` #2A2E36, `mz-overlay` |
| Lines | `mz-line`, `mz-line-soft`, `mz-line-strong` |
| Text | `mz-text` #FFFFFF, `mz-text-body` #E6E2DD, `mz-text-2` #918B84, `mz-text-3`, `mz-on-accent` |
| Host | `mz-host` #E2622B, `mz-host-hi`, `mz-host-tint` |
| Client | `mz-client` #22B5CC, `mz-client-hi`, `mz-client-tint` |
| Outcome | `mz-ok` #2FB677, `mz-ok-tint`, `mz-bad` #E5534B, `mz-bad-tint` |
| Fonts | `mz-font-display` Space Grotesk, `mz-font-text` Inter, `mz-font-mono` JetBrains Mono |
| Sizes | `mz-size-micro` 11 to `mz-size-amount-xl` 100: micro, eyebrow, small, label, body, lead, wordmark, title, heading, display, hero, ring, key, and amount M 52, L 76, XL 100 |
| Spacing | `mz-space-<n>` is n × 4: 1 to 8, 10, 12, 14, 18 and 20 |
| Radius | `mz-radius-sm` 6, `-md` 12, `-lg` 16, `-xl` 24, `-2xl` 40, `-pill`; device corners `-ipad` 28 and `-iphone` 44 |

The hex values above are the dark ones. The app's tokens are generated
from [tokens.json](tokens.json), a snapshot of this file's variables. A
token change in the design ships in the same commit as the refreshed
snapshot and the regenerated Swift:

1. Through the pencil MCP, run `execute` on this file with
   `Print(JSON.stringify(GetVariables()))`.
2. Write the printed JSON to `tokens.json` with a 2-space indent and a final
   newline, so the diff shows only the changed tokens.
3. In `mizan-ble/ios`, run `python3 -I scripts/generate-tokens.py`. It writes
   `Sources/DesignSystem/Tokens.swift` from the `mz-*` variables;
   `--check` exits 1 when that file is stale, and CI runs it.

Each `mz-*` colour has a dark and a light value on the `mode` theme axis;
the module picks the value from the SwiftUI environment's colour scheme.
Unthemed colours use the same value in both appearances; numbers and
strings remain unthemed.

## Components

All in "Mizan · Design System", section Components, except the sign and
amounts, which are under Mizan Sign › Chosen.

| Component | Id |
|---|---|
| DS / Mizan Sign | `svyms` |
| DS / Amount / XL, / L, / M | `MnEvl`, `qZQez`, `gQyLj` |
| DS / Status Bar / iPad, / iPhone | `h8gDqb`, `D6FOmT` |
| DS / Mode Switch / Host, / Client | `W679Zn`, `ASE1j` |
| DS / Button / Host, / Client, / Success, / Failure, / Decline, / Secondary | `BZZd0`, `OOTU5`, `WvBwi`, `e25Tl`, `emcNT`, `Ux6Yl` |
| DS / Key, / Key / Icon | `hKCiD`, `U7nyo` |
| DS / Status Pill | `T9bcjC` |
| DS / Result Mark / Success, / Failure, / Declined, / Link Lost, / Timeout | `A6kIw5`, `McrE1`, `CjiWS`, `ENX8J`, `kCdN0` |
| DS / Rail Step / Done, / Active, / Failed, / Todo (host) | `L9E4PP`, `yrPDI`, `ZipNm`, `Uu0m5` |
| DS / Stepper Step / Done, / Active, / Failed, / Todo (client) | `tTbmh`, `Fbnuz`, `rkiZ1`, `p7MzmO` |
| DS / Chip / Host, / Client, / Empty | `e5JkbR`, `s7bpOK`, `wliID` |
| DS / Message / To Client, / To Host | `mAUD6`, `OQxVh` |
| DS / Exchange Strip | `EbZyY` |
| DS / Countdown Ring | `Z5KbDd` |
| DS / Shell / iPad, / iPhone | `t5zWit`, `EH3tD` |

The components without the `DS /` prefix (`Status Bar`, `Mode Switch`,
`Button`) are the explorations' and are not current.

## Frames

| Where | Frame |
|---|---|
| x = 0 | Mizan · Design System (`pHq12`): header, colour, type, spacing and radius, the Mizan sign with its candidates, components |
| x = 2800 | Mizan · Paired Flow (`OKjZH`): one row per moment, the iPad and the iPhone side by side with the message between them |
| — | Mizan · Design System · Light and Mizan · Paired Flow · Light: the same, in the light appearance |
| x < 0 | Mizan · Explorations (`omPk6`): earlier covers, palettes and flows, kept as they were; not current |

The paired flow, top to bottom:

| Frame | Moment | Host | Client |
|---|---|---|---|
| M1 | Enter amount | H1 | C1, no host nearby |
| M2 | Advertising | H2, countdown | C1, host in range |
| M3 | Handshake | H3 | C2, connecting |
| M4 | Handshake failed | H3 failed | C2, could not connect |
| M5 | Client reviews | H4 | C3 |
| M6 | Client declined | H6 declined | C5 declined |
| M7 | Mock processing | H5 | C4 |
| M8 | Success | H6 paid | C5 paid |
| M9 | Failure | H6 failed | C5 failed |
| M10 | Countdown expired | H1 timed out | C1, host went quiet |
| S1 | Host settings | Settings | — |

The PNGs in [preview/](preview/) are exports of these frames for pages
that cannot open the `.pen` file.
