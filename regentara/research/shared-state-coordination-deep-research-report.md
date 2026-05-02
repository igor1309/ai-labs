# Shared-State Coordination for AI Coding Agents in Git Worktree Workflows

## Executive view

### Executive summary

The safest baseline for multi-agent coding is **per-agent Git worktree isolation plus a small amount of intentionally designed shared state**. Worktrees solve one problem well: they prevent two active sessions from trampling the same checkout. They do **not** solve coordination around task ownership, semantic overlap, review status, architectural decisions, shared external resources, or integration timing. The real problem is not “shared files” but **shared intent and shared consequences**. citeturn13view0turn24view2turn12view0turn11view5

In this setting, “shared state” should be split into at least two families. **Persistent project memory** is durable, human-readable context such as decisions, gotchas, rejected approaches, and handoff summaries. **Concurrent operational state** is live coordination data such as active claims, leases, heartbeats, mailboxes, review gates, and external resource ownership. The seed sources are strongest exactly where they keep those families separate: append-only notes and rollups for memory; atomic per-resource lock files, heartbeats, and message files for operational coordination. citeturn25view0turn25view2turn25view3turn28view4turn28view0turn4view7

The main research conclusion is that **no single coordination primitive is correct for all shared state**. Append-only logs are good for audit trails and handoffs; they are poor as the sole source of live ownership. Message passing is good for questions, review requests, and negotiation; it is weak for exclusivity. Locking is suitable for scarce, concrete resources; it is dangerous when used for fuzzy semantic ownership. Git-native primitives such as branches, commits, PRs, reviews, and merge queues are excellent integration gates, but too coarse and too latent for live concurrent coordination. Database-backed state becomes appropriate once the system must span machines, support subscriptions, recover automatically, query rich state, or avoid turning markdown into an accidental database. citeturn35view0turn20view3turn20view4turn31view1turn14view3turn14view4turn14view0turn20view2turn29view0

The best overall pattern is a **hybrid model**:

1. **Per-agent worktree** as the filesystem safety boundary.
2. **Append-only shared memory** for durable, human-readable project context.
3. **Explicit claims or leases** for scarce live resources and high-risk ownership.
4. **Mailbox-style messages** for asynchronous agent-to-agent negotiation and review.
5. **Repository-level gates** for merge, review, CI, and code ownership.
6. **A DB or hub only when the coordination surface outgrows files**. citeturn12view1turn11view1turn25view3turn27view2turn18view2turn30view2turn14view2turn14view1turn14view0

### Problem framing

A worktree-first multi-agent repo is a small distributed system disguised as local development. Each agent is an independent process with its own local filesystem view, partial context, failure modes, and timing. The system exhibits standard distributed-systems problems: concurrent claims, stale state, crash recovery, liveness detection, ordering, replay, and eventual integration. The fact that the agents mostly run on one machine does not remove these problems; it only shrinks network distance. The seed materials are right to treat AI coding sessions as concurrent processes, and the strongest historical analogs are Chubby, ZooKeeper, etcd, mailboxes, task queues, and append-only logs. citeturn3view4turn8view0turn37view1turn8view1turn38view0turn38view1turn20view1

Git worktrees are a good default because they preserve shared repository history while giving each active session a separate directory and branch. Git documents that a repository can support multiple working trees at once; `HEAD` is per-worktree, but refs under `refs/` are shared, and the repository config is shared by default unless `extensions.worktreeConfig` is enabled. That means worktrees are **not** complete isolation domains. They isolate working files, not all repository state. citeturn13view0turn24view2turn24view0

That distinction matters because coordination questions arise at several layers:

- **File layer:** overlapping edits and merge conflicts.
- **Module layer:** different files, same semantic subsystem.
- **Architecture layer:** incompatible decisions that only surface at integration.
- **External resource layer:** ports, containers, GPUs, staging slots.
- **Process layer:** claims, queues, review status, teammate discovery, stale sessions.
- **Repository layer:** rebases, PR reviews, merge queue, code ownership, CI. citeturn28view4turn12view0turn14view1turn14view0turn14view2

### Glossary of coordination and state terms

The most important conceptual split is between **durable memory** and **live coordination**. Mixing them produces stale operational data or fragile historical memory.

| State class | What it means in agent workflows | Good primitive | Bad primitive | Why |
|---|---|---|---|---|
| Persistent project memory | Decisions, gotchas, rejected approaches, architecture notes, “NOT worked” findings | Append-only markdown, versioned knowledge files, rollups with pointers to source notes citeturn25view0turn25view2turn25view3turn3view7 | Same mutable status file edited by everyone citeturn28view6 | Durable memory benefits from readability, history, and low overwrite risk. |
| Concurrent operational state | Who is active, what is blocked, who owns what now | Leases, heartbeats, per-resource files, task claims, task rows, watches citeturn28view0turn38view1turn18view2 | Hand-off summaries or static docs | Live state becomes stale quickly and needs liveness and reclaim rules. |
| Work ownership state | Claimed tasks, files, resources, semantic areas | Task queue, claim files, advisory locks, DB rows with CAS/lease semantics citeturn18view2turn38view0turn20view2 | Free-form prose alone | Ownership requires conflict-resistant mutation. |
| Handoff state | What was done, what failed, what should happen next | Append-only handoffs and rollups citeturn3view7turn25view3 | Mailbox only | Handoffs are temporal summaries, not active conversations. |
| Review state | Review requested, pass/fail, fix plan, unresolved objections | PR reviews, review mailboxes, task gates, hook-enforced completion rules citeturn14view4turn30view2turn30view4 | Lock files | Review is evaluative, not exclusive ownership. |
| Communication state | Questions, replies, broadcasts, receipts | Mailboxes, message queues, channels, LISTEN/NOTIFY, MCP channels citeturn4view7turn20view3turn20view4turn11view4 | Handoff doc used as chat | Conversation wants addressing, threading, and delivery semantics. |
| External resource state | Ports, GPUs, containers, staging DBs, queues | Per-resource locks or leases with external verification citeturn28view1turn28view5 | Branches/PRs | These resources are not naturally modeled by Git. |
| Git state | Worktrees, branches, commits, merge/rebase, PRs | Git worktree list, commits, PRs, merge queue, branch protection, CODEOWNERS citeturn13view4turn14view3turn14view0turn14view2turn14view1 | External DB as sole source of branch truth | Git-native state already exists; duplicate it carefully, not blindly. |

A practical rule follows from this table: **use append-only formats for facts you want future agents to trust, and use leased or transactional state for facts you want current agents to act on**. citeturn25view3turn38view0turn38view1

## Seed sources

### Seed-source analysis

The seed sources form a coherent **filesystem-first coordination stack**. Their value is not that they “solve multi-agent coding” in general, but that they articulate a usable separation among continuity, exclusivity, and communication.

| Seed source | Core abstractions | What it solves well | What it explicitly does not solve | Failure modes and limits | Fit with worktree-first workflows |
|---|---|---|---|---|---|
| The entity["organization","Habr","media platform"] article | Three layers: handoffs, locks, mail; plus rollups, memory graph, identity registry, active mail hooks citeturn3view7turn3view8turn25view4turn26view0 | Session continuity, exclusive resource claims, live inter-session messaging, project memory | Full autonomous orchestration; human remains arbiter when many agents converge on the same redesign citeturn26view0 | Polling/hook-based mail can lag; stale lock reclaim is semi-manual; summaries can become too abstract if rollups are trusted without raw evidence citeturn3view6turn3view8turn3view7 | Strong fit for shared memory and external-resource coordination; partial fit for per-worktree file ownership unless shared state is placed outside individual worktrees. |
| The mclaude repo on entity["company","GitHub","developer platform"] | Six layers: locks, handoffs, memory graph, identity, messages, code index; MCP surface; optional hub/bridge citeturn25view0turn4view0turn4view1turn4view5turn27view2 | Human-readable source-of-truth files; append-only where possible; optional multi-machine relay; mailbox semantics; durable audit trail | Authentication, design arbitration, full replacement for Claude Code, silver-bullet consistency citeturn26view5 | Message delivery is eventually seen unless hook or monitor is running; hub adds infrastructure; task orchestration is intentionally not the main differentiator citeturn4view3turn27view3turn26view4 | Strong fit if used as coordination layer adjacent to worktrees; especially strong for cross-session knowledge continuity. |
| The multi-session coordination principle | Minimal protocol: one lock file per resource, append-only index, canonical resource names, heartbeat, external stale verification, verify release, convention-first automation later, avoid shared mutable tables citeturn3view4turn28view1turn28view4turn28view5turn28view6 | Concrete lock discipline for real resources; clear anti-patterns; operationally simple | Rich orchestration, identity/auth, large-scale queryability, multi-machine consistency | Manual compliance, potential drift, no native query layer, no strong guarantees across machines or weak filesystems citeturn28view4turn34view0 | Excellent local baseline for worktree-adjacent coordination, especially on one machine. |

The deepest contribution of the seed sources is their insistence that **persistent memory and concurrent state are different problems**. mclaude explicitly says orchestration is increasingly available elsewhere, while cross-session knowledge continuity remains poorly solved; its design therefore emphasizes handoffs, versioned memory, and human-readable archives. That is a strong and correct distinction. citeturn26view4turn25view0turn25view3

Their second important contribution is the preference for **append-only and per-resource data shapes**. Handoffs, INDEX files, and message histories are append-only; locks are mutable but split into one file per resource. The principle document explicitly warns against a shared mutable table like `memory/active_allocations.md`, because it concentrates contention into a single file and invites lost updates. This is exactly the same lesson distributed-systems coordination services learned decades ago: history can be additive; ownership must be explicit and narrow. citeturn25view3turn28view6turn8view0turn8view1turn38view0

The seed sources also show where filesystem-first coordination bends under load. Once you need multi-machine state, richer subscriptions, stronger liveness guarantees, and less polling, mclaude already reaches for a hub with FastAPI, SQLite, and WebSockets. That is a quiet admission that local files are an elegant starting point, not a universal end state. citeturn27view2turn27view3

## Worktree-first approach

### Worktree-first coordination model

A worktree-first design should treat the worktree as a **local mutation boundary**, not as the universal home for coordination data. Git’s model already separates per-worktree and shared repository state: `HEAD` is per-worktree; refs and much config are shared unless explicitly moved to worktree-specific config. Claude Code’s own memory system makes the same distinction in another way: sessions in different worktrees of the same repo share one machine-local auto-memory directory. citeturn24view2turn24view0turn11view1

That leads to a practical placement model:

| Where state should live | Examples | Commit to repo | Rationale |
|---|---|---|---|
| Inside the individual worktree | Draft changes, local test output, scratch notes tied to one branch, worktree-specific config | Usually no | This is the agent’s private mutation surface. |
| Shared across worktrees on the same machine, but outside tracked repo history | Heartbeats, live leases, active mailboxes, discovery registry, local auto memory, ephemeral claim records | No | Live operational state changes too often and creates Git noise or file conflicts if tracked. citeturn11view1turn28view6turn25view3 |
| Shared in tracked repo files | Stable architecture decisions, onboarding notes, long-lived gotchas, durable review criteria, `CODEOWNERS`, branch policy docs, CLAUDE.md/rules | Selectively yes | These should survive clone, review, and history. Git is good at durable policy and documentation. citeturn14view1turn14view2turn14view3 |
| Shared in a DB or hub | Multi-machine task state, leases, subscriptions, event feeds, presence, queryable ownership, audit dashboards | Usually no, though backups may exist | Needed when coordination is bigger than one machine or one filesystem. citeturn27view2turn20view2turn20view3turn29view1 |

A concise worktree-first design sketch looks like this:

- **Git worktree = code isolation.**
- **Shared append-only memory = durable context.**
- **Live claims/leases = operational truth.**
- **Mailbox or queue = negotiation path.**
- **PR/CI/merge queue = integration gate.** citeturn12view0turn25view3turn31view1turn14view0turn14view4

For this baseline, the most useful shared record for each active session is a small tuple:

`{agent_id, worktree_path, branch, HEAD_sha, claimed_task_ids, claimed_resources, last_heartbeat, verification_status, handoff_pointer}`

Git can already provide `worktree_path`, branch, and HEAD via `git worktree list --porcelain`; worktree records can be locked or shown as prunable; and Claude Code documents automatic cleanup behavior for some worktree classes. That makes worktree discovery and garbage-collection tractable if combined with heartbeat age and cleanliness checks. citeturn13view4turn12view1turn13view2turn13view3

A few direct answers to the worktree-specific questions:

- **Should coordination state be committed to the repo?** Stable memory, policy, and review criteria: often yes. Heartbeats, live claims, and mailboxes: no. Committing live coordination state creates branch churn, merge conflicts, and stale history that looks authoritative after it is already false. citeturn25view3turn28view6turn24view0
- **How should agents discover other active worktrees?** Start with `git worktree list --porcelain` on the local machine, then enrich with a shared registry or heartbeat store if multiple machines are involved. citeturn13view4turn12view1turn27view2
- **How should agents claim work?** Use task claims for work items; use locks or leases for scarce resources; use file ownership only as advisory metadata, not as the sole truth of semantic ownership. citeturn18view2turn28view1turn20view2
- **How should they detect overlap?** Compare declared touched files, claimed modules, and review dependencies before merge; rely on review and merge queue for final integration. Same-file work should usually be prevented, not merely reconciled later. citeturn30view0turn30view1turn14view0
- **How should abandoned worktrees be detected and cleaned up?** Heartbeat age plus external verification plus Git cleanliness/prunable signals. Git offers `prune`, `remove`, `repair`, and `lock`; Claude Code also auto-removes some clean orphaned subagent worktrees after an age threshold. citeturn28view0turn28view5turn13view2turn12view1
- **How should review/fix loops be represented?** Prefer explicit states such as `review_requested`, `review_failed`, `fix_in_progress`, `retest_passed`, `ready_for_merge`, backed by PR review and hook-enforced completion gates rather than prose alone. citeturn14view4turn30view2turn30view3

One practical warning deserves emphasis: worktree isolation reduces **filesystem interference**, but it can postpone **integration conflict**. Anthropic’s own guidance for agent teams says two teammates editing the same file leads to overwrites and that same-file edits are a poor fit for parallel agents. Worktrees avoid overwrite-in-place, but the merge conflict still exists; it is simply discovered later unless ownership and review gates are explicit. citeturn30view0turn30view1

## Comparative analysis

### Coordination substrates comparison

The coordination substrate is the medium in which shared state lives. The right choice depends less on “agent intelligence” than on concurrency semantics, durability, debuggability, and machine topology.

| Substrate | Strengths | Weaknesses | Best fit | Main break point |
|---|---|---|---|---|
| Filesystem-first | Very simple; transparent; human-readable; works offline; natural for append-only handoffs and per-resource files; graceful degradation when tools disappear citeturn25view3turn4view4turn4view5 | Weak atomicity beyond rename/create; polling or hooks for notifications; awkward queries; multi-machine behavior depends on filesystem semantics; risks becoming a homegrown DB citeturn34view0turn34view1turn29view0 | Small teams on one machine; durable notes; local mailboxes; lock files for concrete resources | When you need subscriptions, rich queries, or cross-machine correctness. |
| Repository-first | Excellent history, review, audit, ownership, and integration gates through commits, PRs, CODEOWNERS, protected branches, auto-merge, merge queue citeturn14view3turn14view1turn14view2turn14view0turn14view5 | Too coarse and slow for live claims; bad for minute-by-minute operational state; tracking mutable coordination files creates merge noise | Integration, review, policy, durable team-visible memory | When agents must coordinate *before* merge, not only at merge. |
| Database/index-first | Transactions, compare-and-swap, leases, watches, subscriptions, queryability, automatic cleanup on session end or TTL expiry, better multi-machine behavior citeturn38view0turn38view1turn20view2turn20view3turn20view4 | More setup, less transparent, harder for humans to inspect casually, more operational burden | Multi-machine teams, rich live state, dashboards, event streams, durable task engines | When the coordination problem is still small and local; DB overhead can dominate. |
| Protocol/tool-first | Structured tool calls, live notifications, channels, external system access, model-invocable actions; can hide implementation behind MCP or APIs citeturn19view0turn19view1turn19view2turn11view4 | Trust and safety concerns; tool discovery and invocation need human control; protocol alone does not guarantee durable semantics | Integrations, mailboxes, bridges, orchestration APIs | When underlying state durability and recovery are unspecified. |

A more operational view against the user’s requested axes:

| Axis | Filesystem-first | Repository-first | Database/index-first | Protocol/tool-first |
|---|---|---|---|---|
| Simplicity | High | Medium | Low to medium | Medium |
| Transparency | High | High | Medium | Low to medium |
| Human debuggability | High | High | Medium | Medium |
| Atomicity | Low to medium, unless using narrow primitives like `O_CREAT|O_EXCL` or atomic replace citeturn34view0 | Medium at commit/merge boundaries | High | Depends on backing store |
| Conflict risk | Low for append-only; high for shared mutable files | Low for durable docs; high if used for live mutable coordination | Low if modeled correctly | Medium |
| Latency | Low locally, worse with polling | High for human review flows | Low to medium | Low |
| Durability | Good for files; weak for ad hoc live state | Excellent for history | Excellent | Depends on store |
| Git friendliness | High if untracked or append-only | Native | Indirect | Indirect |
| Multi-machine behavior | Weak without shared FS or hub | Good for history, weak for liveness | Strong | Strong |
| Offline behavior | Strong | Strong | Varies | Often weaker |
| Crash recovery | Manual unless leases/heartbeats are added | Strong for history, weak for live state | Strong with leases/logs | Depends |
| Worktree suitability | Strong for local coordination | Strong for integration | Strong when worktrees span machines or need central truth | Strong as wrapper, not sole substrate |
| Accidental DB risk | Very high once you add indexing, subscriptions, GC, and query semantics | Lower | Native DB already | High if API starts reimplementing storage semantics |

The “accidental database” warning matters. The first signs are predictable: you add indexes, inbox scanners, garbage collection, migrations, query semantics, subscribers, compaction, and auth-like assumptions. Once that happens, a real DB or event store is usually cheaper than continuing the fiction that “it’s still just a few markdown files.” mclaude’s optional hub is a concrete example of this transition point. citeturn27view2turn27view3turn25view3

### Coordination models comparison

The substrate is where state lives; the model is how coordination behaves.

| Model | Mechanism | Works well for | Breaks when | Suitability for autonomous agent-to-agent coordination |
|---|---|---|---|---|
| Shared mutable state | Everyone edits current state directly | Tiny local systems | Races, lost updates, stale reads, hidden overwrite bugs; the principle doc explicitly warns against this pattern citeturn28view6 | Poor |
| Append-only event or state log | New facts are appended; current state is derived | Handoffs, reviews, audit trails, mail history, operational replay citeturn25view3turn35view0 | Hard to answer “who owns this now?” without projections; logs can become noisy | Good for memory; weak alone for live ownership |
| Lock-based exclusive ownership | One holder at a time | Scarce concrete resources: GPU, port, deployment slot, file subtree in emergency cases citeturn28view1turn20view2 | Semantic ownership is fuzzy; stale locks block the world | Good, if scope is narrow and reclaim is safe |
| Lease and heartbeat ownership | Ownership expires unless renewed | Crash recovery, stale-session cleanup, abandoned tasks, ephemeral claims citeturn38view1turn37view2turn28view0 | External verification still needed for expensive side effects; false expiry under partitions | Very good for live operational state |
| Message passing and mailbox | Addressed messages with replies or broadcasts | Questions, negotiation, review requests, broadcasts, handoffs needing explicit recipients citeturn4view7turn4view3turn20view1turn20view3 | Does not express exclusive ownership or “exactly one worker” semantics by itself | Good as complement, not substitute |
| Task queue with claim/checkpoint/release | Workers pull work, ack or requeue on failure | Independent tasks, retryable work, background execution, dynamic load distribution citeturn31view1turn18view2 | Coupled work, same-file edits, implicit dependencies, missing checkpoints | Strong for decomposed work |
| Orchestrator-owned state | Lead agent or service owns assignment and lifecycle | Parallel research, orchestrated reviews, central quality gates citeturn18view1turn18view2turn30view2 | Single coordinator becomes bottleneck or SPOF; teammates may still need peer negotiation | Strong when tasks are structured |
| Git-native state | Branches, commits, PRs, reviews, merge queue | Integration, durable discussion, CI gating, accountability citeturn14view3turn14view4turn14view0 | Too latent for live coordination, external resources, or immediate liveness | Necessary, but insufficient alone |
| Database-backed state machine | Transactional rows and state transitions | Multi-machine teams, strong querying, leases, watchers, dashboards, reliable recovery citeturn38view0turn20view2turn20view3turn29view2 | Overkill for tiny local workflows; operational cost | Very strong |
| Hybrid | Worktrees + append-only memory + explicit leases/claims + mailbox + repo gates | Most serious coding-agent systems | Requires discipline about what state goes where | Best overall baseline |

A few distinctions matter in practice.

**Shared mutable state vs append-only:** append-only wins for memory because it minimizes overwrite races and preserves provenance. The Habr rollup pattern is a useful compression mechanism, but it should remain a view over archived notes, not a replacement for verifiable evidence. Claude Code’s memory system itself loads only the first 200 lines or 25KB of `MEMORY.md` at session start, which reinforces the risk that summaries become the de facto truth unless agents retain pointers to raw material. citeturn3view7turn11view1

**Locks vs leases:** plain locks are fine until something crashes. Leases and heartbeats are better because they turn “forever blocked” into “blocked until TTL expiry,” but they are still not enough for side-effectful resources. The seed principle is correct to require **external verification before reclaiming**. This is the same family of problem addressed by Chubby’s keepalive-based session leases and etcd’s lease expiry tied to key deletion. citeturn28view5turn37view2turn38view1

**Message passing vs shared state:** message passing makes boundaries visible. Erlang’s process model, PostgreSQL `LISTEN/NOTIFY`, mailbox files, and MCP channels all make “ask, reply, broadcast” a first-class act. But a mailbox does not determine who owns a GPU or who is allowed to merge a fix. It is a coordination channel, not the whole coordination system. citeturn20view1turn20view3turn20view4turn11view4turn4view7

**CRDTs:** CRDTs are relevant only at the edge. Tools like Automerge automatically merge concurrent changes in replicated data structures without a central server, which is valuable for collaborative documents or structured shared notes. They do not solve semantic code conflicts, build failures, external side effects, or architectural incompatibility. They address convergence of replicated data, not correctness of software integration. citeturn36view0

## Failure and critique

### Failure-mode analysis

The table below is a condensed operational failure model for worktree-first agent systems. It synthesizes the seed protocols, official worktree behavior, queue semantics, lease mechanisms, and repository gates. citeturn28view0turn13view4turn31view1turn38view1turn14view0turn14view4

| Failure | Cause | Detect | Prevent | Recover | Worktree isolation |
|---|---|---|---|---|---|
| Conflicting edits to same file | Two agents implement overlapping changes separately | Declared touched files, diff overlap, PR merge status, teammate conflict warnings citeturn30view0turn14view3 | Avoid same-file parallelism; claim files or task slices; require review before merge | Rebase, manual merge, re-run tests, update handoff | Helps by avoiding overwrite-in-place, but conflict still appears later |
| Conflicting edits to same module via different files | Semantic coupling, not file overlap | Failing tests, reviewers, architecture notes, dependency review | Claim module-level ownership, not only file-level; shared design notes | Consolidate under one agent or explicit review gate | Mostly irrelevant |
| Incompatible architectural decisions | Agents act on stale or incomplete memory | Review objections, failing integration, contradicting design notes | Versioned decisions, `superseded_by`, mandatory plan review for risky work citeturn25view2turn30view3 | Append compensating decision; revert or refactor | Irrelevant |
| Stale state | Summaries, rollups, or current-state files no longer match reality | Timestamps, commit SHA mismatch, stale memory inspections | Separate durable memory from live state; require evidence pointers in handoffs | Refresh from source commits and raw notes | Irrelevant |
| Stale handoffs | Session ended long ago or skipped later developments | Compare handoff time to branch tip and task status | Rollups plus “read newer than rollup” rule | Create corrective handoff or rollup | Irrelevant |
| Stale locks | Crashed agent or forgotten release | Heartbeat age, external resource probe, stale-lock scan citeturn28view0turn28view5 | Leases or heartbeats; release verification; reclaim protocol | Verify dead, log reclaim, clear lock | Irrelevant |
| Abandoned sessions | Human left, process died, tmux orphaned | Heartbeat timeout, idle team state, old worktree with no updates citeturn18view2turn12view1 | Heartbeats, cleanup jobs, session registry | Reassign task, archive notes, prune clean worktree | Helps because work is isolated and easier to archive |
| Network loss | Hub/DB/channel unreachable | Failed keepalive or sync, missed notifications | Local-first fallback; eventual sync; explicit offline mode | Fall back to local file mode; replay on reconnect | Helps for local code, hurts for central live state |
| Interrupted agent runs | Crash during task or partial side effects | Missing ack, stale heartbeat, partial outputs | Checkpoints, ack-on-completion, idempotent steps | Retry from last checkpoint or requeue task | Helps contain local file damage |
| Agent writes completion without completing | Optimistic or hallucinated status write | Verification hooks, CI, test receipts, manual review | Completion gates that check artifacts, not prose alone citeturn30view2 | Reopen task, attach failure evidence | Irrelevant |
| Agent forgets to release ownership | Missing release command or ack | Lease expiry, orphan scans, unreleased claim age | Use leases or transactional ownership, not permanent flags | Expire or reclaim after verification | Irrelevant |
| Silent unverified release | State says “released” but resource is still held | Post-release probe, residual process check | Verify delete or release succeeded; principle explicitly requires this citeturn28view0 | Restore ownership record, notify others, reconcile | Irrelevant |
| Agent reads obsolete rollup or memory | Summary loaded first, raw evidence not revisited | Contradictions with newer commits or notes | Load concise index plus on-demand source docs; cap summary authority | Rebuild summary, link raw evidence | Irrelevant |
| Agent ignores messages | Polling lag, no channel, no hook, cognitive overload | Unanswered message age, review timeout | Prompt-boundary hooks, monitor channels, escalation rules citeturn4view3turn27view3turn11view4 | Re-send, escalate to orchestrator or human | Irrelevant |
| Agent acts on stale claim | Claim obtained before dependency changed | Revision mismatch, dependency status mismatch | Claims tied to task revision or dependency version | Invalidate claim and replan | Irrelevant |
| Review passes incorrectly | Weak rubric, poor reviewer, false positive | Later test failure, production issue, second review | CODEOWNERS, required reviews, domain-specific reviewers, CI checks citeturn14view1turn14view4turn30view4 | Reopen review, add fix loop | Irrelevant |
| Two agents both believe they own next step | Ambiguous handoff or multiple queues | Duplicate commits, duplicate claim attempts | Single claim authority, atomic claim op, explicit dependency graph | Deconflict manually, mark one path abandoned | Helps only at file level |
| Merge conflict discovered too late | Long-lived divergence from target branch | Merge queue or rebase check late in cycle | Periodic integration checks, shorter-lived branches, merge queue citeturn14view0 | Rebase/merge, rerun CI, re-review | Hurts slightly by making divergence cheaper to ignore |
| Tests pass in one worktree but fail after integration | Hidden dependency, shared fixture, main branch moved | Merge queue / merge-group CI, post-rebase CI | Integration branch checks, require up-to-date status checks or queue citeturn14view0turn14view2 | Fix on integration branch, update notes | Neutral |
| Coordination files themselves conflict in Git | Live mutable coordination stored in tracked files | Git merge conflicts in `.agent/` or `.coordination/` | Keep live state out of tracked history; track only stable docs or append-only artifacts | Move state outside repo or convert to append-only | Hurts if state is committed |
| Shared state becomes too large or noisy for agent context | Inbox bloat, giant MEMORY.md, endless logs | Context misses, stale summaries, unread backlog | Rollups, indexes, compaction, queryable store, load-on-demand memory citeturn3view7turn11view1turn35view0 | Archive, compact, derive views from log | Neutral |

A recent real-world example reinforces the point: several 2026 Claude Code bug reports describe config and settings corruption from non-atomic concurrent writes across parallel sessions. That is not a theoretical edge case. It is a direct demonstration that shared mutable JSON without atomic serialization becomes a coordination hazard quickly. citeturn5search0turn5search1turn5search2turn5search5

### Adversarial critique

| Assumption | Adversarial critique | Bottom line |
|---|---|---|
| Shared state is inherently good | Shared state often creates **false confidence**. Agents may trust a rollup or ownership file more than the code, the current branch tip, or the actual resource status. Once stale data looks official, it becomes dangerous. citeturn3view7turn11view1 | Shared state is useful only if freshness, provenance, and revocation are explicit. |
| Files are simpler than databases | Files stay simple only while coordination is local, mostly append-only, and read by humans. Once you need filtering, subscriptions, TTL expiry, replay, multi-machine sync, conflict-free mutation, and dashboards, you are already building a weak DB. citeturn27view2turn29view0turn38view0 | Start with files; graduate deliberately. |
| Locking solves ownership | Locks solve **exclusive access to narrow resources**. They do not solve semantic ownership of an auth redesign, a test strategy, or architectural direction. Locking the wrong thing causes false blocking or deadlock-by-policy. citeturn28view4turn20view2 | Use locks for scarce concrete resources, not vague intent. |
| Message passing is safer than shared mutable state | It is safer for communication, but insufficient for exclusivity. An inbox can tell another agent “please don’t touch auth,” but unless a claim or gate exists, nothing prevents parallel action. It also adds cognitive load and delivery lag. citeturn4view7turn4view3turn20view3 | Message passing should complement claims or queues. |
| Agents should coordinate directly | Direct peer coordination works for questions, review, and local negotiation. It degrades when multiple agents need arbitration, prioritization, or quality enforcement. Anthropic’s team model therefore adds a lead, shared task list, and hook gates. citeturn18view1turn18view2turn30view2 | Direct coordination is good below the arbitration threshold; above that, use an orchestrator or human. |
| Worktree isolation solves the real problem | Worktrees mainly solve “don’t overwrite my checkout.” They do not solve same-module semantic conflicts, architectural divergence, stale decisions, or late integration failures. Anthropic explicitly warns that same-file parallelism still overwrites work conceptually, even if the writes happen in separate directories. citeturn12view0turn30view0turn30view1 | Worktrees are necessary but not sufficient. |
| Git can be the synchronizer for all coordination | Git is excellent for durable review and history, not for high-churn live state. Branches, commits, and PRs are too coarse and too human-latent to be a mailbox, lease registry, or live resource tracker. citeturn14view3turn14view0turn14view4 | Use Git as integration governance, not as the only coordination layer. |

The most important adversarial conclusion is this: **the hardest conflicts are semantic, not textual**. A worktree can isolate bytes. It cannot isolate meaning. That is why review gates, ownership boundaries, and architectural memory remain necessary even when every agent is perfectly isolated at the filesystem layer. citeturn30view1turn14view4turn25view0

## Guidance

### Patterns and anti-patterns

| Patterns | Why they work |
|---|---|
| Per-agent worktree as default mutation boundary | Prevents accidental local interference while keeping shared history. citeturn13view0turn12view0 |
| Append-only handoffs with rollups | Preserve history while keeping context tractable. citeturn3view7turn25view3 |
| One file or row per claimable resource | Narrows contention and simplifies inspection. citeturn28view4 |
| Heartbeats or leases for all long-lived ownership | Enables stale-session recovery. citeturn28view0turn38view1 |
| External verification before reclaiming stale ownership | Prevents reclaiming resources that are still active. citeturn28view5 |
| Mailboxes for questions, review requests, and broadcasts | Keeps negotiation explicit and auditable. citeturn4view7turn27view3 |
| Review and merge gates at repository level | Catches integration and policy failures that local coordination misses. citeturn14view1turn14view2turn14view0 |
| Convention first, automation later | Avoids brittle hooks that guess intent from arbitrary commands. citeturn28view4 |

| Anti-patterns | Why they fail |
|---|---|
| One shared mutable markdown status board for everyone | Concentrates contention and silently loses updates. citeturn28view6 |
| Treating handoffs as live operational truth | Handoffs are summaries, not liveness signals. |
| Locking tasks, files, and architecture with the same primitive | These are different ownership domains with different semantics. |
| Storing live claims in tracked Git files | Creates merge conflicts and stale history that looks authoritative. |
| Assuming agent silence means agent death | Delivery lag, polling, and idle sessions make silence ambiguous. citeturn4view3turn27view3 |
| Letting multiple agents do same-file edits “and merge later” | Usually defers, rather than reduces, costly reconciliation. citeturn30view0turn30view1 |
| Trusting third-party tooling layers without provenance or human control | MCP and similar tool layers expose powerful capabilities and require explicit trust boundaries. citeturn19view0turn19view2turn11view4 |

### Practical recommendations

For the baseline use case in this report, the strongest recommendations are:

1. **Keep the baseline hybrid.** Use one worktree per agent, append-only project memory, explicit live claims, mailbox-style communication, and PR/CI gates for integration. Do not ask one primitive to do all five jobs. citeturn12view0turn25view3turn14view0turn14view4

2. **Separate durable memory from operational truth.** Decisions, gotchas, and rejected approaches may live in versioned human-readable files. Heartbeats, claims, and mailboxes should usually live outside tracked repo history, even if they are file-based. citeturn25view0turn28view6turn11view1

3. **Use claims at the narrowest sensible scope.** Resource locks for ports, GPUs, containers, and staging slots. Task claims for independent work items. Avoid pretending that a lock file can represent “semantic ownership of auth” by itself. citeturn28view1turn20view2

4. **Turn long-lived ownership into leases.** If a task or resource claim can survive agent death, it should have a heartbeat or lease expiry and a reclaim rule. Stale reclaim should include external verification for side-effectful resources. citeturn28view0turn28view5turn38view1

5. **Use worktree discovery and garbage collection deliberately.** Record worktree path, branch, HEAD, and last heartbeat together. Use `git worktree list --porcelain` for discovery, `prune` and `remove` for cleanup, and explicit archival for dirty abandoned trees. citeturn13view4turn13view2turn13view3

6. **Prevent same-file parallelism by policy.** Anthropic’s own guidance is blunt: same-file work is a poor fit for parallel teams. If a feature cannot be decomposed cleanly, use a lead-orchestrated sequence or keep it in one agent. citeturn30view0turn30view1

7. **Use repository-native gates for all integration.** Protected branches, CODEOWNERS, required reviews, and merge queue are the right place to catch branch drift, missing approvals, and integration-only failures. citeturn14view1turn14view2turn14view4turn14view0

8. **Escalate to a DB or hub earlier than teams expect.** Move when any of the following become true: more than one machine matters, agents need push notifications, claim queries become complex, stale state needs automatic expiry, or humans need dashboards rather than grep. SQLite is useful locally, but the SQLite docs themselves recommend client/server databases when data and applications are separated by a network. citeturn27view2turn29view0turn20view2turn20view3

9. **Treat summaries as indexes, not gospel.** Rollups, `MEMORY.md`, and architectural summaries are useful only if they point back to raw evidence: commits, tests, source files, and prior notes. This is the best defense against stale shared-state optimism. citeturn3view7turn11view1

10. **Make quality gates stateful.** A task should not move from “done” to “released” based only on an agent assertion. Gate it on review requested, review passed, tests passed, and integration green. Agent teams already expose hook points for this pattern. citeturn30view2turn14view4turn14view0

### Open questions

Several issues remain unresolved, or are only partially answered by current tooling:

- **Semantic ownership:** there is still no clean low-overhead primitive for “this logical subsystem is mine” that is stronger than a suggestion but weaker than a global lock.
- **Cross-machine local-first coordination:** files are elegant locally, but the transition to multi-machine correctness is still awkward unless a hub or DB is introduced.
- **Proof of completion:** many systems still rely too heavily on agent-written status rather than independently verifiable artifacts.
- **Freshness discipline for summaries:** rollups and memory indexes reduce context cost, but there is no widely adopted pattern for forcing agents to verify summary-derived claims against current source.
- **Worktree-aware integration forecasting:** merge queues catch incompatibility late; prediction of semantic conflict before coding remains underpowered.
- **Human boundary placement:** current systems still need human arbitration for architectural disputes and high-risk releases, but the exact boundary between direct agent coordination and orchestrator or human control is not standardized. citeturn26view0turn14view0turn11view1turn30view2

## References

### Source bibliography

Primary seed and ecosystem sources:

- The Habr article on “Несколько Клодов над одним проектом: locks, handoffs и email 1982 года,” which introduces handoffs, rollups, locks, heartbeat discipline, and mail semantics. citeturn3view6turn3view7turn3view8turn26view0
- The mclaude repository README, which documents files-as-truth, append-only handoffs, memory graph, identity registry, messages, active mail, MCP tools, and the optional hub. citeturn25view0turn25view2turn25view3turn4view7turn4view3turn27view2
- The multi-session coordination principle, which gives the minimal lock-file protocol, heartbeat/reclaim rules, and anti-patterns. citeturn28view1turn28view4turn28view5turn28view6

Git and repository workflow sources:

- Git worktree documentation for working-tree structure, shared refs/config, lock, prune, repair, and porcelain listing. citeturn13view0turn13view4turn13view2turn24view0turn24view2
- GitHub documentation for pull requests, required reviews, protected branches, CODEOWNERS, auto-merge, and merge queue. citeturn14view3turn14view4turn14view2turn14view1turn14view5turn14view0

Claude Code and MCP sources from entity["company","Anthropic","ai company"] and the MCP specification:

- Claude Code docs on worktrees, subagent worktrees, cleanup, memory sharing across worktrees, hooks, MCP integration, and agent teams. citeturn12view0turn12view1turn11view1turn11view3turn11view4turn18view1turn18view2turn30view2
- MCP specification pages for resources and tools, including list-change notifications, subscriptions, model-invoked tools, and human-in-the-loop security guidance. citeturn19view0turn19view1turn19view2
- 2026 Claude Code concurrency bug reports illustrating real shared-state corruption from non-atomic writes. citeturn5search0turn5search1turn5search2turn5search5

Distributed-systems and storage sources:

- entity["company","Google","technology company"]’s Chubby paper for coarse-grained advisory locking, file-like coordination state, keepalives, leases, and event notifications. citeturn8view0turn37view0turn37view1turn37view2turn37view4
- ZooKeeper recipes for ephemeral sequential nodes and herd-effect avoidance in leader election and coordination. citeturn8view1
- etcd API documentation for atomic transactions, compare-and-swap, watchers, leases, keepalives, and revisioned event streams. citeturn38view0turn38view1turn38view2turn38view5
- PostgreSQL docs for advisory locks and LISTEN/NOTIFY semantics. citeturn20view2turn20view3turn20view4
- RabbitMQ work-queue tutorial for claim, ack, requeue-on-worker-death, and durability patterns. citeturn20view0turn31view1
- SQLite documentation for WAL behavior, same-host limitations, and network-storage caveats pointing toward client/server databases. citeturn8view3turn29view0
- The entity["company","Microsoft","technology company"] Azure Architecture Center summary of event sourcing, its auditability benefits, and its real complexity costs. citeturn35view0
- The entity["company","Supabase","database platform"] Realtime docs for broadcast, presence, and real-time database-change subscriptions as examples of DB-backed coordination surfaces. citeturn29view1turn29view2
- Automerge documentation for CRDT-style automatic conflict-free merging and local-first replication. citeturn36view0