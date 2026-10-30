# Benchmarks

What one new word costs the app as a call grows. `LateUpdate` runs the real
session and panel with the rehearsal's fake recognisers, live text on and the
transcript written; it drops the audio tracks and stops at the panel's state,
not its drawing. Setup plays a call until the panel holds 20, 800, 1,620 or
6,000 lines (1,620 is a 3-hour call, 6,000 about 11 hours); each sample then
speaks one more word and waits until the panel shows it.

Run from this directory, outside the agent sandbox (SwiftPM cannot start its
own sandbox inside it). All four loads take under a minute once built:

```sh
swift package --disable-sandbox benchmark baseline compare base   # this code against the saved base
swift package --disable-sandbox --allow-writing-to-package-directory \
  benchmark baseline update base                                  # save a new base (commit it)
```

Read the median instructions per word: they count all the process's work,
the transcript writer's included. Runs of the same code differ by up to about
20%, so only a larger change is real. Wall clock swings with whatever else the
Mac runs and is not compared. Instructions swing too when the Mac is busy (a
run beside a build read 12 M at 20 lines), so run it with nothing heavy alongside.

`base` was saved from `9770e037`, before the final-text work (LAB-815, 813,
810). Medians per word, base, on the owner's MacBook Pro:

| lines | instructions | wall clock |
|---|---|---|
| 20 | 7.0 M | 0.14 ms |
| 800 | 30 M | 0.80 ms |
| 1,620 | 52 M | 1.4 ms |
| 6,000 | 203 M | 5.3 ms |
