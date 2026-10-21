# Apps surveyed (2026-10-21)

Prices are from vendor pages and 2026 comparison articles; "~" marks
figures the sources disagree on.

## Meeting transcribers (live view during a call)

| App | License / price | Live engine | Russian live | Fit |
|---|---|---|---|---|
| Superwhisper 3.0.2 | Closed; Meetings is Pro ($8.49/mo, $84.99/yr, $249.99 once), 3,000 trial words | Parakeet Multilanguage (Parakeet v3) realtime, Scribe/Nova cloud; Whisper and Cohere only in chunks | Yes (Parakeet v3) | Smoothest live text; paid |
| Amanu 0.6.5 ([gsamat/amanu](https://github.com/gsamat/amanu)) | MIT, free | Nemotron 3.5 ASR Streaming Multilingual 0.6B; final pass Parakeet v3, Whisper or GigaAM | Yes | Liked most; live text weaker than Parakeet |
| MacParakeet 0.8.10 ([moona3k/macparakeet](https://github.com/moona3k/macparakeet)) | GPL-3.0, free | Parakeet v3 chunks | Yes | Lagged all others; window cannot stay on top |
| Meetily ([Zackriya-Solutions/meetily](https://github.com/Zackriya-Solutions/meetily)) | MIT, free (32k stars) | Parakeet v3 (ONNX) or Whisper | Claimed | Not tested |
| Muesli ([Muesli-HQ/muesli](https://github.com/Muesli-HQ/muesli)) | MIT, free | Nemotron or Apple Speech live; Parakeet v3 final only | Nemotron only | Not tested |
| anarlog ([fastrepl/anarlog](https://github.com/fastrepl/anarlog)) | MIT, free | Local Parakeet streaming (likely English) | Unclear | Not tested |
| MacWhisper 15.4 | Closed; one-time Pro | WhisperKit large-v3 live captions | Yes | Installed; not tested live |

## Named in the chat survey (not tested)

From [chat-khakhalev-2026-10-21.md](chat-khakhalev-2026-10-21.md) § 2;
statements are the chat members', not checked.

| App | Kind | Note |
|---|---|---|
| Gristmill | Open source, Timur Khakhalev's OpenWhispr rework (2026-10-15) | Records Ogg/Opus tracks, processes after Stop; chat via bb; Zoom speaker names via Accessibility |
| OpenWhispr | Open source | Gristmill's base |
| Guesli ([ivkiwi/guesli](https://github.com/ivkiwi/guesli)) | Muesli fork | GigaAM; summaries through a ChatGPT subscription |
| StenoAI ([stenolabs/stenoai](https://github.com/stenolabs/stenoai)) | Open source | "Promising", untried |
| Vexa ([Vexa-ai/vexa](https://github.com/Vexa-ai/vexa)) | Open source | Joins the call as a bot |
| Granola | Closed | UX reference: no bot, offers to record; lost the far side after a network switch |
| Krisp, Fathom, tl;dv, Plaud, ChatGPT Record | Closed | Hosted or paid |
| Loomind, Tironian, SummitNotes, Fluid, Ruslo | Closed | Free or paid; Ruslo is a Russian Granola analogue |

## Dictation apps (not meeting tools; listed for the gallery)

| App | URL | Note |
|---|---|---|
| Superwhisper | https://superwhisper.com | Local Whisper free; Pro for Parakeet, cloud, Meetings |
| Wispr Flow | https://wisprflow.ai | Cloud only; free 2,000 words/week, ~$15/mo |
| MacWhisper | https://goodsnooze.gumroad.com/l/macwhisper | Local; free tier + one-time Pro |
| VoiceInk | https://tryvoiceink.com | Local, open source; ~$25 once, free from source |
| Aqua Voice | https://withaqua.com | Cloud; ~$8–10/mo |
| Willow | https://willowvoice.com | Cloud; subscription, capped free tier |
| Spokenly | https://spokenly.app | Local free, ~$19 once Local+, ~$99.99/yr Pro |
| MacParakeet | https://macparakeet.com | Local Parakeet v3, free, GPL-3.0 |
| Handy | https://handy.computer | Local, free, open source |
| OpenWhispr | https://openwhispr.com | Open source; local or own cloud key |
| Voibe | https://www.getvoibe.com | Local; ~$9.90/mo, $99/yr, $199 once |
| Monologue | https://www.monologue.to | Cloud subscription (unverified) |
| BetterDictation | https://betterdictation.com | Local Whisper, one-time (unverified) |
| Apple Dictation | built in | Free, on-device; short text only |

## Ruled out

- **Apple SpeechTranscriber (macOS 26):** checked on this Mac; Russian is not
  among its 30 locales.
- **Cohere Transcribe:** its 14 languages exclude Russian.
- **Raycast AI Commands:** Pro only ($10/mo, $96/yr) since Raycast v2; local
  models and own keys are Pro too. Raycast was uninstalled.
- **MacParakeet Transforms for explanations:** pastes the LLM result into the
  focused input; with a read-only transcript it would land in e.g. Zoom chat.
- **T-one, GigaAM streaming:** good Russian models, but no meeting app on Mac,
  and Russian-only models write English terms in Cyrillic.

## How Superwhisper does its live text

From strings in the 3.0.2 binary (closed source): it links FluidAudio
(Apache-2.0, [FluidInference/FluidAudio](https://github.com/FluidInference/FluidAudio))
and uses `SlidingWindowAsrManager` (Parakeet v3, overlapping windows) and
`StreamingNemotronMultilingualAsrManager`; non-streaming models go through a
chunked `MeetingTranscriber`. A `RealtimeTextAnimationHandler` animates new
text, so part of the smoothness is rendering, not the model. Amanu links the
same FluidAudio (0.15.5).
