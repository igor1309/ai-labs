# Agent orchestration lessons from building Verger (21–26.09.2026)

What a week of Claude Code sessions teaches about machinery for orchestrating agents. It covers
design (21–23.09) and build (23–26.09). Each lesson gives what happened and the rule to reuse.
Session IDs are the first 8 characters of the transcript names listed in § Sessions.

The build-phase lessons overlap *Verger orchestration lessons* and its two addenda (L1–L76, in the
owner's Writer folder). Those documents have longer evidence. This one also covers the design phase.

---

## 1. Roles: who does what

**1. The orchestrator orchestrates.** It re-ran gates, read diffs, hand-merged, processed reviews
and researched inline. Owner: "you drifted from orchestration into checking". Its re-runs cost
5 minutes each and never disagreed with the builder. *Rule:* spawn, run scripts and route work.
Judge only what no script can (`a0b2dd5c`, `1f5a2aa4`).

**2. "Spawn a subagent" means spawn.** The orchestrator researched Claude token renewal itself
instead of spawning a researcher. Owner: "you are rotting your context risking work results". *Rule:*
delegate every piece of reading-heavy work. The orchestrator's context is the scarcest resource in
the loop (`50884198`).

**3. Reviews go to a judge, never to the orchestrator.** A fresh judge per review decides each
finding: new plan row, reject, defer or ask the owner. The orchestrator passes the label along and
applies the one-line verdict. That keeps review text out of its context and its bias out of the
triage (`1f5a2aa4`).

**4. The judge can reject only for narrow reasons.** Allowed reasons: already covered, out of scope
or duplicate. A finding it believes false still becomes a row: "Test first; if the test passes,
report false". False findings cost one cheap builder run instead of an argument. Two suspicions
were disproved by about 8,300 runs each (`1f5a2aa4`, `4e110584`).

**5. The writer and the reviewer come from different model families.** Owner: "opus writes ⇒ codex
reviews, codex writes ⇒ opus reviews". The same family shares blind spots. Codex kept finding real
P2s in Claude builders' code that the gates missed, including bugs in the dev scripts themselves
(`f8e84314`, `a0b2dd5c`).

**6. Give an adversarial reviewer no steer.** Owner: "do not orient it in any way, do not set her
focus, just tell check out and commits". A focus you choose limits the review to your own blind
spots. Say when a review was static (Codex's read-only sandbox can't run `go test`) (`a0b2dd5c`).

**7. A builder that goes in circles hands the draft to another model.** The Claude provider doc
went through several fix-and-review rounds, and each review found new problems. Owner: "you are going
in circles… ask astra 6 to draft it". Switching drafters broke the loop. Check the new drafter got
every input: "did you tell it about the research docs?" (`222b6cfc`).

**8. An advisor model takes decisions that would otherwise block the build.** A build question the specs
leave open goes to `owner-decisions.md`, and the Codex advisor rules on it provisionally with a
D-number. The loop moves on, and the owner can overturn any ruling. The owner said: "for my
decision create separate file, and move on, do not stop" (`a0b2dd5c`).

## 2. Steps and briefs

**9. Step size decides whether the loop works.** M1's groups of 4–10 scenarios went through easily.
M6/M7 groups of 15–51 cases ran 50+ minutes and stalled. After the split to at most 7 scenarios and
10 cases, steps took 2–6 minutes and passed first time. *Rule:* when iteration slows, split the
task instead of coaching the agent (`a0b2dd5c`).

**10. The milestone gate is a scenario count, and commits go per scenario group.** "57 scenarios at
once?" 57 was only M1's exit gate. One commit per milestone was too big to review. Owner: "that is
essential as gate definition". Scenario groups in the spec's own order became the unit of work
(`ea82353a`).

**11. Build leaves first, then nodes, and composition last.** The first plan built the composition
root before the modules: "a constant point of drift and friction". Leaves first, then nodes, then
root and adapters. Components talk only to their own interfaces backed by fakes. Integration
belongs to composition (`ea82353a`).

**12. Split investigation from assertions.** One step had to find an undocumented codex network
fetch, reroute it through a mock and land four assertions. It ran 26 minutes. Investigation is one
row and assertions another. That is lesson 9 applied to integration work (`4e110584`).

**13. A fresh builder for every step.** Resumed builders reached 298k and 520k tokens. Owner: "if you
reuse subagents you have to control the context — they do rot". There is no per-agent compaction
cap. Retiring the builder is the only control. It reads the repo, not the previous builder's memory
(`a0b2dd5c`).

**14. A builder reports only three things.** It reports a SHA, the gate line and the plant table.
Anything longer is narrative that the orchestrator would have to read and trust. Evidence lives in
the ledger, not in the report (`CLAUDE.md` § Subagent builds).

**15. A script generates briefs, and a rule added by hand becomes a script row.** A hand-written brief
left out a build tag. In three hours, six rules were added to briefs by hand and lived only in the
session. *Rule:* a line added to a brief by hand is also a `start.sh` row, filed in the same turn
(`4e110584`).

**16. Word brief rules narrowly.** "Don't re-run plants" was meant to save time. It also blocked
rebuilding a plant that didn't compile. A broad rule prevents the fix along with the fault
(`4e110584`).

**17. Builders never touch git history.** A rebase in a hand-written brief stopped to ask the owner
to confirm a merge ("flow is not good"). Builders don't rebase, merge or cherry-pick. Branches move
only through `start.sh` and `accept.sh` (`4e110584`).

**18. Code written ahead of its row is unverified.** A builder wrote code for the next five
assertions without tests. The next row's tests then passed on their first run. *Rule:* the report
lists code written beyond the row. The owning row's brief marks it unverified, and its plants become
the only evidence (`4e110584`).

**19. A "wall" must cite the spec.** A builder declared a wall to skip passing inputs through
because "nothing reads them yet". Codex and the spec overruled it. A real wall names the missing
spec text. "Not needed yet" is not a wall (`a0b2dd5c`).

## 3. Scripts decide, not agents

**20. Verdicts come from a deterministic script, never from an agent.** Builders that ran their own
plants left a plant applied in the tree, committed after one run and counted a 90 s hang as a kill.
Owner: "agents should not control that — they'll fuck up — we need infrastructure". A gate and
plant runner writes a ledger keyed by SHA (`a0b2dd5c`).

**21. Accepting is a lookup.** `accept.sh` merges only on a clean ledger entry for the builder's SHA
and never re-runs anything. Merges took seconds instead of 5 minutes. The owner put this ahead of
product work: "ledger, accept.sh and review.sh next, before any more product steps" (`1f5a2aa4`).

**22. Every builder and every verdict run gets a throwaway worktree.** With a shared tree, a step was
committed while its own plants were applied, and staged work from two builders piled up. Only luck
kept a planted bug out of a commit (`a0b2dd5c`).

**23. Script anything the orchestrator does by hand twice.** After checking was scripted, it still
grepped findings, edited rows in Python and reset worktrees by hand. Those became `queue.sh`,
`start.sh` and `accept.sh --with`. Doing that work by hand is how the orchestrator drifts back into
doing the work (`1f5a2aa4`).

**24. The orchestrator writes no tooling of its own.** Its untracked `/tmp` review loop wrote a
200 GB log and froze the Mac. The loop had run unguarded for eight hours. *Rule:* any helper becomes
a DEV row and ships as a tested `dev/` script. Every append checks size and free space (owner:
"check after log append") (`4e110584`).

**25. A script checks the status of the output it consumes.** `queue.sh` would have applied a
usage-limited review as "no findings". `start.sh` could reset away an unaccepted merge. *Rule:*
refuse on bad upstream status. A refusal changes nothing. Only a review that exited 0 goes to a
judge (`1f5a2aa4`, `4e110584`).

**26. Every path through the loop has a script, including the unhappy ones.** A flake came back
false with no commit, and no script could close that row, so M7 stayed blocked. `accept.sh --false`
was added and has its own guards. *Rule:* design close paths for "found nothing", "died" and
"superseded" (`4e110584`).

**27. Test tools against real output, not tidy fakes.** The fake Codex never printed ANSI colour, so
the first real run misread both the header and the answer. A review of `review.sh` matched the
usage-limit text in its own source and came back falsely `limited` (`1f5a2aa4`).

**28. A script must not change while it runs.** `accept.sh` resets the worktree it lives in. Run it
from a `/tmp` copy, and give the brief the absolute path to `verger`'s `dev/`. A stale worktree copy
of `gate.sh` hit the very flake a newer version fixed (`4e110584`).

**29. Pair every manual override with the row that removes it.** The orchestrator allowed one gate
re-run for a Go temp-dir error, then queued the fix that makes the gate classify that error itself.
An override without a row becomes a habit (`4e110584`).

## 4. Evidence: gates, plants, flakes

**30. A mutation plant is evidence only when it fails properly.** A plant that doesn't compile proves
nothing, so check that every patch applies and builds before the baseline. An `Equivalent:` plant
needs a stated reason. A kill counts only within a bound, and a hang is not a kill (`a0b2dd5c`,
`4e110584`).

**31. Plants target the must-fail assertions first.** Three reviews found assertions that only
logged a violation and never failed. No plant targeted them, so plants couldn't catch them. The
judge and reviewer check for assertions that only log (`4e110584`).

**32. Measure before you explain.** "Plants take 9 minutes" became a story about slow plants. Owner:
"I don't buy it". Measurement showed 6 of 26 plants hung, and the other 20 took 35 s combined.
*Rule:* a hang is a test defect, and every wait has a short, named bound (`a0b2dd5c`).

**33. No fixed sleeps in tests.** A 50 ms wait broke a plants baseline at load 10. An unbounded
stream wait turned a plant into a 385 s hang. Wait on the event, and bound the wait (about 2 s for
in-process waits, 20 s for child processes) (`4e110584`).

**34. A flake is a defect with a cause.** QG14 was a real production bug: 4 in 30k runs before the
fix, 0 after. Another flake came from the scripts setting `TMPDIR`. *Rule:* give it its own step,
measure its rate before and after, and fix the cause before adding tolerance (`a0b2dd5c`,
`4e110584`).

**35. Tolerance widens what can pass as green.** One flake took five tolerance rows before its cause
was fixed. Two of them closed holes the tolerance had opened, where a retry turned a real FAIL into
PASS. *Rule:* one shared classifier decides what counts as an infrastructure failure. A fix row's
first test replays the observed failure (`4e110584`).

**36. Show a reproduction can fail before calling a finding false.** A builder's first reproduction
passed with no fix. Instead of reporting the finding false, it found that its marker collided with a stub
directory, fixed it and got the expected failure. A test that can't fail is not evidence
(`4e110584`).

**37. After fixing a bug, look for its siblings.** The failed-spawn lock bug had three copies. An
octal leading-zero bug in one setting turned up again in the log-cap setting. *Rule:* every fix row
asks "where else is this pattern?" (`a0b2dd5c`, `4e110584`).

**38. Report against the milestone gate, not the row count.** M6 was called "finished in practice" at
89 of 91 rows. Its gate, the live CP-G6 runs, had never run (`4e110584`).

**39. A fast canary speeds up every plants run.** A Go test that runs the Node UI suite cut
time-to-kill from about 42 s to 1–2 s. Most plants time is spent waiting for a plant to be caught.
Queue a canary row when time-to-kill stays high (`4e110584`).

## 5. Load, time and observability

**40. The Mac running the loop is a live host.** A stress recipe with 16 `-race` binaries and 8 CPU
burners ran next to three builders' gates and pushed load to about 47. The Mac rebooted.
*Rule:* heavy jobs take an exclusive machine lock, a clean baseline runs first, and timeouts scale
with the baseline (`4e110584`).

**41. Reviews and plants runs exclude each other.** Five concurrent Codex reviews plus a gate pushed
load to 8. A plants baseline then failed a 618 ms deadline in code the change never touched.
Enforce the exclusion in scripts, not in a README sentence (`4e110584`).

**42. Time spent waiting for the lock isn't part of the time box.** Builders spent their 20 minutes
waiting for the single dev lock. One outer `timeout` killed a plants run while it was still waiting.
*Rule:* waiting scripts print who holds the lock. Run only as many builders as the lock can serve,
and never wrap `gate.sh` in an outer `timeout` (`4e110584`).

**43. Every run is bounded and visible.** Owner: "what prevents from hanging? what cheap and
effective observability can we have?" Answer: each run gets a time box, and a fired bound records
HANG. Each run keeps a heartbeat file with its pid, and `status.sh --stale` reports stalls, listing
active builders from the tracker (`1f5a2aa4`).

**44. Never relay an agent's account of its own state.** A "stopped with background work still
running" notice was passed on as "working". The job had finished 30 minutes earlier. *Rule:* check
with `pgrep`, file times and heartbeats. Keep builders in the foreground, and check back at about half the
time box (10 minutes, not 30) (`a0b2dd5c`, `4e110584`).

**45. A watcher measures real usage.** The `/tmp` watcher alerted on Xcode's sparse 16 GB cache
files, which used 16 KB on disk. A size guard that reads the apparent size cries wolf. Size tests
use sparse files so they don't fill the disk (`4e110584`).

**46. Suspect your own latest unguarded action first.** When the disk filled, the orchestrator
suspected the gates. Then it listed its own log only as a writer it "couldn't rule out". The owner
settled it. After the reboot it did better and named its own stress builder straight away
(`4e110584`).

## 6. State and survival

**47. State lives in the repo and is committed before a builder starts.** Usage limits cut sessions
off at least four times, and compaction and `/clear` came on top of that. Each time the loop resumed
from `tracker.tsv`. `/tmp` is scratch (`a0b2dd5c`, `CLAUDE.md`).

**48. Decide what must survive a reboot.** A reboot wiped `/tmp`, including the ledger, every builder
worktree, saved partial diffs and scripts staged for the owner. Accepted work was safe. In-flight
evidence was lost. An INBOX line never points at `/tmp` (`4e110584`).

**49. Split state by who reads it.** The plan reached 485 KB, and every builder read all of it. It
became the spec, `tracker.tsv` (written only by scripts), one file per step and one plan file per
milestone. Before splitting a doc, measure who reads it: a register read one entry at a time doesn't
need a split (`1f5a2aa4`, `4e110584`).

**50. A limit kills every running builder at once, so plan the rescue.** Save uncommitted work as a
diff and reset the worktree. A fresh builder then treats the diff as an unverified reference. A
dead builder's commit can be rescued by gating it as is (`4e110584`).

**51. The owner's "go on" beats any stopping rule you predict.** After builders died on a weekly
limit, the orchestrator refused "go on". Owner: "since when do you refuse my orders?" The next
builders ran fine and about 15 steps were accepted. A limit counts only once a spawn actually fails
(`4e110584`).

**52. A scarce reviewer is a queue with a concurrency cap.** Codex hit weekly and daily limits.
Sending 41 reviews back to back drained the quota, and 12 came back `limited`. *Rule:* keep a
committed review queue in priority order, cap concurrent reviews and judges, and keep building
under the gates while reviews wait (`a0b2dd5c`, `4e110584`).

**53. A cap is changed in the doc, never waived in chat.** Seven judges ran at once, "above the usual
5, but they only read". Two of them picked the same new row ID. *Rule:* one writer on the tracker at
a time, and the script assigns row IDs, not the judges (`4e110584`).

**54. Don't reuse stale workflow files.** A judge launch reused yesterday's workflow file with
yesterday's seven labels. The orchestrator caught it before any judge wrote anything. Generate the
workflow input from current queue state every time (`4e110584`).

## 7. The owner's attention

**55. The owner's attention has one channel.** Owner: "I CANNOT SEE WHAT YOU ASK WHEN 1000s lines
are printed". Every question goes to `INBOX.md`, gets committed by path and is pushed via a
post-commit hook to ntfy.sh. Never ask in chat. A defect is a plan row, and an open build question
goes to the advisor (`1f5a2aa4`, `4e110584`, `bd51bd18`).

**56. INBOX holds decisions only.** Owner: "do not turn inbox into another huge unreadable blob".
Status notes, "coming later" items and alerts don't belong there. An item is removed once decided.
An owner's pause ("hold codex reviews") is state, so it goes in as an item and survives resets
(`1f5a2aa4`).

**57. Put a decision to the owner as three options.** Owner, repeatedly: "3 options, each with
pro-contra under 64 words, specify your lean with reason". Batch the items so one reply settles
them ("O1–O8 as advised"). Proceed on the lean, marked `PENDING`, while waiting
(`f8e84314`, `547fd2f3`, `4e110584`).

**58. Don't ask what the repo already answers.** "Why are these decisions open despite we have 5000
lines describing the system?" All five were settled in the specs. Twice: "both were already
covered 100%!!" *Rule:* grep the specs before any question. A question the specs answer isn't a
question (`f8e84314`).

**59. Filter reviewer output before relaying it.** The orchestrator passed on Codex's findings about
negative usage and malformed quota as decisions. Owner: "what does this anal fixation gain for MVP?" *Rule:*
triage findings for MVP relevance first, and keep only the edits that remove a real contradiction
(`6b79fdbe`).

**60. A setting is not a design decision.** Owner: "stop discussing 15 sec — that is just a number, a
setting, if practice shows it is not enough we'll tweak it". Also: "this feels like implementation
detail territory — why do we have this discussion?" Move implementation-local choices out of
design talk (`50884198`, `222b6cfc`, `547fd2f3`).

**61. Commands handed to the owner are copy-paste complete.** Pasted `<A>` placeholders broke zsh. A
script's line lacked its `<N>` argument. A `yes` prompt came before the check that made it moot.
What worked: a read-only preflight proposing the arguments, a budget sheet, `--dry-run` and a
rollback line (`4e110584`).

**62. What the classifier blocks goes to the owner as one `!` line.** Credential writes, `reset
--hard` and live installs are blocked for the agent. Stage a script and hand over one line with its
rollback. When the agent says "check G6", the owner asks "you want me to run it? provide commands".
`sudo` can't prompt under `!` (`222b6cfc`, `4e110584`).

**63. A mechanism that fires by itself beats a promise to remember.** The orchestrator promised to
run `notify.sh` after every INBOX commit. The owner pointed to a post-commit hook: it runs only on
the `verger` branch, fires only for new lines, and deduplicates across amends (`4e110584`,
`bd51bd18`).

**64. Mid-loop, a mistake is fixed, not written up.** Writing a lesson to memory mid-loop left a
dangling index line, and the owner had to clean it up: "we have no room for all your misdoings".
Collect lessons in batches (`/retro`, documents like this one). Write the file before its index
line (`4e110584`).

## 8. Design phase with agents

**65. Specs are the authority, and the agent's own docs are not a trump card.** Owner: "do not ref
docs — you wrote them!" The agent cited its own drafts against the owner's architecture. Separately,
a governing spec that the agent had never seen had to be found before its contract docs were
reconciled to it (`547fd2f3`, `ab7e4d5e`).

**66. Lock decisions as explicit, superseding records.** The advisor returned each ruling as a
"Locked for v1" block that named what it supersedes ("the N1 statement … is superseded"). Values
known to have been decided but not recoverable are marked unrecovered, not guessed (`c24c7dcd`,
`d99f3a97`).

**67. Make contracts enforceable as Gherkin, observed by the client.** Owner: "if you lock it as it
is it is not enforceable". Every rule became a scenario from a client's point of view. Stand-ins
appear only in `Given`, and every `Then` checks something a client can see. Later, those scenarios
became the build gates (`f8e84314`).

**68. State the responsibilities before the object graph.** A proposal jumped from behaviour to
twelve objects. A second opinion asked for each unit: what decision it owns, which facts it owns
and which it only consumes, and which invariants it keeps. After that, the nine Core
responsibilities locked quickly, one subagent per component (`f8e84314`).

**69. Don't design what has nothing to adapt.** The agent wrote a 100-line adapter doc before any
adaptee existed. Owner: "what the fuck are you adapting?" There would be two thin adapters, built
last, about 20 lines each. Principles such as SOLID are not restated case by case: "that's why they
are called principles, not cases" (`547fd2f3`, `50884198`).

**70. Keep boundaries: credentials belong to the concrete provider only.** "Verger code should not
reason about any credential at all… no OAuth in Verger." Credential reasoning had spread through
account sources and adapters. A fix subagent moved it back into the Claude provider, and a
cross-family review checked it (`50884198`).

**71. Prior art is a reference, not an oracle.** The agent treated the old bash selector as ground
truth ("HAS NO BUSINESS WITH verger") and proposed that Verger rely on `codex-mgr`. Owner: "it cannot be painted as perfect… if we
can do better, we should". Extract its knowledge through a research subagent. Never depend on it or
change it (`6b79fdbe`, `50884198`, `bc4d732c`).

**72. "Go" in a design session doesn't mean "implement".** Approving a design lean was read as
permission to edit `codex-mgr`. That changed another tool's behaviour to suit an adapter that didn't
exist yet. Owner: "why did you jump to implementation and even more to breaking existing tools?"
(`547fd2f3`).

**73. Stay on your own task when other agents share the tree.** Owner: "the other doc edits are other
agents' work, focus on your task". Commit by path ("commit as one, mind other agent work"). Never
revert or fold in changes you didn't make (`222b6cfc`, `6b79fdbe`).

**74. The index orients, and it is not a second source of truth.** An 80-line docs README drew the
comment "cut your verbosity, should do orientation only". Link to the owner of a fact instead of
restating it. The unlinked cross-file `§N` references were a leftover of the same drift (`5924d127`,
`6b79fdbe`).

**75. Research goes into repo notes that are short and saved before anything is built on them.** Owner:
"save research note to tools/verger/research/, save codex note, commit both" before the fix
subagent started. Findings then survive the session and ground the next drafter (`50884198`,
`ca756635`).

**76. Tools self-heal once safety is grounded.** `ccswitch-limits` reported "credentials_expired" for
a token it could refresh. Owner: "a reporter that does not report is useless". Build the recovery
step in, after subagents verify it is safe. Reserve statuses that need the user for states the tool
genuinely can't recover from (`ca756635`).

**77. Review a process redesign before adopting it.** The orchestrator folded new lessons straight
into orchestrator spec v3.2. Owner: "looks like v3.2 was premature — we had to go through review
first". Process documents get the same review-first discipline as specs (`49446dd0`).

## 9. Operational gotchas

**78. Close stdin for `codex exec`.** Without `</dev/null`, it waits for stdin and never reaches the
model. Owner: "you make the same mistake again and again". Confirm the `model:` header appears within
seconds before saying a review is running (`a0b2dd5c`, `CLAUDE.md`).

**79. Check the permission mode before spawning builders.** Plan mode silently made builders
read-only, and one sat idle for 22 minutes (`4e110584`).

**80. Pin external binaries, and treat a re-pin as a pipeline.** A Homebrew codex upgrade broke every
real-binary test. Pinning fixed that, but "pinned codex is not current codex". Re-pin in order:
review the upstream diff, amend the spec, have the owner install and paste the hash, then run the
whole suite (`4e110584`).

**81. After an upgrade, check processes and defaults, not only the API.** codex 0.157.0 turned on
`daemon_auto_start`. A hidden daemon with an hourly self-updater was running on the live `~/.codex`
and got a 401 on its first refresh. Record findings where people will look, "so we do not run
rediscovery" (`4e110584`).

**82. A live test can clash with the agent's own process.** QV5 refuses to run while any Claude Code
session runs, including the orchestrator's own. It goes to INBOX as "run from a plain terminal after
the session" (`4e110584`).

---

## Sessions

Transcripts are in `~/.claude/projects/-Users-igormalyarov-Developer-my-apps-inventory*/`. Dates
are UTC.

| Session | Dates | What happened |
|---|---|---|
| `ca756635` | 21–22.09 | `ccswitch-limits` misreport; self-healing refresh; verification by subagent (prior art) |
| `ab7e4d5e` | 21.09 | First Verger docs review; which spec governs; recovering lost decisions |
| `37509281` | 21.09 | Created the `verger` worktree |
| `c24c7dcd` | 21–22.09 | Docs review; synchronization baseline; locks for opens 1–15 |
| `d99f3a97` | 22.09 | Docs review; Q/N/P/R lock rounds with supersession |
| `340a7c2b` | 22.09 | Adversarial docs review; locks for items 1–17 |
| `5924d127` | 22.09 | Clarity and contradiction review; C1–C4 locks; split of the decisions doc |
| `6b79fdbe` | 22.09 | One subagent per finding; Codex review; nitpicks relayed unfiltered |
| `f8e84314` | 22.09 | Core composition: responsibilities, Gherkin contracts, subagent per component, cross-family review |
| `547fd2f3` | 22.09 | Non-Core components; adapter confusion; jumped to implementation |
| `50884198` | 22–23.09 | HTTP, CLI, web UI, composition root; credential boundary; research subagents |
| `7ea74cef` | 23.09 | Aborted start of the Claude provider draft |
| `222b6cfc` | 23.09 | Claude provider doc; astra review loop; drafting handed to Codex |
| `cc9e0b07` | 23.09 | Codex provider doc; `/retro` |
| `bc4d732c` | 23.09 | Codex provider review; `codex-mgr` is prior art only |
| `7e224a5e` | 23.09 | First implementation plan |
| `ea82353a` | 23.09 | Plan reordered leaves-first; one commit per scenario group |
| `a0b2dd5c` | 23–25.09 | Build M1–M7; context rot; "scripts decide" |
| `a62cfca9` | 24.09 | Tried to extract thoughts from `a0b2dd5c` (stopped by the classifier) |
| `1f5a2aa4` | 25.09 | Ledger, `accept.sh`, `review.sh`; judges; `INBOX.md` |
| `d0d9a59e` | 25.09 | Resume attempt (stub) |
| `4e110584` | 25–26.09 | "verger-orchestration-status": most corrections, re-pin, 200 GB log, reboot |
| `9a819dc2` | 25.09 | Twenty reusable thoughts from `a0b2dd5c` and `4e110584` |
| `c39b855f` | 25.09 | Three options for each INBOX item |
| `76d650ac` | 25.09 | Build-loop orchestrator description v1–v3 ("agister") |
| `bd51bd18` | 25.09 | ntfy.sh push for the owner inbox |
| `49446dd0` | 25.09 | Lessons addendum; v3.2 premature |
| `d6ac2c48` | 25.09 | Lessons addendum 2; orchestrator v3.3/v3.4; agister resembles Verger |
