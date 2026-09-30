# Verger orchestration lessons — addendum 2, 25.09.2026

This continues *Verger orchestration lessons — addendum*, and its numbering continues from L59. That addendum covers session `4e110584` (verger-orchestration-status) up to 18:18 UTC. This one covers the rest of the session, from 18:18 to 21:21 UTC, when the transcript's last reply came after the reboot:
- the go work-dir flake fixes (DEV-fix.37 through 37d) and M8-WB.fix2;
- the weekly-limit stop and the owner's "go on";
- a Codex review batch and 7 judges;
- the XP5-flake.2 stress run and the reboot.

**Times** are UTC throughout. The Mac's clock is on MSK, so its 00:11 reboot was 21:11 UTC.

**Status tags.** These are the same as in the earlier documents, from a grep of `tools/verger/dev/README.md` and `CLAUDE.md` for each lesson. **[recorded, violated]** means the rule exists and was broken anyway.

---

## Terrible mistakes

**L60. The orchestrator's own stress recipe rebooted the Mac.** [partly recorded]

What happened:
- At 21:09 it started XP5-flake.2 with a brief that called for 16 `-race` test binaries plus 8 CPU burners. Three other builders were running gates and plants at the same time, and their summaries already showed load between 9 and 14.
- It wrote "that load test will slow this Mac". It limited each run (2 runs of at most 8 minutes) but didn't limit what ran alongside.
- The 15-minute load reached about 47 and the Mac rebooted.

`CLAUDE.md` § Live-Host Load Safety already describes this exact failure from 2026-06-22 (load ~54, two reboots). It was read as applying only to VPSes.

One thing improved on L49: right after the reboot, the orchestrator named its own builder as the likely cause.

*Rule:* the Mac running the loop is a live host too. A stress or load reproduction is a heavy job:
- it takes the dev lock exclusively, so no gate, plants run or review runs beside it;
- its size comes from measured headroom, not from limits on each run.

Enforce this in a script, next to L50.

**L61. Rules the orchestrator adds to briefs by hand are lost.** [not recorded]

In three hours it added at least six rules to briefs by hand:
- label each plant with its assertion ID;
- compile-check each plant (added twice);
- a codex run may wait for the lock beyond the time box;
- don't wrap `gate.sh` or `plants.sh` in an outer `timeout`;
- wait until the 1-minute load is under 12.

It also wrote a whole brief by hand when `--next` didn't print one.

The `start.sh` template in `dev/README.md` has none of these. They lived only in the session, and after a reboot or compaction the next orchestrator won't have them.

*Rule:* a line added to a brief by hand is also a DEV row against `start.sh`, filed in the same turn. This is L57 (pair every manual override with the row that removes it) applied to briefs, and a drift away from L7.

**L62. The orchestrator refused "go on" because of a predicted limit, and the prediction was wrong.** [not recorded]

The sequence:
1. Between 19:55 and 20:09, three builders died on the weekly limit ("resets Sep 30").
2. The owner said "go on". The orchestrator refused ("any builder I start now would die the same way"), then asked in chat when to run `/retro`.
3. Owner: "WTF??? i tell you tp go on! since when do you refuse my orders?"
4. The builders started at 20:13 ran without trouble, and about 15 steps were accepted over the next hour.

It was following L27 ("if the limit hits again, stop spawning"), but it applied that rule to a limit it only expected.

*Rule:* the owner's explicit go-ahead overrides any stopping rule. A limit counts only once the next spawn actually fails. **L27 must be amended to say this before anyone records it.**

**L63. Recording the lesson became another mistake.** [not recorded]

What happened:
- The orchestrator tried to save "go on means go" to auto-memory. A hook blocked writing the file, but the `MEMORY.md` index line got through, leaving a pointer to a file that doesn't exist.
- It then asked in chat where the lesson should go. Owner: "we have no room for all your stupid misdoings". The owner then had to run a `sed` to remove the line.

*Rules:*
- Mid-loop, a mistake is fixed, not written up. Lessons are collected in batches (`/retro`, or documents like this one).
- Write the target file first and the index last, so a blocked step leaves nothing pointing at a missing file.

**L64. `/tmp` held state that had to survive a reboot.** [not recorded]

The reboot wiped:
- the ledger (`lib-run.sh:19` defaults it to `/tmp/verger-ledger`);
- every builder worktree;
- the plant patches and review outputs;
- `/tmp/verger-partial/`, where the rescue procedure keeps its saved work;
- the CP-G6 scripts staged for the owner's live runs. INBOX item 1 still points at them.

Accepted work was safe on the branches, and the worktrees were back within 10 minutes, which supports L23. But in-flight evidence was lost: M8-WR.1 and CPG6.2-r2 had to redo their gate and plants.

*Rules:*
- Decide for each artifact whether losing it on a reboot is acceptable. L23 calls `/tmp` scratch, yet the ledger lives there.
- Scripts staged for the owner are generated by a repo script, so they're regenerated rather than staged again by hand.
- An INBOX line never points at `/tmp`.

## Gotchas

**L65. One flake took five tolerance rows before its cause was fixed.** [partly recorded: L57]

What happened:
- The rows were DEV-fix.37, 37a, 37b, 37c and 37d. The actual fix, M8-WB.fix2 (a separate `GOTMPDIR` for each nested build), came only after the flake had hit three times.
- 37a missed the exact failing case because its row said only "the baseline".
- 37c and 37d fixed holes that the tolerance itself had opened:
  - a hang after the error was being retried as an infrastructure failure;
  - a retry could turn a real FAIL or data race into a PASS.
- `gate.sh` and `plants.sh` now apply different retry rules, which the 37d builder flagged.

*Rules:*
- Fix the cause first. Every tolerance widens what can be misread as a pass.
- A fix row's first test replays the observed failure: its log line and the step where it happened.
- One shared classifier in `lib-run.sh` decides what counts as an infrastructure failure, so the gate and plants can't disagree.

**L66. The script version is still the builder's choice.** [partly recorded]

What happened:
- XH-pin.4a-r1's gate ran its worktree's `gate.sh`, from before DEV-fix.37, and hit the very flake DEV-fix.37 fixes.
- The M8-WC.4 builder picked `verger`'s copy only because it noticed that `lib-run.sh` differed.

The README says to run `verger`'s copy, but nothing makes a builder do it.

*Rule:* the brief gives the absolute path to `verger`'s `dev/`, or `gate.sh` and `plants.sh` refuse to run when their own copy is older than `verger`'s.

**L67. With one dev lock, builders spend their time box waiting.** [not recorded]

What happened:
- XC.2's plants run waited 9 minutes behind a gate.
- The M8-WC.4 builder used its whole 590 s waiting for the lock and ran out of time with no plants run.
- CPG6.2-r2's outer `timeout` killed its plants run while it was still waiting for the lock.
- The Bash tool moves any run past 600 s into the background, so "foreground only" breaks without the builder choosing it.
- A codex step (gate about 9 minutes, plants about 10) barely fits the 20-minute time box even with no wait.

*Rules:*
- The time box doesn't count time spent waiting for the lock, which the heartbeat can measure.
- A waiting script prints "waiting for lock, held by X" instead of blocking silently.
- Run only as many builders at once as the lock can serve.

**L68. Two plants failed to compile within 20 minutes.** [not recorded]

CPG6.1-r1 had one; XC.1 had two of its four. Each cost a resend, and for XC.1 a 10-minute codex re-run. L16 says a plant that doesn't compile proves nothing, but nothing checks for it before the run.

*Rule:* `plants.sh` checks every patch (applies it and builds it with the module's tags) before the baseline, and fails fast naming the patch. This belongs in the script, not in a brief line.

**L69. A documented cap was waived in chat, and the rule it bent failed.** [recorded, violated]

What happened:
- At 20:23 the orchestrator ran 7 judges at once, "above the usual 5, but they only read".
- Two of them picked the same new row ID, DEV-fix.37c. `queue.sh` refused the second, and the orchestrator renamed it to 37d by hand.

L29's one-writer rule ("judges run one after another") exists to prevent exactly this collision. Note that a grep of `dev/README.md` didn't find that sentence, so it may not be recorded after all.

*Rule:* a cap is changed in the doc, never waived in chat. `queue.sh` assigns row IDs, not the judges.

**L70. INBOX went back to holding status items and blocking the build.** [recorded, violated]

What happened:
- Item 3 ("scripts were wiped; I'll re-stage them when you're ready") is a status note plus something "coming later", which L34 forbids.
- Item 2 blocks M7: "codex steps wait behind it until you choose". L33 says decisions never block the build.
- Choosing a load recipe for a reproduction is a build question. It belongs in `owner-decisions.md` with a provisional pick (the "defer" option), and M7 should keep moving.
- Two questions also went to chat (when to run `/retro`, where to save the lesson).

**L71. Code written ahead of its row means that row's tests never fail first.** [not recorded; extends L51]

XC.2 added only tests, because XC.1 had already written the logic, so its tests passed on their first run. Only the plants showed that those tests catch anything.

*Rule:* when a row's code already exists, its brief says that its plants are the only evidence, so plants must target each new assertion.

**L72. A fixed short wait fails under load.** [not recorded; the other half of L53]

The WC8 web test waits a fixed 50 ms. It broke M8-WR.1's plants baseline at a load of about 10, and M8-WC8-flake was queued for it.

*Rule:* every wait has a bound (L53), and no bound is a short fixed sleep standing in for waiting on an event.

## Good ideas

**L73. A passing reproduction test is checked for being vacuous before the finding is reported false.** [not recorded]

DEV-fix.27a-r1a's first test passed with no fix. The builder didn't report the finding false. It found that its test's marker had the same name as the stub `rm` directory, renamed it, and the test then failed as expected.

*Rule:* "if the test passes, report false" first requires showing that the test could fail at all, for example with a plant.

**L74. When the safety classifier was down, the orchestrator checked only what the classifier would have caught.** [not recorded]

Before accepting M8-WB.fix2 it checked three things: the worktree was clean, the commit touched only the stated files, and the plants results file matched the report. It didn't re-verify the work itself.

*Rule:* this is the right narrow exception to "the orchestrator never verifies".

**L75. A builder's commit can be rescued after it dies on a limit.** [partly recorded]

A fresh builder reviewed the unverified commit against its step, then ran the gate and plants on it without rebuilding: CPG6.1-r2 at `71c0c76` and M8-WC.4 at `4e2eb79`. L55 and the README cover only uncommitted diffs.

**L76. A mechanism that fires by itself beats a promise to remember.** [recorded in `CLAUDE.md`]

The orchestrator promised to run `notify.sh` after every INBOX commit. The owner pointed to the post-commit hook instead.

---

## Not yet recorded

| Lesson | Gist |
|---|---|
| L60 | A stress or load reproduction takes the dev lock exclusively; the Mac is a live host |
| L61 | A brief line added by hand becomes a `start.sh` DEV row in the same turn |
| L62 | The owner's go-ahead beats any stopping rule; a limit counts only after a spawn actually fails (amend L27) |
| L63 | No lesson-writing mid-loop; write the file before its index line |
| L64 | Decide what must survive a reboot (ledger, `verger-partial`, owner scripts); INBOX never points at `/tmp` |
| L65 | Fix the cause before adding tolerance; the fix test replays the real failure; one shared infra classifier |
| L66 | The brief pins `verger`'s `dev/`, or the scripts refuse when their copy is older |
| L67 | Time box excludes lock wait; waiting scripts say who holds the lock; limit builders to what the lock can serve |
| L68 | `plants.sh` checks each patch applies and builds before the baseline |
| L71 | Code ahead of its row: plants are the only evidence |
| L72 | No fixed short sleeps in tests |
| L73 | Show a reproduction test can fail before reporting a finding false |
| L74 | When the classifier is down, check only scope |
| L75 | Rescue a dead builder's committed work |

**Recorded but broken in this window:** L29/L69 (judge cap and one writer), L33 and L34 (INBOX items 2 and 3), and `CLAUDE.md` § Live-Host Load Safety. Those rules need a script to enforce them, not more wording.
