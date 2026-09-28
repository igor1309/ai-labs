---
date: 2026-09-28
description: "Agister CLI: generic agent calls configured by settings, in Go"
---

# Agister CLI

The CLI stage of [Agister](../research/agister/research/verger/orchestrator.md),
built to [ADR-001](docs/adr/001-agister-cli-architecture.md). The code
performs one generic thing, an **agent call**. Which agent, what work, which
permissions, what inputs and what output means are all settings.

## Usage

```bash
go build -o agister ./cmd/agister

agister init                                   # example settings into ~/.agister
agister process list
agister process show adversarial_review        # effective limits and the runtime plan
agister run adversarial_review --param base=main
agister run ask --param question="What does main.go do?"
agister runs
agister runs show <run-id>
agister runs watch <run-id> --after <seq>      # resumable observation
```

`--home` or `$AGISTER_HOME` moves the state directory (default
`~/.agister`). It must not overlap any repository an agent works in.

Exit codes: `0` accepted, `1` rejected, `2` failed, `3` refused, `4` lost,
`64` usage.

## Settings

```text
~/.agister/
  service.toml            limits, permission vocabulary, state-reaching permissions
  agents/<name>.toml      runtime mapping, model, model family, effort, command
  processes/<name>.yaml   instruction, params, input sources, workspace, output contract
  policies/<name>.yaml    allowed/denied permissions, limits, constraints
  runtimes/<name>.yaml    adapter contract, verified versions, what each primitive grants
  schemas/<name>.json     output contracts (JSON Schema)
  provenance/<sha>.json   writers of revisions Agister produced
  runs/<id>/              evidence: record.json, events.jsonl, provider.jsonl
  logs/agister.jsonl      diagnostics
```

The examples (`examples/settings/`) include the research review processes
and policy, a text `ask` process, and mappings for Claude Code and Codex.
`agister init` never overwrites without `--force`.

## How the ADR rules are realized

| Rule | Mechanism |
|---|---|
| 1–2 generic core, settings | No kind of work in code; `internal/archtest` fails if product code mentions review, verdict or finding. A settings-only test runs a new vocabulary, mapping, schema and process end to end. |
| 3 limits only narrow | `domain/policy.Compose`: service ⊇ policy ⊇ process ⊇ caller (`--timeout`), all violations reported at once. |
| 4 enforcement ≤ mapping | `domain/enforce.Make` grants a primitive only if everything it grants is allowed, never grants state-reaching permissions, and records what it withholds. A property test checks random mappings. The adapter contract and runtime version (`--version`) must match the mapping. |
| 5 permission-blind adapters | `TurnRequest` carries primitives. A shared conformance suite runs against every runner and decorator. |
| 6 layered outcomes | Turn: runtime report, then timeout/cancel, then exit. Call: `run.Judge` with the process's `output.result`. |
| 7 refusals recorded | Every `run` creates a record first; refusals finish it as `refused` before any runtime starts. |
| 8 immutable inputs | Input sources resolve to commits or `sha256:` digests. |
| 9 state out of reach | The state directory must not overlap the workspace. `host.read`/`host.write` are state-reaching and never granted. |
| 10 evidence vs diagnostics | Records carry definition digests, plan, inputs and events. `slog` decorators wrap runtime ports, correlated by run ID from context. |
| 11 effects owned | The supervisor owns the process group. Worktrees are released on every path. A run holds a file lock; an unfinished record nobody holds reads as lost. |
| 13–14 abstractions, composition | Ports in `internal/app`; only `cmd/agister` imports adapters (checked by `internal/archtest`). |
| 15–16 contract | `internal/contract` separates submit, observe (resumable), cancel and inspect. The CLI imports nothing else. |

## Layout

```text
cmd/agister/            composition root (+ end-to-end tests)
internal/contract/      client contract
internal/cli/           CLI over the contract
internal/app/           use cases and ports
internal/domain/        definition, policy, enforce, constraint, run, prompt (pure)
internal/adapters/      fsdefs, fsruns, fsprovenance, git, inputs, schema,
                        logging, system, runtime/{supervisor,claudecode,codex}
examples/settings/      example settings embedded for `init`
docs/adr/               architecture decisions
```

```bash
go vet ./... && go test -race ./...
```

## Findings so far

- **Claude Code's Bash cannot be fenced.** With Bash exposed for
  `git diff` only, the agent ran `git show` without a permission denial. The
  mapping therefore declares Bash as granting everything, so a policy that
  denies command execution gets file tools only.
- **Codex emits non-terminal errors.** Reconnects and transport fallbacks
  arrive as `error` events mid-turn; only `turn.completed` or `turn.failed`
  decide.
- **Codex sandboxes read outside the workspace.** The shipped mapping
  declares `host.read`, which is never granted, and is not yet verified
  against a live Codex, so Codex calls are refused. A test shows that a
  verified mapping without `host.read` runs with no code change.
- **Claude Code rejects draft 2020-12 schemas** passed with `--json-schema`,
  so the example schema declares no `$schema`.

Verified live against Claude Code 2.1.283. Codex is covered by protocol
fixtures only; its API is not reachable from the environment this was built
in.
