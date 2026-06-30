---
date: 2026-06-30
author: Igor Malyarov
model: claude-opus-4-8
version: 0.0.4
status: accepted
accepted: 2026-06-30
description: "Run the scheduled maestro flow review as a sequence of per-subfolder scoped units, one at a time, each a fresh session, gated on reclaimed host headroom — instead of one collection-scope turn that melts the 2.4 GB OpenClaw host. Proposal pending owner acceptance; the cron is disabled until this is implemented and verified."
---

# ADR-001: Windowed per-subfolder review for memory safety

## Status

**Accepted 2026-06-30** (design locked + adversarially reviewed + owner-accepted; implementation in progress — the manifest snapshot is the first artifact). Re-enable of the cron remains gated on G1–G10 passing live. The scheduled `openclaw-maestro-review` cron is **disabled** on the live host (box-1 meltdown 2026-06-30 — see `inventory` `vps/OpenClaw/log.md` 2026-06-30, `triage.md`). This ADR is the proposed re-enable path. It does **not** change the review rubric, the confidence model, or the PR/notification contracts — only *how the scheduled run is decomposed and paced* on a small host. The three v0.0.1 open questions are resolved and locked (see "Resolved design decisions"); v0.0.3 hardens the invariants and gates against a Codex adversarial review (restart-resume authority, guarded swap reclaim, host-wide concurrency, containment-proving gates — see Revision history). Acceptance is the owner's; nothing is re-enabled until the verification gates below pass live.

## Executive Summary

Replace the single collection-scope scheduled run with a **sequencer** that reviews `.maestro/flows/` **one subfolder at a time**, each as a **fresh-session** scoped invocation, **gated on reclaimed host headroom** between units. This bounds every unit under the gateway turn timeout and keeps peak memory to one unit's footprint (~200 MB swap, ≤6 helper processes — measured), so the run can never swarm the 2.4 GB host. Manual and PR-scope triggers are unchanged; only the scheduled (collection) path is decomposed.

## Context

### Problem

The scheduled run uses **collection scope** — all ~70 flows in one `openclaw agent` turn. On 2026-06-30 that turn, running on a **bloated 21 MB accumulated session**, exceeded the **630 s gateway turn timeout**, fell to the embedded-fallback path, hit a `database is locked` contention on the agent's codex-home, and churned as a swarm of title-masked Codex helper processes (`openclaw-hooks`; pre-compaction memory-flush + retry-replay turns — OpenClaw gotcha #28). Swap exhausted (1279/1279 MB), load_per_core hit ~14, Telegram polling starved → all bots down; a gateway restart then *resumed* the interrupted session and re-swarmed. Recovery required `systemctl stop openclaw` + clearing the session store.

### Constraints

- **Host:** RackNerd, 2 vCPU, **2.4 GB RAM**, 1279 MB swap. Co-resident with the OpenClaw gateway baseline. "One active heavy run at a time" (the agent's own ADR already states this).
- **Gateway turn timeout = 630 s.** Crossing it triggers the embedded-fallback → db-lock → retry-replay swarm. A unit MUST finish inside it.
- **Swap does not auto-drain** (OpenClaw gotcha #28): residual swap from one unit persists; sequential units accumulate it unless actively reclaimed.
- **Recurring jobs live in `/etc/cron.d`, never `openclaw cron add`** (gotcha #24 — gateway-scheduler jobs are wiped on restart). `runtime/**` wrappers are hand-deployed (scp + chmod 700) and mirrored to `inventory` per the maintenance rule.
- **maestro already supports path scope** (`agent.md` "Scope of a run": PR / path / collection). Per-subfolder scoping reuses an existing, defined capability — not a new review mode.

### Evidence (measured 2026-06-30, live host, review-only)

| Scope | Flows reviewed | Wall-clock | Peak swap delta | Peak `openclaw-hooks` | Outcome |
|---|---|---|---|---|---|
| `cvvpin` | 2 (1 + 1 child) | 167 s | ~200 MB | ≤6 | clean review, recovered ~2 min |
| `payments` (largest subfolder) | 37 (32 + 5 children) | **252 s** | **~200 MB** | ≤6 | clean review, breaker never tripped |

Findings that shape the decision: (1) even the **largest** literal-directory unit finishes in **252 s ≪ 630 s** → literal-directory granularity holds, no split needed. (2) Per-unit footprint is **uniform ~200 MB / ≤6 hooks** regardless of scope size — a fixed per-turn overhead, not scope-proportional. (3) A **fresh `--session-key`** ran clean where the bloated session melted — the fresh session is the dominant lever; scoping adds margin, bounded units, and per-unit notifications. (4) Swap reached ~200 MB and **did not drain** after the run → sequential units need active reclaim.

### Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Add RAM / move the agent off-box | Out of scope for this ADR; the box is fixed for now. The windowed design makes the current host viable. |
| Raise the 630 s gateway timeout | Lets a heavy turn run *longer* — more compaction/retry-replay, larger swarm. Treats the symptom, worsens the cause. |
| Concurrent subagent fan-out (Task/`Explore`, per-subfolder) | Each subagent is a full Codex process; concurrency is exactly what melts the host (gotcha #28). The fix is *fewer at once*, not more. |
| One collection turn on a fresh session (no scoping) | The fresh session alone *might* suffice (evidence #3), but it is a single ~500 s+ turn with no per-unit isolation, no per-unit notify, and no headroom gate — one bad night re-melts the box. Scoping is the safer, observable shape. |
| **Generated fixed-time cron lines (one `/etc/cron.d` line per subfolder)** | **Documented fallback branch B**, not rejected. A generator emits a static line per scope at staggered fixed times. Restart-immune per window, mirrors the user's "generate from a manifest" meta-pattern — but fixed times are a spacing *guess* that can't adapt when swap hasn't drained. Adopt only if the runtime sequencer (A) proves troublesome. |

## Decision

Adopt the **runtime sequencer** (approach A). The scheduled run becomes:

1. **Unit = one `.maestro/flows/<subfolder>`.** Literal-directory granularity. The trigger feeds maestro a **path scope** per unit (its existing capability); the agent reviews that subfolder's flows plus each `runFlow` child chain (children outside the subfolder are pulled in, as today — verified: `payments` reviewed 37 for 32 in-folder).

2. **One `/etc/cron.d` kickoff** (e.g. `0 3 * * *`) invokes the **sequencer wrapper** `maestro-review-sequencer.sh`. cron only *starts* the cycle; the wrapper owns pacing.

3. **Fresh, non-`main` `--session-key` per unit** (e.g. `maestro-sched-<subfolder>-<run-id>`). No unit resumes the agent's default/accumulated session. The non-`main` key matters specifically: the 2026-06-30 re-swarm came from gateway restart-recovery resuming the agent's **`main`** session — restart-recovery targets `main` sessions, so a distinct key should escape it (to be verified, G8). Belt-and-suspenders: the wrapper writes an in-flight marker and, on reentry, quarantines any in-flight unit's session rather than letting it resume (M2, M10).

4. **Headroom gate before each unit; reclaim is a *guarded fallback*, not routine.** The wrapper proceeds only on **sustained** headroom — `MemAvailable ≥ AVAIL_FLOOR` across ≥`N` consecutive samples with load below threshold, checked immediately before launch (no time-of-check/time-of-use gap). Swap does not auto-drain (gotcha #28), but per-unit swap is largely fixed baseline pages, not linear accumulation (evidence: ~200 MB after one unit) — so `swapoff -a && swapon -a` is invoked **only when** `Swap.used ≥ SWAP_HIGH` **and** `MemAvailable ≥ Swap.used + RESERVE` (so pulling swap back into RAM cannot itself OOM the 2.4 GB host), wrapped in a foreground `timeout`. If that precondition fails, the wrapper **defers** (`⚠ reclaim deferred`) and does not launch the next unit. Each unit runs under the `openclaw.service` memory cgroup cap plus a foreground circuit breaker (M12). This encodes the live-host load-safety rule mechanically.

5. **Per-unit notification + cycle roll-up** (heartbeat model, per `notification-spec.md`): one message per unit (findings / `✓ ran — 0 findings` / `⚠ run FAILED`), and **per-unit suppression** state (not the single per-agent `last_manual_run_utc`) so one manual run doesn't suppress the whole cycle. After the last unit the wrapper posts **one cycle-complete roll-up** ("cycle done — N units, M findings, K failed") — its *absence* at the expected cadence is the cycle-level dead-man signal.

6. **Smallest-first ordering (fail fast).** Units run ordered by ascending flow count, so a systemic problem (auth down, rubric unreadable, host starved) surfaces on a cheap unit before the expensive `payments` unit is attempted, and warms the path cheaply.

7. **Durable cycle state + idempotent resume.** The wrapper keeps per-cycle records (`started` / `in_flight` / `completed` / `failed` / `rolled_up`) and launches each unit in a **child process group killed on wrapper exit**. A re-run or mid-cycle gateway restart **skips** `completed` units; a stale `in_flight` record with no live matching process is marked **failed** (its session quarantined — see Decision 3 / M2) before the cycle proceeds, so an interrupted unit is never resumed into a swarm. A clean unit failure is fail-isolated (logged + `⚠`, cycle continues); a *dangerous* failure stops the cycle (M7).

8. **Source of truth, layered:** the **scope set** is *discovered* from the working tree (`.maestro/flows/*/`) — discovery is authoritative — and checked against a **thin committed snapshot** (the subfolder list) purely to detect drift; a mismatch is surfaced (a new subfolder absent from the snapshot is reported, never silently skipped). The **schedule kickoff** is the cron entry; the **pacing** is the headroom policy in (4); **agent behavior** stays in `agent.md`.

**Fallback branch B** (generated fixed-time cron) is recorded in the rejected-alternatives table; adopt only if (A) misbehaves.

## Rules / Invariants

- **M1 (one in flight, host-wide).** At most **one** maestro review unit MUST be executing at any time *host-wide*. The wrapper MUST NOT launch unit *n+1* before unit *n* returns, and MUST hold the host-wide review lock of M11 (which also blocks a concurrent manual/PR-scope run).
- **M2 (fresh, non-resumable session).** Every scheduled unit MUST run with a fresh, **non-`main`** `--session-key` and MUST NOT resume the agent's default or any prior session. Gateway restart-recovery resumes only `main` sessions, so a non-`main` key SHOULD escape auto-resume — this MUST be verified (G8), not assumed. On wrapper reentry, any unit carrying an `in_flight` marker without a completion summary MUST be treated as failed and its session **quarantined/cleared, never resumed** (this closes the 2026-06-30 restart-resume re-swarm path).
- **M3 (sustained-headroom gate; guarded reclaim).** Before each unit the wrapper MUST confirm **sustained** headroom — `MemAvailable ≥ AVAIL_FLOOR` across ≥`N` consecutive samples with load below threshold — immediately before launch. Swap reclaim is a guarded fallback, not routine: `swapoff -a && swapon -a` MUST run only when `Swap.used ≥ SWAP_HIGH` **and** `MemAvailable ≥ Swap.used + RESERVE`, under a foreground `timeout`; otherwise the wrapper MUST defer (`⚠ reclaim deferred`) and MUST NOT launch the next unit. It MUST NOT start a unit while below headroom.
- **M4 (wrapper-bounded turn — enforceable parts only).** A unit MUST run under a wrapper-enforced inner `timeout` strictly below the 630 s gateway limit (`TURN_BUDGET`, e.g. 540 s). On timeout the wrapper MUST kill the unit's child process group, quarantine its session, and classify it `⚠ run FAILED` — it MUST NOT allow a unit to cross the gateway timeout into the embedded-fallback / retry-replay path. The wrapper does **not** control gateway restart behavior; resume protection is M2 (non-resumable key + in-flight quarantine) + G8, **not** an unenforceable "no auto-restart mid-unit" claim.
- **M5 (literal-directory granularity, proactive split, no silent cap).** One unit = one subfolder. A unit that hits `TURN_BUDGET` (M4) MUST be split into named sub-units **before** it is retried in a later cycle — coverage MUST NOT be silently truncated, and a subfolder MUST NOT be allowed to rediscover the over-budget path by crossing the gateway timeout (the largest current subfolder, `payments`, is verified within budget — no split needed now).
- **M6 (durable schedule).** The schedule MUST be an `/etc/cron.d` entry, never `openclaw cron add` (gotcha #24).
- **M7 (fail-closed, failure-class-aware).** A unit that errors or emits no run-summary MUST post `⚠ run FAILED`, never a false clean heartbeat. Only a **clean, bounded** failure (e.g. an unreadable scope) lets the cycle continue to the next unit. A **dangerous** failure — `TURN_BUDGET` timeout, detected embedded-fallback, hooks over the M12 threshold, failed/deferred reclaim, or sub-floor headroom — MUST stop the cycle, post a failed-cycle roll-up, and require manual recovery or the next clean-gated cycle.
- **M8 (frozen-scope coverage, drift separate).** Cycle scope is the set discovered at cycle start, frozen as an immutable manifest stamped with timestamp + repo commit. The union of a cycle's per-unit markers MUST cover that frozen set exactly once. At cycle end, current discovery is compared to the frozen manifest and any addition/removal is reported as **drift for the next cycle** — separately from coverage of the frozen scope (a mid-cycle addition is drift, not a coverage failure).
- **M9 (docs same-commit).** The wrapper, cron entry, and snapshot MUST be mirrored to `inventory` (`vps/OpenClaw/scripts/`, `vps/OpenClaw/cron/`) and reflected in `migration.md` in the same commit as the live deploy.
- **M10 (durable cycle state + idempotent dead-man).** The wrapper MUST keep durable per-cycle state (`started` / `in_flight` / `completed` / `failed` / `rolled_up`) and launch each unit in a child process group killed on wrapper exit. Every cycle MUST end with exactly one cycle-complete roll-up, guarded by a durable `rolled_up` marker so a killed-then-restarted wrapper posts neither zero nor duplicate roll-ups. Its absence at the expected cadence is the cycle-level liveness signal and MUST NOT be suppressed by per-unit suppression.
- **M11 (host-wide review lock — shell entrypoints).** Every *shell* review entrypoint (the sequencer; any future manual shell trigger) MUST acquire a single host-wide advisory lock (`flock` on `/run/lock/maestro-review.lock`) before launching the agent, and MUST defer/notify if it cannot — no two shell-invoked maestro runs overlap. **Residual (accepted):** manual/PR-scope triggers arrive Telegram→gateway→agent and cannot acquire a host lock without gateway-side logic — they are *not* lock-enforced. Operator guidance: do not manually trigger a maestro review while a scheduled cycle is in progress (the cycle's per-unit + cycle-complete messages make the window visible). Closing this residual properly needs a gateway/agent-side check and is a separate decision.
- **M12 (per-unit circuit breaker, concrete thresholds).** Each unit MUST run under the `openclaw.service` memory cgroup cap and a foreground circuit breaker sampling `openclaw-hooks`, the unit's Codex app-server count, and `MemAvailable`. The breaker MUST kill the unit and mark it failed (M7 dangerous path) if `openclaw-hooks` > `HOOK_MAX` (≤ 8; baseline ≤6), or more than one unit Codex app-server is seen, or `MemAvailable` < `HARD_FLOOR` — sustained beyond one sample.

## Verification gates (implementation gate — must pass live before re-enable)

- **G1 (largest unit bounded + over-budget contained).** Run the `payments` unit via the wrapper. *Check:* wall-clock; that the inner `TURN_BUDGET` (< 630 s) is enforced; and a synthetic over-budget unit. *Expect:* completes < `TURN_BUDGET` (baseline 252 s); the synthetic unit is killed at `TURN_BUDGET`, marked `FAILED`, session quarantined — it never reaches 630 s.
- **G2 (no swarm, concrete threshold + breaker).** Sample `ps -eo comm= | grep -c openclaw-hooks`, the unit Codex app-server count, `Swap.used`, `MemAvailable` every 5 s during a full cycle. *Expect:* `openclaw-hooks` peak ≤ `HOOK_MAX` (≤ 8); exactly one unit Codex app-server at any time; `MemAvailable` never < `AVAIL_FLOOR`; the circuit breaker (M12) kills + marks failed on any breach; no `reasons=load` Telegram alert fires.
- **G3 (one in flight, host-wide).** From the same trace + a concurrent manual trigger attempt. *Expect:* never two units' Codex app-servers concurrent; the wrapper's "starting unit X" / "unit X done" lines never interleave; the manual trigger does not launch while the cycle holds the lock (M11).
- **G4 (reclaim is *safe*, not just bounded).** When reclaim runs, log its duration, exit status, `MemAvailable`, `Swap.used`, `/proc/loadavg`, any OOM-killer kernel messages, and gateway+Hermes liveness before/during/after. *Expect:* `Swap.used` stays below the ceiling; every reclaim finishes under its `timeout` with **no OOM entry** and **no gateway/Hermes liveness loss**; when the M3 precondition fails, reclaim is deferred (not forced).
- **G5 (fresh session — artifact inspection).** For every unit inspect the session record (not just dir size). *Expect:* session key unique and non-`main`; the session file/id created **after** unit start; no default-session id; no prior-turn history; session quarantined/cleared after completion or failure.
- **G6 (frozen-scope coverage + drift).** *Check:* union of per-unit markers vs the frozen start-of-cycle manifest; separately, end-of-cycle discovery vs the manifest. *Expect:* markers cover the frozen set exactly once; any mid-cycle addition/removal is reported as drift **without** failing the cycle's coverage.
- **G7 (failure-class isolation).** Inject (a) a clean failure (unreadable scope) and, separately, (b) a dangerous failure (force a `TURN_BUDGET` timeout). *Expect:* (a) posts one `⚠ run FAILED` and the cycle continues; (b) stops the cycle with a failed-cycle roll-up, leaving no orphaned unit process and no stale `in_flight` marker.
- **G8 (restart-resume — split + contained).** Under the M12 circuit breaker, exercise three restarts: (a) between units, (b) during an in-flight unit, (c) a forced child timeout during a unit. *Expect* each: `completed` units skipped; the in-flight unit marked **failed, not resumed**; no prior session key reused after restart; session-store evidence captured; no swarm.
- **G9 (cycle dead-man + order + idempotency).** *Check:* the cycle's message sequence, including a kill-and-restart of the wrapper. *Expect:* units posted smallest-first by flow count, followed by **exactly one** cycle-complete roll-up (N units / M findings / K failed) even across a wrapper restart (durable `rolled_up` marker).
- **G10 (host-wide lock — shell).** Start a second *shell* sequencer invocation during a cycle. *Expect:* it fails to acquire the `flock` and defers/notifies (no overlap). The Telegram-manual path is the M11 accepted residual — not gate-enforced.

`AVAIL_FLOOR`, `N` (sample count), `SWAP_HIGH`, `RESERVE`, `HARD_FLOOR`, `TURN_BUDGET`, `HOOK_MAX`, and the load threshold are set from a measured single-unit footprint during implementation (baseline: ~200 MB swap delta, ≤6 hooks, recovery to ~1700 MB avail within ~2 min), not guessed.

## Consequences

- The scheduled review now spans **hours**, not one ~5–10 min window (N units × (run + drain)). Acceptable: wall-clock for memory safety is the trade this host needs.
- **N per-unit notifications** per cycle instead of one — louder, but each is a real per-scope heartbeat; absence of the *cycle-complete* signal becomes the new dead-man check.
- Per-unit suppression replaces the single per-agent gate (a `notification-spec.md` / `suppression-policy.md` change).
- A long-lived wrapper spans the cycle; durable cycle state + child-process-group cleanup + the idempotent `rolled_up` marker (M10) bound the blast radius of a wrapper crash to the in-flight unit and keep the roll-up exactly-once.
- The manifest-vs-discovery check turns "a new flow subfolder appeared" into a surfaced signal — on-brand for a review agent.
- **M11 covers shell entrypoints only.** The sequencer's `flock` prevents two shell-invoked runs overlapping, but the Telegram-manual/PR path runs inside the gateway and is not lock-enforced (accepted residual, M11). On this host manual reviews are rare and operator-initiated, and a cycle's messages make its window visible, so the practical overlap risk is low; a robust fix needs a gateway/agent-side lock check.
- **`swapoff -a` is itself a load event** on this 2.4 GB host (it pages all swap back into RAM): it is therefore guarded (M3 — only when `MemAvailable ≥ Swap.used + RESERVE`, under `timeout`, else deferred) and treated as a fallback, not a routine between-unit step. If reclaim is repeatedly deferred, that is a signal the host is too tight — surfaced via `⚠ reclaim deferred`, not silently retried.

## Non-Goals

- Not changing the review rubric, the Verified/Provisional confidence model, the PR contract, or the "never merge/approve" rule.
- Not changing manual or PR-scope triggers — only the scheduled (collection) path is decomposed.
- Not adding RAM, moving the agent off-box, or raising the gateway timeout.
- Not the doc-drift agent (its per-project / cross-project windowing is a **separate** ADR that inherits this template).
- Not re-enabling the cron until G1–G8 pass live.

## Resolved design decisions (locked 2026-06-30)

- **Cycle-complete roll-up: YES.** One roll-up message after the per-unit messages, as the cycle-level dead-man signal (Decision 5, M10, G9).
- **Ordering: smallest-first (fail fast).** Units ordered by ascending flow count (Decision 6, G9).
- **Source of truth: discovery authoritative + thin committed snapshot for drift detection** (Decision 8).

## Open questions

- None blocking. Implementation will set the tunables (`AVAIL_FLOOR`, `N`, `SWAP_HIGH`, `RESERVE`, `HARD_FLOOR`, `TURN_BUDGET`, `HOOK_MAX`, load threshold) from a measured single-unit footprint (baseline ~200 MB swap delta, ≤6 hooks, ~2 min recovery).

## Revision history

- **v0.0.4 (2026-06-30):** during implementation, scoped **M11** to shell entrypoints — the manual/PR trigger is Telegram→gateway and cannot acquire a host lock without gateway-side logic; documented as an accepted residual with operator guidance (M11, G10, Consequences). Implementation artifacts landed: manifest + generator + sequencer (`maestro-review-sequencer.sh`), `--dry-run` verified.
- **v0.0.3 (2026-06-30):** hardened against a Codex adversarial review (13 findings accepted, 1 hand-waved; audit log in scratchpad). Closed the **restart-resume authority gap** — non-`main` session keys + in-flight quarantine instead of an unenforceable "no auto-restart" claim (Decision 3, M2, M4, G8); made **swap reclaim guarded** (only when `MemAvailable ≥ Swap.used + RESERVE`, under `timeout`, else deferred — M3, G4); added a **host-wide review lock** (M11, G3, G10); turned several gates from *sequencing-success* into *containment-proving* (concrete `HOOK_MAX` + circuit breaker M12/G2; safe-reclaim G4; session-artifact G5; split restart-resume G8; failure-class isolation M7/G7; frozen-scope coverage M8/G6; durable idempotent roll-up M10/G9; sub-gateway `TURN_BUDGET` with proactive split M4/M5/G1). Hand-waved smallest-first-defers-payments (F12) — the M3 sustained-headroom gate enforces a clean start before every unit regardless of order.
- **v0.0.2 (2026-06-30):** locked the three v0.0.1 open questions — cycle-complete roll-up (Decision 5, M10, G9), smallest-first ordering (Decision 6, G9), discovery-authoritative + thin-snapshot source of truth (Decision 8). Status note: design locked, pending adversarial review + implementation.
- **v0.0.1 (2026-06-30):** initial proposal. Grounded in the 2026-06-30 box-1 meltdown and same-day live per-subfolder measurements (`cvvpin` 167 s, `payments` 252 s, ~200 MB/unit, ≤6 hooks). Approach A (runtime sequencer) chosen; B (generated fixed-time cron) recorded as the fallback branch.
