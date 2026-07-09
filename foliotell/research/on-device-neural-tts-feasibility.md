---
date: 2026-07-09
model: gpt-5
description: "Decision-critical feasibility research for FolioTell on-device neural TTS."
---

# On-Device Neural TTS Feasibility

## Purpose

This note narrows the backlog issue to evidence needed before an implementation plan: a commercially usable offline iOS runtime, a licensable Russian voice, and enough progress information to preserve reader playback semantics. It does not select an architecture, define settings UI, or authorize product work.

## Findings

### Runtime candidates

| Candidate | Offline iOS / Swift evidence | Commercial posture | Decision |
| --- | --- | --- | --- |
| sherpa-onnx with a Piper-format VITS voice | The project documents iOS builds (minimum iOS 13) and lists Swift among its APIs. Its Swift VITS example configures a Piper model, tokens, and eSpeak data directory, then supplies generated PCM to a callback. | Apache-2.0 permits commercial redistribution subject to its notice and license conditions. Each voice remains independently licensed. | Viable candidate for a device spike. |
| Piper engine (`piper1-gpl`) | Local TTS engine with a C/C++ API. | GPL-3.0. Embedding or distributing it requires a GPL-compatible distribution strategy; it is not the candidate for FolioTell's proprietary application path without legal approval. | Do not spike as the runtime. Use its model format only through another runtime. |
| Silero Community Edition | No iOS/Swift runtime was verified in this research. | The project says Community Edition material is under a non-commercial license. | Exclude from shipping-candidate evaluation unless a commercial agreement is obtained. |

Sources: [sherpa-onnx iOS build guide](https://k2-fsa.github.io/sherpa/onnx/ios/build-sherpa-onnx-swift.html), [sherpa platform/API matrix](https://k2-fsa.github.io/sherpa/intro.html), [sherpa-onnx Apache-2.0 license](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE), [Piper repository and GPL-3.0 license](https://github.com/OHF-Voice/piper1-gpl), [Silero licensing tiers](https://github.com/snakers4/silero-models/wiki/Licensing-and-Tiers).

### Russian voice-model licensing and size

The Piper voice repository says the model card for each voice carries the relevant licensing information. The Russian medium voices in its manifest each have a 63,201,294-byte ONNX model, before the `.onnx.json` configuration and runtime phonemizer data. The following selection is therefore a legal-screening shortlist, not a user-facing catalogue.

| Voice | Dataset license declared by model card | Shipping assessment |
| --- | --- | --- |
| `ru_RU-denis-medium` | CC0 | Evaluate first. |
| `ru_RU-dmitri-medium` | CC0 | Evaluate first. |
| `ru_RU-ruslan-medium` | CC BY-NC-SA 4.0 | Exclude: non-commercial term conflicts with commercial distribution. |
| `ru_RU-irina-medium` | Unknown | Exclude until rights are documented. |

Sources: [Piper voices documentation](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md), [Denis model card](https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/denis/medium/MODEL_CARD), [Dmitri model card](https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/dmitri/medium/MODEL_CARD), [Ruslan model card](https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/ruslan/medium/MODEL_CARD), [Irina model card](https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/irina/medium/MODEL_CARD), [voice manifest showing exact model sizes](https://huggingface.co/rhasspy/piper-voices/blob/main/voices.json).

### Playback progress and text alignment

Sherpa's Swift example exposes a `TtsProgressCallbackWithArg` whose inputs are PCM sample pointer, sample count, and numeric `progress`. The example immediately forwards the PCM samples to playback and returns a continuation flag. It does not expose a text range, word boundary, phoneme timestamp, or audio-playback clock.

FolioTell must therefore synthesize reader-facing progress itself. The spike needs to prove a scheduler that:

1. Segments the selected reader text into deterministic, contiguous UTF-16 ranges before synthesis.
2. Associates every generated audio item with its source range and a monotonically increasing playback position.
3. Treats renderer-generation progress as distinct from audible progress; updates reading position from the audio player's rendered/played frames.
4. Cancels queued generation and audio coherently for stop, skip, and voice/rate changes.

This is a feasibility constraint, not an API deficiency claim: a sentence-level scheduler may supply the product's required semantic events even though the runtime does not provide word-level alignment. The exact text behavior must be measured against FolioTell's existing transport contract in the spike.

Source: [Sherpa Swift VITS TTS example](https://github.com/k2-fsa/sherpa-onnx/blob/master/swift-api-examples/tts-vits.swift).

## Minimal Device Spike

Use one legally screened model (`denis` or `dmitri`) on a physical supported iPhone/iPad. Keep the work non-user-facing: no voice picker, download flow, or persistent preference changes. Record device model, OS version, runtime/model revision, input corpus, and all measurements.

| Area | Exercise | Pass evidence | No-go evidence |
| --- | --- | --- | --- |
| Build and offline operation | Build the app with the runtime and model; enable airplane mode; synthesize Russian text. | Physical device produces audible Russian PCM playback with no network request. | Build cannot produce a supported device binary, or playback needs a network service. |
| Distribution rights | Capture pinned source revision, model file checksum, runtime license, model card, and required notices. | Legal review accepts Apache-2.0 runtime plus the chosen voice's CC0 dataset provenance for the intended distribution. | Any unresolvable model provenance, required right, or distribution conflict. |
| Transport parity | Start, pause, resume, stop, skip next/previous sentence, and resume after app background/foreground while a multi-sentence selection plays. | Every action produces one deterministic reader range and no stale audio after stop/skip; persisted position returns to the same selected range. | A required action cannot be mapped to range-level playback or emits stale/incorrect range updates. |
| Latency and continuity | For short, medium, and long selections, measure time from Play to first audible frame, duration of silent gaps between queued ranges, and Stop to silence. | Results meet thresholds agreed before the spike and show no unbounded queue/memory growth. | Any metric breaches a threshold, or a stable threshold cannot be defined from the measured corpus. |
| Device impact | Run a sustained reading session on the physical device; record thermal state, memory footprint, and failure/crash evidence. | The agreed target device completes the agreed duration with no thermal shutdown, memory warning, or playback failure. | Any of those failures occur under the agreed workload. |

## Decision Gate

Proceed to a product/implementation specification only when every spike row has pass evidence and the team has explicitly set and met latency, gap, stop-latency, and sustained-session thresholds. If the only unresolved item is reader text alignment, do not start settings/download UI: first determine whether sentence-range scheduling satisfies the existing transport contract.

## Open Questions

1. Which iOS versions and physical device classes must meet the performance gate?
2. Which user-visible reading granularity is required: sentence highlighting, word highlighting, or a position-only indicator?
3. Model distribution is decided: the reader downloads neural voices through
   FolioTell settings. The remaining product questions are recorded in
   [`docs/product-intent/downloadable-on-device-neural-voices.md`](../docs/product-intent/downloadable-on-device-neural-voices.md).
