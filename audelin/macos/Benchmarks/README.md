# Benchmarks

What one new word costs the app as a call grows. `LateUpdate` runs the real
session and panel with the rehearsal's fake recognisers, live text on and the
transcript written; it drops the audio tracks and stops at the panel's state,
not its drawing. Setup plays a call until the panel holds 20, 800, 1,620 or
6,000 lines (1,620 is a 3-hour call, 6,000 about 11 hours); each sample then
speaks one more word and waits until the panel shows it.

Run everything from this directory, outside the agent sandbox (SwiftPM cannot start
its own sandbox inside it), with nothing heavy alongside. Every tool takes `-h`.

## Which command

| Question | Command | Time |
|---|---|---|
| Did this commit help, against an earlier one? | `./measure.sh BASE TIP` | about 25 min, plus builds |
| Quick: this code against the saved base | `./compare.sh` | under a minute once built |
| Do the app's tests pass, optimized? | `./test-optimized.sh` | a few minutes |
| Which step grows, one commit only | `Profile/growth.sh TAG [OLD]` | about 5–12 min |
| The same with the other side silent or gone quiet | `SILENT=1 Profile/growth.sh TAG`, `QUIET=1 Profile/growth.sh TAG` | about 5–12 min |
| Which frames grow, between two finished runs | `cd Profile && python3 -I frames.py TAG-20 TAG-6000 45` | seconds |
| Saves, bytes written and CPU at real speaking speed | `Profile/saves.sh [SECONDS]` | minutes |
| Does a real recogniser keep up late in a call? | `./speech.sh TAG [SECONDS]` | about 15 min |

Use these rather than typing the commands. `Profile/` is its own package, built
against the checkout. All three benchmark packages use `Composer` and
`SessionRehearsal` from `../App` (the nested packages use `../../App`),
and component products from `macos`. These harnesses require that App package;
measure older commits with the benchmark tools from their package layout.

## Comparing two commits

`./measure.sh BASE TIP` is the only way two commits are compared. It refuses
uncommitted tools, checks both commits out under `/tmp/audelin-measure/tree-<sha>`,
copies this commit's `Benchmarks` over each, alternates three benchmark runs, then
profiles each once at 20, 1,620 and 6,000 lines. It prints the path of `report.md`,
which sits beside the raw runs in a new folder there. `/tmp` does not last, so put the
report's table in the issue. The trees are reused by later runs; they take gigabytes,
so remove old ones with `git worktree remove --force`.

Reading the report:
- **Instructions per word** give each percentile's lowest to highest run. A change is
  real only if the `overlap` column says `no` and it is larger than the 20% noise below.
- **CPU per word by step** comes from one run. Its lengths use different word and round
  counts, so compare growth between commits, not one commit's two lengths.
- **Frames growing most** say where to look next. A frame is any depth, so parents and
  children repeat.

## Which base

- **The start of this work is `7690a9d5`** (branch `audelin-bench`): `9770e037` plus only
  what the benchmark needs. Use it to report progress against the beginning.
- **`9770e037` and anything before `825b034a` cannot run these tools:** they have no
  `SessionRehearsal` product. A commit needs that product to be measured.
- **To judge a new change, BASE is the commit before it.** To judge a round of work, BASE
  is the TIP of the last report in the tracker (LAB-776).
- **The saved `base` that `compare.sh` reads stays at the start of the work,** so its
  table keeps meaning the same thing. `./save-base.sh` replaces it for everyone; do that
  only when the owner decides on a new starting point, and commit the result.

## Real speech

`./speech.sh TAG` plays the call to each length with the fake recogniser, then feeds speech
through the real Parakeet recogniser on both sides at 1×. Measuring lives in the harness
(`Speech/`), so production code is untouched. The speech is `say` output, one voice on both
sides, in sentences with pauses: synthetic, and not a real call. It builds against the code
after `noWordBefore` (LAB-818), so it cannot measure older commits.

Reading the table: **decoding ÷ audio** below 1 means the model keeps up; **backlog** is how
far behind the live audio a chunk is when read, and negative means none; **window delay** is
word end to report without the backlog, the recogniser's own wait; **capture→panel** is word end to
the panel's state, not drawing; **capture→final** is word end to the word going final. Flat, as
settled in LAB-795: capture→panel at 6,000 lines within 1.25× of 20 lines, or inside the spread of
two runs of the same code, and no backlog growth.

## Reading the number

Read the median instructions per word: they count all the process's work,
the transcript writer's included. Runs of the same code differ by up to about
20%, so only a larger change is real. Wall clock swings with whatever else the
Mac runs and is not compared. Instructions swing too when the Mac is busy (a
run beside a build read 12 M at 20 lines), so run it with nothing heavy alongside.

Saved `base`, from `9770e037` before the final-text work (LAB-815, 813, 810). Medians
per word on the owner's MacBook Pro:

| lines | instructions | wall clock |
|---|---|---|
| 20 | 7.0 M | 0.14 ms |
| 800 | 30 M | 0.80 ms |
| 1,620 | 52 M | 1.4 ms |
| 6,000 | 203 M | 5.3 ms |

Latest results, what is left and what is next live in LAB-776, not here.

The benchmark does not measure the view's drawing or a real recogniser. Nothing here measures a real call.
