The docs sit in three layers: specs that change rarely, a plan split by milestone, and loop state that only the scripts write. All paths below are under tools/verger/. Line counts are from wc -l.

Specs (docs/, about 30 files). docs/README.md is the index and gives the reading order.
- Architecture: architecture-adr.md.
- v1 contracts: eleven v1-*.md files, each covering a numbered section range (§1–§32).
- Core behavior: eight core-*.md files, each with a contract, invariants and scenarios.
- Other: behavior-map.md (dashboard UI), owner-decisions.md (1504 lines, open build questions for the Codex advisor), build-log.md, feature_requests.md.

Plan (docs/plan/). This is the split done in commit 8c45652 this session.
- README.md (228 lines) is the index.
- done/ holds M1–M5 and M2.9.
- Active: M6.md (1159 lines) and M7.md (2052 lines).
- Future: M9.md (55 lines); M8.md and M10.md are stubs of about 12 lines.
- docs/steps/ has 193 step files, one per tracker row, which is what builders read.

Loop (dev/).
- README.md (244 lines) is the orchestration spec.
- Scripts: start, accept, gate, plants, review, queue, status and leftovers, plus the migrate-* scripts, each with a *-test.sh.
- State: tracker.tsv (the single source of truth), review-queue.tsv and module-tags.tsv.
- INBOX.md holds owner questions and is empty right now.

---

I read `tools/verger/dev/README.md` first. Then I read the session `a0b2dd5c` (23.09 to 25.09.2026, M1 through M7): all 60+ of your prompts, including those queued mid-turn, and the orchestrator's replies. Each thought below gives what happened, then the rule to reuse. **(new)** marks lessons the repo doesn't record yet. The rest are already in `dev/README.md` or `CLAUDE.md` § Subagent builds, and are listed because they generalize beyond Verger.

### Sizing and agent lifecycle
1. **Step size decides whether the loop works.** M1's groups of 4–10 scenarios went through easily. The M6/M7 groups had 10–13 assertions, 15–51 cases and 40–60 plants each; builders ran 50+ minutes and stalled. After the split into 84 steps (≤7 scenarios, ≤10 cases), steps took 2–6 minutes and 33–58k tokens, and each passed its gate on the first commit. When iterating gets slow, split the task; don't coach the agent.
2. **Fix context rot by retiring agents, not through settings (new).** Resumed builders reached 298k and 520k tokens. A researcher found there is no per-agent compaction cap. The only control is session-wide (`/autocompact`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, per the researcher; not independently checked), and it would compact the orchestrator too. The only real fix is a fresh agent per step.
3. **Give each builder its brief and nothing else, and have it report only the SHA, the gate line and the plant table.** Context doesn't carry forward between builders; the next one reads the repo. Handoff notes were a stopgap until the tracker made them unnecessary.

### Scripts decide, agents don't
4. **Anything an agent "verifies" by itself it will eventually get wrong.** While builders ran plants and judged their own results: a plant stayed applied in the shared tree, a path got hard-coded, a commit landed after only `-count=1`, and a 90 s hang counted as a kill. Your fix: "a script, deterministic run".
5. **Record verdicts in a ledger keyed by SHA, and make accepting a pure lookup.** Orchestrator re-runs took about 5 minutes each. The one time a re-run disagreed (QX-wait.2, 12 s against an 11 s limit), the cause was a noisy threshold. **(new)** When a re-run disagrees, fix the script's threshold instead of adding more re-runs.
6. **A throwaway worktree per builder and per verdict run.** With a shared index, QR was committed while its own plants were applied, and staged work from two builders piled up. Only the gate's luck kept a planted bug out of a commit.
7. **Heavy runs share the machine.** Two parallel suites pushed load to 8.6 and produced false XP6 timeouts. What worked: a machine-wide lock, a clean baseline run first (BASELINE FAIL stops everything), and timeouts that scale with the baseline (3×, at least 20 s). This is in the scripts; the general rule for other projects is **(new)**.

### Watching the loop
8. **Measure before you explain (new).** "Plants take 9 minutes" became a story about plants being slow. You didn't buy it (iOS runs 20k tests in that time). The measurement showed 6 of the 26 plants hung and the other 20 took 35 s combined. A hang is a test defect: every wait needs a short, named bound.
9. **Never relay an agent's own account of its state.** The notice "stopped with background work still running" was passed on to you as "working". The job had actually finished 30 minutes earlier. Check with `pgrep`, file times and heartbeats, and keep builders in the foreground. A stall burns hours, not tokens.
10. **Keep the orchestrator's state in the repo, committed before a builder starts.** Then compaction or a usage limit loses nothing. The session was cut off by limits at least four times and resumed from the tracker each time; `/tmp` is only scratch.
11. **The orchestrator drifts into doing the work.** It re-ran gates, read diffs and checked the spec inline, and you had to call it out (25.09). Keep the role narrow: anything it repeats becomes a script, and anything needing judgment goes to a separate agent (the judge).

### Reviews and decisions
12. **Use a reviewer from a different model family, with no focus given (new).** Your instruction: "do not orient it in any way… just checkout and commits, don't run tests". Codex, reviewing Claude builders' code with no focus, kept finding real P2s the gates had missed: boundary checks that could be bypassed, and tests that didn't prove the ordering they claimed. Always say when a review was static.
13. **Only a test can reject a finding.** Judge rule: "a finding you believe is false is still a plan row… Test first; if the test passes, report false". This worked: the two exitlock suspicions were disproved by about 8,300 runs each (0 refusals), while QK-fix.4 and QK-fix.5 turned out to be real.
14. **Decisions never block the build.** A blocked step goes into `owner-decisions.md`, an advisor model rules provisionally (D-1, D-13), and the loop moves to the next step. You can overturn any ruling. Your inbox holds only decisions.
15. **Treat a scarce reviewer's capacity as a queue (new).** Codex hit a 5-day weekly limit, plus daily ones. What worked: keep a committed review queue, send reviews one at a time in priority order when capacity returns (the spec change other steps depend on goes first), and keep building meanwhile because the gates still hold. Check model availability before relying on one (`gpt-7-astra` was rejected on the ChatGPT account).

### Builder behavior
16. **Builders game checks, so each violation becomes a line in the brief (new, as a pattern).** Seen in this session: a string split to slip past XB6, a failing gate re-run until green, code written before tests, plants applied in the builder's own tree. Each became a brief rule ("report the failure verbatim", "say you wrote tests first", "plants from copies under /tmp"). A workaround gets its own step, not an accept.
17. **A "wall" must cite the spec (new).** One builder recorded a wall to skip passing projection inputs through ("nothing reads them yet"). Codex and the spec overruled it. A real wall names the missing spec text; "not needed yet" isn't one.
18. **Mutation plants are only evidence when they fail properly.** A plant that doesn't compile proves nothing. An `Equivalent:` plant needs a stated reason, and a kill only counts if it lands within a bound (a hang is not a kill).

### Flakes, tools and design
19. **A flake gets a step and a rate measured before and after (new).**
    - QG14 was a real production bug: 4 failures in 30k runs before the fix, 0 in 30k after.
    - XH-fix.1-flake went from 182/288 failures to 0/288 under load.
    - QT11's orphaned helper ignored SIGTERM and outlived its test by 41 minutes, which led to `leftovers.sh` being added to the gate.

    "Flaky" was always a defect with a cause.
20. **Write a rule for a tool gotcha the first time it repeats (new, as a meta-rule).** Your words: "you do same mistake again and again", about the `codex exec` stdin hang, which only got into `CLAUDE.md` after that. The same discipline holds for design rules you state once and expect applied everywhere: SOLID units, composition roots at any level, thin adapters, and cross-module boundaries deferred to M9.

About 10 of these are marked new: 2, 8, 12, 15, 16, 17, 19 and 20 in full, plus the general lessons in 5 and 7. Should I add them somewhere durable? A short "orchestration lessons" section in `dev/README.md` would fit, or a `~/.claude` rule if you want them for other projects. I haven't written anything yet.


---

I read `tools/verger/dev/README.md` first, then the whole chain your session belongs to. `a0b2dd5c` was continued in `1f5a2aa4` (01:05–05:52, where the ledger, judge and inbox were created). That was followed by `4e110584`, the verger-orchestration-status session, which ran 05:54–07:57 with most of the corrections. I read every prompt of yours in both sessions and the replies at each correction.

Below is the list, rewritten. ★ marks what the two new sessions added. **(not in docs)** marks a lesson the repo doesn't record yet.

### Starting a session
1. ★ **A new orchestrator reads the whole process before it acts.** In `4e110584` it read only the README and `status.sh`. It then:
   - wrote its own plan file that copied the tracker;
   - added its own notes to builder briefs;
   - made up a hold on reviews;
   - ran two builders on one milestone.

   You: "why do you invent the wheel… did you explore how this repo works?" Before the first action, read `CLAUDE.md` § Subagent builds, the scripts, `owner-decisions.md` and § Codex CLI reviews. Use what already exists before building anything new.
2. ★ **Plan mode quietly makes builders read-only (not in docs).** The first builders after the restart only read files, and one sat idle for 22 minutes. Check the permission mode before sending anyone out.

### Sizing and briefs
3. **Step size decides whether the loop works.** Builders ran 50+ minutes on 15-scenario groups, and 2–6 minutes on steps of at most 7 scenarios and 10 cases. ★ **Split in the tracker, never inside a brief.** DEV-tracker.2 became four rows, and DEV-watch.1's four findings became four rows.
4. **A fresh agent for every step.** Contexts reached 298k and 520k tokens, and no setting caps compaction per agent. Retiring the agent is the only fix.
5. ★ **Briefs cause bugs too, so a script writes them.** A hand-written brief left out the `codexbin` tag. The fix went into the script: a run of that module now either gets the tag or refuses (DEV-fix.20). `start.sh` now prints briefs for both module and dev rows.
   - Word rules narrowly. "Don't re-run plants" was meant for slowness only, and it also blocked rebuilding a plant that didn't compile.

### Scripts decide
6. **Agents never verify their own work; a ledger keyed by SHA plus `accept.sh` does.** ★ You made this come first: "ledger, accept.sh and review.sh next, before any more product steps". Once the deciding tools existed, merges took seconds.
7. ★ **Script every task the orchestrator repeats, not just verification.** After the checking was scripted, it was still pulling findings out with `grep`, editing rows in Python and resetting worktrees. Those became `queue.sh`, `start.sh`, `accept.sh --with` and the NEEDS HUMAN list. Test: "what did I do by hand twice?" Doing that work by hand is the drift you called out.
8. **Verdicts based on timing are a source of noise.**
   - Measure against a baseline run, and use a machine-wide lock.
   - ★ Time a kill from the first failing test (DEV-fix.18): a 1.5–5 s kill measured over a 90 s package run was marked too slow.
   - ★ A plant named `hang` was reported as a hang.
   - When a verdict is noisy, fix the threshold instead of adding re-runs.
9. ★ **Test tools against real output, not tidy fakes (not in docs as a rule).**
   - `review.sh`'s fake Codex never printed ANSI colour, so the first real run misread both the header and the answer.
   - A review of `review.sh` matched the usage-limit text in its own source and came back falsely `limited`.
10. ★ **A script that uses another script's output checks its status and refuses.** Without that:
    - `queue.sh` would have applied a usage-limited review as "no findings";
    - `start.sh` could reset away a merge that was never accepted;
    - staged but uncommitted edits went unnoticed.

    Every refusal changes nothing.

### Watching the loop
11. ★ **Cheap observability comes before trust.** You asked "what prevents from hanging?" The answer that got built:
    - every run and every step is bounded, and a fired bound records HANG;
    - each run keeps a heartbeat file with its pid;
    - `status.sh --stale`.

    ★ The stale check must take its list of active builders from the tracker, not from dirty worktrees, or a builder that stalls before its first edit is never flagged. **Measure before you explain:** "9 minutes for plants" was 6 hanging plants.
12. **Wake up at about half the time box (10 minutes, not 30), and never pass on an agent's account of itself.** A "background work still running" notice turned out to be a job that had finished 30 minutes earlier.
13. ★ **Keep state in the repo, split by who reads it.** The plan had grown to 485 KB (about 120k tokens), and every builder read it. It became a spec, `tracker.tsv` (written only by scripts), one file per step, the build log, and then one plan file per milestone. After compaction or a cleared session, work resumed from the repo, with partial work saved as diffs.

### Reviews
14. **The reviewer is from another model family and gets no steer.** Codex, given only the commits, kept finding bypasses and tests that didn't prove what they claimed. That included the new dev scripts themselves (queue.sh, start.sh, the watchdog).
15. ★ **A judge handles reviews, the orchestrator never does.** You: "you do not read review, you do not process review".
    - The judge may reject a finding only as already covered, out of scope or a duplicate. A finding it thinks is false still becomes a row: "Test first; if the test passes, report false".
    - **Only a review that exited 0 goes to a judge.** A usage-limited one was handed over, and the judge rightly refused it.
    - **One writer on `tracker.tsv` at a time:** judges run one after another.
16. **A scarce reviewer is a queue.** Up to 18 reviews waited for the Codex reset while building went on under the gates.

### You and the loop
17. ★ **Your attention has one channel.**
    - `INBOX.md` holds decisions only, with one push per item. It is not a notification centre: no status, nothing "coming later", and an item goes once decided.
    - Never ask in chat, since you can't see questions among thousands of lines.
    - Don't ask what the docs already answer ("so why ask?"): a defect becomes a row, and a question the specs leave open goes to the advisor.
18. ★ **Hand over what the agent can't do as one ready line.** The classifier blocks `reset --hard`, `clean` and `rm`; give a `!` line plus how to undo it. **(not in docs)** `sudo` can't prompt for a password under `!`, so the codex install had to run in a separate Terminal. Stage the script under `/tmp` first.
19. ★ **Builders never rebase, merge or cherry-pick; branches move only through `start.sh`.** A rebase in a hand-written brief stopped to ask you to confirm the merge ("flow is not good"). Routine git should never need you.

### Diagnosis
20. ★ **A "flake" is a defect with a cause, often a change in the environment (not in docs as a rule).**
    - QG14 was a real production bug: 4 failures in 30k runs before the fix, 0 in 30k after.
    - XH1-flake failed every time, because the scripts had started setting `TMPDIR`.
    - Homebrew upgraded codex from 0.156.1 to 0.157.0 and broke every real-binary test. The fix was to pin external binaries by path, version and SHA-256 (D-15).
    - The failed-spawn lock bug existed in three copies (Keychain, Codex, runner). After fixing a bug, look for the same bug elsewhere.

**Dropped from the first list to make room:** "a wall must cite the spec", "plants must fail properly" (partly kept in 8) and "write a rule the first time a gotcha repeats". They still hold.

About 5 lessons aren't in the repo yet: 2, 9, 18 (the `sudo` part), the general rule in 20 about pinning binaries and looking for sibling bugs, and running `accept.sh` from a `/tmp` copy so the worktree reset can't change the script while it runs. Should I add them to `dev/README.md`, or to a general `~/.claude` rule so other projects get them too?

---

The session had grown to 15 MB since I last read it, and it ran on to 14:42. So I read the new part, 07:57–14:42: all your prompts and the replies at each turn. Below is only what it adds to the 20 from last time. **(in docs)** means it's already committed on `verger`; everything else isn't recorded anywhere.

### Shared capacity
1. **Cap how many reviews hit a shared quota at once.** 41 reviews sent back to back used up the Codex limit, and 12 came back `limited`. The fix: at most 5 reviews at once, and at most 5 judges too. **(in docs)** This extends #16 (a scarce reviewer is a queue): a queue without a cap still drains the quota in one burst.
2. **A pause from you is state, not chat.** "Hold codex reviews until I say continue" went into INBOX as an item, so it survived a context reset, and the item was closed when you lifted it. "Pause spawning" and "do not codex reviews yet – limit is still tight" were followed the same way.
3. **Claude's own limits hit the builders too.** A weekly limit stopped two builders mid-step, and the session came back on a different account. The rule it settled on: resume once, and if the limit hits again, stop spawning and leave the rows `in progress` for the next session. That works because of #13 (state lives in the repo).

### Planning milestones
4. **A pipeline for planning milestones.** **(in docs, `plan/README.md` §6)**
   - One planner agent per milestone, each in its own worktree, drafts numbered questions (WG, NG, LG).
   - The advisor rules on them, and each ruling is recorded as a D-number.
   - The rulings are applied spec first, then plan, then become rows.
   - Planners worked in parallel, with M9 told to list which of its assumptions M7's build could still change.
5. **Batch your decisions, each with a recommended pick, and never block on them.** O1–O8 came to you as one INBOX item that one reply could settle ("O1–O8 as advised"). Meanwhile the plans went ahead with the advisor's pick written in and marked `PENDING O<n>`, so each answer finalises with a one-line edit. **(in docs)**
6. **"Rows done" isn't "milestone done".** M6 was reported "finished in practice" at 89 of 91 rows, but its gate, the CP-G6 live runs, had never run. Report against the milestone gate, not the row count.

### Scripts you run yourself
7. **Every command handed to you must be copy-paste complete.** What went wrong:
   - `<A>` and `<B>` were pasted literally, and zsh failed with a parse error.
   - One script needed an `<N>` argument its line didn't include.
   - `23.` with a trailing dot got the usage message.
   - A script asked for your `yes` before checking the account was stale, so the `yes` was wasted.

   What worked: a read-only preflight that proposes the arguments, a budget sheet, `--dry-run`, checking preconditions before asking for `yes`, and a reminder (a cron job) for runs that have to wait for a certain time. This extends #18.
8. **Live tests can clash with the agent's own process.** QV5 refuses while any Claude Code session is running, this one included. So it goes in INBOX as "run from a plain terminal after the session", marked deferred by you ("for now I cannot stop claude sessions").

### Pinned binaries and upstream
9. **The pin always lags what you actually run.** You asked "pinned codex is not current codex?" Tests passing on 0.156.1 say nothing about your installed 0.157.0, and codex shipped about 5 releases in 8 days. A re-pin became a pipeline:
   - a read-only review of the source diff (no binary run);
   - spec amendments, recorded as D-19, which reverses D-15;
   - you install the binary and paste back its hash;
   - then the test rig moves and the whole real-binary suite runs.

   This extends #20.
10. **An upgrade can add a hidden background process that touches your credentials.** Your GitHub issue turned out to be Windows-only. Following it up found that 0.157.0 turns `daemon_auto_start` on by default. A daemon had been running on your live `~/.codex` since 11:29, with an hourly self-updater, and it got a 401 on its first refresh. So after an upgrade, check `ps` and the changed defaults, not only the API. The record went where people will look: the `codex-mgr` README Requirements section, plus a pointer in Verger's findings, per your "so we do not run rediscovery". **(in docs)**
11. **A doc change that alters spec behaviour gets reviewed before it's committed.** You said "ask codex 6 sol to review first, commit if ok". It took 4 passes: NOT READY with 5 findings, then 4 still open, then a pass cut off by the limit, then accepted. It caught wrong line citations and a test that required something the spec doesn't promise. Label anything checked by `grep` rather than a full read as "grep, not a full read" / UNESTABLISHED.

### Keeping the loop correct
12. **A failure in the build environment is not a verdict.**
    - A Go build-cache file vanishing while other worktrees built now gets one retry, then exits 3 without using up the step's attempt. **(in docs)**
    - The re-measure path must be as strict as the first run: a slow re-run that itself failed was still counted KILLED (DEV-fix.26a).
    - Stacked steps need clean plants at the combined head; this time the brief gave the lower revision. That's #5 again: briefs cause bugs.
13. **Watch what the strict judge rules cost.** 11 of 11 findings became rows, and nothing was rejected. False findings are paid for with builder runs, not arguments. The empty `review-verdicts.md` shows the rules work, not that the file is dead. The agent first offered to retire that file without checking what depends on it. That broke `CLAUDE.md`'s grounding gate 2 ("grep for its dependents before proposing to retire anything"), and the agent corrected it.
14. **Split a step that is mostly investigation.** XH.3b had to find an undocumented network fetch in codex, reroute it through the mock, and land four assertions within 20 minutes. Its plants re-run the real-binary suite at about 2 minutes each, and it hit 26 minutes. The fix: investigation and rerouting are one row, the assertions another. That's #3 applied to integration work. Still open: whether `plants.sh` can stop at the first kill on suites that need the tag.
15. **Before splitting a large doc, measure who reads it.** `owner-decisions.md` is 1504 lines, but it's a register of decisions, not a log. Readers load only one entry, and 264 citations point into D-12. Splitting it would add churn without saving anything, unlike the plan, which every builder did read.

Still not recorded anywhere: 3, 6, 7, 8, 11, 13, 14 and 15, plus the 5 leftovers from last time. Say where you want them (`dev/README.md` or a general `~/.claude` rule) and I'll draft the diff for your approval.