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
scheduling/deploy, cross-host reads, canonical-repo location) and is out of this
spec's scope.

## Public interface

The "interface" of a prompt-based OpenClaw agent is its trigger → input → output
contract, plus the artifact set the runtime consumes.

### Triggers (runtime-invoked)

| Trigger | Cadence | Invocation token |
|---------|---------|------------------|
| `weekly-review` | Sunday 06:00 UTC (+ manual) | scheduled tick / manual Telegram mention |
| `hourly-ping` | hourly (+ manual) | scheduled tick / manual Telegram mention |

The wrapper freshens the ai-labs source tree (`git fetch && git checkout trunk
&& git pull --ff-only`) before invoking the agent, and passes the trigger kind.

### Inputs (read-only)

- **Snapshot dir** (`weekly-review`): a dated directory
  `<snapshot-root>/<YYYY-MM-DD>/` containing:
  - `memories/` — `MEMORY.md`, `USER.md`
  - `state.db` — sessions, SQLite with FTS5
  - `pending/<id>.json` — staged `skills/` and `memory/` proposals
  - `local-skills/` — the bot's `~/.hermes/skills`
- **Pending-memory source** (`hourly-ping`): a near-live read of Hermes
  `pending/memory` (cross-host; path handed by the runtime). The daily snapshot
  is NOT a valid source for the hourly ping.
- **Canonical skills repo checkout**: write target for the weekly report;
  location handed by the runtime.

### Outputs

- **`weekly-review`**:
  1. A markdown report committed (not merged) to the canonical skills repo at
     `reviews/memory-review/<YYYY-MM-DD>.md`.
  2. A Telegram notification to the weekly-report topic; the report file is
     delivered as a document (see behavior rule on forum-topic delivery).
- **`hourly-ping`**:
  1. When new staged memory writes exist since the last ping: one short Telegram
     message ("memory updates were done", with a count) to the dedicated
     memory-ping topic.
  2. When nothing new: no message (silent).

## Behavior rules

1. **Read-only over the snapshot.** The agent never writes to Hermes, the
   snapshot, or `pending/`. It never applies, promotes, or merges a proposal.
2. **Proposing-only report.** The weekly report proposes changes; it commits the
   report file but opens no auto-merge and performs no merge/approve. A human is
   the only promotion gate.
3. **Fixed report shape.** Every weekly report has YAML front-matter (`date`,
   `model`, `description`) and exactly these `##` sections, in order:
   New durable facts; Repeated coaching patterns; Corrections from the user;
   Failed approaches; Candidate skill improvements; Proposed canonical patches;
   Reject / ignore. A section with no findings is present with an explicit
   "none this cycle" note — sections are never omitted.
4. **Evidence-anchored findings.** Each finding cites its snapshot evidence
   (file path within the dated dir, or a `state.db` query result) so a reviewer
   can verify it. A finding without snapshot evidence is dropped.
5. **Report path is date-derived.** The report filename is the snapshot's date
   (`<YYYY-MM-DD>.md`), not the run date, so re-running against the same
   snapshot targets the same file (idempotent overwrite, no duplicate).
6. **Hourly ping is silent-when-empty.** The ping fires only when `pending/memory`
   contains staged writes newer than the last ping. With no new writes, the
   agent produces no Telegram output at all.
7. **Ping carries no memory content.** The ping is a short notice (that updates
   were staged, and how many) — it does not transcribe or apply the staged
   memory. Review/apply stays a separate human step.
8. **Forum-topic file delivery.** Because OpenClaw auto-disables the `message`
   tool in forum topics, the weekly report file is delivered by shelling out via
   `exec` to the Telegram Bot API `sendDocument` with `chat_id` +
   `message_thread_id`. A short text summary may ride the normal reply channel;
   the file uses the `sendDocument` path.
9. **Two distinct topics.** The weekly report and the hourly ping post to two
   different Telegram topics; the agent uses the correct `message_thread_id` for
   each and omits `message_thread_id` only for the General topic (`threadId=1`).
10. **No web access assumed.** If the review reads external URLs, it uses
    `web_fetch` (keyless); `web_search` is only used if a provider is confirmed
    configured. The contract does not require web access.
11. **Option C is out of scope for v0.0.1.** Per-candidate proposal files and
    PRs against the canonical repo are deferred; the weekly output is the single
    report file only.

## Tests (required)

Verification cases. Artifact checks are runnable against the repo; behavioral
cases are run against the deployed agent (or a dry-run harness) with a fixture
snapshot.

### Artifact / structure (repo-inspectable)

- **T1 — layout present.** `agents/hermes-memory-review-agent/` contains
  `agent/agent.md`, at least one supporting `agent/*.md` including a
  notification spec, `runtime/cron/` with a wrapper `*.sh` and a `*.cron`,
  `docs/log.md`, `README.md`, `TODO.md`. Expect: all paths exist.
- **T2 — sync workflow matches template.**
  `.github/workflows/hermes-memory-review-agent-sync.yml` triggers on push to
  `trunk` under `agents/hermes-memory-review-agent/agent/**`, rsyncs `agent/**`
  to the workspace, renames `agent.md` → `AGENTS.md`, and reuses
  `OPENCLAW_DEPLOY_SSH_KEY`. Expect: `diff` of structure against
  `doc-drift-agent-sync.yml` differs only in agent name/workspace paths.
- **T3 — cron cadence.** The `*.cron` entry schedules `weekly-review` at Sunday
  06:00 UTC and `hourly-ping` hourly. Expect: cron fields `0 6 * * 0` (weekly)
  and `0 * * * *` (hourly), or documented equivalents.
- **T4 — registration.** The root `README.md` `## Components` table and
  `agents/README.md` list the new agent. Expect: a row/entry naming
  `hermes-memory-review-agent`.
- **T5 — report template completeness.** The report-format spec under `agent/`
  enumerates the seven required sections in the fixed order. Expect: all seven
  present, matching behavior rule 3.

### Behavioral (fixture snapshot)

- **T6 — weekly report emitted with fixed shape.** Given a fixture snapshot with
  content in every category, the agent writes
  `reviews/memory-review/<snapshot-date>.md` with front-matter and all seven
  sections. Expect: file exists at the date-derived path; every section header
  present.
- **T7 — empty categories not omitted.** Given a snapshot with findings in only
  one category, the report still contains all seven sections, the empty ones
  marked "none this cycle". Expect: seven `##` headers regardless of content.
- **T8 — report is committed, not merged.** After a weekly run, the report is a
  new commit on the canonical repo; no PR is auto-merged and no merge/approve
  API call is made. Expect: exactly one report commit; zero merge actions.
- **T9 — idempotent re-run.** Running `weekly-review` twice against the same
  snapshot targets the same `<date>.md` (overwrite), not a second file. Expect:
  one report file for that date.
- **T10 — hourly ping fires on new writes.** Given `pending/memory` with staged
  writes newer than the last ping, the agent posts one message to the ping
  topic. Expect: exactly one Telegram message, containing a count, no memory
  body transcribed.
- **T11 — hourly ping silent when empty.** Given `pending/memory` with no new
  staged writes, the agent posts nothing. Expect: zero Telegram messages.
- **T12 — read-only invariant.** Across any run, the agent issues no write to
  the snapshot, `pending/`, or Hermes. Expect: snapshot and pending byte-identical
  before and after the run.

## Done criteria

- The agent-definition artifact set (T1) exists under
  `agents/hermes-memory-review-agent/`, authored per the `add-openclaw-agent`
  layout.
- The CI-sync workflow (T2) and cron cadence (T3) are in place; registration
  (T4) is done.
- The `agent/agent.md` plus supporting specs encode every behavior rule above,
  and the report-format spec satisfies T5.
- Behavioral cases T6–T12 are demonstrated against a fixture snapshot (dry-run
  or first live run) with recorded evidence.
- Option C, the hourly-ping topic/bot allocation, and the canonical-repo
  location are explicitly noted as deferred / inventory-coordinated — not
  silently assumed.
