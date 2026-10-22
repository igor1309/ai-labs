# Tests (2026-10-21)

Mac: macOS 26.6.2, Apple Silicon, 36 GB. Call app: Zoom 7.2.2, solo
meeting. Test phrases: «Давайте определим RACI для проекта», «Согласуем OKR
на следующий квартал», «Какой у нас SLA по этому сервису?». The other side
was simulated with `say -v Milena` through the speakers.

## Run 1 — Superwhisper Meetings, Whisper Large v3 Turbo, language Russian

From `~/superwhisper/recordings/1792594633/meta.json`:

- Mic and system audio both captured; the two voices got separate speakers.
- «Согласуем OKR…» → «оК и ОР на следующий квартал».
- «Какой у нас SLA…» → «…у нас слово по этому сервису?» (owner spoke over it).
- RACI phrase not spoken.
- Whisper is not a realtime model; Meetings feeds it in chunks, so live text
  lags. No latency figure taken.

## Run 2 — four apps side by side (owner's observations)

Superwhisper (Parakeet Multilanguage), Amanu (live Nemotron, final Whisper,
language ru), MacParakeet (Parakeet v3) and MacWhisper ran together on one
Zoom call.

- **Superwhisper:** smoothest; text added neatly and steadily.
- **Amanu:** faster than MacParakeet; minimal UI; stopped with Zoom.
- **MacParakeet:** lagged everyone; too much UI; transcript window disappears
  behind others and cannot stay on top; selection only gives system actions;
  kept recording after Zoom closed.
- Arranging windows to see all transcripts at once was painful.

Caveat: all four shared one Neural Engine; swap was 2.7 of 4 GB used, so
MacParakeet may have been starved. Its window and UI problems stand anyway.

## Run 3 — spike: Parakeet v3 sliding window over run 1's audio

[`spike/`](spike/) feeds a recording to FluidAudio 0.17.7
`SlidingWindowAsrManager` at real-time pace and logs each update with its
time. Input: run 1's 70.6 s recording, converted to 16 kHz mono WAV (the
audio is not committed). Context 2 s left and 2 s right in every run.

| Chunk | Updates | Newest words appear after | Text |
|---|---|---|---|
| 2 s | every 2 s | ~4 s | Splits words at chunk edges: «ОКР наследство.» then «и Р на следующий квартал»; «Миленной» / «миленой» |
| 4 s | every 4 s | ~6 s | Clean sentences: «Согласуем ОКР на следующий квартал.» |
| 8 s | every 8 s | ~10 s | Clean but lumpy; «Оу Кей Ар»; a stray «Rose» at the start |
| 11 s (default) | every 11 s | ~13 s | «Согласуем Оу КР…» |

- **OKR** came out in Cyrillic in every run; **SLA** became «слог» in every
  run. RACI was not spoken. One recording is not enough to judge terms: the
  owner spoke over the SLA phrase.
- **Language hint `ru` changed nothing here** (4 s run identical to no
  hint). It is still left off: in FluidAudio it filters out Latin tokens, so
  it can only make English terms worse.
- **`hypothesisChunkSeconds` is ignored** by the manager: updates arrive once
  per chunk, so there is no faster partial text to smooth from.
- **Unconfirmed updates are not a running hypothesis.** Each one covers only
  the newest chunk, and some of them («Раз, два, три», «Это тестовая
  запись…») are never repeated as confirmed, though `finish()` includes
  them. The app has to keep unconfirmed text, not wait for confirmation.

Outcome: 4 s is the best of the four; 2 s is faster but breaks words. The
default 11 s is what makes a live view feel stuck.

### Run 3b — 4 s chunk over run 2's audio (263 s, owner's commentary)

Compared with the text Superwhisper saved for the same call (Parakeet
Multilanguage, `meta.json`; whether that text is the live one or a final pass
is not known).

- Updates every 4 s, all the way through; no stalls over 4.4 minutes.
- **Words repeat at chunk edges:** «показывает. / показывается», «что /
  что-то», «у меня / у меня», «видеть / видеть», «вывод вывод». Superwhisper's
  text has almost none of these. Our layer has to merge the overlap.
- Names drift from chunk to chunk: «паракид», «Ракет», «Паркит», «маг
  паракит», «MacParkit»; Superwhisper has «Паракит» throughout.
- Mixed scripts appear: «Митинг рекорд» then «meeting recording»; «stop
  zone» / «Stop zoom».

## Run 4 — two live streams at once

[`spike/`](spike/) `wisper-load` feeds run 2's 263 s recording to one or two
`SlidingWindowAsrManager`s at once (4 s chunks, shared models), as fast as
possible. Mac load average was ~6 from other work; nothing else used the Neural
Engine.

Ten alternating repeats after a first pair, ranges over the ten:

| Streams | Wall time | CPU (user + sys) | Peak memory | Updates per stream |
|---|---|---|---|---|
| 1 | 3.56–3.75 s | 3.5–3.9 s | 103–106 MB | 66 |
| 2 | 3.61–3.73 s | 6.1–6.9 s | 133–136 MB | 66 |

The very first 1-stream run peaked at 498 MB and used 6.2 s of CPU; no repeat
came near it, so it was a one-off, probably the models' first load (not
checked). Each stream processed 263 s of audio in under 4 s, about 70× real
time. A second stream adds CPU and ~30 MB but no wall time: the two run in
parallel. Two live streams («я» and «они») need
about 3% of the engine's capacity. Latency at real-time pace was not measured
here.

## Run 5 — Audelin's own windows over the owner's terms (2026-10-22)

[`spike/`](spike/) `audelin-windows` cuts a recording into 4 s chunks with
2 s left and 2 s right context and runs FluidAudio 0.17.7
`AsrManager.transcribe` (Parakeet v3, no language hint) on each window with a
fresh decoder state, as ADR-001 decision 7 sets. Input: the owner reading
[`fixtures/terms-script.md`](spike/fixtures/terms-script.md) into the MacBook
Pro microphone, 16 kHz mono, about 60 s, no overlap and no other voice (the
audio is not committed). It ran twice: chunks from 0 s, and every chunk
shifted by 0.24 s (3 encoder frames). The replies are kept as the
stabilizer's fixtures in [`spike/fixtures/`](spike/fixtures/) (ADR-001
invariant 14).

| Term | Said | In Latin letters | What came out otherwise |
|---|---|---|---|
| RACI | 4 | 0 in both runs | «врачи», «рачи», «раче», «рачек» |
| OKR | 4 | 0 in both runs | «АКР», «ОКРП», «КР» |
| SLA | 4 | 2 at shift 0, 2 at 0.24 s | «СЛА», «SL», «с лэ» |

- **One pass over the whole recording is no better:** «рачи», «АКР», «ОКР»,
  «СЛА», «С Лэй». More context does not bring the terms back.
- **A window can switch language.** At shift 0 the chunk from 24 s reads
  «If SLA is client» for «Если SLA нарушен, клиент…»; the shifted window
  reads it right. A committed segment is final, so such a window would stay
  in the log.
- Russian outside the terms is clean in both runs. Words near a chunk edge
  differ between the two runs («Согласуем АКР» / «АКР»), which is the
  stabilizer's input, not an error.

Outcome: ADR-001's acceptance item is answered. Parakeet v3 does not give
RACI, OKR or SLA in Latin letters on clean Russian speech, so live terms are
not usable for v2 explanations and the live engine is revisited before v2.
v1 does not depend on it (ADR-001 § Executive summary).

## Run 6 — streaming Nemotron against windowed Parakeet (2026-10-22)

Same input to both: run 5's reading of the terms script (62 s) and run 2's
Zoom recording (263 s), 16 kHz mono. Streaming: [`spike/`](spike/)
`audelin-stream` feeds FluidAudio 0.17.7's Nemotron 3.5 multilingual
streaming model (1120 ms chunks, the model Amanu runs live) in 0.1 s blocks.
Windowed: `audelin-windows`, Parakeet v3, 4 s chunks with 2 s of context on
each side. A word's delay is how much audio had been fed when it first
appeared, minus when it was spoken; compute time is on top and is
negligible for both.

| | Streaming Nemotron | Windowed Parakeet |
|---|---|---|
| Delay, median / p90 / max, terms | 0.37 / 0.84 / 1.10 s | 3.76 / 5.04 / 5.44 s |
| Delay, median / p90 / max, Zoom | 0.39 / 0.94 / 1.12 s | 3.60 / 5.20 / 5.84 s |
| Compute for 263 s of audio | 8.8 s | 5.1 s with model load |
| RACI, OKR, SLA in Latin letters | 0 of 12, `ru` and `auto` alike | 2 of 12 (run 5) |
| Word errors on the script, terms and numbers left out | 14.8% of 54 words | 20.4% |

- **Streaming is about ten times faster to show a word**, and needs no
  windows. Its text still needs a layer: the model reports one growing
  transcript per speaker, so something has to cut it into segments at
  pauses, as Amanu does.
- **Neither gives the terms.** Nemotron: «врач», «АКР», «СЛА», with `ru`
  and with `auto`.
- **Russian quality is not settled by this run.** On the script Nemotron
  makes fewer errors, but the windowed figure counts words at chunk edges
  without a settling layer. On the Zoom recording Parakeet reads better by
  eye: «UI штучек», «то ли там окошко» against Nemotron's «UAC
  зарисовок», «туалетам окошка». No reference text exists for it.

## Not yet measured

- Selection while text is appending.
- Whether 4 s feels smooth enough once text is animated in.
