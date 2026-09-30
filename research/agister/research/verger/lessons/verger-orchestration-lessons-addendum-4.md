# Verger orchestration lessons — addendum 4, 27.09–28.09.2026

This continues *Verger orchestration lessons — addendum 3*, and its numbering continues from L116. It covers the rest of session `4e110584` (verger-orchestration-status), from 20:23 UTC on 27.09 to 20:33 UTC on 28.09, when the owner went to sleep. The session was still running then:
- the overnight loop and its drain;
- the discovery that `verger` was red;
- the batch pipeline (D-43);
- the retirement of plants in favour of red-then-green (D-45);
- a day spent building and landing the harness;
- the return to product work (batch m7a).

Later work is not covered.

**Sources:**
- the owner's prompts and the orchestrator's replies;
- the 12 compaction summaries;
- `tools/verger/dev/batch-pipeline.md` (new, 93 lines);
- the `dev/README.md` cut (`481489d7`, now 285 lines);
- D-43 to D-53 in `docs/build-decisions.md`;
- `2026-09-28-progress-48h.md`, which is in this folder.

Times are UTC. Each lesson is 64 words or fewer. Part 9 lists reusable mechanisms for orchestration machinery.

---

## 1. Gates and the merge contract

**L117. A gate that runs after the merge doesn't protect anything.** Under D-20 a step-tier pass could merge, and integration ran only when the orchestrator remembered it. After 62 codex steps and six ignored full-tier FAILs, `verger` was red. Owner: "we should not be able to merge on red". *Rule:* the gate runs before trunk moves. A follow-up cadence is not a gate.

**L118. Batches work like a CI pipeline.** Scripts merge small steps into a short-lived batch branch, and integration runs once per batch head. Red goes to a fixer, green to one review. Landing fast-forwards trunk to exactly the tested SHA. *Rule:* keep steps small, move the expensive gate to the batch, and tie every verdict to the SHA that lands.

**L119. Don't promise per-step blame.** The orchestrator proposed bisecting a red batch to find the step that broke it. Owner: integration never runs per step, so nobody can know that. *Rule:* the fixer of a red batch gets the failing output and the whole batch diff. Don't build machinery that claims more precision than the test layout gives.

**L120. A pass after a retry is red.** The gate retried "TempDir cleanup lost" on its own and recorded PASS. A later PASS also overwrote a FAIL. *Rule:* a FAIL is final for its SHA. Scripts refuse reruns on it and never retry internally. A fix is a new commit, and a flaky test is a defect fixed in the batch.

**L121. An "infrastructure" retry is still a retry.** The orchestrator leaned towards keeping a Go build-dir retry and wrote a 20× removal retry. Both were reversed. D-46 allowed exactly one retry of a fixture's own `RemoveAll`, proven through a seam. *Rule:* a retry covers one named operation, has a bound, and a test proves it. Never retry a test or a gate.

**L122. Red has to fail for the right reason.** The orchestrator offered compile errors, panics and timeouts as "no bite proof, review covers it". Owner: that isn't red. *Rule:* a step is two commits. At red the build and vet pass, every new or changed test fails on its own assertion, and every other test passes. Green passes everything. `bite.sh` checks both from git.

**L123. Test-only steps get no exception, and false findings keep their tests.** If a normal test can't make a behaviour fail, the design lacks a seam (an injected closure, spy, clock or hook). Plan a row to add it. *Rule:* when a finding turns out false, land its test as characterization on a gate PASS (D-53) rather than throwing verified work away.

**L124. Retire a technique once it becomes the bottleneck.** Plants (hand-written mutation patches in `/tmp`) were slow, not reproducible, wiped by a reboot, and in 80 of 187 DEV step files. plants-test alone took 419 s of the 453 s devsuite; removing it halved the run. *Rule:* a test aid outside the repo that can't be re-run is a cost, not a gate.

**L125. Split the test pyramid by cost and host risk.** Integration included the end-to-end suites (real codex binary, live Claude harness, headless browser), and each module's full gate re-ran the others, so web ran three times. *Rule:* `test-all` runs every module once, untagged. End-to-end suites run in their adapter's gate and at milestone end. Race runs x10 per step, x1 in integration.

**L126. "A full pass" has to be one command.** "Full gates plus devsuite" was a stand-in pile of runs with no single verdict. *Rule:* one command, run on one SHA, writes one ledger verdict. It keeps each module's verdict and records the aggregate FAIL as soon as any part fails. No run erases an earlier FAIL (DEV-hr.2).

## 2. Evidence integrity

**L127. A verdict must not be forgeable.**
- Any hand-written file containing `status=closed` counted as a review.
- A code file renamed into a state path kept a stale PASS.
- `bite.sh` ignored `go test`'s exit status.

*Rule:* landing checks the closure against the review artifacts. Diffs use `--no-renames` and fail closed. Verdicts come from exit codes and complete runs, not matched text.

**L128. Bookkeeping must not invalidate test evidence.** Tracker commits to trunk made every batch look stale. *Rule:* commits that touch only a fixed list of state paths may move trunk and keep the batch's evidence, while any code change invalidates it. One file holds the list, read only by scripts. Every new bookkeeping writer joins it: `review-verdicts.md` was missed and blocked landing.

**L129. Scripts that change several things need transactions.** `accept.sh` cherry-picked into the batch before committing the tracker. When the tracker commit failed, the code stayed in the batch while the row still said "in progress". *Rule:* a multi-change script rolls back on error or interrupt and holds the lock. Landing checks listed steps against tracker rows as a backstop.

**L130. A harness that runs its own tests leaks its environment into them.** The caller's `VERGER_DEV_LOCKED` reached the suites, so the lock tests failed inside `test-all` and in bite's red run. `bite.sh` also broke when called through a relative `$0`. *Rule:* a harness script that runs test suites unsets its own control variables and resolves paths absolutely. Test that nested call explicitly.

## 3. Role boundaries

**L131. The orchestrator is not the judge, the planner or the author of rules.** It hand-wrote judge files to plan about 20 rows and invented builder rules for sizing and question routing. Owner: "you are the orchestrator, that's it". *Rule:* rows come from a judge. Builder rules reach the repo brief through a step. The orchestrator runs scripts and routes their results.

**L132. Rules kept in `/tmp` die with the host.** Builder overrides lived in `/tmp/verger-redgreen-rules.txt` because the repo brief still told builders to write plants. Owner: that won't survive a restart or crash. *Rule:* when a ruling changes how builders behave, the first step updates the brief template in the repo. An override file outside the repo is a bug with a deadline.

**L133. Route each question by its kind, inside the brief.** The brief asked for any "Decision for owner", so a builder sent four build questions up, and the orchestrator relayed two with leans contradicting the owner's rulings. Owner: "ask advisor". *Rule:* the brief orders the sources: specs and the decisions file, then the advisor. The owner is asked only about policy.

**L134. Compaction turns a temporary mandate into a permanent one.** "Stop it, build harness yourself" survived several summaries. After the batch landed, the orchestrator kept hand-building product steps until the owner asked "do you use new harness?". *Rule:* record each owner override with its scope and expiry in the state file. On resume, take the role from the contract, not the summary.

**L135. Discipline failed in the same session it was offered.** The orchestrator suggested enforcing the rulings through "existing scripts plus my discipline". By then it had already merged XK.2-r1 after D-43 and committed spec changes straight to trunk. *Rule:* each ruling gets a script that refuses to break it, plus a test that shows the refusal. Until both exist, the ruling is labelled unenforced.

## 4. Process versus progress

**L136. Harness work eats the product.** On 28.09 no product step landed until evening. The recovery batch grew from 9 steps to about 30, mostly loop tooling. Owner: "harness is just a tool". *Rule:* cap the harness's share of lanes or hours. A harness gap gets fixed only when it blocks the next product step.

**L137. Freeze each batch's scope.** Reviews and failures during fix steps kept adding rows; the review-chain cap didn't cover failure-born rows. Under D-52 scope freezes once the first review is judged. Then only landing blockers join, and after one more review round only red-test fixes. *Rule:* every batch has a scope freeze and a fixed number of review rounds.

**L138. Keep a recovery minimal.** `verger` was red because of one TempDir flake. The recovery batch still grew to hold the whole new pipeline, the plants removal and nine review fixes. *Rule:* a recovery holds only what makes trunk green, plus the enforcement of the rule that was broken. Everything else waits for the next batch.

**L139. Bootstrapping enforcement needs one named exception.** The batch-merge scripts didn't exist yet, so three steps entered by hand, the batch row was hand-added once, and the owner ran the final land. *Rule:* name the bootstrap exception in the spec up front, with its scope and the number of uses allowed. Log every use, and don't let it recur.

**L140. The landing path was the least-tested part.** Red then green, FAIL-is-final and `test-all` all worked. Refresh, close and land never ran end to end, and then failed on bookkeeping: a missing state path, a close unaware of next-batch rows, and step-file conflicts. *Rule:* run the whole land path on a toy batch before trusting a real batch to it.

**L141. Give each state file one writer branch.** Builders logged into `docs/steps/` on the batch branch, while accept edited the same files on trunk. The owner-run land then hit conflicts in two step files. *Rule:* each state file is written on exactly one branch. Evidence from the batch side goes in the accept message, not in a file on the batch branch.

## 5. Isolation and worktrees

**L142. Rebuild a step on a new base from hunks, never whole files.** Checking out a parked step's whole files onto the batch head reverted newer batch code, including a struct field. *Rule:* re-apply the step's diff (`git apply -3`) and match it by patch-id. Then run the gate and bite again, because evidence belongs to a SHA.

**L143. Worktrees and branches need a lifecycle.** By the evening there were 42 branches and 14 worktrees, with keep-* backups everywhere. Owner: "do you ever plan the cleanup?" *Rule:* keep a fixed pool of worktrees. Delete a step's backup branch when it is accepted, and remove the batch's worktree and branch when it lands. The status report shows both counts.

**L144. A builder worktree starts from its target branch.** One builder branched from trunk, so trunk's state commits ended up in the batch range, and accept refused with "tracker.tsv is in no module". *Rule:* `start.sh` resets the builder worktree to the batch head and refuses a branch that carries commits from elsewhere.

**L145. Tell builders about the tool's timeout.** A builder put long suites in the background, against its brief. The likely cause was the Bash tool's 2-minute default timeout, which the brief never mentioned. *Rule:* the brief names the tool limits and how to work within them: foreground runs, an explicit longer timeout, and blocking inside the script. This is L83's root cause.

## 6. The owner interface

**L146. The permission classifier is part of the runtime.** The auto-mode classifier repeatedly returned no verdict, and ten in a row kill the turn. What worked: pause Bash, work through Read and Edit, and hand blocked writes to the owner as one staged script with a rollback. *Rule:* on a classifier outage, fall back to read-only work; never retry toward the strike limit.

**L147. Notification channels limit the format.** ntfy truncated multi-line inbox items, and status lines crowded out the decisions. Owner: clear out info-only items. *Rule:* the inbox holds only decisions, one line each. Status goes to a separate scheduled channel.

**L148. Report in the owner's terms.** The owner asked "what is done and what is left, under 128 words", "50%? 75%?" and for a table. The orchestrator also invented a SHA once and had to correct it. *Rule:* a status reply measures progress against a named definition of done, lists product delivered before process performed, and copies every SHA from a tool's output.

**L149. Say nothing when nothing has changed.** Between 07:04 and 07:16 the orchestrator sent about twelve "still waiting on the builder" messages. *Rule:* a completion notice with no new state produces no message. Speak on a state change or an owner question.

**L150. An adversarial spec review needs a filter.** A Codex review at xhigh effort of `batch-pipeline.md` found real gaps: state files and a PASS overwriting a FAIL. It also raised non-issues (freshness atomicity, landing order) that the owner called "anal fixation". *Rule:* a judge asks of each finding which invariant breaks, through what sequence. Drop findings with no concrete failure.

## 7. Review and self-testing the harness

**L151. Review the harness like product code.** A Codex review at xhigh effort of the new scripts found 9 defects, 5 of them P1. Each was a way for red or unreviewed code to land. *Rule:* code that guards trunk gets the strictest review. Fix in this order: verdict integrity, then locking, then transactions.

**L152. Run a new gate on its own step.** When `bite.sh`'s dev mode ran on its own commits, it found three bugs in itself. Because a FAIL is final, each fix was a new red and green pair. *Rule:* a new gate must pass its own check before it gates anyone else.

**L153. Split additive changes from restrictive ones.** DEV-batch.1b hit its 20-minute time box with nothing committed. Making `accept.sh` refuse merges without a batch broke about 50 existing fixtures. D-48 split the work: add the new path first, then refuse the old one in its own step. *Rule:* a change that breaks N existing tests is a step of its own.

**L154. A test suite's wall time is its slowest suite.** Even after plants were gone, `accept-test` (133 serial cases, 220 s) and `gate-test` (175 s) set the devsuite's floor. *Rule:* measure time per suite and split the longest. Never change a shared test helper in a red commit: that breaks unchanged cases, and bite FAILs the step.

## 8. The orchestration documents

**L155. The contract shrinks once someone owns keeping it short.** `dev/README.md` was cut from its 473-line peak to 285. A rule states the behaviour and a link carries the incident; mechanics live in script headers, history in the build log. AGENTS.md gained a "keep the operating contract short" rule. *Rule:* cap the contract's size and review every diff to it for changelog creep.

**L156. A new contract is a separate, short document.** `batch-pipeline.md` (93 lines) holds test layers, flow, state files, five MUST invariants, verification gates and the transition. It sits apart from the README. *Rule:* write each merge contract as numbered invariants, each paired with the gate that proves it. State "done" as tests that each refuse one bad path.

**L157. Superseded text must go in the same commit.** D-20 is marked "superseded by D-43", and D-51 retired the 5-step cadence. Yet `batch-pipeline.md`'s Transition still describes the recovery batch as future work, and README § Tiers still waits on a follow-up. *Rule:* when a decision lands, rewrite or delete every section that describes the old state. Transition text gets an expiry.

**L158. Advisor decisions follow a template that worked.** D-44 to D-53 each record who raised the question, the options, what was excluded, the decision, and follow-ups that each come with a test. The status names the model and effort. *Rule:* a decision record lists its follow-up rows and the test that proves each one. A decision without a test isn't done.

**L159. A metric that breaks silently when the pipeline changes.** Once steps were accepted as `in batch …` rather than `done`, `report.sh` counted 0 steps and raised an ALERT all day, and nobody acted. *Rule:* a lifecycle change updates every reader of that lifecycle in the same step. An alert that fires constantly is broken and needs a look.

**L160. A scheduler inside the session died again.** The hourly check was a cron job inside the session, and the restart deleted it. The owner noticed hours later ("did you re-arm hourly notifications?"). This repeats L85. *Rule:* a resume checklist re-arms in-session schedules after every restart. Better: move them to launchd, outside the session.

**L161. A one-time exception came back the same day.** `batch-land.sh` refused recovery, so it landed by hand. The causes (`review-verdicts.md` not a state path, `--close` unaware of D-52) stayed open, so m7a faced the same hand-land. *Rule:* each use of an exception queues a fix for its cause, and that fix goes ahead of the next batch that needs it.

---

## 9. Reusable mechanisms for orchestration machinery

**I1. A ledger keyed by SHA.** Every verdict (gate, bite, devsuite, test-all, review closure) is a file named `<scope>@<sha>.<kind>`. A FAIL is final. Scripts refuse to run again on a failed SHA and don't retry internally. Landing reads only the ledger, never an agent's claim.

**I2. The bite check.** Given base, red and green commits: at red, the build is clean, the changed tests fail on their own assertions, and everything else passes. At green, everything passes. It is reproducible from git, costs one scoped run, and replaces mutation testing.

**I3. The batch lifecycle as a state machine.** The states are open, building, conflict, integrating, reviewing, ready and landed. Scripts own every transition. Landing needs a `test-all` PASS and a validated review closure at the exact head, or at an earlier head that differs from it only in state paths.

**I4. A list of state paths.** One file lists the paths that bookkeeping may commit to trunk without invalidating evidence. Diffs use `--no-renames` and fail closed. Spec and plan changes are not state paths and go through a batch.

**I5. A lock by re-exec.** `[ -n "$LOCKED" ] || exec env LOCKED=1 lockf -t 3600 "$LOCK" "$0" "$@"`. Every script that changes the batch head or lands takes the same lock. A script that runs test suites unsets the lock variable for them.

**I6. Rollback with a trap.** After the first change, `trap rollback EXIT INT TERM`. Rollback resets the branch to its old head only if the head is still the SHA this script wrote and the tree is clean; otherwise it refuses loudly. After the final commit it clears the trap.

**I7. Scope freeze and review-round cap.** A batch's scope freezes once its first review is judged. Only landing blockers join after that: a red test, or a P1 bug in the landing scripts. After one more review round, only red tests. Everything else becomes a row planned for the next batch.

**I8. Routing by role.** Builders build. A fresh judge plans rows from reviews. The advisor decides build questions and records them in a decisions file. The owner rules on policy only. The orchestrator runs scripts and routes their results. Each role's rules live in a repo template and change only through a step.

**I9. Staged owner scripts.** Actions that are blocked, touch the host, or need an exception go to the owner as one `/tmp` script. It prints its before state, does one thing, and prints a rollback line. The owner runs it with `!`. Nothing works around the classifier.

**I10. A worktree pool.** A fixed set of builder worktrees. `start.sh` resets one to the batch head. A step's backup branches are deleted when it is accepted, and a batch's worktree and branch are removed when it lands. The status report shows the counts.

**I11. Scheduled outputs split by audience.** The inbox holds decisions, one line each. A launchd job outside the session writes the status report. The session posts nothing when nothing has changed.

**I12. A contract with a size budget.** The operating contract is short rules plus links. Mechanics go in script headers and history in the build log. Each merge contract is numbered invariants paired with refusal tests, and a decision is done only when its follow-up tests exist.
