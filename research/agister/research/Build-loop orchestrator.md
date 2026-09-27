# The build-loop orchestrator

A design for building software through subagents, based on what Verger M1–M7 taught (see *Verger orchestration lessons*, cited as L-numbers).

## Concise

The orchestrator builds software by sending out builder agents, one small step at a time. It never builds, verifies or reviews anything itself. Scripts decide every verdict, a judge handles every review, and all state lives in the repo.

**Roles**
- **Orchestrator:** picks the next row, spawns a builder, runs `accept`, routes reviews and questions. Repeated manual work becomes a script.
- **Builder:** a fresh agent for every step. It gets a brief that a script generated, writes tests first, and reports only the SHA, the gate line and the plant table.
- **Scripts:** deterministic, run in throwaway worktrees under a machine-wide lock, with timeouts scaled from a baseline run. They record verdicts in a ledger keyed by SHA, so accepting a step is a lookup.
- **Reviewer:** a model from another family. It gets only the commits, no steer. Reviews go through a queue with a concurrency cap.
- **Judge:** a fresh agent for each review. Every finding becomes a row unless it is already covered, out of scope or a duplicate. Only a test can prove a finding false.
- **Advisor:** rules provisionally on questions the specs leave open.
- **Owner:** decides through the inbox only, on batched questions with recommended picks.

**Invariants**
- A step has at most 7 scenarios and 10 cases. Oversized work is split in the tracker, never inside a brief.
- State is committed before each builder starts, so any session can resume from the repo.
- Nothing blocks the build: not a decision, not a review, not a quota.
- Every wait has a bound, and a hang is a defect. Liveness is checked with `pgrep` and heartbeats, never taken from an agent's own account.
- A milestone is done when its gate passes, not when its rows are done.

## Detailed

### Principles

1. **Small steps, fresh agents.** Speed depends on step size, and a long-lived agent's context rots (L3, L5). Slow steps get split, not coached.
2. **Scripts decide.** An agent verifying its own work eventually gets it wrong (L8). Judgment goes to separate agents: judge and advisor.
3. **The repo is the memory.** Sessions get compacted, cleared and cut off by limits, so everything that matters is committed (L23).
4. **The owner's attention is scarce.** It gets one channel, and only decisions go there (L34).

### State layout

State is split by who reads it (L24):
- **Specs:** contracts, scenarios, the ADR and the D-numbered decision register. Rarely changed; readers load single entries.
- **Plan:** one file per milestone. Each milestone has a gate.
- **Steps:** one file per tracker row. A builder reads only its own.
- **`tracker.tsv`:** the single source of truth for every row's status. Only scripts write it, and only one writer at a time.
- **Queues:** the review queue and module tags.
- **`INBOX.md`:** open owner decisions, plus owner holds such as "pause reviews", which are state, not chat (L26).

### The step cycle

1. `status` shows the next row, which is committed as `in progress`.
2. `start` resets a throwaway worktree and prints the brief. It refuses if the previous merge was never accepted (L11) or if the brief would miss a module tag (L7).
3. A fresh builder gets the brief and nothing else. The brief's rules come from past violations: write tests first, report failures verbatim, apply plants only to copies under `/tmp`, never rebase, merge or cherry-pick (L40, L41). A "wall" must cite the missing spec text (L42).
4. `gate` runs the suite plus `leftovers` (orphaned processes), then `plants` runs the mutation plants. Each plant must compile, and must be killed within a bound; a hang is not a kill. An `Equivalent:` plant needs a stated reason (L16). Both record a verdict in the ledger.
5. `accept` merges only on a clean ledger entry for that SHA. It re-runs nothing and runs from a `/tmp` copy of itself (L13).
6. The commits enter the review queue.

### Verdict hygiene

- Machine-wide lock; clean baseline first. Baseline failure stops everything; timeouts are 3× baseline, minimum 20 s (L14).
- Time a kill from the first failing test, not from the start of the package run (L15).
- When a re-run disagrees, fix the threshold rather than adding re-runs. A re-measure is as strict as the first run (L15, L17).
- An environment failure, such as a vanished build-cache file, gets one retry, then exits without using up the step's attempt (L17).
- Test the scripts against real tool output, not tidy fakes (L12).

### Observability

Every run and step is bounded, and a fired bound records HANG. Each run writes a heartbeat with its pid. `status --stale` takes active builders from the tracker, so one that stalls before its first edit is still caught (L19). The orchestrator wakes at about half the time box and checks `pgrep` and file times, never an agent's own report (L20). When something is slow, it measures before explaining (L18).

### Reviews

- The reviewer, from another model family, gets only the commits: no focus, no tests. Static reviews are labelled static (L28).
- The queue is committed and runs in priority order; a spec change other steps depend on goes first. At most 5 reviews and at most 5 judges run at once, and building continues under the gates while reviews wait (L31).
- Only a review that exited 0 goes to a judge. Judges run one at a time because they write the tracker (L29).
- The judge turns each surviving finding into a row. A finding it suspects is false becomes "test first; if the test passes, report false" (L29). False findings cost builder runs, and that price is accepted (L30).
- A doc change that alters spec behavior is reviewed before it is committed. Claims checked only by `grep` are labelled as such (L32).

### Decisions and the owner

- A question the specs leave open goes to the advisor. The advisor's ruling is recorded as a D-number and applied provisionally, and the loop moves on (L33).
- Owner decisions are batched in one inbox item, each with a recommended pick, and sent with one push notification. Work continues with the pick written in and marked `PENDING`, so the answer finalises with a one-line edit (L35).
- A defect never becomes a question: it becomes a row (L34).
- What the agent can't do goes to the owner as a copy-paste-complete `!` line with its rollback: no placeholders, preconditions checked before asking for `yes`, staged under `/tmp`. `sudo` runs in a separate Terminal (L37, L38).

### Milestones and capacity

One planner per milestone, in parallel worktrees, drafts numbered questions. The advisor rules, and rulings flow into spec, then plan, then rows. A milestone is done only when its gate passes (L21, L36).

If Claude's usage limit stops builders, the orchestrator resumes once. On a second hit it stops spawning and leaves rows `in progress` for the next session (L27).

### Environment

- External binaries are pinned by path, version and SHA-256. A re-pin is a pipeline: review the upstream source diff, amend the spec, have the owner install the binary and paste back its hash, then run the full real-binary suite (L45).
- After an upgrade, check `ps` and the changed defaults for hidden background processes (L46).
- A flake is a defect with a cause: its own step, with the failure rate measured before and after. Then look for sibling copies of the bug (L43, L44).

### Starting or resuming a session

1. Read the whole process first: the loop spec, the scripts, the decision register and the review rules. Reuse what exists (L1).
2. Check the permission mode, since plan mode makes builders read-only (L2).
3. Read the tracker and inbox, then continue from the committed state.
