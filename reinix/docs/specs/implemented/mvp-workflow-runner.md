---
date: 2026-04-28
model: gpt-5
description: "MVP workflow runner contract derived from the accepted Reinix ADRs, including provider/model-tier routing."
---

# MVP Workflow Runner Spec

## Goal

The MVP workflow runner, owned by the Reinix Orchestrator module, executes one Reinix workflow from a valid task by validating settings, invoking configured provider CLIs, preserving run artifacts, and delegating post-review routing to `ReviewFixPolicy`.

## Public Interface

### Run Workflow

```text
runWorkflow(input: RunWorkflowInput) -> RunWorkflowResult
```

`RunWorkflowInput`:

- `task`: valid task accepted by Reinix.
- `workingDirectory`: directory selected for the Reinix invocation.
- `reviewFixPolicy`: injected policy used for every post-review routing decision.

`RunWorkflowResult`:

- `status`: `succeeded` or `failed`.
- `exitCode`: `0` for success, non-zero for failure.
- `runId`: present only when startup validation passed and a run was created.
- `runDirectory`: present only when startup validation passed and a run was created.
- `failureReason`: concise failure reason, present only when `status` is `failed`.

### Settings Resolution

```text
resolveAgentSettings(workingDirectory: Path) -> AgentSettings | StartupValidationFailure
resolveModelRouting(workingDirectory: Path) -> ModelRouting | StartupValidationFailure
```

`AgentSettings`:

- contains every Reinix-defined agent required by the MVP workflow.
- rejects unknown agent identifiers.
- defines `provider`, `model`, `prompt`, and `output` for each required agent.
- treats `name` as an optional display-name override only.
- defines JSON output contracts through supported JSON Schema references or inline schemas.

The MVP workflow requires exactly these Reinix-defined agent identifiers:

| Identifier | Role | Input contract | Output contract |
|---|---|---|---|
| `producer` | Performs the current valid task. | Current valid task. | JSON output matching the configured `producer` schema and identifying produced work or artifacts. |
| `reviewer` | Reviews the current task and produced work. | Current valid task plus Producer work or artifact references. | JSON verdict matching the configured `reviewer` schema. |
| `remediator` | Converts review feedback into a follow-up valid task. | Current valid task, Producer work or artifact references, latest Reviewer verdict, and completed review history. | JSON output matching the configured `remediator` schema and containing a valid task. |

`ModelRouting`:

- maps each provider declared in `models.yaml` to a provider CLI `runner` and provider-local model tiers.
- maps each provider-local model tier to a concrete provider CLI `model`.
- may define optional tier metadata such as `reasoningEffort` for runners that support it.
- treats providers, model tiers, and runners as catalog values: no closed inventory and no closed whitelist.

### Review Fix Policy

```text
ReviewFixPolicy.decide(input: ReviewFixPolicyInput) -> ReviewFixPolicyOutput
```

`ReviewFixPolicyInput`:

- `verdict`: completed review output.
- `session`: opaque policy session from the previous policy decision, or no session for the first completed review.

`ReviewFixPolicyOutput`:

- `decision`: `complete-ok`, `complete-fail`, or `remediate`.
- `session`: opaque policy session to pass unchanged to the next policy decision in the same run.

### Provider CLI Execution

```text
executeProviderCli(input: ProviderCliInput) -> ProviderCliResult
```

`ProviderCliInput`:

- `runner`: validated runner selected by model routing.
- `model`: validated concrete model selected by model routing.
- `provider`: validated provider selected by agent settings.
- `reasoningEffort`: optional model-tier metadata selected by model routing.
- `executionInput`: prepared task, artifact, and file references for the agent call.

`ProviderCliResult`:

- `exitStatus`: provider CLI process status.
- `stdoutReference`: captured stdout summary or reference, when available.
- `stderrReference`: captured stderr summary or reference, when available.
- `runnerReference`: runner-level reference, when available.
- `sessionReference`: provider CLI session reference, when available.
- `jsonOutput`: runtime JSON output expected from the configured agent.

## Behavior Rules

### Startup Validation

- Reinix must resolve `agents.yaml` from `./.reinix/agents.yaml` first, then `~/.reinix/agents.yaml`.
- If local `agents.yaml` exists, Reinix must not merge it with or fall back to the global file.
- Reinix must fail startup validation when no `agents.yaml` exists.
- Reinix must fail startup validation when the selected `agents.yaml` is invalid.
- Reinix must resolve `models.yaml` from `./.reinix/models.yaml` first, then `~/.reinix/models.yaml`.
- If local `models.yaml` exists, Reinix must not merge it with or fall back to the global file.
- Reinix must fail startup validation when no `models.yaml` exists.
- Reinix must fail startup validation when the selected `models.yaml` is invalid.
- Reinix must fail startup validation before creating a run when provider execution is requested without a non-empty task file path.
- Reinix must fail startup validation when `agents.yaml` references a provider that is not defined in `models.yaml`.
- Reinix must fail startup validation when `agents.yaml` references a provider-local model tier that is not defined in `models.yaml`.
- Reinix must validate that every provider CLI required by the selected workflow and model routing is available before workflow execution starts.
- When `agents.yaml` is missing at both locations, Reinix must write `~/.reinix/agents.yaml.example` before failing, and must not overwrite an existing `agents.yaml.example`.
- When `models.yaml` is missing at both locations, Reinix must write `~/.reinix/models.yaml.example` before failing, and must not overwrite an existing `models.yaml.example`.
- Bootstrap must not create `agents.yaml` or `models.yaml` directly; it writes only the `*.example` templates.
- Startup validation failure must not create a run.
- Startup validation failure must return a non-zero exit code and surface a `StartupValidationFailure` whose message names the offending settings file or rule.

### Run Creation

- Reinix must create a run only after startup validation passes.
- A run ID must match `^[0-9]{8}T[0-9]{6}Z-[a-z0-9]{8}$`.
- The timestamp segment must represent the run start time in UTC as `YYYYMMDDTHHMMSSZ`.
- The suffix segment must contain exactly 8 lowercase alphanumeric characters generated from at least 40 bits of randomness.
- Reinix must create the run directory under `~/.reinix/runs/<run-id>/`.

### Agent Execution

- Reinix must invoke provider CLIs as headless subprocesses.
- Reinix must run provider CLIs from the invocation `workingDirectory`.
- Reinix must not manage provider credentials, authentication state, or provider sessions.
- Reinix must not directly run build, test, format, dependency installation, Git, branch, commit, pull-request, worktree, cleanup, sandbox, or permission-management commands.
- Reinix must treat a non-zero provider CLI exit status as a runtime failure.
- Reinix must not infer success from partial files, logs, or side effects when the provider CLI exits non-zero.

### Runtime Output Validation

- Reinix must parse each agent runtime output as JSON.
- Reinix must validate each parsed runtime output against the JSON Schema configured for that agent.
- Invalid JSON output or schema-invalid output must be a runtime failure.
- Reinix must not pass invalid agent output to the next workflow step.

### Workflow Sequence

- Reinix must start the workflow by invoking `producer` with the input valid task.
- After a successful `producer` call, Reinix must invoke `reviewer` with the same current valid task and the Producer work or artifact references.
- After a successful `reviewer` call, Reinix must invoke `ReviewFixPolicy.decide` before any subsequent agent call.
- If `ReviewFixPolicy` returns `complete-ok`, the workflow must succeed without invoking `remediator`.
- If `ReviewFixPolicy` returns `complete-fail`, the workflow must fail without invoking `remediator`.
- If `ReviewFixPolicy` returns `remediate`, Reinix must invoke `remediator` with the current valid task, Producer work or artifact references, latest Reviewer verdict, and completed review history.
- A successful `remediator` call must return a valid task.
- After a successful `remediator` call, Reinix must repeat the workflow by invoking `producer` with the remediated valid task.
- `producer`, `reviewer`, and `remediator` must not invoke each other or the Orchestrator.

### Review Routing

- A run must not start without an injected `ReviewFixPolicy`.
- The Orchestrator must hold exactly one `ReviewFixPolicy` instance for the duration of a run.
- The Orchestrator must call `ReviewFixPolicy.decide` exactly once per completed review, before any subsequent agent call.
- The Orchestrator must act only on the returned policy decision.
- The Orchestrator must forward the returned policy session unchanged to the next policy call in the same run.
- The Orchestrator must not inspect, mutate, or persist policy session contents.
- The Orchestrator must not contain conditional routing logic over verdict severity, finding categories, recurrence, or budget state.
- On `complete-ok`, the workflow succeeds.
- On `complete-fail`, the workflow fails without calling the Remediator.
- On `remediate`, the workflow calls the Remediator and then continues with the remediated valid task.

### Artifact Mutation

- Authored artifacts must be immutable after creation.
- Reinix must reject overwrite or rewrite attempts for authored artifacts.
- Reinix must not record execution progress by mutating authored artifacts.
- Run metadata must record the task file path when one is provided at run creation.
- Run metadata may be updated only to record run end time, run status, and final exit code.

### Fail-Fast Behavior

- After workflow execution starts, subprocess non-zero exit, invalid runtime JSON output, missing expected artifact, and user interruption are runtime failures.
- A runtime failure must stop the current run immediately.
- A runtime failure must mark the current run failed.
- A runtime failure must return a non-zero exit code and print a concise failure reason.
- Reinix must preserve artifacts already created before a runtime failure.
- Reinix must not fabricate missing artifacts.
- Reinix must not retry failed steps in the MVP.
- Reinix must not continue the workflow after a failed step.
- Reinix must not impose subprocess timeouts in the MVP.
- If the user interrupts Reinix before workflow execution starts, no run is created and Reinix exits non-zero.
- If the user interrupts Reinix after workflow execution starts, the current run is marked failed.

## Tests (Required)

1. `runWorkflow` should fail before creating a run when neither local nor global `agents.yaml` exists.
2. `runWorkflow` should write `~/.reinix/agents.yaml.example` when no `agents.yaml` exists at either location.
3. `runWorkflow` should not overwrite an existing `~/.reinix/agents.yaml.example` during bootstrap.
4. `runWorkflow` should not write `agents.yaml` during bootstrap.
5. `runWorkflow` should use local `agents.yaml` instead of global `agents.yaml` when both exist.
6. `runWorkflow` should fail before creating a run when local `agents.yaml` exists but is invalid.
7. `runWorkflow` should reject `agents.yaml` with an unknown agent identifier.
8. `runWorkflow` should reject `agents.yaml` missing `producer`.
9. `runWorkflow` should reject `agents.yaml` missing `reviewer`.
10. `runWorkflow` should reject `agents.yaml` missing `remediator`.
11. `runWorkflow` should reject `agents.yaml` missing `provider`, `model`, `prompt`, or `output` for `producer`.
12. `runWorkflow` should reject `agents.yaml` missing `provider`, `model`, `prompt`, or `output` for `reviewer`.
13. `runWorkflow` should reject `agents.yaml` missing `provider`, `model`, `prompt`, or `output` for `remediator`.
14. `runWorkflow` should reject `agents.yaml` with an unsupported output schema reference.
15. `runWorkflow` should fail before creating a run when neither local nor global `models.yaml` exists.
16. `runWorkflow` should write `~/.reinix/models.yaml.example` when no `models.yaml` exists at either location.
17. `runWorkflow` should not overwrite an existing `~/.reinix/models.yaml.example` during bootstrap.
18. `runWorkflow` should not write `models.yaml` during bootstrap.
19. `runWorkflow` should write only the missing `*.example` when only one of `agents.yaml` or `models.yaml` is missing.
20. `runWorkflow` should use local `models.yaml` instead of global `models.yaml` when both exist.
21. `runWorkflow` should fail before creating a run when local `models.yaml` exists but is invalid.
22. `runWorkflow` should reject `models.yaml` missing provider-level `runner`, provider-level `models`, or tier-level `model`.
23. `runWorkflow` should fail before creating a run when `agents.yaml` references a provider not defined in `models.yaml`.
24. `runWorkflow` should fail before creating a run when `agents.yaml` references a provider-local model tier not defined in `models.yaml`.
25. `runWorkflow` should pass provider model-tier routing to the runner adapter.
26. `runWorkflow` should fail before creating a run when a required provider CLI is unavailable.
27. `runWorkflow` should surface a `StartupValidationFailure` naming the offending settings file or rule on every startup-validation failure.
28. `runWorkflow` should create a run ID with the required UTC timestamp and lowercase alphanumeric suffix format after startup validation passes.
29. `runWorkflow` should create the run directory under `~/.reinix/runs/<run-id>/` after startup validation passes.
30. `runWorkflow` should invoke the provider CLI from the invocation working directory.
31. `runWorkflow` should treat a non-zero provider CLI exit status as a runtime failure.
32. `runWorkflow` should not infer success from partial files or logs when the provider CLI exits non-zero.
33. `runWorkflow` should fail immediately when agent runtime output is not valid JSON.
34. `runWorkflow` should fail immediately when agent runtime JSON does not satisfy the configured output schema.
35. `runWorkflow` should not call the next workflow step after invalid agent output.
36. `runWorkflow` should call `producer` first with the input valid task.
37. `runWorkflow` should call `reviewer` with the current valid task and Producer work or artifact references after `producer` succeeds.
38. `runWorkflow` should call no subsequent agent before the policy decision after a completed review.
39. `runWorkflow` should call `remediator` with the current valid task, Producer work or artifact references, latest Reviewer verdict, and completed review history when the policy returns `remediate`.
40. `runWorkflow` should call `producer` with the remediated valid task after `remediator` succeeds.
41. `runWorkflow` should not allow `producer`, `reviewer`, or `remediator` to invoke each other or the Orchestrator.
42. `runWorkflow` should fail before starting a run when no `ReviewFixPolicy` is injected.
43. `runWorkflow` should call `ReviewFixPolicy.decide` exactly once after each completed review.
44. `runWorkflow` should succeed when the policy returns `complete-ok`.
45. `runWorkflow` should fail without calling Remediator when the policy returns `complete-fail`.
46. `runWorkflow` should call Remediator and continue with the remediated task when the policy returns `remediate`.
47. `runWorkflow` should forward the policy session returned from one decision unchanged into the next decision.
48. `runWorkflow` should not branch on verdict severity without consulting `ReviewFixPolicy`.
49. `runWorkflow` should reject authored artifact overwrite attempts.
50. `runWorkflow` should allow run metadata updates for end time, run status, and final exit code.
51. `runWorkflow` should reject run metadata updates for fields other than end time, run status, and final exit code.
52. `runWorkflow` should fail before creating a run when provider execution has no task file.
53. `runWorkflow` should include the task file on Producer start events.
54. `runWorkflow` should include provider run references on agent end events.
55. `runWorkflow` should record the task file in run metadata.
56. `runWorkflow` should mark run metadata terminal on successful and failed completion decisions.
57. `runWorkflow` should not record execution progress by mutating authored artifacts.
58. `runWorkflow` should preserve already-created artifacts when a runtime failure occurs.
59. `runWorkflow` should not fabricate an expected artifact when it is missing.
60. `runWorkflow` should fail immediately when an expected artifact is missing.
61. `runWorkflow` should stop after the first runtime failure.
62. `runWorkflow` should not retry a failed step.
63. `runWorkflow` should not continue to later workflow steps after a failed step.
64. `runWorkflow` should not impose an automatic subprocess timeout.
65. `runWorkflow` should exit non-zero and create no run when interrupted before workflow execution starts.
66. `runWorkflow` should mark the run failed when interrupted after workflow execution starts.

## Done Criteria

- Startup validation enforces all `agents.yaml`, `models.yaml`, cross-file provider/model-tier resolution, and provider CLI availability rules before run creation.
- First-run bootstrap writes missing `agents.yaml.example` and `models.yaml.example` to `~/.reinix/` without overwriting existing examples and without creating actual settings files.
- `agents.yaml` validation enforces the MVP agent inventory: `producer`, `reviewer`, and `remediator`.
- Settings validation rejects only structural problems; providers, model tiers, runners, and prompt references are accepted as catalog values.
- Startup validation failures surface a `StartupValidationFailure` naming the offending settings file or rule.
- Successful startup creates a valid run ID and run directory under the global Reinix runs root.
- Provider CLI execution obeys the invocation, capture, and responsibility boundaries defined above.
- Runtime output validation prevents invalid agent output from reaching later workflow steps.
- Workflow execution follows the Producer, Reviewer, policy decision, optional Remediator, and repeated Producer sequence defined above.
- The Orchestrator delegates every post-review routing decision to the injected `ReviewFixPolicy`.
- Runtime failures stop the workflow immediately, preserve existing artifacts, mark the run failed, and return a non-zero exit code.
- Authored artifacts are immutable after creation, while run metadata records task-file provenance at creation and supports only the allowed status/end-time/exit-code updates afterward.
- The required tests above pass.
