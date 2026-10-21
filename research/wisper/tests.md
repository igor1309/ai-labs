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

## Not yet measured

- Latency from speech to text, per engine.
- Selection while text is appending.
- Parakeet v3 accuracy on English abbreviations in Russian speech.
