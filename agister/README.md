---
date: 2026-09-28
description: "Agister steps 1–3: Claude Code and Codex runtime adapters running processes defined in YAML, behind a local CLI"
---

# Agister CLI — steps 1–3

The first small slices of [Agister](../research/agister/research/verger/orchestrator.md):
**provider runtime adapters** for Claude Code (step 1) and Codex (step 2),
running **processes defined in configuration files** (step 3), reached from a
local CLI. There is no service, scheduler or workflow engine yet. One command
runs one agent-backed process once and leaves a durable record of what
happened.

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
4. **The configuration boundary works in practice.** An agent profile (TOML)
   holds only runtime settings. A process (YAML) owns instruction, inputs,
   output contract and policy overrides. A process policy (YAML) owns reusable
   execution defaults. The process may only narrow its policy, and the policy
   must sit inside the service ceiling.
5. **Turn completion is not process success.** A completed turn must still
   produce output that passes the process's own contract before it counts.
6. **One capability vocabulary fits different enforcement mechanisms.** A
   policy grants capabilities once; each runtime maps them onto its own
   mechanism and refuses any policy it cannot enforce, rather than
   over-granting.

## What step 2 (Codex) showed about the boundary

The same `review` process runs unchanged on either runtime. Making that work
changed the contract in three places, each a real provider difference:

| Difference | Claude Code | Codex | Contract change |
|---|---|---|---|
| Session identity | caller presets `--session-id` | provider mints `thread_id` | `capabilities.presetSessionId`; `sessionId` optional |
| Workspace policy | tool surface (`--tools`, `--allowedTools`) | OS sandbox (`--sandbox read-only`) | superseded in step 3 by the capability vocabulary |
| Effort vocabulary | `low … max` | `minimal … xhigh` | validated per runtime, not mapped |

Adapter-internal differences that did not leak:

- Codex emits top-level `error` events and `error` items mid-turn for
  reconnects and transport fallbacks (observed from the real CLI). They are
  recorded as `PROVIDER_ERROR` but never decide the outcome; only
  `turn.completed` / `turn.failed` do. The last one is attached to the reason
  when the process dies without a terminal event.
- Codex has no system-prompt flag; process instructions are prepended to
  the prompt in an `<instructions>` block.
- Codex structured output is the final agent message, constrained by an
  `--output-schema` file (written to a temp dir and removed afterwards).
  OpenAI strict schemas require every property, so `line` is now required
  and nullable.
- Process supervision (process group, timeout, abort, stderr tail) is shared
  in `process-supervisor.ts`; adapters only build arguments, reduce their
  stream and reconcile the outcome.

Verified against real Claude Code. Codex is verified against the documented
`codex exec --json` protocol and the real CLI's startup and error stream,
but not yet through a successful live turn.

## What step 3 (configuration files) showed

The research definitions run as written:
[`static-review.yaml`](../research/agister/research/verger/policies/static-review.yaml),
[`adversarial-review.yaml`](../research/agister/research/verger/processes/adversarial-review.yaml)
and [`architecture-review.yaml`](../research/agister/research/verger/processes/architecture-review.yaml)
are parsed in place by the tests, and `agister init` copies them into
`.agister/` (the policy byte-for-byte apart from `status`).

**Each runtime maps the capability vocabulary onto a different mechanism,
and each can enforce a different set of policies.**

| Capability | Claude Code (tool surface) | Codex (OS sandbox) |
|---|---|---|
| `repository.read` | `Read`, `Glob` | always granted |
| `repository.search` | `Grep` | always granted (commands) |
| `repository.diff`, `repository.history.read` | withheld unless `process.execute` | always granted (commands) |
| `repository.write` | `Edit`, `Write`, `NotebookEdit` | `workspace-write` sandbox |
| `repository.history.write` | only via `process.execute` | `workspace-write` sandbox |
| `process.execute` | unrestricted `Bash`: refused unless *everything* is granted | always granted, contained by the sandbox |
| `network` | `WebFetch`, `WebSearch` | refused |

Consequences, found by running it:

- **Command-prefix rules do not fence Bash.** The first live static review
  exposed Bash with only `Bash(git diff:*)` allowed, and the agent ran
  `git show` anyway, with no permission denial: Claude Code auto-approves its
  built-in read-only commands once Bash exists. That silently granted
  `repository.history.read`, which the policy does not allow. The Claude
  adapter now never exposes Bash without `process.execute`. Command
  capabilities are withheld instead (recorded as `CAPABILITIES_WITHHELD`),
  which is safe because the review gets the diff as an input.
- **Codex cannot run the static-review policy.** Its sandbox always lets the
  agent run commands, and commands can always read history. A policy that
  denies `process.execute` would be over-granted, so the adapter refuses it
  before any run. `sandboxed-review.yaml` is the same review with
  `process.execute` and `repository.history.read` granted and contained by
  the read-only sandbox.
- **Open vocabulary question:** is "run commands inside a read-only,
  no-network sandbox" the same capability as unrestricted `process.execute`?
  Treating them as one makes Codex unusable for the design's static review.
  Splitting them (e.g. `process.execute.sandboxed`) would let one policy fit
  both runtimes. This needs a decision, not a guess.

Other rules now enforced:

- Narrowing is checked field by field and every violation is reported at
  once: `timeout`/`retry` decrease, `tools.allow` removes, `workspace.access`
  goes read-write → read-only only, `workspace.scope` cannot change,
  `isolation.deny`/`resources`/`artifacts.retain` add, and constraints only
  add. Isolation wins over the allowlist, and `access: read-only` denies
  writes.
- The service ceiling (1h, one attempt: retries are not implemented) is hard.
  A policy outside it is invalid, not clamped. `--timeout` can shorten a run
  but never extend it.
- The cross-family constraint is evaluated before anything is spawned. The
  writer's model family comes only from provenance Agister recorded itself
  (`.agister/provenance/<sha>.json`); a revision Agister did not write has no
  agent writer, so the constraint holds and the event says why. An
  unsatisfied constraint is recorded as a failed run that spawned nothing.
  Agents need `model_family` to be checkable.
- Inputs are exactly the process's `required` list: candidate-derived ones
  (`base_revision`, `candidate_revision`, `merge_base`, `diff`,
  `changed_files`) plus `--input name=value|@file`. Missing or extra inputs
  are errors.
- Run records carry the process, policy, agent, effective policy and the
  SHA-256 of each definition file, so every run is attributable.
- `resources` and `artifacts.retain` are recorded but not enforced: there is
  no scheduler, and every artifact is retained.

## Usage

Run from the repository you want to work on. State lives in `./.agister/`.

```bash
alias agister='node --disable-warning=ExperimentalWarning --import tsx /path/to/ai-labs/agister/src/cli.ts'

# 1. Example definitions: agents, policies, processes
agister init
agister process list
agister process show architecture_review                          # effective policy
agister process show adversarial_review --agent codex-reviewer    # why Codex refuses it

# 2. Run a process against the current branch
agister review                                   # = process run adversarial_review
agister process run architecture_review --base main --input architecture_context=@ARCHITECTURE.md
agister process run adversarial_review_sandboxed --base main       # the Codex variant

# 3. Or one ad-hoc turn with explicit capabilities (default: read, search)
agister run reviewer --prompt "Summarize the architecture of src/"

# 4. Inspect what happened
agister runs
agister runs show <run-id>
```

Exit codes: `0` ok, `1` review requested changes, `2` run failed, `64`
usage or configuration error.

### Definitions

```text
.agister/
  agents/<name>.toml        agister.agent/v1alpha1: runtime, model, model_family, effort
  policies/<name>.yaml      agister.process-policy/v1alpha1: reusable defaults
  processes/<name>.yaml     agister.process/v1alpha1: uses agent:<name>, policy process-policy:<name>
  provenance/<sha>.json     written by Agister for revisions it produced (none yet)
```

A process names an output schema. `agister.review-result/v1alpha1` is built
in. Its JSON Schema carries the severity and verdict semantics, and Agister
validates the output itself rather than trusting the runtime's
structured-output support.

For a candidate-scoped process, Agister resolves `--base` (default
`origin/HEAD`, then `main`/`trunk`) and `--candidate` (default `HEAD`) to
SHAs. It checks the candidate out in a temporary detached worktree and
removes the worktree afterwards.

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

```text
cli.ts ──► main.ts (CLI: parse, call, present; names no runtime)
   │            │ drives
   │            ▼
   │       application.ts (use cases; config.ts definitions; runtime-agnostic)
   │            ▲ RuntimeCatalog of RuntimeAdapter
   └──► composition-root.ts ──► claude-code.ts, codex.ts   (concrete runtimes)
                             └─► logged-runtime.ts, logging.ts  (cross-cutting)
```

| File | Role |
|---|---|
| `src/cli.ts` | Process entry: real I/O, SIGINT, hands `composeAgister` to `main` |
| `src/main.ts` | CLI only; receives a composition function, never imports a runtime |
| `src/application.ts` | Use cases over a `RuntimeCatalog`: resolves definitions, checks enforceability, inputs and constraints, runs |
| `src/config.ts` | Process and policy YAML: strict parsing and narrowing-only composition under the service ceiling |
| `src/candidate.ts` | Candidate resolution to SHAs, candidate-derived inputs, detached worktree |
| `src/review-result.ts`, `src/output-schemas.ts` | Output contracts: JSON Schema plus Agister's own validator |
| `src/composition-root.ts` | The only module that imports concrete runtimes; wraps each in logging; sets the service ceiling |
| `src/runtime.ts` | Adapter contract: capability vocabulary, `checkPolicy`, request, events, outcome, resume hint |
| `src/process-supervisor.ts` | Shared CLI process supervision and the no-terminal-event outcome rules |
| `src/claude-code.ts` | Claude Code adapter: arguments, tool surface, stream-json reduction, outcome |
| `src/codex.ts` | Codex adapter: arguments, sandbox mapping, JSONL reduction, outcome |
| `src/logged-runtime.ts` | Logging decorator for any `RuntimeAdapter` |
| `src/logging.ts` | JSONL logger, sinks, async log context for correlation |
| `src/agents.ts` | Agent profiles; runtime/effort vocabulary is injected |
| `src/run-store.ts` | File-backed run records and append-only events |

`tests/architecture.test.ts` enforces the layering: only the composition root
imports concrete runtimes, and the CLI and application import neither runtimes
nor logging.

## Logging

Two different things are kept apart:

- **Run evidence**: `runs/<id>/events.jsonl`, `run.json`, `provider.jsonl`.
  Always written, part of the product contract. Anything needed to understand
  a run is an event or an outcome `reason`, never only a log line.
- **Diagnostics**: `logs/agister.jsonl`, how Agister's own plumbing behaved.
  A cross-cutting concern applied by the composition root: each runtime
  adapter is wrapped with `withLogging`, which records `turn.started`,
  warning-level events, `turn.finished` (outcome, wall time, event counts) and
  `turn.crashed`. It changes no result and rethrows every error. Prompts are
  not logged, only their size.

Correlation uses an async log context: the application opens a scope with the
run ID, process and agent, and every log line inside it carries them, without
passing a logger or IDs through the core. The file log is info level;
`--debug` adds debug-level lines (every event kind) to the file and stderr.

```bash
npm run test:agister && npm run typecheck:agister   # from the repo root
```

## Deliberately not here yet

Service, durable intents and restart reconciliation, workflows and routing,
parallel review suites, synthesis, resume/continuation, retries, resource
admission, service configuration file (the ceiling is built in), recording
provenance for revisions Agister produces, and OS-level isolation for Claude
Code. Each should come in only once a step shows it is needed.

## Open questions to verify with use

- `process.execute` vs sandboxed execution (see step 3): one capability or two?
- Is `--restricted` too tight for real reviews (e.g. a reviewer that wants to
  run tests)? That would need a separate `test-review` process with its own
  policy, not a looser reviewer.
- Should the reviewer see project `CLAUDE.md` guidance? `--restricted` drops
  project settings; it is unverified whether memory files are affected.
- When nested inside a Claude Code session, the child inherits the parent's
  environment. `--session-id` was honoured in testing, and the adapter emits
  `SESSION_ID_MISMATCH` if it is not.
