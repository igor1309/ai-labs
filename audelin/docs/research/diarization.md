# Speaker diarization on the call track (LAB-1103)

Status: measured on 2026-11-09/10 (night run). Recommendation: **after the
call, with Nemotron 3 `fast128`** (FluidAudio's `Nemotron3Diarizer`), on the
call track only; the microphone stays "Me". Not live. VBx
(`OfflineDiarizerManager`) is the runner-up and the fallback.

- **Q1, how often.** VBx and Nemotron both find more than one remote
  speaker on 10 of the owner's 16 recordings with speech on the call track:
  dailies 2–4, planning and status calls 4–5, 1:1 and family calls 1. So
  most calls need it. (Unlabelled: the systems' own counts.)
- **Q2, offline.** On the 16 AMI test meetings VBx's DER is 12.9 % with
  overlapped speech left out and 16.2 % with it included; speaker error,
  the part diarization itself decides, is 2.3 % and 2.5 %, and it counts
  the speakers right in 15 of 16 meetings. Nemotron, scored the same way,
  is far better: 2.7 % and 3.6 %, speaker error 0.2 % and 0.4 %, the right
  count in 16 of 16.
- **Q3, live LS-EEND.** It never changes a label once shown: over 34
  recordings and three models, 0 changes, each 100 ms frame labelled 1.0 s
  after its audio. It runs beside live Parakeet at 6 % of one core without
  moving Parakeet's lag. But its labels are wrong far more often: with the
  general (DIHARD III) model speaker error is 16.6 % on AMI, against 2.3 %
  for VBx and 0.2 % for Nemotron, and it counts right in only 7 of 16
  meetings, usually one speaker short. On the owner's dailies it shows one
  speaker where VBx and Nemotron find two to four.
- **Q4, cost.** Nemotron: 325× real time, about 11 s for a 1-hour call,
  model 193 MB, peak footprint 815 MiB on a 58-minute call. VBx: 195–246×,
  about 15–18 s per hour, 21 MB, 1.39 GiB on the same call. LS-EEND: 87–94×
  offline, 6 % of a core live, 43 MB per model, 122–140 MiB.

The recommendation follows: after the call there is time for the best
model, and Nemotron is both the most accurate and the fastest. LS-EEND is
cheap and stable live, but a live label that is wrong for one word in six,
merges people, and is then replaced by different labels after the call is
worse than no live label. "Both" would show the user exactly that.

## What was measured, on what data

| Data | Labels | What it gives |
|---|---|---|
| AMI meeting corpus, 16 test meetings (EN2002, ES2004, IS1009, TS3003; 9 h), headset mix | human forced-alignment RTTMs (`nttcslab-sp/diar-forced-alignment`); AMI's manual segment annotations (1.6.2) for FluidAudio's own VBx and legacy runs | DER (miss, false alarm, speaker error) with overlap left out and included; speaker-count accuracy; cost |
| The owner's calls in `~/Recordings/Audelin`, the call track of 18 recordings (249 min; 16 with speech) | none | speaker counts, label switches per minute, agreement between systems, cost, peak memory |
| One owner daily, 5 minutes, both tracks | none | live LS-EEND beside live Parakeet: CPU, latency and Parakeet's lag |

Every DER here is on AMI: English meetings recorded in a room, close-talk
headsets mixed to one channel. No figure on the owner's calls is a DER;
they have no reference. The owner's call track is Russian VoIP audio of
remote people, each on their own microphone and codec. VoxConverse's audio
now needs a login, and no public Russian conversational set with speaker
labels was found, so none of the DERs is on Russian or on call audio.

Scoring (`diarization/score.py`): 10 ms frames, 0.25 s collar around each
reference boundary, one-to-one speaker mapping that maximises matched time.
"Overlap left out" removes frames where two reference speakers talk at once
(how FluidAudio's published numbers are scored); "included" keeps them,
which is what a user sees. Engine: FluidAudio 0.17.7. Mac: M3 Max, 14 cores,
36 GB, macOS 26.6.2.

## Q2: offline VBx and Nemotron, and LS-EEND scored the same way

| System | DER, overlap left out | miss / FA / SE | DER, overlap included | miss / FA / SE | Count right | Count right, speakers ≥ 5 % | RTFx |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Nemotron 3 `fast128`** (`Nemotron3Diarizer`) | **2.7 %** | 1.2 / 1.3 / **0.2** | **3.6 %** | 1.8 / 1.3 / **0.4** | 16/16 | 14/16 | 325× |
| VBx (`OfflineDiarizerManager`) | 12.9 % | 0.8 / 9.8 / 2.3 | 16.2 % | 4.6 / 9.1 / 2.5 | 15/16 | 14/16 | 195× |
| LS-EEND, DIHARD III model | 25.0 % | 4.1 / 4.3 / 16.6 | 26.2 % | 5.0 / 4.6 / 16.6 | 7/16 | 4/16 | 87× |
| LS-EEND, CALLHOME model | 46.0 % | 13.2 / 12.9 / 19.9 | 46.1 % | 13.8 / 12.3 / 20.0 | 6/16 | 8/16 | 90× |
| LS-EEND, AMI model (trained on AMI) | 17.4 % | 1.3 / 10.5 / 5.6 | 18.2 % | 2.2 / 10.1 / 5.9 | 15/16 | 11/16 | 94× |

Pooled over the 16 meetings (errors summed, divided by the total reference
speech). LS-EEND's rows are its final labels; the labels it first showed
live are identical (Q3).

With no collar (`COLLAR=0`), overlap included, the same scorer gives VBx
38.5 % (speaker error 6.3 %) and Nemotron 9.5 % (0.8 %). MacParakeet's
matched runs against the same forced-alignment references give 38 % and
9 % (below), so the two measurements agree.

Reference rows, scored by FluidAudio's own benchmark commands (mean over
the 16 meetings, not pooled, so they compare with each other but not with
the table above):

| System | Reference, collar, overlap | DER | miss / FA / SE | Count right | RTFx | Process peak footprint |
|---|---|---:|---:|---:|---:|---:|
| Streaming Sortformer (`sortformer-benchmark`) | forced alignment, none, included | 16.0 % | 7.9 / 5.0 / 3.1 | 16/16 | 27× | 1.1 GB |
| Legacy `DiarizerManager`, streaming 10 s chunks (`diarization-benchmark --mode streaming`) | AMI manual, as FluidAudio scores, left out | 38.2 % | 7.7 / 1.5 / 29.0 | 5/16 | 339× | 9.6 GB |
| VBx (`diarization-benchmark --mode offline`), a check on this scorer | AMI manual, as FluidAudio scores, left out | 9.6 % | 5.4 / 2.0 / 2.2 | 15/16 | 197× | 1.2 GB |

- **FluidAudio's own VBx run agrees with this scorer** where both measure
  the same thing: speaker error 2.2 % against 2.3 %, and the same single
  miscount (2 of 4 speakers in TS3003a). Its miss and false alarm differ
  because the manual annotation marks whole turns, not aligned words.
- **Sortformer** counts right in every meeting, but it has four speaker
  slots, as many as an AMI meeting; the owner's planning and status calls
  have four to six remote speakers. Its 16.0 % at zero collar lies between
  VBx's 38.5 % and Nemotron's 9.5 % from this scorer, though averaged
  per meeting rather than pooled.
- **The legacy streaming diarizer** splits people (it found up to 9 in a
  four-person meeting) and its process grew to 9.6 GB over the run.

What the main table shows:

- **Nemotron's lead is in every part of the error.** Speaker error is a
  tenth of VBx's, and false alarm 1.3 % against 9.8 %: it ends a speaker's
  label in the pauses between words, as the forced-alignment reference
  does, where VBx and two of the three LS-EEND models keep the turn open.
- **Overlap costs VBx 3.3 points**, nearly all as miss: it gives one label
  per frame, so the second voice in an overlap is missed. Nemotron and
  LS-EEND can give two labels at once and lose about 1 point.
- **Speaker count**: Nemotron got 16 of 16 right and VBx 15 (2 of 4
  speakers in TS3003a). LS-EEND's general model found fewer speakers than
  the reference in 8 meetings and one more in one.
- **LS-EEND's AMI model is close to VBx only on AMI**, which it was trained
  on. That is not evidence for the owner's calls; the DIHARD III model,
  trained on a broad mix of domains, is the fair one for unseen audio.
- **LS-EEND's CALLHOME model**, trained on two-speaker telephone calls,
  fails on four-speaker meetings (46 %) and over-splits the owner's calls
  (below).

## Q1: speakers on the owner's calls

Speakers with at least 5 % of each system's speech on the call track
(all speakers in brackets), and label switches per minute for VBx and
Nemotron. Two recordings have no speech on the call track and are left
out (VBx and Nemotron give them no speaker).

| Recording | min | VBx | sw/min | Nemotron | sw/min | LS-EEND DIHARD III | CALLHOME | AMI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 10-29 family call | 3.7 | 1 (1) | 0.0 | 1 (1) | 0.0 | 1 (1) | 1 (1) | 1 (1) |
| 10-29 consult, part 1 | 6.7 | 3 (3) | 1.2 | 3 (4) | 1.9 | 2 (2) | 3 (3) | 3 (3) |
| 10-29 consult, part 2 | 9.2 | 2 (2) | 0.4 | 2 (2) | 1.3 | 2 (3) | 2 (2) | 1 (2) |
| 10-29 consult, part 3 | 9.2 | 1 (1) | 0.0 | 1 (1) | 0.0 | 1 (1) | 1 (2) | 1 (1) |
| 10-29 family call | 2.2 | 1 (1) | 0.0 | 1 (2) | 0.9 | 1 (2) | 1 (2) | 1 (2) |
| 11-05 daily | 7.6 | 2 (2) | 0.3 | 3 (4) | 1.2 | 1 (2) | 1 (2) | 1 (1) |
| 11-05 team call, Telemost | 7.8 | 1 (2) | 0.5 | 1 (3) | 1.5 | 1 (2) | 1 (2) | 1 (2) |
| 11-05 team call, Telemost | 5.8 | 3 (3) | 2.1 | 3 (4) | 4.6 | 3 (3) | 3 (4) | 2 (3) |
| 11-05 1:1 | 12.0 | 1 (1) | 0.0 | 1 (1) | 0.0 | 1 (1) | 2 (2) | 1 (1) |
| 11-05 team call, Zoom | 11.8 | 4 (4) | 2.8 | 5 (7) | 7.4 | 2 (3) | 3 (3) | 2 (3) |
| 11-05 team call, Zoom | 4.2 | 4 (4) | 3.1 | 4 (5) | 5.9 | 3 (4) | 4 (4) | 3 (4) |
| 11-05 planning | 37.0 | 5 (6) | 3.5 | 5 (8) | 7.7 | 2 (4) | 4 (5) | 3 (4) |
| 11-06 daily | 12.4 | 3 (3) | 0.6 | 4 (4) | 1.6 | 1 (2) | 2 (3) | 2 (2) |
| 11-06 1:1 | 41.3 | 1 (1) | 0.0 | 1 (1) | 0.0 | 1 (2) | 2 (2) | 1 (2) |
| 11-09 daily | 7.5 | 3 (3) | 0.8 | 4 (5) | 1.7 | 1 (2) | 2 (2) | 1 (1) |
| 11-09 status call | 58.4 | 4 (6) | 2.9 | 4 (8) | 6.6 | 2 (4) | 4 (4) | 2 (3) |
| **More than one remote speaker** | | **10/16** | | **10/16** | | 7/16 | 11/16 | 7/16 |

- **Most calls have several remote speakers.** VBx's and Nemotron's
  counts fit what the calls are: one on 1:1 and family calls, two to four
  on dailies, four to five on planning and status calls. They agree on
  which calls have one speaker. One Telemost team call that opens with
  "всем привет, коллеги" gets one main speaker from every system, so all
  may undercount there.
- **Nemotron finds one more speaker than VBx on all three dailies and one
  team call, and switches labels about twice as often (1.6–4 times).** On AMI the same
  habit was right: it counted every meeting right and had a tenth of VBx's
  speaker error. On Russian VoIP nothing here can tell finer turns from a
  voice split in two; that is the first thing the hand labels must answer.
  On the two longest calls it uses all eight of its speaker slots, the
  smallest with under 5 % of the speech.
- **LS-EEND's general model undercounts**, as on AMI: one speaker on three
  dailies where VBx and Nemotron find two to four, two on the planning and
  status calls where they find four or five.
- **LS-EEND's telephone model over-splits**: 7–14 label switches a minute
  on the team calls, and a second speaker on both 1:1s.

## Q3: live LS-EEND beside live Parakeet

### Label churn

`audelin-diarize lseend` feeds 100 ms blocks as a capture callback would,
reads the visible timeline (committed and tentative segments) after each
block, and records each frame's first label and every later change.

| Model | Recordings | Speech frames | Frames whose first label differs from the final | Label changes after shown | Shown after the audio |
|---|---:|---:|---:|---:|---:|
| DIHARD III | 34 (16 AMI, 18 calls) | 275,111 | 0 | 0 | 1.0 s (p50 and p90) |
| CALLHOME | 34 | 284,722 | 0 | 0 | 1.0 s |
| AMI | 34 | 334,130 | 0 | 0 | 1.0 s |

LS-EEND in FluidAudio 0.17.7 shows only committed frames, each 1.0 s after
its audio (with 100 ms steps), and never revises them. So its live DER is
its final DER: the live label is as good as it will get, no better.

### Cost beside Parakeet

The live-transcription baseline (`macos/Benchmarks/Baseline`: the app's
composition with two real Parakeet v3 recognisers at 1×, no devices) on 5
minutes of one owner daily, alone (A) and with LS-EEND paced at real time
on the call track in a second process (C).

| Measure | A: baseline alone | C: baseline + live LS-EEND |
|---|---:|---:|
| Baseline CPU, share of one core | 23 % | 21 % |
| LS-EEND CPU, share of one core | – | **6.3 %** |
| Recognisers at most behind | 1.1 s | 1.4 s |
| Final text trails, per-minute means | 2.3–2.7 s | 2.3–2.6 s |
| Newest word trails, per-minute means | 1.3–1.7 s | 1.3–1.7 s |
| LS-EEND time per 100 ms block, p50 / p99 / max | – | 6.3 / 8.8 / 13 ms |

Live LS-EEND does not slow live recognition. Unpaced it runs at 87–94×
real time (43 s of CPU per hour); paced, the per-block wake-ups at low clock
take 6 % of a core. Cost does not rule live out; accuracy does.

## Q4: cost

| Measure | Nemotron 3 `fast128` | VBx | LS-EEND |
|---|---:|---:|---:|
| Speed, AMI (9 h) | 325× | 195× | 87–94× |
| Speed, owner's call tracks (249 min) | 327× | 246× | 87–94× |
| Process CPU per hour of audio | 2 s | 17 s | 40–43 s |
| 1-hour call, after it ends | about 11 s | about 15–18 s | – |
| Peak footprint, 58-minute call | 815 MiB | 1.39 GiB | 122–140 MiB (any length) |
| Model download | 193 MB | 21 MB | 43 MB per model |

Process CPU leaves out Core ML work on the GPU and Neural Engine, which is
where Nemotron runs; its wall time is the fairer cost. VBx peaked at
1.0 GB on a 14-minute meeting and 1.39 GiB on the 58-minute call, so its
footprint grows with the call; Nemotron was measured on the long call only.

## How other open-source recorders do it

- **MacParakeet** (moona3k/macparakeet, `spec/adr/010-speaker-diarization.md`):
  diarization **after recording**, on the isolated system track only; the
  microphone is "Me", and live transcription is unchanged. Its default is
  now Nemotron 3 `fast128` through FluidAudio (eight speakers at most),
  with Community-1/VBx kept for an explicit speaker count. Its matched runs
  on the same 16 AMI mixed-headset meetings, NIST-scored with no collar and
  overlap included, give Community-1/VBx 22.97 % DER, 3.25 % confusion and
  the right count in 14 of 16, and Nemotron 26.03 %, 0.72 % and 15 of 16.
  Against forced-alignment references VBx scores 38 % there and Nemotron
  9 % (Community-1 then on FluidAudio 0.15.7), as here: the reference and
  collar move DER by tens of points, so only matched rows compare.
- **Amanu** (gsamat/amanu) keeps the two tracks apart and diarizes inside
  each only when a cloud engine (AssemblyAI, ElevenLabs Scribe) does it
  after the call; its local Parakeet path has no diarization.
- Neither diarizes live.

Both projects, like this measurement, put diarization after the call on the
remote track alone, and the one that measured local engines chose Nemotron.

## What still needs hand labels

- **DER on the owner's calls**: speaker turns on a few calls of each kind
  (a daily, a planning call, a 1:1), to check that Nemotron's AMI accuracy
  holds on Russian VoIP audio, and whether its extra speaker on the dailies
  is a real person or one voice split in two.
- **The true number of remote speakers** per call, for Q1: the counts above
  are the systems' own.
- A public Russian set with speaker labels, if one is found; and
  VoxConverse once its audio can be fetched.

## Before adopting

- Score Nemotron and VBx on the hand-labelled owner calls; keep Nemotron
  unless it splits voices there, and fall back to VBx if it does.
- A call with more than eight remote speakers exceeds Nemotron's slots;
  VBx has no such limit.
- A word gets one speaker; overlaps need a rule for which one.

## When to rerun

Not on a calendar: the AMI results change only when the models do. Rerun
the whole measurement when

- FluidAudio moves past 0.17.7, or Nemotron, VBx or LS-EEND ship new
  models;
- hand-labelled owner calls exist: score Nemotron and VBx on them and
  choose between them there;
- calls of a new kind appear, such as more than eight remote speakers, or a
  call that VBx and Nemotron count differently.

The monthly check (`monthly/`) watches for the last: it flags a new call
where VBx and Nemotron disagree on whether there is more than one remote
speaker, or where the speakers outnumber Nemotron's eight slots.

## Reproduce

From `audelin/docs/research`: build the spike (`swift build --package-path spike -c release`);
in `diarization/`, `uv sync`, clone `nttcslab-sp/diar-forced-alignment` into
`work/Datasets/`, fetch AMI's test headset mixes with
`fluidaudiocli download --dataset ami-sdm`, then `./run.sh ami`,
`./run.sh calls` (after `../enhance/run-calls.sh` has prepared the call
tracks) and `uv run python score.py summary` (`COLLAR=0` for the zero-collar
figures). FluidAudio's reference rows run from `work/` with
`fluidaudiocli sortformer-benchmark --dataset ami` and
`fluidaudiocli diarization-benchmark --mode streaming|offline --dataset ami-sdm`,
the latter with AMI's manual annotations (`ami_public_manual_1.6.2.zip`)
unpacked into `work/Datasets/ami_public_1.6.2`. The live test:
`audelin-diarize lseend <call.f32> <out.json> dihard3 paced` beside
`macos/Benchmarks`' `AudelinBaseline`. Outputs go under `diarization/work/`,
which is not committed.
