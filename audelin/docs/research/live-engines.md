# Live engines to test

On-device engines that could give live text for Russian calls with English
terms, on Apple Silicon from Swift. Terms are unknown in advance, so no
option here takes a list of terms, a replacement table or a prompt naming
them. Web and source research only (2026-10-22); **[unverified]** marks
claims no primary source confirms.

Measured so far (tests.md run 6): streaming Nemotron 3.5 shows a word 0.37 s
after it is spoken (median) and gave 0 of 12 terms in Latin letters;
windowed Parakeet v3 takes 3.7 s and gave 2 of 12.

## Candidates

| Engine | Russian quality | Live delay | English terms in Latin | Runs on | Swift | License |
|---|---|---|---|---|---|---|
| Nemotron 3.5 multilingual 0.6B, FluidAudio | ~15% word errors on our script | 0.37 s median at 1120 ms chunks; 560, 2240 and 4480 ms also exist | 0 of 12 | CoreML, Neural Engine | In our spike | FluidAudio Apache-2.0; weights NVIDIA Open Model License **[unverified]** |
| Voxtral Mini 4B Realtime | 6.0% on FLEURS ru at 480 ms delay, 5.6% at 960 ms (model card) | 80–2400 ms, set by the caller | Unknown; its language-model decoder may switch scripts by itself **[unverified]** | MLX, 4-bit about 2.5 GB | `VoxtralRealtimeStreamSession` in mlx-audio-swift | Apache-2.0 |
| GigaAM v3 | Strong on plain Russian (3.3% in one CPU test) | Not streaming upstream; would run in our own windows | Unknown | ONNX | None; needs ONNX Runtime | MIT |
| Apple DictationTranscriber, ru_RU (macOS 26) | 13% in one third-party test | 0.3–0.7 s to appear, about 2 s to settle (same test) | Unknown | The OS | First-party API | OS |
| Parakeet TDT v3, FluidAudio | ~20% on our script | 3.7 s in our windows | 2 of 12 | CoreML, Neural Engine | In our spike | CC-BY-4.0 **[unverified]** |
| Qwen3-ASR 0.6B / 1.7B, second pass per phrase | No Russian figure published | Not a live engine; would redo each finished phrase 1–2 s later | Unknown | MLX | mlx-audio-swift | Apache-2.0 |
| Whisper large-v3-turbo via WhisperKit, second pass per phrase | 13–17% (same third-party test) | 2.8–5.4 s live; as a second pass, 1–2 s after a phrase | Unknown | CoreML | WhisperKit | MIT |

Not candidates:

- **T-one** writes Russian letters only.
- **Parakeet Unified and EOU** are English only; **Cohere Transcribe** has no
  Russian.
- **Apple SpeechTranscriber** has no Russian; only DictationTranscriber has
  it (third-party reports).

## Notes per engine

- **Nemotron:** the model's prompt table maps both `ru` and `ru-RU` to prompt
  11, so run 6's `ru` run did use the Russian prompt. `setForcedPrefix(true)`
  also seeds the decoder with the language tag and has not been tried.
  Smaller chunks (560 ms) cut the delay further; FluidAudio reports little
  loss in word errors.
- **Voxtral:** the best published Russian streaming figure, but 4B
  parameters next to a running Zoom call may not keep up on a laptop.
- **GigaAM v3:** reported in the chat survey as strong on plain Russian and
  weak on IT talk mixed with English; whether it can write Latin letters at
  all is unknown.
- **Parakeet:** FluidAudio's `TokenLanguageFilter` with Russian forces
  Cyrillic letters, so it must stay unset.
- **Second pass:** Qwen3-ASR and Whisper are not live engines. A phrase-level
  second pass would replace the live text of each finished phrase; it needs
  a guard against invented text on silence and short phrases.

## How to compare

Same inputs for every engine: the 62 s terms reading and the 263 s Zoom
recording from run 6, plus a recording with no English terms, to catch
terms an engine invents. For each run:

- English terms in Latin letters, of 12;
- Russian word errors, terms left out;
- terms written where none was said, on the term-free recording;
- word delay, median and max;
- compute against real time, and memory, with Zoom running.

## Sources

- FluidAudio: https://github.com/FluidInference/FluidAudio ; Nemotron
  multilingual: https://github.com/FluidInference/FluidAudio/blob/main/Documentation/ASR/NemotronMultilingual.md ;
  token language filter: https://github.com/FluidInference/FluidAudio/blob/main/Documentation/ASR/TokenLanguageFilter.md ;
  model list: https://github.com/FluidInference/FluidAudio/blob/main/Documentation/Models.md
- Voxtral Mini 4B Realtime: https://huggingface.co/mistralai/Voxtral-Mini-4B-Realtime-2602 ;
  paper https://arxiv.org/abs/2602.11298
- mlx-audio-swift: https://github.com/Blaizzy/mlx-audio-swift
- GigaAM: https://github.com/salute-developers/GigaAM ,
  https://huggingface.co/ai-sage/GigaAM-v3 , https://habr.com/en/articles/1002260
- Apple DictationTranscriber: https://developer.apple.com/documentation/speech/dictationtranscriber ;
  WWDC25 session https://developer.apple.com/videos/play/wwdc2025/277/ ;
  Russian only in DictationTranscriber: https://github.com/kitlangton/scrawl/issues/17 ;
  live test of Apple and Whisper on Russian: https://github.com/dimqsh/Screening/pull/8
- Qwen3-ASR: https://github.com/QwenLM/Qwen3-ASR
- WhisperKit: https://github.com/argmaxinc/WhisperKit
- T-one: https://huggingface.co/t-tech/T-one
