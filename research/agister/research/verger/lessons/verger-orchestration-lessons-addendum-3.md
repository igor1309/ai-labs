# Verger orchestration lessons — addendum 3, 25.09–27.09.2026

This continues *Verger orchestration lessons — addendum 2*, and its numbering continues from L76. Addendum 2 ends at 21:21 UTC on 25.09. This one covers the rest of session `4e110584` (verger-orchestration-status), from 21:21 UTC on 25.09 to 20:23 UTC on 27.09. Over those two days the loop ran through 13 compactions, about 8 usage-limit deaths and roughly 250 accepted steps.

**Sources.** The owner's prompts, the orchestrator's replies to them, and the "Errors and fixes" and "Standing rules" sections of the 13 compaction summaries. §8 also draws on the diff of `tools/verger/dev/README.md` from 4c74d53b to the verger head (244 → 415 lines), `dev/start.sh`, and the root `AGENTS.md` on trunk. Times are UTC unless marked MSK.

**Limits.** Status tags (recorded or not) were **not** checked against `tools/verger/dev/README.md` for this addendum. Each lesson is 64 words or fewer.

---

## 1. Gate economics and throughput

**L77. Integration tests don't run on every step.** Each step's gate and plants baseline both ran the whole module's integration tests, making 44-minute steps. The owner chose two tiers (D-20): scoped unit tests per step, integration per batch or milestone. Gates fell from 389 s to about 100 s. *Rule:* test cost scales with the change.

**L78. Full runs start only in a quiet slot.** The orchestrator started an 11-minute full integration run just as two builders reached their gates, and both then spent 30 minutes in the queue. *Rule:* a heavy run waits until no builder is gating. A scheduler enforces this, not the orchestrator's sense of timing.

**L79. More lanes than the shared resource allows only lengthen the queue.** Five codex lanes shared one gate lock, and builders spent most of their time box in line. *Rule:* size the lane count to the slowest shared resource (gate slots), and report queue time separately from work time.

**L80. Scoping creeps back in.** DEV-tags.2 added the 5-minute tagged pass whenever an affected package had any tagged file, so most codex gates paid it again. A tagged plants run spent a 5-minute baseline on plants that each died in 12 s. *Rule:* re-measure gate time after every scoping change, and scope baselines to the tests the plants target.

**L81. An optimization that shortens a run inherits its teardown.** DEV-fix.43 stopped each plant at its first failing test, which skipped the tests' cleanup. Orphaned process groups were then flagged LEFTOVER, and clean runs came back "not clean". *Rule:* any early exit must also own the cleanup that the full run used to do.

## 2. Agent lifecycle and cost

**L82. An agent that waits burns tokens.** A builder polled the lock and the load. Owner: "DO NOT waste my resources". The fix: builders never wait. A token-free shell loop waits instead, then spawns a fresh runner that only runs the gate and plants. *Rule:* waiting belongs to cheap infrastructure, never to a model.

**L83. A ban needs its exception spelled out.** "Don't poll the lock" was read as "stop if the lock is held", and a builder killed its own gate. Others backgrounded runs or added their own `timeout`, killing gates. *Rule:* briefs say blocking inside the gate script is expected, runs stay in the foreground, no outer timeout. Better, the script enforces it.

**L84. Usage limits are routine events, not incidents.** Session and weekly limits, account switches, `ERR_PROXY_TUNNEL` and restarts killed builders about eight times. The recovery that worked: check the worktree and the ledger, then resume through SendMessage with HEAD and "finish missing gate/plants in foreground", or spawn a fresh builder that treats the earlier work as unverified. *Rule:* script the resume procedure.

**L85. A scheduler that lives in the session dies with it.** The hourly-report cron lived inside the Claude session. Restarts deleted it silently, and the INBOX line went stale for hours. The fix was a launchd agent outside Claude, plus a session check on launchd's freshness. *Rule:* monitoring outlives what it monitors, and a missing heartbeat is itself an alert.

**L86. "Stop starting" is not "stop running".** Owner: stop spawning at 23:30. The orchestrator let lanes idle from 23:03 and reported done at 23:16. *Rule:* model drain as its own state. Before the drain deadline, keep refilling lanes. After it, accept results but start nothing. Signal the owner when only the orchestrator is left.

## 3. Reviews and fix chains

**L87. Cap review-fix chains.** Of 46 steps accepted in one stretch, 37 were fixes and 13 were fixes of fixes. One test's timing was fixed four times, and plan work stalled. With a cap at depth 2, deeper findings are deferred or go to the owner. *Rule:* track review depth, because a growing chain is a loop, not progress.

**L88. Review cost is mostly input tokens.** Each Codex review read 42–69k tokens, and one review per step used up a profile after 11–20 reviews. Lower effort saves little. The levers are batching consecutive steps per module and skipping tiny fix steps that gates already cover. *Rule:* budget reviews by count and context size.

**L89. A surviving plant is a test gap until proven equivalent.** XT.2's survivor exposed a real gap: nothing checked for temp writes after the deadline. Plants run without the integration tag all survived, a vacuous run. One survivor was ruled EQUIVALENT (same-instant race). *Rule:* plants run with the tags of the tests they target, and each survivor gets an explicit ruling.

## 4. Measuring the loop

**L90. Measure the product, split by kind.** The owner rejected LOC alone: steps accepted per hour and gate/plants time by tier are the primary measures, and tests are part of the product. The Go-only LOC count undercounted by 3–5×. *Rule:* count every language, split production from test code, and mark hours under a usage limit so comparisons stay fair.

**L91. Throughput hides waste.** 130 steps a day looked healthy. Re-applies, redos, builder deaths and parked lanes were invisible, and docs steps inflated the count. *Rule:* metrics count wasted work (redo, death, chain depth, lane idle time) and separate plan work from fixes and docs.

**L92. Test the alarm on zero and on missing input.** Three 0-step hours raised no ALERT. A later ALERT stuck on a full-gate failure that a pass had superseded. The report printed zeros when the tracker was unreadable. *Rule:* unreadable state is an error, not zero. A later success clears a failure. Test alarms on empty input.

**L93. One question gets one consolidated answer.** Owner: "i miss your response regarding my ask for loud productivity drops". The orchestrator had answered across several messages. *Rule:* answer each owner question in one message that covers mechanism, triggers, current state and gaps. Status streams don't count as answers.

## 5. Parallel lanes and dependencies

**L94. Green lanes can make a red head.** XS-admit.1 and XS-spec.2 each passed their own gate, but together they broke a checker test that the step gate skips. XK.2 and XW.2 broke XK6 the same way. *Rule:* after each accept, run a fast combined build and test of the head. The next builder first confirms the head is green.

**L95. Hotspot files serialize their steps.** Parallel lanes kept conflicting in `attempt.go`, and XT.1 and XK.3 were rebuilt two or three times each. *Rule:* detect hotspot files and keep steps that touch them on one lane. On a conflict, a script (`accept.sh --rebase-needed`) saves the ref, resets the lane and prints a redo brief.

**L96. Dependencies are validated data, changed only by scripts.** `--next` started XW.2 before XW.1 had landed, so it built nothing, and XN.1 duplicated XK rules. A `depends_on` of "-" made `start.sh` refuse. No script could amend a dependency, so a lane sat parked until `amend-deps.sh` existed. *Rule:* validate the dependency graph at queue time.

**L97. Each class of step gets its own acceptance criteria.** Accept refused docs-only steps and demanded plants for a comment change. Dev steps needed their own path rules and a full dev-suite pass. *Rule:* classify each step as code, docs or dev tooling, give each class explicit criteria, and forbid docs rows from touching code.

## 6. Isolation and host safety

**L98. Forbid credential-reading commands in the sandbox, not in the prompt.** A Codex reviewer with no restrictions ran an unfiltered `launchctl print` and leaked the proxy password, which then had to be rotated. The prompt-level fix: every brief forbids `launchctl`, `env`, `printenv` and `security`. *Rule:* delegates get deny-listed tools and scrubbed environments. A prompt line is the weakest guard.

**L99. Scratch space is private and cleanup is exact.** A builder's `cp -R . $D/..` copied files into `/tmp` itself, then deleted by name, possibly removing other files. Another used `git stash` on a shared stack. *Rule:* scratch goes only under `mktemp -d`, agents delete only what they created, and there is no stash, rebase or merge. A shared helper library enforces this.

**L100. The host is a dependency.** Loopback stalls came from pf's state limit silently resetting to 10000. Finder's `.DS_Store` broke temp cleanups and git checkouts in fixtures. *Rule:* record the host settings the loop relies on, check them in a preflight before runs, and make fixtures tolerate OS noise.

**L101. Every background process has an owner, a bound and a reaper.** Waiter shells ran `pgrep -f` on a pattern that matched their own command line, so they looped forever. `plants.sh`'s bare `wait` deadlocked on its lock watcher. Dead heartbeats blocked runs. *Rule:* bound every loop, detach helpers deliberately, and let a stale lock be taken over once its holder is dead.

**L102. System changes are owner actions, delivered as one script.** sysctl, pf and launchd changes went to the owner as `!` lines. The owner ran a rollback first by mistake, and one line with leading spaces never ran. *Rule:* stage a single script with named apply, verify and rollback modes. Hand over blocked actions (kill, rm, tracker edits) instead of working around the classifier.

## 7. Orchestrator behavior

**L103. Brief rules still pile up in chat.** Across 13 compactions the orchestrator added about 20 rules to briefs by hand: foreground runs, no timeout, `mktemp`, plants dir, vetting plants, tags. Two conflicted: `mktemp` against the fixed plants dir the ledger looks up. This repeats L61, and none reached the template (L110). *Rule:* a brief rule exists only in the template.

**L104. Standing rules survived only through compaction summaries.** Each of the 13 summaries re-copied about 20 standing rules "verbatim". That worked, but one lossy summary could drop a security rule. *Rule:* standing rules live in a repo file that the orchestrator re-reads on every resume. Summaries point to that file rather than carry the rules.

**L105. Hand-authored formats fail at the parser.** `queue.sh` refused hand-written queue files for an empty `shas=`, duplicate numbers, a missing `%%` or a missing blank line. The judge workflow reused hard-coded labels, and backticks broke its template. *Rule:* scripts emit the files that other scripts consume, and they validate at write time, not at use.

**L106. Loop tooling is a product with its own gate.** More than 60 DEV rows (fix, tags, conflict, deps, stale) went through build, gate and review. One accepted dev step broke a different dev suite unnoticed, and one devsuite ran on an uncommitted tree. *Rule:* accepting a tooling change requires the whole tooling suite to pass on the committed SHA.

**L107. When challenged, answer with measurements and concede exactly.** "Except one package" was wrong: no Go test ran over 5 minutes, only the whole gate did. The orchestrator also misjudged XS-spec.2's tag needs and miscounted findings. It corrected each claim promptly. *Rule:* quote the ledger rather than estimates, and retract a wrong claim in the next message.

**L108. Suspect your own actions first.** The "2 agents for 30 min" slowdown came from the orchestrator's own integration run holding the lock and from its brief turning on tagged tests. This repeats L49. *Rule:* when throughput drops, list the orchestrator's own recent actions before looking at the builders.

**L109. Owner decisions arrive as short options with a lean.** Owner: "3 options, each with pro-contra under 64 words, specify your lean". They picked B within a minute, and it became D-20. *Rule:* put decisions to the owner as a few bounded options with a recommendation, record the choice as a numbered decision, and keep building while waiting.

## 8. What the orchestration docs show

**L110. The generated brief never learned the chat rules.** `start.sh` prints each brief from the README's "Builder brief" block. By 27.09 that block still lacked the stash ban, `mktemp` scratch, vetting plants, the checks-package run and the credential-command ban. Every brief was patched by hand. *Rule:* diff each brief sent against the template, and turn any difference into a template change.

**L111. A safety rule landed where delegates can't see it.** After the proxy-password leak, the retro put the `launchctl`/`env`/`security` ban into root `AGENTS.md` on trunk (`02832a1b`). The verger branch's `CLAUDE.md` and its brief template don't have it. Builders and reviewers get it only if the orchestrator remembers. *Rule:* put safety rules in what every delegate actually loads, and verify that with grep.

**L112. A cadence in the spec needs a trigger.** The README says to run the full tier after every 5 accepted steps of a module, and `status.sh` prints `INTEGRATION DUE`. In practice codex went 21–30 steps between full runs, so failures were hard to attribute. *Rule:* a cadence rule needs a scheduler that fires it. A status line someone must notice is not enough.

**L113. Blocking is cheap; polling isn't.** The README still says a builder that can't get the lock commits, reports "blocked" and stops. Practice moved on: waiting inside `gate.sh` in one foreground call is expected. The expensive thing was polling turns, not blocking. The doc never caught up. *Rule:* the spec distinguishes a blocked call (allowed) from a polling loop (banned).

**L114. The spec turned into a changelog.** The README grew from 244 to 415 lines in two days. Single table cells hold paragraphs of DEV-fix history ("it did, and a plants run under a lock hung"). Orchestrators and builders re-read it constantly. *Rule:* keep the operating contract short. The rule states the behavior, and a link carries the incident.

**L115. Pair every prompt rule with a script backstop.** The review-chain cap went into the judge brief, and `queue.sh` also refuses ids of depth 3 or more. That pairing held. Rules that lived only in prompts (foreground runs, no stash, credential commands) were broken repeatedly. *Rule:* each prompt rule names the script that enforces it, or is explicitly marked unenforced.

**L116. The retro deferred to "session end" never came.** The session ran for three days. Hotspot serialization, the resume-after-limit procedure, the launchd monitor and drain semantics appear nowhere in the README, only in summaries and a "lessons to harvest" list. *Rule:* change the doc in the turn the practice changes, and run retros on a clock.
