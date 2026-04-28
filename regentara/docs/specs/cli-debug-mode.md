---
date: 2026-04-28
model: gpt-5
description: "Spec for Regentara CLI debug mode based on ADR-010."
---

# CLI Debug Mode Spec

## Goal

The Regentara CLI emits compact live debug progress to stderr for one run while preserving existing orchestration behavior and stdout semantics.

## Public Interface

CLI invocation:

```text
regentara --debug --task-file <path>
node regentara/src/index.js --debug --task-file <path>
```

Parsed CLI arguments:

```text
parseArguments(argv: string[]) -> { task: string, taskFile?: string, debug: boolean }
```

Debug output:

```text
regentara debug: <event> <key=<json-scalar>>...
```

Every line starts with `regentara debug:`. The next token is a stable event label. Remaining tokens are compact `key=<json-scalar>` fields.

Required event labels:

- `settings`: selected settings paths known at the time of emission.
- `run-created`: run ID and run directory.
- `agent-start`: agent call start.
- `agent-end`: agent call end.
- `policy-decision`: post-review policy decision.
- `failure`: startup or runtime failure.
- `completion`: terminal successful or failed status.

Representative debug lines:

```text
regentara debug: settings agents="/path/.regentara/agents.yaml" models="/path/.regentara/models.yaml" policy="/path/.regentara/policy.yaml"
regentara debug: run-created runId="20260428T141417Z-boz0l1nw" runDirectory="/Users/example/.regentara/runs/20260428T141417Z-boz0l1nw"
regentara debug: agent-start agent="reviewer" route="codex/openai/gpt-5.5/high"
regentara debug: agent-end agent="reviewer" route="codex/openai/gpt-5.5/high" sessionReference="019dd471-414b-77a0-9bcc-05bbd4857991"
regentara debug: policy-decision decision="complete-ok"
regentara debug: completion status="succeeded"
```

Values must be JSON-encoded scalar values on a single line. Optional fields are omitted when unknown or unavailable.

## Behavior Rules

- `--debug` writes only to stderr.
- `--debug` does not write to stdout.
- `--debug` does not change exit code semantics.
- `--debug` does not change orchestration behavior, provider execution, policy decisions, settings precedence, `events.jsonl`, or run metadata.
- Debug lines must be human-readable plain text, not JSONL.
- Every debug line must start with `regentara debug:`.
- Every debug field value must be encoded as a single-line JSON scalar.
- The `settings` event must include selected `agents.yaml`, `models.yaml`, and `policy.yaml` paths when those paths are known.
- If startup fails before all settings paths are known, the `settings` event includes only known paths.
- If startup fails before run creation, debug output must include a `failure` event with the startup failure reason and must not include `run-created`.
- After run creation, debug output must include `run-created` with `runId` and `runDirectory`.
- Agent debug events must include `agent` and a compact `route` value in `runner/provider/model/tier` form when routing has resolved.
- Producer `agent-start` includes `taskFile` when a task file is provided.
- Agent end debug events include provider runner/session references when available.
- Policy debug events include the returned decision.
- Runtime failures after run creation include a `failure` event with `status=failed` and `reason`.
- Successful runs include a `completion` event with `status=succeeded`.
- Failed runs include a `completion` event with `status=failed` when Regentara reaches a controlled terminal failure path.
- Debug output must not include full prompts.
- Debug output must not include full JSON Schemas.
- Debug output must not include full provider stdout or stderr.
- Debug output must not include environment variables, credentials, auth state, or provider secrets.
- Debug output must not be implemented by tailing, parsing, or transforming `events.jsonl`.

## Tests (Required)

1. `parseArguments` should set `debug` to `true` when `--debug` is present.
2. `parseArguments` should set `debug` to `false` when `--debug` is absent.
3. `main` should write debug lines to stderr during a successful `--debug --task-file` run.
4. `main` should not write debug lines when `--debug` is absent.
5. `main` should keep stdout unused by debug output.
6. `main` should write selected settings paths to debug output when startup resolution succeeds.
7. `main` should write a startup failure debug line when startup fails before run creation.
8. `main` should not write a `run-created` debug line when startup fails before run creation.
9. `runWorkflow` should report run ID and run directory through debug output after run creation.
10. `runWorkflow` should report agent start with agent ID, provider, tier, concrete model, runner, and reasoning effort when available.
11. `runWorkflow` should report Producer task file on Producer start when a task file is provided.
12. `runWorkflow` should report agent end with provider runner/session references when available.
13. `runWorkflow` should report policy decisions through debug output.
14. `runWorkflow` should report runtime failure status and reason through debug output after run creation.
15. `runWorkflow` should report successful completion through debug output.
16. `runWorkflow` debug output should not include full prompts, full schemas, full provider stdout, or full provider stderr.
17. `runWorkflow` should preserve existing `events.jsonl` event behavior when debug mode is enabled.

## Done Criteria

- `--debug` is parsed by the CLI.
- Debug output follows the `regentara debug: <event> <key=<json-scalar>>...` line format.
- Debug output is emitted to stderr only.
- Successful runs, startup failures, runtime failures, agent lifecycle, policy decisions, and completion are covered by tests.
- Debug mode does not alter existing run results, `events.jsonl`, or metadata behavior.
- The required tests above pass.
