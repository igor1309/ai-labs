# LocalVQE enhancement on the microphone track (LAB-1102)

Status: measured on 2026-11-09/10 (night run). Recommendation: **final pass
only, with the call track as reference, and only on calls that show bleed.**
Never denoise without a reference; do not run it live.

- **Q1, speakers.** With the call track as its reference, LocalVQE v1.3
  removes far-side words from the microphone transcript almost completely:
  on the public echo set leakage fell from 33.8 % to 1.1 % of far-side words
  and near-end recall rose from 43 % to 78 %; on the one owner recording
  made on speakers, from 15.3 leaked words a minute to 0.0 (denoising alone:
  10.4). It also costs the owner's own words: on the 17 calls without bleed
  it keeps 85 % of the words said while the far side is silent, against 92 %
  for denoising alone. So it pays only where the far side leaks.
- **Q2, headphones or noise.** Denoising without a reference makes Parakeet
  v3 worse in every noisy condition measured, by 0.4–48 WER points, and
  leaves clean speech unchanged. On real far-field room recordings (VOiCES)
  WER doubles or more. On headphone calls no pass should run.
- **Q3, cost.** After the call: 28.7× real time on the CPU, 5 % of one core
  per second of audio, so a 1-hour call takes about 2 minutes (3 minutes of CPU over several cores); model 20 MB
  (v1.3). Live: the 16 ms model keeps up beside live recognition without
  moving its lag, but takes 30 % of a core for the whole call, more than both
  recognisers together.

The recommendation follows: the benefit exists only where there is bleed,
and there the final pass is cheap; a pass without bleed or without a
reference harms Parakeet; live costs more than recognition itself, for a
case (speakers) that 1 of the owner's 18 recordings shows, a test call.
Gate the pass on bleed measured from the call's two transcripts (below),
then transcribe the cleaned microphone again for the saved transcript.

## What was measured, on what data

| Data | Labels | What it gives |
|---|---|---|
| Microsoft AEC Challenge synthetic set, 200 files (165 scored), via FluidAudio's `enhance-benchmark` | machine: the benchmark transcribes the clean near-end file with Parakeet and uses that as reference | near-end word recall, WER and far-end leakage, with and without reference |
| LibriSpeech test-clean (120 utterances, English), FLEURS ru (120, Russian) | human transcripts | WER clean, and with DEMAND cafeteria and meeting-room noise mixed at 10 and 0 dB SNR |
| VOiCES devkit subset (226 clips) | human transcripts | WER on real far-field room recordings with no, babble, music and TV distractors |
| The owner's calls in `~/Recordings/Audelin`, 18 calls, 249 min | none | leaked far-side words (matched against the call track's transcript), owner-only word retention, envelope bleed, CPU and RTF |

Every WER figure below comes from public sets with human references, except
the AEC set's, whose references are Parakeet's own output on the clean
near-end audio. No figure on the owner's calls is a WER: they have no
transcript to score against.

Engine: FluidAudio 0.17.7 `LocalVqeManager`, CPU only (`.cpuOnly`), whole
file in 256 ms chunks, model v1.3 unless stated. Recogniser: Parakeet v3
(`AsrModels.downloadAndLoad(version: .v3)`). Mac: M3 Max, 14 cores, 36 GB,
macOS 26.6.2.

## Q1: does the reference remove far-side leakage without losing the owner?

### Public echo set

Microsoft AEC Challenge synthetic (far-end echo mixed with near-end speech at
several signal-to-echo ratios, SER). 35 of 200 files have an empty near-end
reference and are left out of every condition.

| Condition | Near-end recall | WER | Far-end leakage |
|---|---:|---:|---:|
| unprocessed | 42.8 % | 111.7 % | 33.8 % |
| v1.3, with reference | **77.7 %** | **28.9 %** | **1.1 %** |
| v1.3, with reference, 16 ms realtime export | 78.2 % | 28.3 % | 1.1 % |
| v1.3, no reference | 40.9 % | 101.1 % | 23.7 % |
| v1.2, with reference | 73.2 % | 34.3 % | 1.1 % |
| v1.2, no reference | 43.6 % | 100.5 % | 25.7 % |

By SER: where echo is as loud or louder than the user (SER ≤ 0 dB, 94 files)
v1.3 with reference lifts recall from 34.6 % to 74.6 % and cuts leakage from
39.9 % to 1.7 %; where the user is louder (71 files), 54.5 % → 82.2 % and
26.5 % → 0.3 %. Without a reference the model barely touches the echo
(leakage 33.8 → 23.7 %): the reference does the work. v1.3 beats v1.2 by
4.5 recall points at the same leakage, at 28× real time against 45×.

### The owner's calls

18 recordings, 249 minutes: Zoom, Telemost in Yandex Browser, dailies, a
planning call, 1:1s and short test calls. The microphone was run through
LocalVQE twice, with the call track as reference and with a silent one, and
Parakeet v3 transcribed the call track and all three microphone versions.

- **Leaked words**: microphone words that the call track's transcript also
  has within 2 s, two or more in a row. The same count against the call
  transcript shifted by ±60 s (chance) is 0.03 per minute overall.
- **Owner words kept**: raw microphone words with no call-track word within
  3 s (the owner speaking while the far side is silent), and the share of
  them the enhanced transcript still has (same word within 0.5 s). It is a
  proxy for losing the owner's words, not a WER.

| Call | min | Mic words | Leaked/min raw | with ref | no ref | Owner words | kept, ref | kept, no ref |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 10-27 test (mic only) | 2.6 | 75 | 0.0 | 0.0 | 0.0 | 75 | 29 % | 29 % |
| 10-29 Zoom test, **speakers** | 3.7 | 289 | **15.3** | **0.0** | 10.4 | 192 | 77 % | 77 % |
| 10-29 Zoom test | 6.7 | 149 | 2.1 | 0.0 | 2.4 | 78 | 81 % | 80 % |
| 10-29 Zoom | 9.2 | 828 | 0.0 | 0.0 | 0.0 | 798 | 87 % | 95 % |
| 10-29 Zoom | 2.2 | 56 | 0.0 | 0.0 | 0.0 | 18 | 56 % | 72 % |
| 11-05 daily | 7.6 | 397 | 0.3 | 0.3 | 0.3 | 244 | 85 % | 94 % |
| 11-05 1:1 | 12.0 | 960 | 0.2 | 0.2 | 0.2 | 586 | 94 % | 94 % |
| 11-05 planning | 37.0 | 167 | 0.1 | 0.1 | 0.0 | 81 | 91 % | 88 % |
| 11-06 daily | 12.4 | 623 | 0.3 | 0.3 | 0.3 | 357 | 86 % | 94 % |
| 11-06 1:1 | 41.3 | 3570 | 0.5 | 0.4 | 0.4 | 2226 | 84 % | 93 % |
| 11-09 daily | 7.5 | 390 | 0.3 | 0.0 | 0.0 | 231 | 84 % | 94 % |
| 11-09 status call | 58.4 | 762 | 0.1 | 0.0 | 0.0 | 352 | 92 % | 94 % |
| 6 calls with the microphone muted or silent | 48.1 | 0–43 | ≤ 0.4 | 0.0 | 0.0 | 0 | – | – |
| **17 calls without bleed** | 245 | 8060 | 0.23 | 0.11 | 0.17 | 5046 | **85 %** | **92 %** |

- **The owner nearly always wears headphones.** Only one recording, a
  3.7-minute Zoom test on speakers, has real bleed (15 leaked words a
  minute); one more test shows a trace (2.1 a minute). On every real call
  the leaked count is 0.0–0.5 a minute, a few times the chance rate.
- **With the reference, the bleed goes**: 15.3 → 0.0 leaked words a minute,
  where denoising alone leaves 10.4. On that call the owner keeps 77 % of
  their words either way.
- **Without bleed, the reference pass costs the owner's words**: it keeps
  85 % of them against 92 % for denoising alone. On the 9-minute Zoom call
  it dropped 106 of 798, ordinary content words ("российские учредители",
  "международное", "юрлицо"), not hallucinations. So a pass must run only
  where bleed is measured.
- **The test recording with no far side** lost 53 of 75 words in both
  versions: a reading of a test phrase stayed, while later, louder Russian
  speech was suppressed by 40–55 dB. Whether that was the owner away from
  the microphone or another voice in the room is unknown without listening.
- **A cheap probe for bleed is not the envelope correlation.** The peak
  correlation of the two tracks' 10 ms energy envelopes is 0.02 on the
  speaker call and up to 0.45 on headphone calls, so it cannot gate. The
  leaked-word count from the two final transcripts, which the app already
  has after a call, separates the speaker call (15.3) from every real call
  (≤ 0.5) by a factor of 30. MacParakeet and Amanu gate on a
  cross-correlation delay estimate instead.

## Q2: does denoising help Parakeet on headphones or in noise?

LocalVQE v1.3 with a silent reference (pure denoising) on public speech with
human transcripts. WER is over the whole set; "better / worse" counts
utterances.

| Set | Language | Condition | Utterances | WER raw | WER denoised | Δ pt | better / worse |
|---|---|---|---:|---:|---:|---:|---:|
| LibriSpeech | en | clean | 120 | 2.1 % | 2.0 % | −0.2 | 5 / 2 |
| LibriSpeech | en | cafe 10 dB | 120 | 2.6 % | 4.0 % | +1.4 | 7 / 19 |
| LibriSpeech | en | cafe 0 dB | 120 | 7.0 % | 25.8 % | +18.8 | 3 / 84 |
| LibriSpeech | en | meeting room 10 dB | 120 | 4.0 % | 4.3 % | +0.4 | 11 / 16 |
| LibriSpeech | en | meeting room 0 dB | 120 | 14.5 % | 22.3 % | +7.9 | 14 / 61 |
| FLEURS | ru | clean | 120 | 5.4 % | 5.4 % | 0.0 | 6 / 7 |
| FLEURS | ru | cafe 10 dB | 120 | 8.1 % | 14.1 % | +6.0 | 14 / 63 |
| FLEURS | ru | cafe 0 dB | 120 | 27.9 % | 76.3 % | +48.4 | 1 / 114 |
| FLEURS | ru | meeting room 10 dB | 120 | 7.8 % | 12.9 % | +5.1 | 13 / 57 |
| FLEURS | ru | meeting room 0 dB | 120 | 27.3 % | 55.2 % | +27.9 | 8 / 102 |
| VOiCES | en | far field, quiet | 63 | 3.6 % | 7.1 % | +3.5 | 6 / 38 |
| VOiCES | en | far field, babble | 49 | 3.7 % | 16.3 % | +12.5 | 3 / 34 |
| VOiCES | en | far field, music | 66 | 3.6 % | 10.2 % | +6.6 | 3 / 47 |
| VOiCES | en | far field, TV | 48 | 4.7 % | 10.7 % | +6.0 | 5 / 35 |

- **Denoising never helps Parakeet here.** It is neutral on clean speech and
  worse in all twelve other conditions. Parakeet v3 is trained on noisy
  speech, and the denoiser's distortion costs it more than the noise did. In
  cafe noise at 0 dB the denoised speech frames sit a median 4.0 dB below
  the clean original in Russian (1.2 dB in English): part of the speech is
  suppressed with the noise. At 10 dB the loss is 0.3–0.5 dB, and WER still
  rises.
- **Russian suffers most**: +5 to +48 points against +0.4 to +19 for English
  at the same SNR.
- **Real rooms**: on VOiCES, recorded by distant microphones, denoising
  doubles WER even with no distractor. A laptop's built-in microphone a
  metre from the owner is closer to this than to close-talk LibriSpeech.
- The only case for a pass on headphone calls would be a gain, and there is
  none, so the answer to Q2 is no.

## Q3: cost, and live or final pass

### Final pass (whole file, 256 ms chunks, CPU)

| Measure | v1.3 | v1.2 |
|---|---:|---:|
| Speed, public sets (245.8 min of audio) | 28.4× | — |
| Speed, AEC set | 27.9× | 45.2× |
| Speed, owner's calls (249 min, with reference) | 28.7× | — |
| CPU per second of audio | 4.95 % of one core | — |
| Peak memory | 291 MiB footprint for a 9-minute call, with the whole file in memory (input, reference and output arrays, 106 MB of it, grow by 11.5 MB a minute); a streamed render holds only the model | — |
| Model download | 20 MB | 5.3 MB |
| Model load | 0.05 s warm | — |

A 1-hour call takes about 2 minutes after it ends, using about 1.4 cores
(178 s of CPU). MacParakeet, running LocalVQE v1.4, measures 11.7–12.6× real time and
about 230 KB of resident memory per second of meeting, and caps the wait
before final transcription at 600 s.

### Live

LocalVQE's realtime export (v1.3, 16 ms chunks) fed 10 ms blocks at the wall
clock, beside the live-transcription baseline (`macos/Benchmarks/Baseline`:
the app's composition with two real Parakeet v3 recognisers at 1×, no
devices). Input: 5 minutes from one of the owner's dailies, its microphone
and call tracks on the two sides. Run A is the baseline alone, run B the
baseline with live LocalVQE in a second process.

| Measure | A: baseline alone | B: baseline + live LocalVQE |
|---|---:|---:|
| Baseline CPU, share of one core | 23 % | 18 % (run-to-run noise; the 2026-11-03 runs spread 11–15 %) |
| LocalVQE CPU, share of one core | – | **30.5 %** |
| Recognisers at most behind | 1.1 s | 2.7 s |
| Final text trails, per-minute means | 2.3–2.7 s | 2.3–2.7 s |
| Newest word trails, per-minute means | 1.3–1.7 s | 1.3–1.7 s |
| Peak footprint, baseline | 186 MiB | 187 MiB |
| LocalVQE time per 10 ms block, p50 / p99 / max | – | 3.5 / 7.2 / 31 ms |
| LocalVQE finished behind the audio | – | 9 ms |

The load average before each run was 3–4 (other work on the Mac). Live
LocalVQE keeps up and leaves recognition's lag unchanged, apart from one
1.6 s worse peak, so it *could* run live. But it costs 30 % of a core
continuously, more than both recognisers together, to clean a track that
is clean on every real call the owner recorded. Quality does not rule live out: on
the public echo set the 16 ms model scores as the 256 ms one does (recall
78.2 %, WER 28.3 %, leakage 1.1 %). Cost and need do.

## How other open-source recorders handle bleed

- **MacParakeet** (moona3k/macparakeet, `spec/adr/028-meeting-echo-cancellation.md`):
  echo cancellation **after Stop**, writing a derived `microphone-cleaned`
  file and keeping the raw one. It uses LocalVQE's **echo-only v1.4** variant,
  chosen by a scoring test against the joint denoise-and-echo v1.2, because
  echo-only "minimizes distortion of the speech being transcribed". An echo
  probe over the reference's energy skips the render when there is no echo
  path (headphones, or the far side inaudible), measured from the audio, not
  from the output route. It reads the reference 20 ms early, which took one
  speakerphone meeting from about 1 dB to about 22 dB of cancellation; in
  its tests 2.5 ms of misalignment destroys cancellation. Apple's
  voice-processing I/O was rejected because it ducks and processes the
  user's voice live. Final transcription waits for the render with a
  duration-scaled deadline and falls back to the raw microphone with a
  logged reason.
- **Amanu** (gsamat/amanu): offline echo cancellation with LocalVQE
  v1.4-AEC (GGML, echo only, noise suppression off), a GCC bulk-delay
  estimate and a skip when the reference is silent. On its 9 recordings,
  words heard on both tracks fell from 532 to 39 with Parakeet; own-side
  proxy WER fell from 41.2 % to 33.4 %, though deletions rose and one real
  answer from the user was lost.
- **Meetily** reportedly lowers system audio rather than cancelling echo
  (from its public descriptions, not read in source).

Two independent projects with measurements reached the same shape: offline,
reference-driven, echo-only, skipped when there is no echo path. These
measurements support offline, the reference and the skip directly. Echo-only
could not be tried: FluidAudio 0.17.7 ships only the joint v1.3 and v1.2
models, not v1.4. The joint model's denoising is what harms Parakeet (Q2),
and the pass with a reference takes owner words where there is no bleed
(85 % kept against 92 %), which an echo-only model may not.

## What still needs hand labels

- **WER of the owner's own words on speaker calls**, raw and enhanced: the
  retention figure above is a proxy (same word, same time), not a WER, and
  cannot tell a lost owner word from a dropped hallucination.
- **Which microphone words are leaked**: the leakage count matches words
  heard on both tracks; it misses leaked words the call track's recogniser
  got wrong and counts the owner repeating the far side's words.
- **Double talk**: the owner and the far side speaking at once, the case
  where an echo canceller most often eats the near end. The AEC set covers
  it synthetically; no owner call is labelled for it.
- **Other voices in the room**: whether the louder Russian speech the
  mic-only test recording lost was the owner, who should be kept, needs a
  listener.

## Before adopting

- Prefer an echo-only model if FluidAudio adds one, and rerun this set; the
  harm measured here is the denoiser's.
- Gate the pass on bleed measured from the two tracks, as MacParakeet does,
  not on the output device.
- Check the alignment of the two tracks in Audelin's recordings; a few
  milliseconds of offset decides whether cancellation works.

## Reproduce

From `audelin/docs/research`: build the spike (`swift build --package-path spike -c release`),
then in `enhance/` `uv sync`, `uv run python labelled.py build <LibriSpeech test-clean>
<FLEURS ru> <VOiCES> <DEMAND>`, `uv run python labelled.py lists`,
`./run.sh "<call folder>"...` (labelled sets, then each call), and
`uv run python labelled.py score` and `uv run python calls.py`. The AEC set:
`fluidaudiocli enhance-benchmark --no-reference` and `--chunk 16ms --variants v1.3`, from FluidAudio's checkout. The live
test: `audelin-enhance live <mic.f32> <call.f32> 300` beside
`macos/Benchmarks`' `AudelinBaseline`. Outputs go under `enhance/work/`,
which is not committed.
