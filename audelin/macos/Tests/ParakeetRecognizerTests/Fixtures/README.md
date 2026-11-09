# Parakeet speech fixture

`diff-means.wav` is the first 88,000 samples (5.5 seconds) of
`03-diff-explanation-16.9s.wav` from FluidAudio 0.17.7, commit
`503b4bd1bbf7220882de39fe8ae6716aae4132da`. It retains the source's
16 kHz, mono, signed 16-bit PCM format. Only the end was trimmed.

Expected speech: **“Diff means comparing.”** Normalized words:
`diff`, `means`, `comparing`.

Source: https://github.com/FluidInference/FluidAudio/blob/503b4bd1bbf7220882de39fe8ae6716aae4132da/Tests/FluidAudioTests/ASR/Parakeet/SlidingWindow/Fixtures/03-diff-explanation-16.9s.wav

The upstream repository distributes the recording under Apache 2.0; its
regression tests state that the speaker cleared it for public release and
identify its original publication in saurabhav88/FluidAudio's
`issue-855-actionable-repros` release. The upstream license is included as
`FluidAudio-LICENSE.txt`. Source WAV SHA-256:
`83f670fa70b12e64a1c5195d948937605c0e4786d5cefea3d3feb0b3b47cde36`.

`diff-means-parakeet-v3.json` contains actual, unmodified `TokenTiming`
values captured from this excerpt on 2026-11-03 with FluidAudio 0.17.7:
`AsrModels.downloadAndLoad(version: .v3)`, `AsrManager(config: .default)`,
`loadModels`, and `transcribe(_:decoderState:)` with a fresh
`TdtDecoderState.make()`. Capture ran with a dedicated serial queue task
executor preference on an Apple M3 Max, macOS 26.6.2. Times, IDs and
confidence values are the model's output, not hand-authored measurements.
The unit tests' other boundary tokens and Nemotron snapshots are synthetic.

`terms-shift-0.jsonl` records recognition windows for a scripted Russian
planning conversation with English terms. It contains text and word timings,
not call audio. The tests use it to replay pending and final word changes.
