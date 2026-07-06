---
date: 2026-07-06
model: gpt-5
description: "Original prompt used to create the iPhone text-to-speech reader UI reference research corpus"
---

# Research Prompt: iPhone Text-to-Speech Reader UI References

## Objective

Collect current UI screenshots and official mockups for the following iPhone apps, focusing on document browsing, file opening, reading, playback, and speed controls.

## Apps

1. Speech Central
2. ElevenReader
3. Read Aloud AI
4. NaturalReader
5. Voice Dream Reader
6. Voice Dream Writer / VDWrite
7. Voicepaper
8. Voice Leaf
9. Speechify
10. Voicen AI
11. SayTXT
12. BookNPC
13. Aurader
14. Audeus
15. Narrate
16. Voicify
17. AI Voice TTS

Also collect relevant UI references for Apple Accessibility Reader as a separate system reference.

## Sources

Prioritize:

1. Apple App Store screenshots
2. Official app websites
3. Official product documentation
4. Official videos or demo pages
5. Recent third-party reviews only when official sources do not show the required screen

Use current sources available in July 2026.

## Screens to collect

For each app, collect any available examples of:

- App home or library
- Document browser
- Folder navigation
- File import or file opening
- Supported-format selection
- Reader screen
- Play, pause, resume, and stop controls
- Playback speed selection
- Voice selection
- Reading progress and current position
- Previous and next document navigation
- Settings
- Empty states
- Errors
- Subscription or paywall screens

Do not fabricate missing screens.

## Deliverables

Create:

```text
research/
  apps/
    <app-name>/
      screenshots/
      sources.md
  ui-inventory.md
  comparison-table.md
```

### Per-app `sources.md`

Record:

- Official app name
- Developer
- App Store URL
- Official website
- Screenshot source URL
- Screenshot date or source publication date
- Screen type
- Whether the image is:
  - actual app screenshot
  - official marketing mockup
  - third-party screenshot

### `ui-inventory.md`

Group screenshots by interaction:

- Browse files
- Open document
- Start playback
- Pause and resume
- Change speed
- Navigate between documents
- Recover from errors
- Encounter subscription or upgrade prompts

For every screenshot, include:

- App
- Screen
- Source
- One-sentence description of the interaction pattern

### `comparison-table.md`

Compare:

| App | Document-first UI | Folder browsing | Direct `.md` support | Playback controls | Speed control | Reading progress | Paywall friction | UI observations |
|---|---|---|---|---|---|---|---|---|

Mark unsupported or unverified capabilities explicitly.

## Research constraints

- Focus on iPhone UI.
- Preserve original screenshot proportions and resolution.
- Avoid screenshots from Android, iPad, macOS, or web apps unless clearly placed in a separate reference section.
- Keep marketing mockups distinct from real in-app screenshots.
- Do not infer direct Markdown support from generic document-import claims.
- Do not add unrelated apps.
- Identify apps that appear renamed, removed, abandoned, or unavailable in the Finnish App Store.
- Note the retrieval date for every source.

## Final synthesis

Conclude with:

1. The strongest document-browser patterns
2. The clearest reader-screen patterns
3. The best speed-selector implementations
4. The lowest-friction flows
5. Common UI failures
6. Patterns suitable for the planned v0.0.1 document-based Markdown reader
7. Patterns better deferred to the folder-oriented v0.0.2
