# VAD: FluidAudio vs reference Silero (LAB-1101)

Status: interim. Criteria 4–8 are measured; 1–3 and 9 wait for hand labels,
because the recogniser reference turned out to be contaminated (below).

## Candidates

- **FluidAudio** `VadManager`, FluidAudio 0.17.7 (already a dependency): Silero
  v6.2.1 converted to Core ML, one probability per **256 ms** hop.
- **Silero** v6.2.1 reference model through ONNX Runtime, CPU, one thread, one
  probability per **32 ms** hop.

Both go through one Silero-style segmenter (threshold, threshold − 0.15 hysteresis,
min speech 0.25 s, min silence 0.4 s, padding), so differences come from the model
artefact and hop, not from segmentation code.

## Corpus

12 recorded calls of 6 minutes or more (3 h 20 min per channel): Zoom, Telemost in
Yandex Browser, two dailies, a planning call and 1:1s. Each channel
(`microphone.caf`, `call.caf`) resampled to 16 kHz and scored separately.

## Results so far

Each engine at its sweep setting with fewest dropped words (threshold 0.3, padding
0.3 for both; no setting met the dropped-word limit, see the reference problem).

| Criterion | FluidAudio mic / call | Silero mic / call | Pass? |
|---|---|---|---|
| 1 Missed speech (vs Parakeet words, overstated) | 6.2 % / 6.7 % | 8.8 % / 9.4 % | waits for labels |
| 2 Recognised words dropped (overstated) | 2.0 % / 0.9 % | 2.8 % / 1.4 % | waits for labels |
| 3 False speech (frames > 0.5 s from any word, overstated) | 18.1 % / 30.6 % | 10.5 % / 21.5 % | waits for labels |
| 4 Far-end-only time marked speech on the microphone | 12.8 % | 1.9 % | Silero far better |
| 5 ΔWER, gated vs fixed 14 s chunks | −0.1 / +0.5 pt | −0.3 / +2.3 pt | FluidAudio passes; Silero fails on call |
| 6 Parakeet audio saved | 30 % / 31 % | 35 % / 36 % | both pass |
| 7 VAD cost (RTFx) | 1340× (< 0.1 % of a core) | 330× on one thread (0.3 %) | both pass; ANE contention not yet measured |
| 8 Onset lag, median / p90 | 198 / 478 ms mic, 219 / 496 ms call | 208 / 445 ms, 208 / 432 ms | median passes for both, p90 fails for both |
| 9 FluidAudio within 1 pt of Silero on 1–3 | — | — | fails on the reference measures (different trade-off, see below) |

### Findings

- **The Parakeet word reference is contaminated.** Latin-script words are 3 % of
  microphone words but 45–61 % of the words the VADs drop: English phrases
  ("Yeah, but you're gonna hit this") in Russian calls, which Parakeet produces on
  noise or quiet bleed. Most "misses" are the VAD correctly rejecting them, so
  criteria 1–3 need hand labels.
- **Cutting audio into pieces alone moves Parakeet's output by ~13 WER points**
  (fixed 14 s chunks, no VAD, vs one pass over the whole file). ΔWER is therefore
  measured against fixed chunks, which is also how production reads windows.
- **The two engines work at different points and neither does better on both.**
  Across thresholds 0.3–0.7, FluidAudio always misses less and flags more
  non-speech; Silero always the reverse. The sweep curves do not overlap, so this
  is the model artefact and hop, not a threshold choice.
- **FluidAudio flags far-end bleed on the microphone** 7× as often as Silero. For a
  speech-based "owner is silent" signal on the microphone, that matters more than
  any other number here.
- Both are cheap enough that cost does not decide it.

## Next

Hand-label the 40 clips that `score.py windows` picks (half where the engines
disagree most, half random), then `score.py report` adds hand-label miss and false
rates for criteria 1, 3 and 9, and the decision is written here.

## Reproduce

From `audelin/docs/research/vad`:

1. `swift build -c release --product audelin-vad` in `../spike`.
2. `uv sync`, then `./run.sh "<call folder>"...` (writes `work/`, gitignored).
3. `uv run python score.py sweep`, `./run-gated.sh`, `uv run python score.py report`.
4. `uv run python score.py windows` writes `labels.csv`; clips are cut to `clips/`.
   Both stay local because they hold call audio and names.
