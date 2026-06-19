---
date: 2026-04-28
model: gpt-5
description: "Reinix usage, configuration, and orchestration overview"
---

# Reinix

Landing page: docs/landing.html

Reinix is an MVP workflow runner for governed coding-agent loops. It coordinates provider CLI agents through a Producer, Reviewer, injected review policy, and optional Remediator loop.

The core idea is simple: Reinix does not decide whether a result is good enough by itself. It runs agents, validates their structured outputs, records run progress, and delegates the post-review routing decision to a `ReviewFixPolicy`.

## Boundaries

- Reinix invokes provider CLIs as subprocesses; it does not call provider APIs directly.
- Reinix does not manage credentials, authentication state, sessions, worktrees, branches, commits, pull requests, builds, tests, formatting, dependency installation, sandboxing, permissions, cleanup, retries, or subprocess timeouts.
- Runtime settings are read from `.reinix/agents.yaml`, `.reinix/models.yaml`, and `.reinix/policy.yaml` in the invocation working directory before falling back to `~/.reinix/`.
- Production composition uses `ConfigBasedReviewFixPolicy` from `policy.yaml` when callers do not inject a custom `ReviewFixPolicy`.

## Workflow

Each workflow starts from a task file and proceeds through the same loop:

1. `producer` receives the current task and returns a structured completion claim.
2. `reviewer` receives the task plus producer output and returns a structured verdict.
3. `ReviewFixPolicy.decide` receives the verdict plus its opaque session state and returns one of:
   - `complete-ok`
   - `complete-fail`
   - `remediate`
4. On `remediate`, `remediator` receives the task, producer output, latest reviewer verdict, and all completed review verdicts, then returns a new task.
5. The loop repeats with the remediated task.

Any startup or runtime failure is fail-fast. Reinix records the failure when a run directory already exists, then returns a failed result.

## CLI

```bash
reinix --task-file tasks/accepted-task.md
```

Run Reinix from the target workspace. Provider CLIs run in the Reinix invocation working directory; the run directory is reserved for Reinix-owned artifacts and diagnostics.

Add `--debug` to print compact live progress lines to stderr without changing stdout, exit codes, run metadata, or `events.jsonl`:

```bash
reinix --debug --task-file tasks/accepted-task.md
```

Agent debug lines identify the selected runner/provider/model/tier as a single route label such as `codex/openai/gpt-5.5/high`. When a provider exposes cost or duration diagnostics, debug output includes the compact per-agent cost and duration. Runtime failure debug lines include a short provider error classification when Reinix can infer one from provider diagnostics.

The CLI fails fast before creating a run when provider execution is requested without a task file. The task file path is recorded in the Producer start event and in run metadata.

The bare CLI uses the production composition path, which resolves `policy.yaml` and supplies the config-based policy. Callers that embed Reinix can override that policy with `createReinixComposition({ reviewFixPolicy })`.

## Settings

Reinix uses three YAML files. Local workspace settings win over global settings:

1. `./.reinix/agents.yaml`
2. `./.reinix/models.yaml`
3. `./.reinix/policy.yaml`
4. `~/.reinix/agents.yaml`
5. `~/.reinix/models.yaml`
6. `~/.reinix/policy.yaml`

On a first run with missing settings, Reinix writes example files under `~/.reinix/` and fails with a startup error. It never creates active `agents.yaml`, `models.yaml`, or `policy.yaml` files for you.

### agents.yaml

`agents.yaml` must define exactly `producer`, `reviewer`, and `remediator` under an `agents` mapping. Each agent must include `provider`, `model`, `prompt`, and `output`. The `provider` selects a provider section from `models.yaml`; `model` selects a provider-local tier such as `medium` or `high`.

```yaml
agents:
  producer:
    provider: anthropic
    model: medium
    prompt:
      ref: reinix://prompts/producer
    output:
      schemaRef: reinix://schemas/producer-output
  reviewer:
    provider: openai
    model: high
    prompt:
      ref: reinix://prompts/reviewer
    output:
      schemaRef: reinix://schemas/reviewer-output
  remediator:
    provider: anthropic
    model: high
    prompt:
      ref: reinix://prompts/remediator
    output:
      schemaRef: reinix://schemas/remediator-output
```

Prompt references are catalog values and may be user-defined. Output schemas can be inline JSON Schema objects under `output.schema` or built-in schema references under `output.schemaRef`:

- `reinix://schemas/producer-output` requires `artifact`
- `reinix://schemas/reviewer-output` requires `verdict`
- `reinix://schemas/remediator-output` requires `task`

### models.yaml

`models.yaml` maps provider-local model tiers to concrete provider CLI models. Provider keys and tier names are catalog values, so users may choose names that fit their environment. Reinix only requires that every configured agent's `(provider, model)` pair resolves.

```yaml
providers:
  anthropic:
    runner: claude-code
    models:
      medium:
        model: claude-sonnet-4-5
      high:
        model: claude-opus-4-7
  openai:
    runner: codex
    models:
      medium:
        model: gpt-5.5
        reasoningEffort: medium
      high:
        model: gpt-5.5
        reasoningEffort: high
```

The provider-level `runner` selects the provider CLI adapter. Built-in adapters currently support:

- `claude-code`, which invokes `claude`
- `codex`, which invokes `codex`

Reinix validates only the runners referenced by configured agents. `reasoningEffort` is optional and currently passed through to the Codex runner as `model_reasoning_effort`.

### policy.yaml

`policy.yaml` configures the built-in `ConfigBasedReviewFixPolicy`.

```yaml
reviewPolicy:
  maxRemediationAttempts: 5
```

`maxRemediationAttempts` counts only Remediator attempts after a failed review. A value of `5` permits the initial Producer/Reviewer round plus up to five Remediator calls.

## ReviewFixPolicy

`ReviewFixPolicy` is the routing seam between review output and workflow control. It owns budget, escalation, severity mapping, convergence checks, and any state it wants to carry across rounds.

Production composition uses `ConfigBasedReviewFixPolicy` by default. It treats `verdict: "accepted"` with `verification.ran: true` as success. Missing or false `verification.ran` fails immediately; any other verified non-empty verdict is remediated until `maxRemediationAttempts` is exhausted.

The policy interface is intentionally small:

```js
const reviewFixPolicy = {
  decide: async ({ session, verdict }) => {
    if (verdict.verdict === "accepted") {
      return { decision: "complete-ok", session };
    }

    return { decision: "complete-fail", session };
  },
};
```

Reinix threads the returned `session` into the next policy call but does not inspect it.

## Provider CLI Execution

Reinix passes each agent prompt and expected JSON Schema to the selected runner's native structured-output mode.

- Claude Code uses `claude -p --model ... --output-format json --json-schema ...`.
- Codex uses `codex exec --model ... --config model_reasoning_effort="..." --output-schema ... --output-last-message ...` when `reasoningEffort` is configured, and omits the config argument otherwise.

Provider stdout and stderr are treated as diagnostics. The orchestration loop consumes only the validated semantic JSON result.

## Runs and Progress

Each run appends operational progress events to `~/.reinix/runs/<run-id>/events.jsonl`. Authored artifacts are not rewritten to record progress.

Follow the latest run's event log with:

```bash
latest_run="$(ls -td "$HOME"/.reinix/runs/* | head -n 1)"; tail -f "$latest_run/events.jsonl"
```

The watched event surface includes the run ID plus current agent, selected provider/model tier, Producer task file, current policy decision, runtime failure reason, final status, provider runner/session references, optional provider cost/error diagnostics, and provider stdout/stderr diagnostics when those fields apply. A `reinix watch --run latest|<run-id>` command is intentionally deferred.

Run metadata is stored in `metadata.json`. It records the run ID, start time, task file when available, terminal status fields, final duration as `mm:ss`, and total provider cost when available. Only `duration`, `endTime`, `exitCode`, `status`, `totalCost`, and `totalCostUsd` are mutable after creation.

## Local Demo

The local demo runs from `reinix/examples/local-demo` and can use fake providers, so it does not require provider credentials:

```bash
node reinix/examples/local-demo/run-demo.js --fake-providers
```

The fake demo exercises the same orchestration loop with a demo policy:

- accepted review verdicts complete successfully
- rejected review verdicts remediate up to a configured limit
- exhausted remediation budget completes with failure

## Description

Coordinates provider CLI agents — Producer, Reviewer, and optional Remediator — through a loop with pluggable review policy. Every input is a *verifiable task with done criteria*; settings live in `.reinix/` YAML files.

## Stack

- Node.js
- JavaScript
- CLI
- Multi-Agent
