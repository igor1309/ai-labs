# Naming prompt

Adapted from [foliotell-naming-brief.md](../../foliotell/docs/foliotell-naming-brief.md)
(scope, root families, blockers, scoring). "wisper" is a working name only.

---

Brainstorm a name for a small macOS app, then screen and rank the candidates.

## Product

A native macOS app for the owner's own calls (Zoom, Telemost, Meet), in
Russian with English professional terms (RACI, OKR, SLA).

- Records the mic and the call audio as two local tracks and shows a smooth
  live transcript in a small floating window beside the call.
- The owner selects an unfamiliar term with its sentence, presses a hotkey,
  and gets a short Russian explanation through bb (a local agent harness).
- After the call: a better final transcript, a summary, a list of past calls.
- Fully local recognition (Parakeet v3), no server, no subscription.

The feeling it should carry: a quiet companion that listens, writes down and
explains during the call, not a meeting bot and not a productivity suite.

## Where the name is used

- The app name in the menu bar and the Dock.
- The data folder `~/.<name>`: lowercase, short, no spaces or hyphens.
- A CLI command `<name>` that agents call, so it must be quick to type and
  must not shadow a common Unix command.
- A GitHub repository name. Distribution through the App Store is not
  planned; domains and handles are a minor concern.

## Target field for collisions

Blocked if the same or a highly similar name exists among:

- meeting recorders and transcribers: Granola, Superwhisper, Wispr Flow,
  MacWhisper, OpenWhispr, Gristmill, Amanu, Muesli, Guesli, Meetily, anarlog,
  StenoAI, Vexa, Krisp, Fathom, tl;dv, Otter, Fireflies, Plaud, Loomind,
  Tironian, SummitNotes, Fluid, Ruslo, Parrot, MacParakeet;
- dictation and speech-to-text apps: VoiceInk, Aqua Voice, Willow, Spokenly,
  Handy, Voibe, Monologue, BetterDictation;
- speech models and libraries a reader would confuse it with: Whisper,
  Parakeet, Nemotron, GigaAM, FluidAudio.

So "wisper" itself fails: it is one letter from Whisper and Wispr.

## Semantic directions

Use both modes.

**Role names.** The owner names projects after old roles and crafts (Verger,
Agister, Dragoman, Nomos). A historical role that listens, writes down, or
interprets fits well, as long as it is not already taken in the target field
("amanuensis" is taken by Amanu; "dragoman" is the owner's own channel).

**Compounds or coined words** from root families such as:

- listening / speech: ear, hear, heed, say, voice, word, echo, tell
- writing / record: scribe, note, ledger, line, margin, gloss, quill, page
- explaining / meaning: gloss, term, lexis, sense, crib, key

The visual language is already called Glass Ledger (a calm ledger of lines);
a name that sits well beside it is a plus, not a requirement.

## Language and sound

- The owner is Russian-speaking and will say the name in Russian sentences.
  It must be easy to pronounce in Russian and English, and carry no rude,
  silly or misleading meaning in either language.
- One obvious spelling after hearing it; 1–3 syllables; lowercase-friendly.
- Tone: practical, calm, a little literary; not cute, not corporate, not
  "AI + noun".

## Hard blockers

- Same or highly similar name in the target field above.
- A strong negative meaning in English or Russian.
- Spelling or pronunciation ambiguity in either language.
- Shadows a common Unix command or a widely used CLI tool.
- Associated with malware, scams or fraud.

Small GitHub repos, unrelated companies and personal handles are soft
concerns, not blockers.

## Scoring

| Criterion | Weight |
|---|---:|
| Product fit | 35% |
| Spoken usability (Russian and English) | 25% |
| Tone fit | 15% |
| Memorability | 15% |
| Availability risk in the target field | 10% |

## Output

1. 30–40 raw candidates, grouped by direction, one line each.
2. A collision check on the best 10–12 using web search (App Store, GitHub,
   general search); say what you found and where, and never guess.
3. The top 5 scored in the table above, each with strengths, concerns, and
   the `~/.<name>` and CLI form.
4. Rejected names with the reason in one line each.
