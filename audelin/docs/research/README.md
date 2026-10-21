# Audelin research — live call transcript for Russian calls with English terms

Research for a small macOS app: during a call, show a smooth live transcript
of both sides, let the owner select a term with its sentence, and later
explain it. Started 2026-10-21 from a Superwhisper + Raycast setup attempt,
under the working name wisper.

| File | What it holds |
|---|---|
| [needs.md](needs.md) | What the owner needs, and the constraints |
| [apps.md](apps.md) | Dictation and meeting apps surveyed, with how each fits |
| [tests.md](tests.md) | Hands-on test results from 2026-10-21 |
| [mvp.md](mvp.md) | Draft MVP: our own native app |
| [adr-001-v1-architecture.md](../adr-001-v1-architecture.md) | v1 architecture: one modular app, record first, ports and adapters |
| [chat-khakhalev-2026-10-21.md](chat-khakhalev-2026-10-21.md) | Chat survey of meeting recorders and pipelines (Granola, Gristmill, others) |
| [naming-prompt.md](naming-prompt.md) | Prompt for brainstorming the app's name |
| [naming-prompt-round-2.md](naming-prompt-round-2.md) | Second naming round, built on `prompts/` |
| [naming-prompt-round-3.md](naming-prompt-round-3.md) | Third round: Russian historical roles, GitHub search required |
| [audelin-naming-brief.md](../audelin-naming-brief.md) | The chosen name: Audelin, CLI `audelin`, data in `~/.audelin` |
| [audelin-availability-check.md](audelin-availability-check.md) | Collision search and score for Audelin; GitHub and App Store not yet confirmed directly |
| [spike/](spike/) | CLI that runs a recording through Parakeet v3's sliding window |
| `gallery/` | Site captures and screenshots of the surveyed apps (inventory-a6) |
| `../design/visual-language.pen` | Glass Ledger's design system, components and Screens 1–8, light and dark |
| [design/README.md](../design/README.md) | Index of the design file: Glass Ledger's tokens, components, and the frame map |

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

The design system is locked (2026-10-21): the file's variables hold Glass
Ledger's colours with a light and a dark value (theme axis `mode`), two
fonts, and consolidated type, radius and spacing scales. Each screen has one
current frame, built from the components, which draws the owner's answers of
2026-10-21 recorded in mvp.md. Earlier versions and the four proposals
are in git history.
[design/README.md](../design/README.md) lists the tokens, components and screens.

## Conclusion so far

No installed app fits without either paying a subscription or living with a
poor live view. Amanu was liked most but its live engine (Nemotron) is weaker
than Parakeet v3. Superwhisper's smooth live text comes from open components
(FluidAudio's Parakeet v3 sliding window plus a text animation layer), so the
plan is to write our own app on FluidAudio rather than fork Amanu. The
spike shows Parakeet v3 at 4 s chunks gives clean text ~6 s behind speech;
English terms are still weak (OKR in Cyrillic, SLA misheard).
