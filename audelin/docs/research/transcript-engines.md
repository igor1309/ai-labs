# Final-pass engines and language settings (LAB-1689)

**Parakeet v3 over the whole track reads Russian best wherever the audio is
not studio-clean, and writes almost nothing where nobody speaks.** Whisper
large-v3-turbo with `ru` reads clean read speech better and keeps more Latin
names in Latin, but on long audio with pauses it falls into loops (one line
654 times in a track) and on short or distant speech it writes subtitle
credits that are not in the audio. Its own VAD stops the loops and costs it
far-field speech. Language detection gains nothing over `ru`.

Production's 4 s windows lose to one pass over the whole track on every
measure: 12.6 % against 7.1 % WER on long tracks, and 252 against 18 words
per hour written into silence.

**Open: the owner's calls.** The same five setups are being run over 16
recorded calls; the call-side tables below are filled when that run ends.
The recommendation stands on the public sets until then.

## Candidates

| Name | Engine and setting |
|---|---|
| pk-windows | Parakeet v3 (FluidAudio 0.17.7) in Audelin's windows: a 4 s chunk with 2 s of context on each side, a fresh decoder per window, keeping the words whose middle lies in the chunk. Production's final pass. |
| pk-whole | Parakeet v3, one `AsrManager.transcribe` call over the whole file |
| wh-ru | Whisper large-v3-turbo q5_0 (Amanu's model file), whisper.cpp 1.9.5 `whisper-cli`, `-l ru`, default decoding (beam 5) |
| wh-auto | the same with `-l auto` |
| wh-ru-vad | wh-ru reading only what whisper.cpp's Silero VAD v6.2.0 marks as speech, default VAD settings |

FluidAudio's Parakeet `ru` hint is left out: it filters Latin tokens
(`tests.md` run 2).

## Data

Public sets with human transcripts:

| Set | What it is | Clips |
|---|---|---:|
| FLEURS ru test | read Wikipedia sentences; transcripts keep case, punctuation and Latin names (70 Latin words in 42 clips: PC, Apple, ASUS, USOC, GBP…) | 775 |
| Golos crowd test | requests recorded on phones, seeded sample from the first shard | 398 |
| Golos far-field test | requests to a smart speaker at one to several metres, seeded sample | 400 |
| long | FLEURS clips joined into 12 tracks of about 25 minutes, 60 clips each, with gaps of 0.5 to 60 s of quiet noise (−65 dBFS RMS, a muted microphone's floor); 5.3 h | 12 |

Two Golos crowd clips without a transcript are left out. The long tracks test
what short clips cannot: reading a long recording as the final pass does, and
text written where nobody speaks.

The owner's calls: the 16 calls recorded by both Audelin and Amanu that
LAB-1688's spike reads (2026.10.29-1525, an English test, left out), both
tracks, 21 h of audio. They have no reference text; they are measured with
levels and reference Silero as in `transcript-language.md`.

## Method

WER is scored after normalising both sides: lower case, ё → е, digits spelled
out in Russian, punctuation and hyphens dropped. Golos spells numbers out and
Whisper writes digits, so WER is also given on the clips where no engine
wrote a digit; the order of the engines does not change.

- **Latin words not in the reference**, per 1,000 reference words: Latin
  script the engine wrote where the reference has none: wrong-language or
  invented words.
- **Latin names kept**: of FLEURS's 70 Latin reference words, how many the
  engine writes as the same Latin word.
- **Words in gaps**: words whose middle lies in a long-track gap at least
  0.5 s from any clip, per hour of gap. Whisper words are timed by spreading
  each segment's span over its words.
- **Repeats**: the most times one Whisper segment's text repeats in a track.
- **Cost**: wall time and peak memory of one process over the whole set from
  `/usr/bin/time -l`, on an M3 Max, 36 GB. The models load once per set.

## Results

### WER

| Set | pk-windows | pk-whole | wh-ru | wh-auto | wh-ru-vad |
|---|---:|---:|---:|---:|---:|
| FLEURS | 7.0 % | 6.0 % | **4.3 %** | 4.4 % | 4.6 % |
| Golos crowd | 4.9 % | **4.4 %** | 14.0 % | 14.4 % | 21.4 % |
| Golos far-field | 11.2 % | **10.6 %** | 19.6 % | 20.6 % | 47.0 % |
| long | 12.6 % | **7.1 %** | 110.7 % | 103.6 % | 8.1 % |

On clips where no engine wrote a digit (608, 333 and 391 clips):

| Set | pk-windows | pk-whole | wh-ru | wh-auto | wh-ru-vad |
|---|---:|---:|---:|---:|---:|
| FLEURS | 5.7 % | 4.9 % | **3.4 %** | 3.5 % | 3.6 % |
| Golos crowd | 5.1 % | **4.8 %** | 14.1 % | 14.7 % | 23.3 % |
| Golos far-field | 11.6 % | **11.1 %** | 19.9 % | 21.0 % | 48.1 % |

### Latin words not in the reference, per 1,000 reference words

| Set | pk-windows | pk-whole | wh-ru | wh-auto | wh-ru-vad |
|---|---:|---:|---:|---:|---:|
| FLEURS | 1.6 | 1.2 | 1.5 | 1.5 | 1.9 |
| Golos crowd | 0.0 | 0.0 | 9.4 | 18.3 | 12.4 |
| Golos far-field | 24.8 | 24.8 | 7.1 | 26.5 | 5.3 |
| long | 32.9 | 4.6 | 26.2 | 31.3 | 1.3 |

### Latin names kept in Latin (FLEURS, of 70)

| pk-windows | pk-whole | wh-ru | wh-auto | wh-ru-vad |
|---:|---:|---:|---:|---:|
| 18 | 25 | 36 | 36 | **41** |

### Long tracks: text where nobody speaks

| Measure | pk-windows | pk-whole | wh-ru | wh-auto | wh-ru-vad |
|---|---:|---:|---:|---:|---:|
| words in gaps, per hour of gap | 252 | **18** | 2,999 | 3,031 | 901 |
| most repeats of one line in a track | 0 | 0 | 654 | 654 | 2 |

### Language detection

`-l auto` took 27 of 1,585 clips for another language (1 FLEURS, 13 Golos
crowd, 11 far-field, 2 long tracks), and its WER is never below `-l ru`'s.

### Cost on this Mac, long tracks

| Engine | minutes per hour of audio | peak memory |
|---|---:|---:|
| pk-windows | 0.8 | 0.42 GB |
| pk-whole | **0.2** | 0.55 GB |
| wh-ru | 3.7 | 1.43 GB |
| wh-auto | 3.7 | 1.45 GB |
| wh-ru-vad | 1.0 | 1.45 GB |

## Findings

- **Whisper invents text on silence and on short clips.** On the long tracks
  it writes the line "Корректор А.Кулакова" hundreds of times over gaps; on
  Golos clips it writes "Редактор субтитров А.Семкин Корректор А.Егорова" or
  "Субтитры создавал DimaTorzok" over real requests. These are subtitle
  credits from its training data, the same lines LAB-1688 found in Amanu's
  transcripts.
- **Whisper's VAD trades one failure for another.** It removes the loops and
  two thirds of the gap text, and keeps the most Latin names, but its WER on
  far-field speech goes from 19.6 % to 47 %: the VAD drops quiet, distant
  speech.
- **Whisper reads clean speech and names better.** On FLEURS it is about
  1.5 points better than pk-whole and keeps 36 to 41 of 70 Latin names
  against 25.
- **Windows cost Parakeet on long audio.** pk-windows writes 14 times as many
  words into silence as pk-whole and has 5.5 points more WER on the long
  tracks; on short clips the two are within a point. This matches LAB-1101's
  13-point windowing gap.
- **Parakeet over the whole track is the cheapest**: 5 times faster than
  Whisper with its VAD and 18 times faster than without, in less than half
  the memory.

## Recommendation

- **v3 final pass: Parakeet v3 over the whole track**, replacing the 4 s
  windows. It is best or close to best on every set, cheapest, and the only
  setup that writes almost nothing into silence without a VAD.
- **LAB-1122 (rebuild with another engine):** Whisper `ru` is not a safe
  default rebuild: without a VAD it loops on long recordings, with one it
  loses distant speech. It could be offered for clean recordings heavy with
  English names, behind its VAD; language detection is not worth offering.
- **Not settled here:** English terms in conversational speech (RACI, OKR,
  SLA). FLEURS names are read, not spoken in Russian sentences as on calls;
  the call measures below count acronyms per engine but have no reference.

## Calls

Pending the run over the 16 calls: per engine and side, per hour of track,
words on no speech (other side speaking, silence), Latin words and acronyms
on own speech, and cost.

## Limits

- **Public sets are not calls.** Read sentences and smart-speaker requests,
  not conversation with code-switching; the long tracks' gaps are synthetic
  noise, not a real muted microphone or far-side leakage.
- **One decoding setup per engine.** whisper.cpp defaults (beam 5, full text
  context); `--max-context 0` or a stricter no-speech threshold might reduce
  loops, and was not tried.
- **Gap timing for Whisper is approximate**: words are spread over their
  segment's span, so a few words near a gap's edge may be misplaced. The
  0.5 s margin and the size of the gap counts make this minor.

## Reproduce

From `audelin/docs/research/transcript-engines`, with `ffmpeg`,
`/opt/homebrew/bin/whisper-cli` and Amanu's
`ggml-large-v3-turbo-q5_0.bin`:

```sh
./fetch.sh                   # public sets and the whisper.cpp VAD model, into work/
uv run python build.py       # work/sets/: 16 kHz WAVs, refs.json, long tracks
./calls.sh                   # the owner's calls as WAVs, and reference Silero
./run.sh                     # every candidate over every set; resumable
uv run python score.py       # results.md, results.json
```

`run.sh` builds `audelin-final` from `../spike` and skips sets already done.
`work/` holds audio and call text and stays local; the committed
`results.md` and `results.json` hold counts only.
