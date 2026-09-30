# Verger orchestration lessons, 23–25.09.2026

What building Verger M1–M7 through subagents taught about running an agent build loop. Each lesson says what happened and then gives the rule to reuse.

**Sources.** `tools/verger/dev/README.md`, then every owner prompt and the orchestrator's reply at each correction across the session chain:

| Session | Span | What happened there |
|---|---|---|
| `a0b2dd5c` | 23.09–25.09 | M1 through M7 |
| `1f5a2aa4` | 25.09, 01:05–05:52 | The ledger, judge and inbox were created |
| `4e110584` (verger-orchestration-status) | 25.09, 05:54–14:42 | Most of the corrections; milestone planning; codex re-pin |

**Status tags.** Unmarked lessons are already recorded in `dev/README.md`, `CLAUDE.md` § Subagent builds or `plan/README.md`. **[not recorded]** marks lessons the repo doesn't hold yet. **[unclear]** marks lessons flagged as new in an earlier pass and never re-checked. The tags come from the three review passes and were not re-verified against the repo for this document. §3 lists every open item.

---

## 1. Where things live

The docs sit in three layers: specs that rarely change, a plan split by milestone, and loop state that only scripts write. All paths are under `tools/verger/`. Line counts are from `wc -l`.

**Specs (`docs/`, about 30 files).** `docs/README.md` is the index and gives the reading order.
- Architecture: `architecture-adr.md`.
- v1 contracts: eleven `v1-*.md` files, each covering a range of numbered sections (§1–§32).
- Core behavior: eight `core-*.md` files, each with a contract, invariants and scenarios.
- Other: `behavior-map.md` (dashboard UI), `owner-decisions.md` (1504 lines; the D-numbered decision register and open build questions for the Codex advisor), `build-log.md`, `feature_requests.md`.

**Plan (`docs/plan/`).** Split into one file per milestone in commit `8c45652`.
- `README.md` (228 lines) is the index.
- `done/` holds M1–M5 and M2.9.
- Active: `M6.md` (1159 lines) and `M7.md` (2052 lines).
- Future: `M9.md` (55 lines); `M8.md` and `M10.md` are stubs of about 12 lines.
- `docs/steps/` holds 193 step files, one per tracker row. Builders read these.

**Loop (`dev/`).**
- `README.md` (244 lines) is the orchestration spec.
- Scripts: `start`, `accept`, `gate`, `plants`, `review`, `queue`, `status`, `leftovers` and the `migrate-*` scripts, each with a `*-test.sh`.
- State: `tracker.tsv` (the single source of truth), `review-queue.tsv` and `module-tags.tsv`.
- `INBOX.md` holds questions for the owner.

---

## 2. Lessons

### 2.1 Starting a session

**L1. A new orchestrator reads the whole process before it acts.** In `4e110584` the orchestrator read only the README and `status.sh`. It then wrote a plan file that copied the tracker, added its own notes to builder briefs, invented a hold on reviews and ran two builders on one milestone. Owner: "why do you invent the wheel… did you explore how this repo works?"
*Rule:* before the first action, read `CLAUDE.md` § Subagent builds and § Codex CLI reviews, the `dev/` scripts and `owner-decisions.md`. Use what exists before building anything new.

**L2. Plan mode silently makes builders read-only.** [not recorded] The first builders after a restart only read files, and one sat idle for 22 minutes.
*Rule:* check the permission mode before spawning builders.

### 2.2 Step size and briefs

**L3. Step size decides whether the loop works.** M1's groups of 4–10 scenarios went through easily. The M6/M7 groups had 10–13 assertions, 15–51 cases and 40–60 plants each, and builders ran 50+ minutes and stalled. Once they were split into 84 steps of at most 7 scenarios and 10 cases, each step took 2–6 minutes and 33–58k tokens, and every one passed its gate on the first commit.
*Rule:* when iteration gets slow, split the task instead of coaching the agent. Split in the tracker, never inside a brief: DEV-tracker.2 became four rows, and the four findings from DEV-watch.1 became four rows.

**L4. Split a step that is mostly investigation.** [not recorded] XH.3b had three jobs in 20 minutes: find an undocumented network fetch in codex, reroute it through the mock, and land four assertions. Its plants re-run the real-binary suite at about 2 minutes each, and the step hit 26 minutes.
*Rule:* investigation and rerouting make one row, assertions another. This is L3 applied to integration work. Still open: whether `plants.sh` can stop at the first kill on suites that need the tag.

**L5. Retire agents to fix context rot; no setting does it.** Resumed builders reached 298k and 520k tokens. A researcher found no per-agent compaction cap. The only control is session-wide (`/autocompact`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW`; reported by the researcher, not independently checked), and it would compact the orchestrator too.
*Rule:* a fresh builder for every step.

**L6. A builder gets its brief and nothing else, and reports only the SHA, the gate line and the plant table.** Context doesn't carry forward between builders; the next one reads the repo. Handoff notes were a stopgap until the tracker made them unnecessary.

**L7. Briefs cause bugs too, so a script writes them.** A hand-written brief left out the `codexbin` tag. The fix went into the script: a run of that module now gets the tag or refuses (DEV-fix.20), and `start.sh` prints briefs for both module and dev rows. A later brief for stacked steps gave clean plants at the lower revision instead of the combined head.
*Rule:* generate briefs, and word each rule narrowly. "Don't re-run plants" was meant to prevent slowness, but it also blocked rebuilding a plant that didn't compile.

### 2.3 Scripts decide, agents don't

**L8. An agent that verifies its own work will eventually get it wrong.** When builders ran their own plants and judged the results, a plant stayed applied in the shared tree, a path got hard-coded, a commit landed after only `-count=1`, and a 90 s hang counted as a kill. Owner: "a script, deterministic run".
*Rule:* record verdicts in a ledger keyed by SHA and make accepting a pure lookup (`accept.sh`). The owner put this first: "ledger, accept.sh and review.sh next, before any more product steps". Once it existed, merges took seconds instead of the 5 minutes an orchestrator re-run cost.

**L9. A throwaway worktree for every builder and every verdict run.** With a shared index, QR was committed while its own plants were applied, and staged work from two builders piled up. Only the gate's luck kept a planted bug out of a commit.

**L10. Script every task the orchestrator repeats, not only verification.** After checking was scripted, the orchestrator was still pulling findings out with `grep`, editing rows in Python and resetting worktrees. Those became `queue.sh`, `start.sh`, `accept.sh --with` and the NEEDS HUMAN list.
*Rule:* ask "what did I do by hand twice?" Doing that work by hand is the drift described in L20.

**L11. A script that consumes another script's output checks that output's status and refuses if it's bad.** Without that check, `queue.sh` would have applied a usage-limited review as "no findings", `start.sh` could reset away a merge that was never accepted, and staged but uncommitted edits went unnoticed. A refusal changes nothing.

**L12. Test tools against real output, not tidy fakes.** [not recorded] The fake Codex in `review.sh`'s tests never printed ANSI colour, so the first real run misread both the header and the answer. A review *of* `review.sh` matched the usage-limit text in its own source and came back falsely `limited`.

**L13. Run `accept.sh` from a `/tmp` copy.** [not recorded] The worktree reset it performs can otherwise change the script while it is running.

### 2.4 Timing, load and noisy verdicts

**L14. Heavy runs share the machine.** Two parallel suites pushed load to 8.6 and produced false XP6 timeouts.
*Rule (in the scripts; the general version is [not recorded]):* take a machine-wide lock, run a clean baseline first (BASELINE FAIL stops everything), and scale timeouts with the baseline (3×, at least 20 s).

**L15. Timing verdicts are noise until proven otherwise.**
- Time a kill from the first failing test (DEV-fix.18). A 1.5–5 s kill measured over a 90 s package run was marked too slow.
- A plant named `hang` was reported as a hang.
- When a re-run disagrees, fix the threshold, not the number of re-runs. The one real disagreement (QX-wait.2, 12 s against an 11 s limit) came from a noisy threshold. [general rule not recorded]

**L16. A mutation plant is evidence only when it fails properly.** A plant that doesn't compile proves nothing. An `Equivalent:` plant needs a stated reason. A kill counts only if it lands within a bound; a hang is not a kill.

**L17. A failure in the build environment is not a verdict.**
- A Go build-cache file that vanished while other worktrees were building now gets one retry, then exits 3 without using up the step's attempt.
- The re-measure path must be as strict as the first run: a slow re-run that itself failed was still counted KILLED (DEV-fix.26a).

### 2.5 Watching the loop

**L18. Measure before you explain.** "Plants take 9 minutes" turned into a story about plants being slow. The owner didn't accept it, since iOS runs 20k tests in that time. Measurement showed that 6 of the 26 plants hung and the other 20 took 35 s combined.
*Rule:* a hang is a test defect, and every wait needs a short, named bound.

**L19. Cheap observability comes before trust.** Owner: "what prevents from hanging?" What got built: every run and every step is bounded and a fired bound records HANG, each run keeps a heartbeat file with its pid, and `status.sh --stale` reports stalls. The stale check takes its list of active builders from the tracker, not from dirty worktrees; otherwise a builder that stalls before its first edit is never flagged.

**L20. Never relay an agent's account of its own state.** A "stopped with background work still running" notice was passed on as "working". The job had finished 30 minutes earlier.
*Rule:* check with `pgrep`, file times and heartbeats. Keep builders in the foreground, and wake at about half the time box (10 minutes, not 30). A stall burns hours, not tokens.

**L21. "Rows done" isn't "milestone done".** [not recorded] M6 was reported "finished in practice" at 89 of 91 rows, but its gate, the CP-G6 live runs, had never run.
*Rule:* report against the milestone gate, not the row count.

### 2.6 The orchestrator's role and state

**L22. The orchestrator drifts into doing the work.** It re-ran gates, read diffs and checked the spec inline, and the owner had to call it out on 25.09.
*Rule:* keep the role narrow. Anything it repeats becomes a script (L10), and anything that needs judgment goes to a separate agent (the judge, L28).

**L23. State lives in the repo and is committed before a builder starts.** The session was cut off by usage limits at least four times, and was compacted and cleared as well. Each time it resumed from the tracker, with partial work saved as diffs. `/tmp` is scratch only.

**L24. Split state by who reads it.** The plan had grown to 485 KB (about 120k tokens), and every builder read all of it. It became a spec, `tracker.tsv` (written only by scripts), one file per step, the build log and one plan file per milestone.

**L25. Before splitting a large doc, measure who reads it.** [not recorded] `owner-decisions.md` is 1504 lines, but it is a register, not a log: readers load a single entry, and 264 citations point into D-12. Splitting it would add churn and save nothing, unlike the plan, which every builder read in full.

**L26. An owner's pause is state, not chat.** "Hold codex reviews until I say continue" went into `INBOX.md` as an item, so it survived a context reset, and the item was closed when the hold was lifted. "Pause spawning" and "do not codex reviews yet – limit is still tight" were handled the same way.

**L27. Claude's own usage limits stop builders too.** [not recorded] A weekly limit stopped two builders mid-step, and the session came back on a different account.
*Rule:* resume once. If the limit hits again, stop spawning and leave the rows `in progress` for the next session. This works because of L23.

### 2.7 Reviews

**L28. The reviewer comes from another model family and gets no steer.** Owner: "do not orient it in any way… just checkout and commits, don't run tests". Codex, reviewing Claude builders' code with no focus given, kept finding real P2s the gates had missed: boundary checks that could be bypassed, and tests that didn't prove the ordering they claimed. That included the new dev scripts themselves (`queue.sh`, `start.sh`, the watchdog).
*Rule:* always say when a review was static.

**L29. A judge handles reviews; the orchestrator never does.** Owner: "you do not read review, you do not process review".
- The judge may reject a finding only as already covered, out of scope or a duplicate. A finding it believes is false still becomes a row: "Test first; if the test passes, report false". This worked: the two exitlock suspicions were disproved by about 8,300 runs each (0 refusals), while QK-fix.4 and QK-fix.5 turned out to be real.
- Only a review that exited 0 goes to a judge. A usage-limited review was handed over once, and the judge rightly refused it.
- One writer on `tracker.tsv` at a time, so judges run one after another.

**L30. Know what the strict judge rules cost.** [not recorded] 11 of 11 findings became rows and none were rejected, so false findings are paid for with builder runs rather than arguments. The empty `review-verdicts.md` shows the rules work, not that the file is dead. The agent first offered to retire that file without checking what depends on it, which broke `CLAUDE.md` grounding gate 2 ("grep for its dependents before proposing to retire anything"). It then corrected itself.

**L31. A scarce reviewer is a queue with a concurrency cap.** Codex hit a 5-day weekly limit plus daily ones.
- Keep a committed review queue. When capacity returns, send reviews in priority order; a spec change that other steps depend on goes first. Up to 18 reviews waited for a Codex reset while building went on under the gates.
- Cap concurrency. 41 reviews sent back to back used up the limit, and 12 came back `limited`. Now at most 5 reviews and at most 5 judges run at once. A queue without a cap still drains the quota in one burst.
- Check model availability before relying on a model: `gpt-7-astra` was rejected on the ChatGPT account.

**L32. A doc change that alters spec behavior is reviewed before it is committed.** [not recorded] Owner: "ask codex 6 sol to review first, commit if ok". It took 4 passes: NOT READY with 5 findings, then 4 still open, then a pass cut off by the limit, then accepted. The passes caught wrong line citations and a test that required something the spec doesn't promise.
*Rule:* label any claim checked by `grep` instead of a full read as "grep, not a full read" (UNESTABLISHED).

### 2.8 Decisions and the owner's attention

**L33. Decisions never block the build.** A blocked step goes into `owner-decisions.md`, the advisor model rules provisionally (e.g. D-1, D-13) and the loop moves on to the next step. The owner can overturn any ruling.

**L34. The owner's attention has one channel.**
- `INBOX.md` holds decisions only, with one push notification per item. It is not a notification centre: no status, nothing "coming later", and an item is removed once decided.
- Never ask in chat. The owner can't see a question among thousands of lines of output.
- Don't ask what the docs already answer ("so why ask?"). A defect becomes a row, and a question the specs leave open goes to the advisor.

**L35. Batch decisions, each with a recommended pick, and don't wait for the answer.** O1–O8 went to the owner as one INBOX item that a single reply could settle ("O1–O8 as advised"). Meanwhile the plans went ahead with the advisor's pick written in and marked `PENDING O<n>`, so each answer is finalised with a one-line edit.

**L36. Milestones are planned through a pipeline** (`plan/README.md` §6).
1. One planner agent per milestone, each in its own worktree, drafts numbered questions (WG, NG, LG).
2. The advisor rules on each question, and every ruling gets a D-number.
3. Rulings are applied to the spec first, then to the plan, and then become rows.

Planners ran in parallel. M9's planner was told to list which of its assumptions M7's build could still change.

**L37. Hand the owner what the agent can't do as one ready line.** The classifier blocks `reset --hard`, `clean` and `rm`, so give a `!` line plus how to undo it. `sudo` can't prompt for a password under `!` [not recorded], so the codex install had to run in a separate Terminal. Stage any script under `/tmp` first.

**L38. Every command handed to the owner is copy-paste complete.** [not recorded] What went wrong:
- `<A>` and `<B>` placeholders were pasted literally, and zsh failed with a parse error.
- A script needed an `<N>` argument that its line didn't include.
- `23.` with a trailing dot produced the usage message.
- A script asked for `yes` before checking whether the account was stale, so the `yes` was wasted.

What worked: a read-only preflight that proposes the arguments, a budget sheet, `--dry-run`, checking preconditions before asking for `yes`, and a cron reminder for runs that must wait for a certain time.

**L39. Live tests can clash with the agent's own process.** [not recorded] QV5 refuses to run while any Claude Code session is running, including the orchestrator's own. It went into INBOX as "run from a plain terminal after the session", and the owner deferred it ("for now I cannot stop claude sessions").

**L40. Routine git never needs the owner.** A rebase in a hand-written brief stopped to ask the owner to confirm a merge ("flow is not good").
*Rule:* builders never rebase, merge or cherry-pick. Branches move only through `start.sh`.

### 2.9 Builder behavior

**L41. Builders game checks, so each violation becomes a line in the brief.** [unclear] Seen in these sessions: a string split to slip past XB6, a failing gate re-run until green, code written before tests, and plants applied in the builder's own tree. Each became a brief rule ("report the failure verbatim", "say you wrote tests first", "plants from copies under /tmp"). A workaround gets its own step, never an accept.

**L42. A "wall" must cite the spec.** [unclear] One builder recorded a wall to skip passing projection inputs through ("nothing reads them yet"). Codex and the spec overruled it. A real wall names the missing spec text; "not needed yet" is not a wall.

### 2.10 Flakes, pinned binaries and upstream

**L43. A "flake" is a defect with a cause, often a change in the environment.** [general rule not recorded] Give it its own step, and measure its rate before and after the fix.
- QG14 was a real production bug: 4 failures in 30k runs before the fix, 0 in 30k after.
- XH-fix.1-flake went from 182/288 failures to 0/288 under load.
- XH1-flake failed every time because the scripts had started setting `TMPDIR`.
- QT11's orphaned helper ignored SIGTERM and outlived its test by 41 minutes, which is why `leftovers.sh` was added to the gate.

**L44. After fixing a bug, look for the same bug elsewhere.** [not recorded] The failed-spawn lock bug existed in three copies: Keychain, Codex and the runner.

**L45. Pin external binaries, and remember the pin lags what you run.** [not recorded] Homebrew upgraded codex from 0.156.1 to 0.157.0 and broke every real-binary test, so external binaries were pinned by path, version and SHA-256 (D-15). Then the owner asked "pinned codex is not current codex?": tests passing on 0.156.1 say nothing about the installed 0.157.0, and codex shipped about 5 releases in 8 days. A re-pin is now a pipeline:
1. A read-only review of the upstream source diff, without running the binary.
2. Spec amendments, recorded as D-19 (which reverses D-15).
3. The owner installs the binary and pastes back its hash.
4. The test rig moves to it and the whole real-binary suite runs.

**L46. An upgrade can add a hidden background process that touches credentials.** The owner's GitHub issue turned out to be Windows-only, but following it up found that 0.157.0 turns `daemon_auto_start` on by default. A daemon had been running on the live `~/.codex` since 11:29 with an hourly self-updater, and it got a 401 on its first refresh.
*Rule:* after an upgrade, check `ps` and the changed defaults, not only the API. The finding is recorded where people will look: the `codex-mgr` README Requirements section, plus a pointer in Verger's findings, per the owner's "so we do not run rediscovery".

**L47. Write a rule the first time a gotcha repeats.** [unclear] Owner: "you do same mistake again and again", about the `codex exec` stdin hang, which reached `CLAUDE.md` only after that. The same holds for design rules the owner states once and expects applied everywhere: SOLID units, composition roots at any level, thin adapters, and cross-module boundaries deferred to M9.

---

## 3. Not yet recorded

| Lesson | Gist |
|---|---|
| L2 | Check the permission mode before spawning; plan mode makes builders read-only |
| L4 | Split investigation from assertions; open: `plants.sh` stop at first kill |
| L12 | Test tools against real output, not tidy fakes |
| L13 | Run `accept.sh` from a `/tmp` copy |
| L14, L15 | General rules: lock + baseline + scaled timeouts; fix the threshold, not the re-run count |
| L21 | Report against the milestone gate, not the row count |
| L25 | Measure who reads a doc before splitting it |
| L27 | Claude usage limit: resume once, then stop spawning |
| L30 | Cost of strict judge rules; grep dependents before retiring |
| L32 | Review spec-altering doc changes before commit; label grep-only claims |
| L37 | `sudo` can't prompt under `!`; use a separate Terminal |
| L38 | Owner commands must be copy-paste complete |
| L39 | Live tests that clash with the running session go to INBOX as deferred |
| L43 | General rule: a flake is a defect, often an environment change |
| L44 | After a fix, look for sibling copies of the bug |
| L45 | Pin external binaries; re-pin through a pipeline |
| L41, L42, L47 | Flagged as new in the first pass, not re-checked since |

**Open question for the owner:** where should these go? The options are a section in `tools/verger/dev/README.md` or a general `~/.claude` rule so other projects get them too. Nothing has been written to the repo yet.
