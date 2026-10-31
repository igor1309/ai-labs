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
./measure.sh BASE TIP       # both commits with the same tools: report.md in /tmp/audelin-measure
./compare.sh                # this code against the saved base: a table of medians
./save-base.sh              # save a new base (commit it)
./test-optimized.sh         # the app's tests, optimized and bounded
Profile/growth.sh TAG [OLD] # Time Profiler at 20, 1,620 and 6,000 lines: CPU per word by step
SILENT=1 Profile/growth.sh TAG [OLD] # the same with the other side silent the whole call
QUIET=1 Profile/growth.sh TAG [OLD]  # the same with it saying one sentence, then nothing
Profile/saves.sh [SECONDS]  # real speaking speed: saves per minute, app CPU, CPU per save
```

`measure.sh` is how two commits are compared. It refuses uncommitted tools, puts
this commit's tools on both in throwaway worktrees, and alternates three benchmark
runs before one profile of each. Every number in the report came from that run.

Use these rather than typing the commands. `Profile/` is its own package, built
against this checkout.

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
