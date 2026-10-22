# audelin-replay

Replays recorded tracks through Audelin's own recognisers and Live text, the
code the app runs, to choose between them on real calls.

```
swift build -c release
.build/release/audelin-replay /tmp/audelin-replay audio.m4a --split [--only parakeet|nemotron|hybrid] [--pause <s>]
```

Each track is read in 0.1 s chunks at its own rate, channels averaged, and
fed as fast as the recogniser takes it; delays are counted in audio fed, so
they are what a live call would show, with compute on top. Amanu keeps a
call only with "Keep the audio after transcribing" on, as one `audio.m4a`
with the mic on the left and the system on the right: `--split` hears each
channel as its own track. Keep call audio
and the output out of the repository.

`hybrid` shows Nemotron's words and settles Parakeet's. `--pause` sets Live
text's pause (2 s); a large one turns off settling at pauses.

Per track and recogniser, the output directory gets the settled segments
(`<track>-<recogniser>.md`), the final words with their times
(`<track>-<recogniser>.tsv`) and a row in `summary.md`. Words match across
reports by letters, within 1 s of each other's start:

- **Words final**: words the recogniser called final, each counted once.
  **Words settled**: words in Live text's settled text; a gap between the two
  means Live text lost or added words.
- **Shown delay**: audio fed when a final word's text first showed, minus
  the word's end.
- **Final delay**: audio fed when it became final, minus its end.
- **Shown, never final**: words shown that no final word replaced in place
  with the same text: how much live text changes after it shows.
- **Final, then changed**: reported words that start where a final word
  does but read differently: a recogniser breaking its promise; Live text
  keeps the final one.
- **Compute / audio**: time to hear the track over its length, model
  loading apart.
