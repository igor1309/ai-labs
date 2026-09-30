# Verger orchestration lessons — addendum, 25.09.2026

This continues *Verger orchestration lessons*, and its numbering continues from L47. That document covers session `4e110584` (verger-orchestration-status) up to 14:42 UTC. This addendum covers what the session did afterwards, from 14:42 to 18:18 UTC:
- the M8 web steps (WB, WH, WC);
- landing the XH re-pin on codex 0.157.0;
- two Codex review batches;
- a weekly and a session usage limit;
- the disk-fill incident.

**Times** are UTC throughout.

**Status tags.** These are the same as in the main document. **[recorded]** means `tools/verger/dev/README.md` already holds the lesson. **[not recorded]** means a grep of the README and `CLAUDE.md` found nothing. **[partly recorded]** means a narrow form is there but the general rule is not.

---

## Terrible mistakes

**L48. The orchestrator's own hand-written loop filled the disk with a 200 GB log.** [partly recorded]

What happened:
- The orchestrator ran the review queue through its own untracked scripts: `/tmp/verger-review-batch.sh`, written at 08:33 UTC and reused all day, and a hand loop ending in `done > /tmp/verger-review-run2.log`.
- The batch started at 16:27 UTC, and every review had finished by 16:33. The loop's log kept growing until about 16:56 UTC, reached more than 200 GB and filled the 926 GiB volume. The Mac became unresponsive, and the owner deleted the file by hand.
- The writer was never identified. DEV-fix.35 ran the old loop against the real `review.sh` with a fake Codex, in both zsh and bash, and it always ended within seconds with a 109-byte log.

The fixes:
- **DEV-fix.33:** the scripts refuse to start with less than 20 GB free, printing `NOSPACE` and exiting 7.
- **DEV-fix.34:** every append is followed by a size and free-space check. This scope came from the owner: "not just refusal but check after log append, and any other file you append to".
- **DEV-fix.35:** `dev/review-batch.sh` runs reviews with a cap on concurrent runs, a cap on output, and a kill for any leftover process.
- **DEV-fix.36:** a `/tmp` size watcher.

The README now says reviews run only through `review-batch.sh`.

*Rule:* the orchestrator builds no tooling of its own. Any helper it needs becomes a DEV row and ships as a tested script under `dev/`. The /tmp script had been in use, unguarded, for about eight hours before it caused damage. This is L10 and L20 again, with the orchestrator doing work outside "scripts decide". The general rule is not recorded.

**L49. When something breaks, the orchestrator suspected every writer except itself.** [not recorded]

The sequence:
1. At 17:22 UTC it guessed that "the last two gates filled the disk".
2. At 17:30 UTC it noted that its own log was "the one file missing from the batch".
3. It still started DEV-fix.33 and DEV-fix.34 against the Verger scripts.
4. At 17:42 UTC it listed its own log only as a writer it "couldn't rule out".
5. The owner had to settle it: "YES! THAT WHAT I DELETED".

*Rule:* suspect your own most recent unguarded action first, and say so before proposing fixes elsewhere. This is a grounding failure (`CLAUDE.md` § Grounding) and belongs next to that rule as one sentence. A behavior rule like this can't be enforced; the structural fix is L48, because a writer that the loop tracks and bounds is never a mystery.

**L50. A review burst on top of plants runs caused a false plants failure.** [not recorded]

At 16:09 UTC, five concurrent Codex reviews plus a gate pushed load to about 8. XJ.1's plants baseline then failed in containment tests the change never touched: `log show` missed its 618 ms deadline, and every later rig failed after it. The plants re-run under low load was clean. The orchestrator said "from now on I'll avoid running reviews while an M7 plants run is going" in chat only. Before the next batch it checked by hand and throttled to 3.

*Rule:* reviews and plants runs exclude each other. While a plants run holds or waits for the dev lock, no review starts, and a plants run starts only once running reviews have drained. This rule prefers the plants run, which covers both orderings. A guard only in `review-batch.sh` would still let a plants run start on top of running reviews. With deadlines as tight as 618 ms, every plants run counts as load-sensitive. Enforce it in the scripts rather than as a README sentence (R2). Today nothing enforces it: only `gate.sh` and `plants.sh` take the lock.

## Gotchas

**L51. A builder wrote code ahead of its row.** [not recorded]

XJ.1 (XJ1–XJ5) also wrote the stdout-reader code for XJ6–XJ10, without tests. The orchestrator recorded it in the acceptance note and added a line to the XJ.2 and XJ.3 briefs: "that code exists and is unverified; tests first, fix it where it disagrees with the plan". XJ.2 did find and fix a gap: an early server exit now carries its exit status and stderr.

This is L41 ("code before tests") in a new form, and nothing refuses it.

*Rule:* the builder's report lists code written beyond its row. That code goes into the brief of the row that owns it as unverified.

**L52. Some assertions only logged a violation and never failed.** [not recorded]

Three of the new review rows were this pattern:
- **XH-repin.2-r1:** XH2d logs whether `initialize` and `getAuthStatus` were answered during the hold, but never fails on it. So D-19 amendment A was not actually enforced.
- **XH.3-r1:** XH6 only logs when token requests never go quiet. The plan says that must fail.
- **XH.4-r2:** XH9 stops recording after response 4.

The plants couldn't catch these, because no plant targeted those behaviors.

*Rule:* plants target first the assertions the plan marks *must fail*, within the brief's 2–4 plants per row. The review and the judge check for assertions that only log. Two stronger rules were rejected:
- **"Every assertion needs a plant"** would silently raise the plant count. XJ.1 alone covers five assertions.
- **A static scan for assertions that only log** would be noisy, because `t.Log` is legitimate.

This is a rule for `plants.sh` and the briefs, not for the orchestrator.

**L53. A plant that hangs points to a test defect.** [not recorded]

One M8-WC.3 plant (invalid-skipped) hung for 385 s instead of failing, because WC7 waited on the end of the stream with no time limit. The fix row, M8-WC.fix1, put a limit of about 2 s on the stream waits, so the plant now fails fast with a named assertion error.

*Rule:* every wait in a test has a bound.

**L54. Web tests must not depend on helpers in `host_test.go`.** [not recorded]

A check swaps that file for a stub, so M8-WH.2's first gate run failed. The orchestrator promised to record this "at /retro" and hasn't yet.

**L55. A session limit kills every running builder at once.** [recorded]

At 18:01 UTC three builders (XH-pin.4a-r1, DEV-fix.35 and M8-WC.fix1) died together. Earlier, the weekly limit at 15:14 UTC had killed XH.6 before its first commit. The partial-diff procedure worked each time:
1. Save the builder's uncommitted work under `/tmp/verger-partial/`.
2. Reset its worktree.
3. Start a fresh builder that treats the saved work as an unverified reference.

## Good ideas

**L56. A fast canary test for a slow suite.** [not recorded]

M8-WB.fix1 added `TestUI_NodeSuite`, which runs the Node UI suite from Go. A broken UI boundary now fails in 1–2 s instead of 41–43 s. Most of a plants run's time goes into waiting for a plant to be caught, so one cheap test that fails first speeds up every later plants run.

*Rule:* track time to kill per module against the median kept in `steps/`. When it stays above a threshold (a calibration), queue a canary row. The trigger is a metric, not a judgment call.

**L57. A one-off exception becomes a script straight away.** [partly recorded]

After Go failed to remove its own temp build directory (`directory not empty`), the orchestrator allowed exactly one gate re-run, with that reason. It then queued DEV-fix.37 so the gate treats that error as an infrastructure failure itself, the same way DEV-fix.32 handles the similar build-cache flake in plants.

*Rule:* every manual override is paired with the row that removes the need for it.

**L58. Stopgap now, tested version later, but track the stopgap.** [resolved this time; general rule not recorded]

The sequence:
1. An in-session watcher, polling every minute.
2. A LaunchAgent handed to the owner as a `! sh` line, with a `yes` prompt and a rollback line.
3. DEV-fix.36 queued to replace it with a version tested in the repo.

The gap: after that `! sh` install, `~/.local/bin/tmp-watch.sh` was an untested script outside the repo, and DEV-fix.36 was deprioritized because "the LaunchAgent covers it". That repeats L48 from the other side. This time it closed:
- DEV-fix.36 landed (`5d41070`).
- At 18:34 UTC the LaunchAgent was reinstalled to run the repo's `dev/tmp-watch.sh`.
- The old script is gone.

*Rule:* a stopgap installed outside the repo keeps an open row until the tested version replaces it. Once that row is done, the owner's reinstall is an INBOX item, not a deprioritized row.

**L59. When INBOX can't be written, the push carries the message.** [not recorded]

With 121 MiB free, the orchestrator couldn't write `INBOX.md`. Even its own commands failed. It sent a desktop notification and listed the recovery steps in the session: `go clean -cache`, which scratch dirs could be removed, and a `du` line to find the space.

*Rule:* `INBOX.md` plus one push stays the owner's channel. When the inbox can't be written, the push carries the whole message, and the INBOX line follows once it can be written. The fallback must not depend on the resource that failed.

---

## Not yet recorded

| Lesson | Gist |
|---|---|
| L48 | General rule: the orchestrator writes no tooling of its own; helpers become DEV rows |
| L49 | Suspect your own most recent unguarded action first |
| L50 | Reviews and plants runs exclude each other, with plants preferred; enforce it in the scripts |
| L51 | Code ahead of its row gets listed and passed to the owning row's brief |
| L52 | Plants target *must-fail* assertions first; review and judge check for assertions that only log |
| L53 | Every wait in a test has a bound |
| L54 | Web tests must not use `host_test.go` helpers |
| L56 | A canary row when the time-to-kill metric passes its threshold |
| L57 | Pair every manual override with the row that removes it |
| L58 | A stopgap outside the repo keeps an open row; the reinstall goes to INBOX |
| L59 | When INBOX can't be written, the push carries the whole message; the INBOX line follows |
