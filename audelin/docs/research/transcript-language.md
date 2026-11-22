# Non-Cyrillic text in Audelin's final transcripts (LAB-1688)

**On the microphone, most English text is written where nobody spoke.** Half of
the non-Cyrillic words on the owner's side (370 of 736) fall in spans where both
the level and reference Silero find no speech on the microphone. Most of the
other unresolved words lean the same way. Text written on a silent microphone
is almost entirely English: 370 Latin words against 8 Cyrillic. On the call
side, nearly all non-Cyrillic words fall on real speech: about a quarter are
terms Amanu also writes in Latin, a quarter English fillers for Russian
interjections («угу» → "Mm-hmm"), and a third Latin words inside Russian
sentences.

Non-Cyrillic words are 3.4 % of the microphone's words and 1.4 % of the call
side's. This spike measures where they come from. It does not measure Russian
misrecognition, or how much any of this changes the call notes.

## Corpus

Calls recorded by both apps, matched by the `yyyy.MM.dd-HHmm` folder prefix,
where Audelin kept `microphone.caf` and `call.caf` and Amanu kept
`transcript.json`. That gives 16 calls. One (2026.10.29-1525, an English test
recording) is left out: Amanu's text there is only "Thank you." and
"*Sounds of the wind*", so the clocks cannot be aligned. That leaves 15 calls
from 2026-11-10 to 2026-11-18: 21,932 microphone words and 40,843 call-side
words in Audelin's transcripts. Fourteen used AirPods 4 ANC as the
microphone and one used the MacBook Pro microphone, per Amanu's `meta.json`.

## Method

`classify.py` reads each Audelin segment:

- its side: `Me` is the microphone, `Them…` the call track;
- its span, from its start to the next segment on the same side, capped at 30 s;
- the loudest 100 ms frame on both tracks;
- the highest reference-Silero speech probability on its own track
  (`vad.sh`, Silero v6.2.1 ONNX, 32 ms hops);
- Amanu's same-side text over the span. The two clocks are aligned per call
  by shared Russian words of five letters or more; offsets came out at +1 to
  +6 s.

A track has speech over a span only when both signals agree: a frame at
−40 dBFS or above, and Silero at 0.5 or above. The Silero threshold is the
one LAB-1107 found to reject silent windows. When the two disagree, the word
stays unresolved. Each non-Cyrillic word then gets one class:

| Class | Rule |
|---|---|
| speech.term | own-track speech, and Amanu has the same word in Latin on that side within 60 s |
| speech.filler | own-track speech, and the word is a filler ("Mm-hmm", "Okay", "Yeah", "Uh"…) |
| speech.in-russian | own-track speech, and the word sits in a segment with Russian words |
| speech.alone | own-track speech, no Russian word in the segment, and Amanu has Russian there |
| quiet-own.other-speaking | no speech on its own track while the other track has speech |
| quiet-own.silence | no speech on either track |
| unresolved | the two signals disagree, or Amanu has nothing to compare |

Both signals check out on known speech. No Russian-only segment (three or
more Cyrillic words, no Latin) falls in a no-speech span: 0 of 669 on the
microphone and 0 of 1,593 on the call side.

## Results

| Class | Microphone | Call side |
|---|---:|---:|
| speech.term | 72 (10 %) | 162 (27 %) |
| speech.in-russian | 85 (12 %) | 210 (36 %) |
| speech.filler | 59 (8 %) | 151 (26 %) |
| speech.alone | 24 (3 %) | 52 (9 %) |
| quiet-own.other-speaking | 361 (49 %) | 5 (1 %) |
| quiet-own.silence | 9 (1 %) | 0 |
| unresolved | 126 (17 %) | 10 (2 %) |
| **non-Cyrillic words** | **736 of 21,932 (3.4 %)** | **590 of 40,843 (1.4 %)** |

- **Silent microphone.** 125 of 1,018 microphone segments (12 %) have no
  speech by both signals. They hold 370 Latin words and 8 Cyrillic ones.
  The median of their loudest 100 ms frame is −53 dBFS. Most of these spans fall
  while the far side speaks, which is when the owner is silent. None of
  these words reappears on the call side within 5 s, so they are not the
  far side's words heard twice. They spread over 12 of the 15 calls, from
  1 to 63 words per call.
- **Unresolved microphone words lean the same way.** In 106 of the 122
  disagreements the span has a loud frame but Silero finds no speech; in 16
  it is the reverse. Samples of the first kind read like the silent-microphone
  text above ("The weather is sunny today. Please send the report by Friday.").
  They are counted as unresolved, not as silence.
- **Latin inside Russian sentences is mostly terms.** In a seeded random
  sample of 40 of the 295 speech.in-russian words, read against Amanu's
  text:
  - 27 are technical terms or product names, often misheard (C2C, Opera-ID,
    AML, Java, Waterfall, Contact-Center, CSR);
  - 13 are wrong-language or invented words ("Just", "huh", "What do you
    have to talk about if", "gework" for Георг, "Michael" where Amanu has
    «Сходи»).

  On a sample of 40 the term share (68 %) is uncertain by about ±15 points.
- **Real speech written in another language** is speech.filler,
  speech.alone, and about a third of speech.in-russian. That is roughly 110
  microphone words (0.5 % of the side) and 270 call-side words (0.7 %). Most
  are English fillers for «угу», «ага» and «окей», and short invented
  phrases on real but brief speech.
- **The checked lines from 2026.11.18-1500 were not typical.** «Да, уже» →
  "Uh Delva", «Алиса, стоп» → "Alicia, stop." and «Ага» → "Ajá." are real
  speech written in another language. That kind of error is the smaller
  share on the microphone.

## What this says for the next steps

- **A speech gate on the microphone targets the largest source.** A span-level
  reference-Silero gate at 0.5 would remove the 370 silent-microphone words and,
  by construction, keep every Russian-only segment in this corpus. Production
  reads 8 s windows, not transcript segments, so this does not show how a
  windowed gate behaves. LAB-1107's conditions for adoption still stand: hand
  labels, speech crossing window edges, short interjections, persistent state,
  live cost.
- **Terms and wrong-language fillers are a question of engine and language
  setting.** That is LAB-1689. Its reference stretches can start from this
  spike's classes.
- **Amanu is a reference, not ground truth.** Its text over these calls has
  its own invented lines: "Продолжение следует...", «Субтитры сделал
  DimaTorzok» at the end of a call, "Thank you." at a recording's start, and
  long runs of a repeated line.

## Limits

- **Nothing was listened to.** "No speech" means two detectors agree, and
  "terms" rests on reading the text against Amanu's.
- **Choices were made after seeing data.** The −40 dBFS line came from the
  2026.11.18-1500 call. The switch from a 90th-percentile level to the
  loudest frame, the two-signal rule and the same-side span were all made
  after inspecting early runs. The Russian-only check above is the guard
  against overfitting, not a held-out test.
- **Spans are coarse.** Audelin's transcript has segment start times only, so a
  span can be up to 30 s and a long span can catch an unrelated loud frame.
- **Coverage is small.** 15 calls, all but one on AirPods; Amanu kept no
  transcript for 12 more calls with Audelin audio.

## Reproduce

From `audelin/docs/research/transcript-language`, with `ffmpeg` installed and
the `../vad` project synced (`uv sync` there):

```sh
./vad.sh                      # reference Silero per track, into work/vad/
uv run python classify.py     # work/words.csv, work/segments.csv, counts.csv
```

Both read `~/Recordings/Audelin` and Amanu's `~/Recordings`; override them with
`AUDELIN`/`AMANU` for `vad.sh` and `--audelin`/`--amanu` for `classify.py`.
`work/` holds call text and stays local. The committed `counts.csv` has counts
per call and side, with no text.
