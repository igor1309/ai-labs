# Orchestration lessons from the Verger build sessions

What the Claude Code sessions that designed and built Verger (21–26 Sep 2026) teach about
orchestration machinery. Mined from the transcripts alone, without reading earlier lesson
write-ups. Each lesson cites the session it came from (first 8 characters of its ID; see
[Sessions](#sessions)).

## Sizing the work

1. **Small steps are the biggest lever.** M1 groups of 3–10 pure-logic scenarios went through
   easily. M6/M7 briefs held 10–13 assertions, 15–51 cases and 40–60 plants, plus review fixes and
   the next group. Those ran 50+ minutes and stalled. After the split, steps took 2–6 minutes and
   33–58k tokens and passed their gates first time. (`a0b2dd5c`)

2. **An exit gate is not a unit of work.** "57 scenarios" was M1's exit criterion, not a task.
   Work goes one scenario at a time, test first, with one commit per scenario group. The plan's
   original "one commit per milestone" would have produced commits too big to review. (`ea82353a`)

3. **Build leaves first, then nodes, then the composition root.** A plan that built the root first
   was rejected as "a constant point of drift and friction". Before composition, no component
   talks to a real collaborator. A "bridge" to a real collaborator inside a module step is an
   integration test in disguise. (`ea82353a`)

4. **Time-box every builder and check on it within the box.** Builders got 20 minutes. A 30-minute
   hang check would leave a stuck builder idle for longer than its whole box, so the check moved
   to about 10 minutes. Hitting the box is a signal to split the step, not to extend it. (`4e110584`)

## Scripts decide, agents don't

5. **Gates and mutation runs belong to infrastructure.** When builders wrote and judged their own
   plants, a plant was left applied in the tree, paths were hard-coded, a commit landed on
   `-count=1`, and a 90 s hang counted as a kill. The fix: deterministic `gate.sh` and
   `plants.sh`, with plants as `.patch` files applied in throwaway copies. (`a0b2dd5c`)

6. **A ledger plus a merge script ends duplicate verification.** Scripts record each result under
   the commit SHA, and `accept.sh` merges only when the ledger entry is clean. It never re-runs
   anything. The orchestrator's hand re-runs cost about 5 minutes each and never once disagreed
   with the builder. (`1f5a2aa4`)

7. **Planted bugs prove that a test works.** Tests that pass on arrival are backed only by the
   plants they kill. A surviving plant is acceptable only as a missing test or as an equivalent
   mutant, and a reviewer rules on which. Planted deletions exposed four blocker rules that no
   scenario tested, and those rules got new scenarios. (`a0b2dd5c`)

8. **"Test first; if the test passes, report false."** Every review finding becomes a row that
   has to reproduce the finding before fixing it. That filters out false positives cheaply: two
   lock-race findings were refuted by 0 refusals in 8,320 and 8,280 loaded attempts, and no code
   changed. (`1f5a2aa4`)

9. **No retry-until-green.** A gate failure in a test the change didn't touch becomes its own
   flake row, reported verbatim, and is never re-run until it passes. Word the rule precisely:
   rebuilding a plant that doesn't compile is legitimate, and one over-broad "don't re-run" line
   briefly blocked that. (`1f5a2aa4`)

10. **Measure flakes under load, before and after the fix.** The fixes came with numbers, such as
    182/288 → 0/288, 1238/2400 → 0/2400 and 35 failures plus 20 races → 0 in 12,800 runs. Load
    also exposed platform facts: on macOS a child's flocks outlive its observed exit by up to
    15 ms. (`1f5a2aa4`)

## Isolation

11. **One worktree and one branch per builder.** Two builders sharing a worktree shared one git
    index, and plants edited source in place while the other builder committed. That produced
    half-staged fixes and a renewal commit mixed with unrelated edits. The owner's call: "restart
    them isolated and fresh." (`a0b2dd5c`)

12. **Shared locks need their own time budget.** A single dev lock serialized plant runs. Builders
    spent their time box waiting on it, and one outer `timeout` killed a run while it was still
    waiting for the lock, before anything reached the ledger. Account for lock-wait separately,
    and forbid outer wrappers around scripts that already bound themselves. (`4e110584`)

13. **Builders never rebase, merge or cherry-pick.** Git history operations prompted the owner to
    confirm ("flow is not good — it asks me to confirm merge"). Landing belongs to `accept.sh`.
    Stacked steps need a clean plants entry at the combined head, not at the lower
    revision. (`4e110584`)

14. **Red checks run on copies, not in the worktree.** A builder edited production code in its
    worktree to prove a test fails without the fix, then restored it. It did no harm, but the
    brief now says to do that on a copy under `/tmp`. (`1f5a2aa4`)

15. **Pin external binaries by path, SHA-256 and version.** Homebrew upgraded `codex` mid-build and
    deleted the tested version. Real-binary tests must fail by name on a mismatch and never fall
    back to `PATH`. A re-pin is its own step with a source review: 0.157.0 changed the startup
    order and made a daemon the default. (`4e110584`)

## The orchestrator's role

16. **Orchestrate; don't verify.** The orchestrator drifted into re-running gates, reading diffs,
    hand-merging, and transcribing reviews with `grep`/`sed`. Any manual step it keeps repeating
    is a script to write, and the loop grew `ledger`, `accept.sh`, `review.sh`, `queue.sh`,
    `start.sh` and `status.sh` exactly that way. (`1f5a2aa4`)

17. **Send reviews to a judge.** The chain is reviewer → fresh judge → script. The judge rules on
    each finding as plan, reject, defer or owner, with a reason, and `queue.sh` applies the
    verdict. The orchestrator passes only a label. The strict version won: a judge may not reject
    a finding it merely believes is false, because the builder's test settles that. (`1f5a2aa4`)

18. **Check exit status before a hand-off.** A review that had hit the usage limit was passed to a
    judge. The judge refused to write an empty verdict, which was correct, but `queue.sh` would
    have dropped an unreviewed commit. Now only an exit 0 goes to a judge; a `limited` review stays
    queued, and other failures get one retry. (`4e110584`)

19. **Don't take an agent's word that it is working.** A notification said a builder "stopped with
    background work still running", and the orchestrator repeated it. That run had finished
    30 minutes earlier. Builders now wait on long runs in the foreground, and a watchdog checks
    for new commits, file changes and live test processes. (`a0b2dd5c`)

20. **Measure before explaining.** "Plants are slow" was asserted without data. Measured, the plants
    took 9 minutes of a 57-minute stall, on 14 cores at load 5. The real causes were oversized
    briefs and a shared worktree. (`a0b2dd5c`)

21. **Keep loop state in the repo, not the session.** The tracker row is committed before a
    builder starts, and a resume reads `git log verger..<branch>`. Session limits, restarts and
    compaction then lose nothing. The owner asked, "what is good if you keep it in memory? there
    is a tracker". (`a0b2dd5c`)

22. **Give each step a fresh builder, because contexts rot.** One reused builder passed 500k
    tokens. If a builder must stop mid-stream, it writes a handoff note of at most 80 lines:
    commits, uncommitted work, the next step, lessons and open findings. (`a0b2dd5c`)

23. **Learn the house machinery before adding any.** A new orchestrator session wrote its own plan
    file, duplicating `tracker.tsv` and `dev/README.md` and mixing in rules it had made up. The
    first move is to read the loop doc and resume from its state. (`4e110584`)

24. **When the owner says "go on", go on.** The orchestrator stopped because it predicted that the
    weekly limit would kill new builders. The fix: try, and report the actual error if one
    comes. (`4e110584`)

## The owner channel

25. **The owner cannot read the session.** Questions buried in thousands of scrolling lines go
    unseen. Questions go into `INBOX.md`, get committed, and a post-commit hook pushes each new
    line to the phone via ntfy.sh without duplicates. The inbox holds decisions only, not status
    or facts, and each item is removed once acknowledged. (`1f5a2aa4`, `bd51bd18`, `4e110584`)

26. **Classify before asking.** A defect met while running the loop becomes a plan row. A build
    question the spec leaves open goes to the decision register for the advisor. Only a genuine
    owner decision goes to the inbox. And first check the specs: "why are these decisions open
    despite we have 5000 lines?" (`4e110584`, `f8e84314`)

27. **Use a fixed format for decisions.** Give three options, each with pros and cons under
    64 words, plus a stated lean and its reason. The owner can then answer in one line ("1A 2A 3A
    4B 5A"). The format was requested repeatedly and made owner turnaround fast. (`f8e84314`,
    `547fd2f3`, `cc9e0b07`)

28. **Let an advisor model settle build questions so the loop keeps moving.** Open spec gaps get
    numbered drafts (H1–H19, CG1–CG32). A Codex advisor rules on them, and each ruling is recorded
    as a D-number. The spec is amended before the code, and the owner can overturn any ruling. The
    loop never waits on the owner for an implementation-local choice. (`a0b2dd5c`)

29. **Don't bikeshed.** Arguing over a 15 s timeout, or over negative-usage edge cases for an MVP,
    burned owner patience and tokens. A number that is a setting gets tuned by practice. Spend
    review attention on boundaries and correctness. (`50884198`, `222b6cfc`, `6b79fdbe`)

## Cross-model review

30. **A model family never reviews its own writing.** When Opus writes, Codex reviews; when Codex
    writes, Opus reviews. An unoriented adversarial review ("do not set her focus") of all of M1
    found real bugs that the earlier focused reviews had missed. (`f8e84314`, `a0b2dd5c`)

31. **Make CLI quirks harness code, not memory.** `codex exec` hung on an open stdin more than once
    until `</dev/null` and a check for the `model:` header became rules. ANSI colour broke parsing
    of the output, and a review that quoted `review.sh`'s own source faked a "limited" status. The
    test fakes had no colour or decoys, so the tests passed. (`a0b2dd5c`, `1f5a2aa4`)

32. **Treat usage limits as a scheduling input.** Codex, Claude session and weekly limits killed
    builders mid-step. After a reset: inspect the worktrees, save partial work, and give a fresh
    builder that partial work with an order to re-verify all of it. Run reviews in batches of
    3–5, and remember that a read-only reviewer cannot run the tests. (`1f5a2aa4`, `4e110584`)

## Guards and host safety

33. **Every ad-hoc loop is an unguarded loop.** A hand-written review-batch loop wrote a 200 GB log
    to `/tmp` and froze the Mac. The fix: scripts only, a size and free-space check after every
    append, whole-run and per-step timeouts, heartbeat files, and `status.sh`. A LaunchAgent
    watcher catches anything that slips past. (`4e110584`)

34. **Watchers need tests too.** The `/tmp` watcher fired on Xcode's sparse 16 GB cache files,
    because it compared apparent size instead of allocated size. Parallel plant workers sharing
    one heartbeat file hid a stalled worker, and the stale check skipped clean
    worktrees. (`4e110584`, `1f5a2aa4`)

35. **Gate load-generating runs on load.** The "gentle" stress recipe: start only when the
    one-minute load is 12 or lower, stop itself above 16, run at most 4 test binaries, stay in the
    foreground with an 8-minute cap and at most two runs, then check for leftover
    processes. (`4e110584`)

36. **Clean up without SIGKILL, and count failures as failures.** Send TERM and report survivors.
    `leftovers.sh` finds stray test processes, including those in temp directories. An `lsof`
    failure fails the gate instead of meaning "nothing left". Ctrl-C on a parent must stop its
    workers. (`1f5a2aa4`)

37. **Hand the owner a script for live credential operations.** Staged `/tmp` scripts carry a
    preflight, a budget sheet, yes/no prompts and a restore on every exit, and never print a token.
    The classifier blocks the agent from doing this itself; don't reword around it. A missed
    time window becomes a scheduled reminder. (`222b6cfc`, `4e110584`)

## Spec and design discipline

38. **Prior art is not an oracle.** The existing tools describe what works today, not what is
    best. Survey alternatives through a research subagent. During design, the orchestrator edited
    `codex-mgr`, a prior-art tool, and broke its argument handling. It had to revert, because
    Verger never changes prior-art tools. (`50884198`, `547fd2f3`, `bc4d732c`)

39. **Don't cite your own documents as authority.** The owner: "DO NOT REF docs — you wrote them!"
    Answer from first principles and from the owner's stated boundaries. For example, an adapter
    translates one outside call into a port result and knows nothing of the core's process or of
    credentials. (`547fd2f3`)

40. **Delegate research to protect the orchestrator's context.** When asked to spawn a researcher,
    the orchestrator researched itself instead, and the owner objected: "you are rotting your
    context risking work results." Research, drafting and fixing go to subagents, and the
    orchestrator keeps the thread. (`50884198`)

41. **Grep for dependents before proposing to retire something.** The orchestrator called
    `review-verdicts.md` unused. `queue.sh` writes every reject, defer and owner verdict there, and
    a test checks it; it was empty only because every verdict so far had been "plan". (`4e110584`)

42. **Plan each milestone the same way.** A planner agent drafts the plan and numbered gap
    questions, the advisor rules, spec edits land first, the rows go into the tracker, and the loop
    builds them. The owner approved the pattern once and then ran it for M8, M9 and M10 on
    parallel branches, merged after the owner's answers were applied. (`4e110584`)

43. **Restructure big docs with a script and a preview.** The 497 KB plan was split into
    `tracker.tsv`, per-step files, a build log and one plan file per milestone. A tested migration
    script did the split and checked that every ID, status and SHA survived. The owner approved a
    194-file preview diff before it ran. (`1f5a2aa4`, `4e110584`)

44. **Put a rule next to what it governs.** The hang-check interval belongs beside the builder time
    box in the loop doc, not in auto-memory, and not in the repo-wide agent rules. A rule that
    lives beside its constant changes with it. (`4e110584`)

## Sessions

Claude Code sessions for this repo that touched Verger, 21–26 Sep 2026, oldest first. The "Store"
column gives the project directory: `root` is `-Users-…-inventory`, `wt` is `…--claude-worktrees-verger`,
and `wt-tv` is `…--claude-worktrees-verger-tools-verger`.

| Session | Store | Dates | What it was |
|---|---|---|---|
| `37509281` | wt | 21 Sep | Create the verger worktree |
| `ab7e4d5e` | root | 21 Sep | First docs review; which behaviour spec governs |
| `c24c7dcd` | wt | 21–22 Sep | Docs review; synchronization baseline of locked decisions |
| `d99f3a97` | wt | 22 Sep | Docs review; Q/N/P/R decision locks |
| `340a7c2b` | wt | 22 Sep | Adversarial docs review; point-of-use selection |
| `5924d127` | wt | 22 Sep | Clarity and contradictions review; split the decisions doc |
| `6b79fdbe` | wt | 22 Sep | Subagent per review finding; "old selector is not an oracle" |
| `f8e84314` | wt | 22–23 Sep | Core component design; cross-family write/review rule |
| `547fd2f3` | wt | 22 Sep | Non-Core components; the adapter boundary; the `codex-mgr` edit reverted |
| `50884198` | wt | 22–23 Sep | HTTP, CLI, web UI, composition root; Claude provider research |
| `7ea74cef` | wt | 23 Sep | Aborted start of the Claude provider doc |
| `222b6cfc` | wt | 23 Sep | Claude provider doc drafted by Codex; CP-G6 live script |
| `cc9e0b07` | wt | 23 Sep | Codex provider design; first `/retro` |
| `bc4d732c` | wt | 23 Sep | Docs status; Codex doc review; "`codex-mgr` is prior art" |
| `7e224a5e` | wt | 23 Sep | First implementation plan draft |
| `ea82353a` | wt | 23 Sep | Plan rework: leaves before the root; scenario groups |
| `a0b2dd5c` | wt | 23–25 Sep | **Main build, M1–M7**: first subagent loop, split into small steps, gate/plants scripts |
| `d0d9a59e` | root | 25 Sep | Stub ("verger-implementation") |
| `1f5a2aa4` | root | 25 Sep | **Build continued**: ledger, `accept.sh`, `review.sh`, judge, observability, INBOX |
| `4e110584` | root | 25–26 Sep | **Loop run from the docs, M6–M8**: inbox discipline, codex re-pin, 200 GB log, watcher |
| `c39b855f` | root | 25 Sep | Options for each INBOX item |
| `bd51bd18` | wt | 25 Sep | ntfy.sh push for the owner inbox; post-commit hook |

Excluded as instructed, because they are earlier lesson write-ups: `a62cfca9`, `9a819dc2`,
`d6ac2c48`, `49446dd0`, `76d650ac` and `c46b04fe`. Also excluded is `6be93724`, the session that
wrote this file.
