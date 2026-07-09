---
date: 2026-07-06
model: gpt-5
description: "Forward product backlog for FolioTell after the first simulator implementation."
version: 0.0.1
---

# Backlog — FolioTell product

Keep the near-term backlog focused on making FolioTell trustworthy as a
document-listening app before expanding formats, accounts, network features, or
AI features.

## Verify background and lock-screen playback

Confirm the listening experience on a real device when the app is backgrounded
or the device is locked.

- Verify whether synthesized speech continues under lock and background states.
- Add audio session configuration if required by real-device behavior.
- Add lock-screen or remote transport support only after the basic background
  behavior is validated.

## Validate language and voice behavior on device

Make voice selection predictable for non-English documents, especially Russian
Markdown documents.

- Test the detected-language voice selection on real iOS hardware.
- Show the detected document language in the voice or controls menu.
- Keep the normal voice list filtered by the detected language.
- Add a manual language override or "show all voices" escape hatch if detection
  is wrong or the desired system voice is hidden.

## Voice-quality onboarding

Get users from the pre-installed compact voices (the robotic default,
especially audible in Russian) to the Enhanced/Premium Apple voices. Auto
selection already prefers the best installed voice; the gap is that most
devices only have compact voices installed, and voices cannot be downloaded
programmatically — only the user can, in Settings → Accessibility → Spoken
Content → Voices.

- Detect when only standard-quality voices are installed for the document's
  detected language, and show a one-time, dismissible hint with the exact
  Settings path (deep-link to Settings where iOS allows).
- Show quality labels (Enhanced/Premium) next to voice names in the voice
  picker so the difference is visible at pick time.
- Consider a short first-launch onboarding step that frames voice download as
  the single biggest quality upgrade.
- Keep the hint honest: if an Enhanced/Premium voice for the language is
  already installed, never show it.

## On-device neural TTS (needs UI discussion beyond tech)

Evaluate embedding an open neural TTS engine for a quality level above
Enhanced Apple voices while staying fully offline — the current product
promise (no network, private by design) must hold. Do not start
implementation from this item alone: the product/UI questions below need a
design discussion first.

Technical shape:

- Candidate engines: Piper (MIT, ONNX, Russian voices: irina, ruslan, denis,
  dmitri) via sherpa-onnx Swift bindings; Silero as an alternative. Verify
  each voice model's own license separately from the engine license.
- Leaving `AVSpeechSynthesizer` means owning the audio pipeline: synthesize
  PCM, play via AVAudioEngine, and keep the audio-session behavior
  (`.playback`/`.spokenAudio`, mute-switch override, background audio) that
  is already validated on device.
- Sentence highlighting and PlaybackTransport events currently come from
  `willSpeakRange` delegate callbacks; a neural engine must reconstruct
  word/sentence timing from the model's alignment output. This is the
  hardest technical piece — treat it as the feasibility gate.
- Models are ~60–100 MB per voice: decide bundled vs downloaded, and how
  that squares with the offline promise (first-run download needs network
  once).

Product/UI discussion needed before any spec:

- Voice management UI: browsing, downloading, deleting models; storage
  visibility.
- How neural voices coexist with Apple voices in the picker (sections?
  quality badges? per-language defaults?).
- Whether Auto selection may pick a neural voice, and what the fallback
  chain is when a model is missing.
- App size, review implications, and whether the quality gain over Enhanced
  Apple voices justifies the added complexity at all.

## Cloud TTS voices (option, gated on a product decision)

Optional highest-quality tier via a cloud TTS provider (ElevenLabs, OpenAI,
Azure `ru-RU` neural, Yandex SpeechKit — the strongest for Russian
specifically). Parked as an option, not planned work.

- Directly conflicts with the shipped promise: landing page and product card
  say no network, no account, fully private. Requires an explicit product
  decision to reposition (e.g. strictly opt-in "premium voices" with clear
  disclosure), not just a feature spec.
- If ever pursued: per-character cost model, API-key/account handling,
  streaming playback with sentence timing, and on-device caching of
  synthesized audio for offline replay all need answers first.
- Revisit only after the on-device neural TTS evaluation settles — if that
  lands, this tier may be unnecessary.

## Persist per-document listening settings

Keep each document's listening setup independent, so switching between
documents (for example a Russian poem at 0.9× and an English article at 1.5×)
does not drag one document's speed, voice, or front-matter mode onto another.
Recents listing and reopening are already covered by the system document
browser's Recents tab; no custom library UI unless a "continue listening"
affordance proves necessary.

- Store speed, voice, and front-matter mode per document alongside the
  playback position, extending the ADR-001 position store (designed as this
  extension point).
- Fall back to the global defaults for documents without a record.
- Keep this local and offline; no account, sync, analytics, or backend.
- Optional follow-up, only if renames/moves happen in practice: key records by
  security-scoped bookmark instead of path so listening state survives
  rename/move.

## Maintain reusable Maestro regression flows

Keep simulator coverage for the interaction bugs that have already appeared.

- Open the supplied Pushkin Markdown file.
- Verify play, pause/resume, stop, and speed change without restarting from the
  beginning.
- Verify front-matter skip/read behavior.
- Verify the voice menu is filtered for the detected document language.

## Render Markdown more clearly

Improve the reader's visual presentation without changing the document model.

- Render headings, paragraphs, lists, and front matter with distinct SwiftUI
  styles.
- Keep front matter secondary and caption-sized when it is visible.
- Consider hiding visible front matter when the front-matter setting is Skip if
  user testing shows that "skip" is understood as both visual and spoken hiding.
