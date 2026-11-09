# Speech gating on the reported silent-microphone failures

2026-11-09, LAB-1107. The owner approved a focused evaluation after reporting
English text while remaining silent. **Reference Silero at threshold 0.5 rejects
both reported windows; FluidAudio needs 0.95 to reject both.** At those respective
settings, both retain all 12 speech controls. This supports revisiting the earlier no-VAD decision, but is not
enough evidence to deploy a gate across calls. Production recognition is unchanged.

## Method

FluidAudio 0.17.7 Parakeet v3 and its Core ML Silero VAD were compared with
reference Silero 6.2.1 through ONNX Runtime on the same Mac. Each independent
recognition window is eight seconds, matching a full production window's four
seconds of central audio and two seconds of context on either side. Parakeet uses
a fresh decoder state for each window. This evaluates the reader boundary, not
the app's overlapping-window reconciliation or streaming VAD state.

The gate is deliberately conservative: retain the **entire original window** if
any VAD hop has probability at least the threshold. Otherwise return no words.
There is no cropping, concatenation of speech spans, timestamp compression, or
language filter. Retained outputs reuse the baseline decoding exactly, so they
cannot change because the ASR was called on different samples. Each VAD starts
with fresh state per window; online persistent-state behavior is not measured.

Five negative controls:

- Microphone windows 00:50–00:58 and 01:10–01:18 from the reported call. Labels
  are the owner's report of silence, not an independent acoustic annotation.
  RMS levels are −68.9 and −68.5 dBFS. The offline reader reproduces English
  hallucinations, though the exact phrasing differs from the live transcript.
- Digital zero, and seeded Gaussian noise at −69 and −50 dBFS RMS.

Twelve speech controls: Russian macOS Milena speech, English macOS Samantha speech
including “API”, “pull request” and “deployment”, and the committed human English
“Diff means comparing” fixture. Each source is tested at −30, −45, −55 and −65
dBFS RMS, with a one-second leading pause and additive −69 dBFS Gaussian noise.
Speech level is measured over the full source clip, including source pauses.
The Russian and technical-English prompts are synthetic; these are sensitivity
controls, not representative conversational ground truth. No live audio device
is opened and no call audio is uploaded.

## Results

Baseline: **3/5 negative windows produce text (23 invented words)**. Both real
windows hallucinate (12 and 8 words), as does the −69 dBFS Gaussian noise (3).

| Gate | Threshold | Negative windows producing text | Invented words | Speech windows dropped |
|---|---:|---:|---:|---:|
| None | — | 3/5 | 23 | 0/12 |
| FluidAudio | 0.3 | 2/5 | 20 | 0/12 |
| FluidAudio | 0.5 | 1/5 | 8 | 0/12 |
| FluidAudio | 0.7 | 1/5 | 8 | 0/12 |
| FluidAudio | 0.9 | 1/5 | 8 | 0/12 |
| FluidAudio | 0.95 | 0/5 | 0 | 0/12 |
| Reference Silero | 0.3 | 1/5 | 8 | 0/12 |
| Reference Silero | 0.5 | 0/5 | 0 | 0/12 |
| Reference Silero | 0.7 | 0/5 | 0 | 0/12 |
| Reference Silero | 0.9 | 0/5 | 0 | 1/12 |
| Reference Silero | 0.95 | 0/5 | 0 | 2/12 |

| Input | FluidAudio maximum probability | Reference Silero maximum probability |
|---|---:|---:|
| Reported silence, 00:50–00:58 | 0.476562 | 0.070497 |
| Reported silence, 01:10–01:18 | 0.904297 | 0.367439 |
| Digital silence | 0.098145 | 0.008911 |
| Noise, −69 dBFS | 0.063965 | 0.014897 |
| Noise, −50 dBFS | 0.305176 | 0.109630 |
| Human English, −65 dBFS | 1.000000 | 0.790115 |

All 80 reference speech words remain at FluidAudio 0.3–0.95 and reference Silero
0.3–0.7. Reference Silero 0.9 drops the −65 dBFS human fixture (three reference
words); 0.95 also drops its −55 dBFS version (six reference words total).
The human fixture has five additional baseline words across
two attenuations; gating does not remove those errors inside speech windows.
The twelve controls repeat only three distinct utterances, so zero dropped
controls is weak evidence of general speech recall. Results are targeted failure
reproductions, not a population error-rate estimate. No CPU/latency or live
contention claim follows from this short run.

## Decision

Carry **FluidAudio at 0.95** and **reference Silero at 0.5** into broader
validation. Both remove the reported hallucinations without dropping these
controls. FluidAudio avoids a new runtime dependency; prefer it if broader speech
recall holds at that high threshold. Its 0.90 score on reported silence means
the previously explored 0.3–0.7 range does not solve this incident completely.
For reference Silero, 0.5 keeps more margin than 0.7 below the quiet human
control's 0.79 maximum. Scores are not calibrated across the two engines, so
equal numerical thresholds are not equal operating points. The extra 0.9/0.95
rows were calculated from the same measured traces after inspecting the failures;
this threshold selection is exploratory, not held-out validation.

Do not ship either gate from these 17 windows alone. Before adoption, validate
both candidates on human Russian and mixed-language calls with known speech
intervals, short interjections, speech crossing window edges, realistic room noise
and far-side leakage. Exercise persistent VAD state alongside production window
reconciliation and measure onset/end retention and live contention. Explicitly
account for the new inference dependency and packaging cost. LocalVQE remains a
separate leakage experiment; diarization does not address this reader failure.

## Reproduce

From `audelin/docs/research/spike`, run
`swift build -c release --product audelin-vad`. From the neighboring `vad`
directory, run `uv sync`, then:

```sh
uv run python hallucinations.py --call '<original recording folder>'
```

Requires macOS Milena and Samantha voices and `ffmpeg`. The harness refuses to
truncate a speech source that does not fit. Seed is 1107; TTS and model/runtime
versions can still change exact outputs. Original audio is required to reproduce
the two incident windows. Audio, full ASR text and probability traces stay in
gitignored `work/hallucinations/`. The adjacent committed CSV contains only case
identifiers, probabilities, word counts and gate decisions.
