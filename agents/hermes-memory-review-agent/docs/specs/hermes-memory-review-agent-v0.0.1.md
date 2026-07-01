---
date: 2026-07-01
model: claude-opus-4-8
description: "Spec v0.0.1 for the OpenClaw hermes-memory-review agent definition: weekly memory-snapshot review report + hourly memory-update ping. Contract, behavior rules, and verification cases for the ai-labs-owned agent core/skills."
---

# Spec: `hermes-memory-review` agent — v0.0.1

## Goal

Define the ai-labs-owned OpenClaw agent that, on a weekly cadence, turns a
read-only Hermes memory snapshot into a proposing-only review report in the
canonical skills repo, and on an hourly cadence pings a Telegram topic when new
memory writes are staged — never writing to Hermes and never merging anything.

Ownership: ai-labs owns the agent definition, its `runtime/` cron wrapper, and
the CI-sync workflow. Inventory owns the runtime wiring (snapshot job, cron
scheduling/deploy, cross-host reads, canonical-repo location, Telegram
topic/bot allocation) and is out of this spec's scope except where a value must
be handed to the agent (listed under "Inventory-coordinated inputs").

## Scope pins (v0.0.1)

- **One Hermes bot.** v0.0.1 reviews and pings for a single Hermes bot's
  snapshot. Multi-bot aggregation (per-source cursors, count aggregation,
  partial-source failure) is deferred to a later version. (Finding 13.)
- **Option B only.** The weekly output is the single report file. Per-candidate
  proposal files and PRs (Option C) are deferred. (Handoff, Option C.)
- **Manual triggers retained.** Both cadences also accept a manual Telegram
  trigger, gated by suppression (see Behavior rules 12–13). (Finding 15.)

## Public interface

The "interface" of a prompt-based OpenClaw agent is its trigger → input → output
contract, plus the artifact set the runtime consumes.

### Triggers (runtime-invoked)

| Trigger | Scheduled cadence | Manual |
|---------|-------------------|--------|
| `weekly-review` | Sunday 06:00 UTC — cron `0 6 * * 0` | `@`-mention in the review topic |
| `hourly-ping` | every hour at :20 — cron `20 * * * *` | `@`-mention in the ping topic |

The hourly job runs at minute 20 (not :00) so it never coincides with the
Sunday 06:00 weekly tick. A shared per-agent lock additionally guards against
overlap (Behavior rule 14). The wrapper freshens the ai-labs source tree
(`git fetch && git checkout trunk && git pull --ff-only`) before invoking the
agent and passes the trigger kind and a `--scheduled` token for scheduled ticks.

### Inputs (read-only)

- **Snapshot dir** (`weekly-review`): a dated directory
  `<snapshot-root>/<YYYY-MM-DD>/` containing:
  - `memories/` — `MEMORY.md`, `USER.md`
  - `state.db` — sessions, SQLite with FTS5
  - `pending/skills/<id>.json` — staged skill proposals
  - `pending/memory/<id>.json` — staged memory proposals
  - `local-skills/` — the bot's `~/.hermes/skills`
- **Pending-memory source** (`hourly-ping`): a near-live read of the bot's
  `pending/memory/` (cross-host; path handed by the runtime). The daily snapshot
  is NOT a valid source for the hourly ping.

### Inventory-coordinated inputs (handed to the agent, not chosen here)

- Snapshot root path and pending-memory source path.
- Canonical skills repo checkout path + the target branch for report commits.
- Telegram `chat_id` and the two `message_thread_id`s (review topic, ping topic).
- The bot API token (via the runtime's key store).

### Outputs

- **`weekly-review`**:
  1. A markdown report committed (not merged, not PR'd) to the canonical skills
     repo at `reviews/memory-review/<YYYY-MM-DD>.md` (snapshot date).
  2. A Telegram notification to the review topic; the report file is delivered
     as a document via `sendDocument` (Behavior rule 8).
- **`hourly-ping`**:
  1. When new staged memory writes exist since the last delivered ping: one
     short Telegram message ("memory updates were done", with a count) to the
     ping topic.
  2. When nothing new: no message (silent).
- **Every run** returns a structured run-result to the wrapper (Behavior rule 3)
  so the wrapper can post the outcome and detect failure.

## Behavior rules

1. **Read-only over the snapshot.** The agent never writes to Hermes, the
   snapshot, or `pending/`. It never applies, promotes, or merges a proposal.
2. **Proposing-only report.** The weekly report proposes changes; it commits the
   report file only. It opens no PR, performs no merge/approve, and never
   force-pushes. A human is the only promotion gate.
3. **Structured run-result.** The agent returns to the wrapper a result with
   parseable fields: `trigger` (`weekly-review`|`hourly-ping`),
   `status` (`ok`|`no-op`|`failed`), and trigger-specific fields —
   weekly: `report_path`, `commit_sha` (or empty on no-op), `sent` (bool);
   hourly: `new_count`, `sent` (bool). On `failed` it includes `error` (one
   line). The wrapper posts a failed-run alert to the relevant topic on
   `failed`.
4. **Fixed report shape.** Every weekly report has YAML front-matter (`date`,
   `model`, `description`) and exactly these `##` sections, in order:
   New durable facts; Repeated coaching patterns; Corrections from the user;
   Failed approaches; Candidate skill improvements; Proposed canonical patches;
   Reject / ignore. A section with no findings is present with an explicit
   "none this cycle" note — sections are never omitted.
5. **Evidence-anchored findings.** Each finding cites its snapshot evidence and
   is dropped if it cannot:
   - File evidence: relative path within the dated snapshot dir + a verbatim
     quote (or line reference).
   - `state.db` evidence: the SQL query used + a stable identifier (session id
     / row id) so a reviewer can re-run and land on the same rows.
6. **Report path is snapshot-date-derived.** The report filename is the
   snapshot's date (`<YYYY-MM-DD>.md`), not the run date.
7. **Report commit semantics.** One commit per successful weekly run, touching
   only `reviews/memory-review/<date>.md`, on the configured target branch.
   Precondition: the canonical checkout is clean; if dirty, the run fails
   (rule 15) without committing. If the report content is byte-identical to what
   is already committed (no diff), the run is a `no-op`: no commit, no push.
   Otherwise commit and push (fast-forward only; never force).
8. **Forum-topic file delivery.** Because OpenClaw auto-disables the `message`
   tool in forum topics, the weekly report file is delivered by shelling out via
   `exec` to the Telegram Bot API `sendDocument` with `chat_id` +
   `message_thread_id`. Delivery success = HTTP 200 with `ok:true`. A short text
   summary may ride the normal reply channel; the file uses the `sendDocument`
   path. On delivery failure the wrapper retries once, then records a failed
   delivery (the commit still stands).
9. **Two distinct topics.** The weekly report and the hourly ping post to two
   different `message_thread_id`s; the agent uses the correct one for each and
   omits `message_thread_id` only for the General topic (`threadId=1`).
10. **Hourly ping cursor.** "New since the last ping" is defined by a durable
    cursor persisted at `~/.openclaw/agents/hermes-memory-review-agent/state.json`
    field `last_ping` = `{ ids: [<pending/memory item ids>], utc: "<ISO 8601>" }`.
    Item identity is the `pending/memory/<id>.json` filename stem. Initial value
    (first ever run): empty id set. On each hourly run, compute the set of
    current ids not in `last_ping.ids`; that count is `new_count`. The cursor is
    advanced to the current id set **only after** the ping is delivered
    successfully (rule 8 delivery test); a failed delivery leaves the cursor
    unchanged so the next run retries. A deleted-then-reappearing id counts as
    new again (identity is the current filename, not history).
11. **Ping carries no memory content.** The ping states that updates were staged
    and how many; it does not transcribe or apply the staged memory.
12. **Suppression gate (scheduled vs manual).** A successful manual run of a
    trigger suppresses that trigger's next scheduled tick within a window:
    `weekly-review` window = 24h, `hourly-ping` window = 55m. "Successful" =
    run-result `status` is `ok` or `no-op`. The window is compared in UTC. The
    gate is enforced by the wrapper reading per-agent state; the agent persists
    `last_manual_run_utc.<trigger>` on manual runs only (never on `--scheduled`).
13. **Manual trigger routing.** A manual `@`-mention in the review topic runs
    `weekly-review`; in the ping topic runs `hourly-ping`. A mention in any
    other topic, or a malformed/empty command body, is rejected with a one-line
    reply and no run. A manual run ignores the suppression window (it is the
    human's explicit request) but still records its timestamp for rule 12.
14. **Concurrency lock.** Both cadences acquire a shared per-agent lock before
    doing work. If the lock is held, the later invocation skips with a `no-op`
    result and logs "skipped: locked". This bounds the Sunday-06:00 edge and any
    manual/scheduled overlap.
15. **Input validation and failure (fail-closed).** The run fails (rule 3
    `failed`, no partial report, no commit, no cursor advance) when any of:
    snapshot dir missing or missing a required child; `state.db` unreadable,
    corrupt, or lacking FTS5; `sqlite3` absent; canonical checkout dirty or
    `pull --ff-only` / push fails; a `pending/*/*.json` file is malformed JSON.
    Failures are classified `recoverable` (transient: push conflict, Telegram
    5xx) vs `hard` (corrupt db, missing tooling); both emit a failed-run alert,
    recoverable ones note "retry next tick".
16. **No web access assumed.** If the review reads external URLs it uses
    `web_fetch` (keyless); `web_search` only if a provider is confirmed. The
    contract does not require web access.

## Tests (required)

Artifact checks (T1–T6) are runnable against the repo and pass at build time.
Behavioral cases (T7–T22) are **run-verified**, not an automated suite: they are
demonstrated against a fixture snapshot on a dry-run / first live run, matching
the sibling agents (doc-drift, maestro), which ship no wrapper test harness and
verify by running. This is the "match siblings" verification decision for
v0.0.1; a later version may extract the deterministic wrapper logic into a
harness that automates the T13–T22 subset.

Implementation split (informs which side each case exercises): the **hourly ping
is deterministic and owned by the cron wrapper — no LLM invocation** (it counts
new `pending/memory/` items and posts a number); the **weekly review is the LLM
agent's job**. Delivery, the suppression gate, the concurrency lock, and the ping
cursor are wrapper-enforced (rules 8, 10, 12, 14). Manual triggering applies to
`weekly-review`; the hourly ping needs no manual trigger.

### Artifact / structure (repo-inspectable)

- **T1 — exact artifact set.** `agents/hermes-memory-review-agent/` contains
  exactly: `agent/agent.md`, `agent/report-format.md`, `agent/notification-spec.md`
  (covering both topics + failed-run alerts), `agent/review-methodology.md`
  (the review prompt/rubric), `agent/suppression-policy.md`,
  `runtime/README.md`, `runtime/cron/hermes-memory-review-cron.sh`,
  `runtime/cron/openclaw-hermes-memory-review.cron`, `docs/log.md`,
  `docs/adr-*.md`, `docs/specs/…`, `README.md`, `TODO.md`. Expect: every path
  exists; `ls` of `agent/` returns exactly the five listed `*.md`.
- **T2 — sync workflow exact assertions.** In
  `.github/workflows/hermes-memory-review-agent-sync.yml`: `on.push.branches`
  = `[trunk]`; `on.push.paths` = `['agents/hermes-memory-review-agent/agent/**']`;
  uses secret `OPENCLAW_DEPLOY_SSH_KEY`; rsync source
  `agents/hermes-memory-review-agent/agent/`; a `mv <staged>/agent.md
  <staged>/AGENTS.md` step; destination workspace path
  `workspace-hermes-memory-review/`; a final verify step that `ls`es the deployed
  `AGENTS.md`. Expect: `grep`/`yq` for each key returns the stated value.
- **T3 — cron cadence exact.** `openclaw-hermes-memory-review.cron` contains a
  line matching `0 6 * * 0` invoking `weekly-review` and a line matching
  `20 * * * *` invoking `hourly-ping`, each with a `# UTC` comment. Expect: both
  lines present verbatim; no `0 * * * *` line (proves the collision offset).
- **T4 — repository registration.** Root `README.md` `## Components` table and
  `agents/README.md` each list `hermes-memory-review-agent`. Expect: a matching
  row/entry in both.
- **T5 — inventory-coordination criterion recorded.** The agent's `README.md`
  lists the inventory-owned values it depends on (snapshot path, canonical repo
  + branch, `chat_id`, both `message_thread_id`s, bot token) as a coordination
  checklist. Expect: all six named.
- **T6 — report template completeness.** `agent/report-format.md` enumerates the
  seven required sections in the fixed order and the evidence-field shape from
  rule 5. Expect: seven headers in order; both evidence shapes documented.

### Behavioral (fixture snapshot, mocked Bot API + git)

- **T7 — weekly report shape.** Fixture snapshot with content in every category
  → report at `reviews/memory-review/<snapshot-date>.md` with front-matter and
  all seven sections. Expect: file at the date path; seven `##` headers.
- **T8 — empty categories not omitted.** Snapshot with findings in one category
  → report still has all seven sections, empties marked "none this cycle".
  Expect: seven headers regardless.
- **T9 — evidence accepted vs dropped.** A candidate with a valid file/SQL
  citation appears; a candidate lacking either evidence half is absent. Expect:
  the evidenced finding present with its path/query+id; the unevidenced one not
  in the report.
- **T10 — commit + delivery on new content.** Weekly run → exactly one git
  commit on the target branch touching only the report path; exactly one
  `sendDocument` call with the review `chat_id` + review `thread_id` + the
  report file. Expect: 1 commit, 0 PRs/merges, 1 `sendDocument` with those args.
- **T11 — no-op on identical rerun.** Rerun `weekly-review` against the same
  snapshot with the report already committed and identical → zero new commits,
  zero pushes, run-result `no-op`. Expect: commit count unchanged.
- **T12 — changed rerun updates in place.** Rerun with changed snapshot content
  → one new commit touching only the same `<date>.md` path (no second file).
  Expect: one report file for that date; one additional commit.
- **T13 — hourly ping fires on new writes.** `pending/memory/` has ids not in
  `last_ping.ids` → one `sendMessage` to the ping topic containing the count;
  cursor advanced to the current id set. Expect: 1 message with `new_count`; no
  memory body; `state.json last_ping.ids` updated.
- **T14 — hourly ping silent when empty.** All current ids already in
  `last_ping.ids` → zero Telegram messages; cursor unchanged. Expect: 0 messages.
- **T15 — ping cursor not advanced on failed delivery.** `sendMessage` mocked to
  fail → cursor unchanged; next run retries the same ids. Expect: `last_ping.ids`
  equals its pre-run value; second run re-attempts.
- **T16 — reappearing id counts again.** An id present, pinged (cursor advanced),
  removed, then a new file with the same stem appears → counted as new on the
  next run. Expect: `new_count` includes it; 1 message.
- **T17 — suppression gate.** A successful manual `weekly-review` at T; a
  scheduled `weekly-review` tick at T+1h → skipped (within 24h window). A
  scheduled tick at T+25h → runs. Expect: no run in-window; run out-of-window.
- **T18 — manual routing rejects bad topic/command.** `@`-mention in a
  non-agent topic, and an empty command body → one-line rejection reply, no run.
  Expect: 0 report commits, 0 pings; a reply posted.
- **T19 — concurrency lock skips overlap.** Second invocation while the lock is
  held → `no-op` "skipped: locked"; no duplicate commit/ping. Expect: the
  guarded side-effect count does not double.
- **T20 — schedule intersection.** Static check: the weekly (`0 6 * * 0`) and
  hourly (`20 * * * *`) cron expressions share no firing minute. Expect: no
  common (minute,hour,dow) tuple.
- **T21 — failure paths fail-closed.** For each of: missing snapshot child,
  corrupt `state.db`, absent `sqlite3`, dirty canonical checkout, `push`
  conflict, malformed `pending/*/*.json` → run-result `failed`, no report
  commit, no cursor advance, one failed-run alert; the alert marks transient
  cases "retry next tick". Expect: per boundary, the stated no-side-effect +
  alert outcome.
- **T22 — read-only invariant.** Run with snapshot and `pending/` mounted
  read-only and the filesystem/Hermes collaborator instrumented to reject and
  record write attempts. Expect: zero attempted writes to snapshot/pending/Hermes
  AND those trees byte-identical before/after.

## Done criteria

- The exact artifact set (T1) exists under `agents/hermes-memory-review-agent/`,
  authored per the `add-openclaw-agent` layout.
- The CI-sync workflow satisfies T2; the cron cadence satisfies T3 and T20;
  repository registration (T4) and the inventory-coordination checklist (T5) are
  present.
- `agent/agent.md` plus supporting specs encode every behavior rule 1–16, and
  `agent/report-format.md` satisfies T6.
- Behavioral cases T7–T22 are demonstrated against a fixture snapshot (dry-run
  or first live run) with recorded evidence, Bot API and git interactions mocked.
- Deferred items are stated explicitly, not silently assumed: Option C;
  multi-bot aggregation; and the inventory-owned values (canonical-repo location
  + branch, Telegram topic/bot allocation, snapshot/pending paths, SQLite
  tooling confirmation on the gateway).
