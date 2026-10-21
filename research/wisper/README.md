# wisper — live call transcript for Russian calls with English terms

Research for a small macOS app: during a call, show a smooth live transcript
of both sides, let the owner select a term with its sentence, and later
explain it. Started 2026-10-21 from a Superwhisper + Raycast setup attempt.

| File | What it holds |
|---|---|
| [needs.md](needs.md) | What the owner needs, and the constraints |
| [apps.md](apps.md) | Dictation and meeting apps surveyed, with how each fits |
| [tests.md](tests.md) | Hands-on test results from 2026-10-21 |
| [mvp.md](mvp.md) | Draft MVP: our own native app |
| `gallery/` | Site captures and screenshots of the surveyed apps (inventory-a6) |
| `design/visual-language.pen` | Four visual languages for the panel, light and dark, plus Glass Ledger window sizes |

## Visual language

The owner chose Proposal 4, Glass Ledger (2026-10-21): Ledger Mono's time
gutter, arrows and footnote card on Night Glass's blurred floating panel.
The panel is resizable; the window-sizes frame proposes how it adapts. The
explanation card stays in the panel (owner, 2026-10-21); the no-footnote
frame shows the panel before any term is selected.

Screens 1–8 in the same file draw the rest of the app from [mvp.md](mvp.md)
in Glass Ledger: setup, launch blocker, live panel states, calls list, the
call after it ends, settings, menu bar item and errors. Values neither spec
nor owner set are marked as proposals in each frame. The gallery's "Screen
references" section holds the sites surveyed for them (inventory-59).

The v2 frames beside Screens 1–5 and 8 apply the design review and the
owner's answers of 2026-10-21 (recorded in mvp.md on branch `wisper`). The originals
are kept unchanged. Term chips moved to a separate "Later" frame.

## Conclusion so far

No installed app fits without either paying a subscription or living with a
poor live view. Amanu was liked most but its live engine (Nemotron) is weaker
than Parakeet v3. Superwhisper's smooth live text comes from open components
(FluidAudio's Parakeet v3 sliding window plus a text animation layer), so the
plan is to write our own app on FluidAudio rather than fork Amanu.
