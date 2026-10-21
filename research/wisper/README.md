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
| [chat-khakhalev-2026-10-21.md](chat-khakhalev-2026-10-21.md) | Chat survey of meeting recorders and pipelines (Granola, Gristmill, others) |
| [naming-prompt.md](naming-prompt.md) | Prompt for brainstorming the app's name |
| [naming-prompt-round-2.md](naming-prompt-round-2.md) | Second naming round, built on `prompts/` |
| [naming-prompt-round-3.md](naming-prompt-round-3.md) | Third round: Russian historical roles, GitHub search required |
| [spike/](spike/) | CLI that runs a recording through Parakeet v3's sliding window |
| `gallery/` | Site captures and screenshots of the surveyed apps (inventory-a6) |

## Conclusion so far

No installed app fits without either paying a subscription or living with a
poor live view. Amanu was liked most but its live engine (Nemotron) is weaker
than Parakeet v3. Superwhisper's smooth live text comes from open components
(FluidAudio's Parakeet v3 sliding window plus a text animation layer), so the
plan is to write our own app on FluidAudio rather than fork Amanu. The
spike shows Parakeet v3 at 4 s chunks gives clean text ~6 s behind speech;
English terms are still weak (OKR in Cyrillic, SLA misheard).
