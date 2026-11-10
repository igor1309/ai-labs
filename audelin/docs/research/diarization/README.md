# Diarization measurements

Scripts behind [`../diarization.md`](../diarization.md): which speaker-diarization
model Audelin should run on the call track, and how well it works. Audio and model
outputs go under `work/`, which is not committed.

| File | What it does |
|---|---|
| `run.sh ami\|calls\|synth` | runs `audelin-diarize` (from `../spike`) on a set and writes `work/<set>/<name>.<system>.json` |
| `score.py` | DER (miss, false alarm, speaker error) against an RTTM, speaker counts, and the summary tables |
| `synth.py` | builds synthetic Russian group calls whose speaker turns are known by construction |
| `fetch-voxforge.sh` | downloads the VoxForge Russian speakers `synth.py` uses |
| `synth-night.sh` | the synthetic-call measurement end to end: fetch, build, run, score |

## Synthetic Russian group calls

The owner's calls have no speaker labels, so no DER can be measured on them. The
synthetic set gives a reference without labelling anything by hand: calls of 2–6
speakers, 10–20 minutes each, made from read speech with known speakers.

- **Voices**: 49 Russian speakers. 17 are audiobook readers from Russian
  LibriSpeech (RuLS, [OpenSLR 96](https://www.openslr.org/96/), public domain,
  LibriVox). 32 are volunteers from
  [VoxForge Russian](http://www.repository.voxforge1.org/downloads/Russian/Trunk/Audio/Main/16kHz_16bit/)
  (GPL), each on their own microphone: every named speaker with 3 or more
  submissions. VoxForge speakers have only a few minutes of audio each, so a
  speaker whose audio runs out within a call is heard again, reshuffled. In about
  a quarter of the calls, one speaker
  reads English instead ([LibriSpeech test-clean](https://www.openslr.org/12/),
  CC BY 4.0), since real calls mix both languages.
- **Turn-taking**: the turn lengths, pauses, short back-channel turns and overlap
  come from AMI train and dev meetings (the forced-alignment RTTMs in
  [`nttcslab-sp/diar-forced-alignment`](https://github.com/nttcslab-sp/diar-forced-alignment)),
  remapped from 4 speakers to the call's 2–6. A turn under 0.6 s gets one short burst
  of the reader's speech, standing in for "да" or "угу".
- **Line**: each speaker's track goes through Opus in VoIP mode (12–32 kbps),
  0–5 % lost 20 ms frames, their own gain (±8 dB) and noise (15–35 dB SNR), and
  then all tracks are mixed.
- **Reference**: the RTTM marks each speaker's placed speech in 10 ms frames, with
  gaps under 0.25 s bridged. The details are in the docstring at the top of
  `synth.py`.

Seed 1130 with 6 calls per speaker count gives the set the report uses: 30 calls,
about 7.5 hours. Each call is seeded from the main seed and its own name, so a call
can be rebuilt alone (delete its `.rttm` and rerun `synth.py`).

Read speech is cleaner than real conversation: there are no hesitations, no
laughter and no crosstalk beyond the overlap built in. Treat the figures as a
best case.

### Run it

From this directory:

```sh
./synth-night.sh
```

The first run downloads about 9.6 GB (RuLS is 9.1 GB) into `work/Datasets/`. It
needs `ffmpeg` built with libopus, `uv`, Swift and network access. Every step
skips work that is already done, so a run that stops resumes where it left off.
Do not run other CPU-heavy benchmarks at the same time; they distort the timings.

It writes:

- `work/synth/n<speakers>-<k>.{f32,rttm,json}`: each call's audio, its reference
  RTTM, and how it was built.
- `work/synth/*.{nemotron,vbx}.json`: the model outputs.
- `work/synth-summary.md` and `work/synth-summary-collar0.md`: the tables, with a
  0.25 s collar and with no collar.
- `work/synth-summary.json`: the per-call figures (the last run's collar).

Running steps by hand: `uv run python synth.py [--seed N] [--per-count K]`,
`./run.sh synth`, then `uv run python score.py synth`.
