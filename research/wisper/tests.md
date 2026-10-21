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

## Not yet measured

- Latency from speech to text, per engine.
- Selection while text is appending.
- Parakeet v3 on English abbreviations in clean Russian speech (all three
  phrases, no overlap).
- Whether 4 s feels smooth enough once text is animated in.
