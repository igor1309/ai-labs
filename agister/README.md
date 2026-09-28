---
date: 2026-09-28
description: "Agister step 1: Claude Code runtime adapter and a review process behind a local CLI"
---

# Agister CLI — step 1

The first small slice of [Agister](../research/agister/research/verger/orchestrator.md):
a **provider runtime adapter** for Claude Code, reached from a local CLI. There is
no service, scheduler or workflow engine yet. One command runs one
agent-backed process once and leaves a durable record of what happened.

## Hypotheses this step checks

1. **The adapter boundary holds.** One call runs one provider turn and returns
   a normalized outcome (`completed | failed | interrupted | lost`) plus
   ordered events. Workflows above it never see provider details.
2. **Headless stream-json is enough evidence.** Claude Code's `result` message
   decides the turn outcome. Agister's own timeout or abort decides it only
   when no result arrived. Process exit comes last. A provider error is never
   rewritten into success because the process exited 0.
3. **Identities stay separate.** The Agister run ID, the provider session ID,
   the process (PID) and the workspace are recorded independently. Agister
   mints the session ID (`--session-id`) and still records the ID the
   provider reports, flagging any mismatch.
4. **Profile / process split works in practice.** An agent profile holds only
   runtime settings (runtime, model, effort, session mode). The process
   (`review`) owns instruction, tools, policy and output contract.
5. **Turn completion is not process success.** A completed turn must still
   produce output that passes the process's own contract before it counts.

## Usage

Run from the repository you want to work on. State lives in `./.agister/`.

```bash
alias agister='node --disable-warning=ExperimentalWarning --import tsx /path/to/ai-labs/agister/src/main.ts'

# 1. Define an agent (reusable runtime profile, no prompt)
agister agent create reviewer --model sonnet --effort high
agister agent list

# 2. Use it: review the current branch against its base
agister review                         # base: origin/HEAD, candidate: HEAD
agister review --base main --candidate feature --agent reviewer

# 3. Or run one ad-hoc, read-only turn
agister run reviewer --prompt "Summarize the architecture of src/"
echo "What does main.ts do?" | agister run reviewer

# 4. Inspect what happened
agister runs
agister runs show <run-id>
```

Exit codes: `0` ok, `1` review requested changes, `2` run failed, `64` usage.

### What `review` does

1. Resolves `--base` and `--candidate` to commit SHAs and diffs from their
   merge base.
2. Checks out the candidate in a **temporary detached worktree**. The reviewer
   reads exactly the candidate revision, not your uncommitted changes. The
   worktree is always removed afterwards.
3. Runs one fresh Claude Code turn with the review policy:
   - tools: `Read, Grep, Glob, Bash`, pre-allowed: read tools plus
     `git diff/log/show`; anything else is denied (`--permission-mode dontAsk`);
   - `--restricted --strict-mcp-config`: no user/project settings, hooks or
     MCP servers; file tools confined to the worktree;
   - `--json-schema` for the `review-result` contract;
   - 20 minute timeout (`--timeout` can only shorten it).
4. Validates the structured output and prints findings by severity.

### Run record

```text
.agister/
  agents/<name>.toml
  runs/<run-id>/
    run.json         identities, inputs (base/candidate SHAs), outcome, output
    events.jsonl     normalized events with Agister's own sequence number
    provider.jsonl   raw Claude Code stream, verbatim
```

Add `.agister/` to the target repository's `.gitignore`.

Agent profile (`.agister/agents/reviewer.toml`):

```toml
schema = "agister.agent/v1alpha1"
name = "reviewer"
runtime = "claude-code"
model = "sonnet"
effort = "high"
session = "fresh-only"
```

`command = "/path/to/claude"` overrides the runtime binary. The tests use it
to point at a fake runtime.

## Layout

| File | Role |
|---|---|
| `src/runtime.ts` | Provider-neutral adapter contract: request, policy, events, outcome |
| `src/claude-code.ts` | Claude Code adapter: arguments, stream reduction, outcome reconciliation, process-group supervision |
| `src/agents.ts` | Agent profiles (`agister.agent/v1alpha1`) |
| `src/review.ts` | The `review` process: target resolution, worktree, prompt, policy, output contract |
| `src/run-store.ts` | File-backed run records and append-only events |
| `src/main.ts` | CLI |

```bash
npm run test:agister && npm run typecheck:agister   # from the repo root
```

## Deliberately not here yet

Service, durable intents and restart reconciliation, workflows and routing,
parallel review suites, synthesis, resume/continuation, Codex adapter,
process-policy files, OS-level isolation (tool policy only; no sandbox), and
cross-model-family constraints. Each should come in only once a step shows it
is needed.

## Open questions to verify with use

- Is `--restricted` too tight for real reviews (e.g. a reviewer that wants to
  run tests)? That would need a separate `test-review` process with its own
  policy, not a looser reviewer.
- Should the reviewer see project `CLAUDE.md` guidance? `--restricted` drops
  project settings; it is unverified whether memory files are affected.
- When nested inside a Claude Code session, the child inherits the parent's
  environment. `--session-id` was honoured in testing, and the adapter emits
  `SESSION_ID_MISMATCH` if it is not.
