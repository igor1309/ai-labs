---
date: 2026-08-03
model: gpt-5.6
description: "Architecture decision for runtime-neutral adversarial-cycle orchestration and skill-owned Claude/Codex execution profiles."
status: accepted
---

# Adversarial Cycle Runtime Portability

## Context

The `adversarial-cycle` procedure owns a lifecycle of planning, one
Implementer per step, independent review, review-round limits, tracker
transitions, evidence, and terminal receipts. Its current wording also embeds
Claude model assignments, a Codex review command, and runtime-specific launch
concepts.
That coupling prevents the same procedure from being driven by Claude or
Codex, makes caller-selected models undefined, and leaves the ownership of
review fixes ambiguous.

This decision is based on the [runtime portability intake](../research/codex-claude-runtime-portability-intake.md),
which is the provenance for the requirements and observed runtime constraints.
The change is limited to process configuration. Vortex application code,
product tests, simulator state, and product behavior remain out of scope.

The prior Phase 5 acceptance index is invalid for executable portability. Its
host bridges ran the installed CLIs and injected their responses into the
callback-only adapters, so those PASS cells do not prove that the shipped
public entry point can launch either runtime. This decision supersedes that
evidence without rewriting its historical commit or the authoritative intake.

## Decision

Keep one runtime-neutral `adversarial-cycle` orchestration contract. Store
runtime-specific defaults and model choices in skill-owned profiles:

- `runtime/claude.toml` describes the Claude host, executable, access mapping,
  and launcher.
- `runtime/codex.toml` describes the Codex host, executable, sandbox mapping,
  and launcher, and the atomic `luna-max` preset (`gpt-5.6-luna` with `max`
  reasoning).

Profiles are skill resources interpreted at run time. They do not modify
global Claude or Codex defaults, persistent agent definitions, or caller
configuration.

The shared orchestration resolves one canonical execution manifest before the
first launch and passes that manifest, the role, the artifact-specific task,
and the orchestrator-supplied `review_round_spent` value through
`scripts/launch-runtime-agent.py` for every launch. The shared boundary chooses
the adapter named in the manifest and validates the shared result contract.
It does not perform orchestration.

Both adapters are CLI subprocess adapters. They invoke the installed
executables directly with an argument list, never through a shell and never
through a custom host bridge. The neutral lifecycle boundary is
`scripts/runtime-lifecycle.py`; it owns executable status, follow-up, and
cancellation operations for the stored session/thread identifier.

### Ownership boundary

| Layer | Owns | Must not own |
|---|---|---|
| `SKILL.md` | Lifecycle, role responsibilities, review rounds, tracker transitions, watch policy, terminal states, receipts, and calls to the neutral launcher/lifecycle boundaries | Vendor/model names, CLI argument construction, fallback selection, review judgment, or fix routing inside an adapter |
| `runtime/claude.toml` | Claude executable, defaults, access mapping, and independent-review settings | Orchestration or CLI implementation |
| `runtime/codex.toml` | Codex executable, defaults, sandbox mapping, and `luna-max` | Orchestration or CLI implementation |
| `scripts/resolve-runtime-profile.py` | Profile validation, host selection, preset expansion, and override precedence | Spawning agents or choosing fallbacks |
| `scripts/launch-runtime-agent.py` | Neutral launch input, adapter dispatch from the manifest, and shared result validation | Role sequencing, fallback, tracker transitions, review judgment, or fix ownership |
| `scripts/launchers/claude.py` | Translation from one resolved role to a Claude CLI subprocess and JSON/session response normalization | Changing model/effort, retrying, or making orchestration decisions |
| `scripts/launchers/codex.py` | Translation from one resolved role to a Codex CLI subprocess and JSONL/thread response normalization | Changing model/effort, retrying, or making orchestration decisions |
| `scripts/runtime-lifecycle.py` | Neutral status, follow-up, and cancellation operations over launch records and adapter lifecycle commands | Changing model/effort, hiding unsupported operations, or mutating cycle decisions |
| `independent-review.md` | Read-only findings, independence classification, audit fields, and owner-routed fixes | Applying accepted fixes directly |
| `codex-judge.md` | Standalone human-invoked judge → fix → log workflow | Acting as the cycle's review adapter |

### Profile schema and defaults

Both profiles use schema version 1 and provide the host runtime, executable,
launcher adapter, Planner, Implementer, cold Reviewer, escalation, and
independent-review model/effort/access values. They also provide the
independent-review launcher, an independence classification, concrete model
identifiers for audit records, the unavailable-model policy, and zero or more
atomic presets.

The defaults are fixed as follows:

| Host | Planner | Implementer | Reviewer | Escalation | Independent review |
|---|---|---|---|---|---|
| Claude | `opus` / `high`, read-only | `sonnet` / `medium`, workspace-write | `opus` / `high`, read-only | `opus` / `high`, read-only | direct read-only Codex, `gpt-5.6-sol` / `high`, `cross-runtime` |
| Codex | `gpt-5.6-sol` / `high`, read-only | `gpt-5.6-terra` / `medium`, workspace-write | `gpt-5.6-sol` / `high`, read-only | `gpt-5.6-sol` / `xhigh`, read-only | fresh read-only Codex, `gpt-5.6-luna` / `max`, `same-runtime-fresh-pass` |

The Codex `luna-max` preset is inseparable: it expands to
`model = "gpt-5.6-luna"` and `reasoning_effort = "max"`. It is selectable for
any configurable role. A conflicting explicit effort is a validation error.

### Selection and compatibility

The detected host selects its matching profile. A caller cannot label a Codex
host as Claude or label a Claude host as Codex. Per role, resolution uses this
precedence:

1. Explicit caller literal model and effort.
2. Explicit caller named preset.
3. The selected host profile default.

Resolved values are passed to each launch and are never persisted as global
defaults. Explicit caller values remain exact, including an unavailable model.
The unavailable-model policy is `stop`; no profile declares a fallback.

### Neutral launcher contract

The canonical launcher input is the resolved execution manifest, the requested
role, the artifact-specific task prompt, and the supplied
`review_round_spent` value. The manifest contains the selected runtime,
executable, adapter, exact model and effort, access, and context mode.

`scripts/launchers/claude.py` runs the configured executable with
`--print --output-format json --model <model> --effort <effort>` and maps
read-only access to `--permission-mode plan` and workspace-write access to
`--permission-mode acceptEdits`. A cold launch omits `--resume` and
`--continue`; the returned JSON must contain `session_id`.

`scripts/launchers/codex.py` runs the configured executable as
`exec --json --model <model> -c model_reasoning_effort=<effort> --sandbox
<read-only|workspace-write> --cd <workspace> --output-last-message <path> -`.
The prompt is supplied on stdin and the first `thread.started.thread_id` is
stored. A cold launch omits resume arguments.

`scripts/runtime-lifecycle.py` is the neutral executable boundary for the
stored identifier. `status` reads the launch record and the runtime status
surface when the process is active; `follow-up` uses the verified Claude
`--resume` or Codex `exec resume` command with the same resolved model, effort,
and access; and `cancel` terminates an active recorded subprocess or returns a
structured completed/unsupported result. No lifecycle operation selects a
fallback or hides a CLI limitation.

Both adapters use argument-list subprocesses with no shell, the caller's
workspace as `cwd`, and per-launch evidence containing argv, cwd, stdout,
stderr, exit status, identifier, and canonical result. Tests replace the
configured executable on `PATH` with a recording stub through the same public
entry point.

Both adapters return the same canonical launch-result object:

| Field | Contract |
|---|---|
| `role` | Exact requested role from the manifest |
| `runtime` | `claude` or `codex` from the manifest |
| `requested_model` | Exact model passed to the CLI |
| `requested_effort` | Exact effort passed to the CLI |
| `status` | Exactly `accepted` or `rejected` |
| `runtime_task_or_agent_id` | CLI session/thread identifier when accepted; `null` when rejected |
| `adapter_error` | `null` when accepted; exact unmodified CLI failure output when rejected |
| `review_round_spent` | Echo of the supplied value; the adapter cannot infer or change it |

Adapters translate and normalize only. They do not choose role order, charge
review rounds, select fallbacks, update the tracker, judge findings, or route
fixes. A rejection returns the exact failure once. The orchestrator consumes
that result through its existing `stopped` transition, records the requested
role/model/effort, adapter error, and review-round value, and returns the
existing stopped receipt. It never launches a replacement model.

### Independent review and legacy compatibility

The shared gate is named **independent review** and its record is an
**independent audit**. Each audit records the resolved reviewer, runtime,
concrete model, effort, launcher, and independence classification.

`cross-model` is recorded only when orchestrator and independent-review model
identifiers differ. `cross-vendor` is recorded only for the `cross-runtime`
adapter when its recorded providers differ. A Codex orchestrator's fresh Codex
pass is classified `same-runtime-fresh-pass`; it is not called cross-vendor.

The independent reviewer is read-only. The orchestrator judges findings and
routes every accepted fix to the Planner or Implementer that owns the artifact,
preserving follow-up commits, the two-round cap, and the audit log. The cycle
does not invoke standalone `codex-judge`.

Committed legacy tracker entries named `codex-audit` remain untouched and
resumable. On resume they are interpreted as independent audits with
`classification = legacy-codex-review`. New transitions and receipts use
neutral names and include the resolved execution-manifest digest.

## Invariants

- Planner, one Implementer per plan step, a fresh cold Reviewer, review-round
  caps, committed tracker transitions, evidence discipline, terminal states,
  and receipts remain part of one cycle contract.
- The resolver selects exactly one compatible host profile before the first
  launch and emits a canonical manifest; every role launch uses that manifest.
- A Claude manifest reaches only the Claude adapter, and a Codex manifest
  reaches only the Codex adapter.
- Every CLI launch receives the exact resolved model and effort. Cold launches
  omit resume/continue arguments.
- Every result includes all canonical fields; acceptance includes the CLI
  session/thread identifier and rejection includes no identifier.
- Rejection preserves the exact CLI failure output, makes exactly one launch
  attempt, does not change model or effort, does not retry, and stops the cycle
  without fallback.
- Read-only roles use a read-only CLI mode; only the Implementer receives
  workspace-write access, and its subprocess `cwd` is the caller's workspace.
- Lifecycle status, follow-up, and cancellation are executable operations with
  explicit completed/unsupported results.
- Adapters never sequence roles, spend review rounds, judge findings, route
  fixes, or mutate tracker state.
- Profiles are runtime resources and do not alter global defaults.

## Compatibility

The implementation must accept both installed host runtimes and the defaults
recorded above. The Codex `luna-max` selection must resolve to
`gpt-5.6-luna` / `max`. An explicit model such as
`unavailable-runtime-portability-test-model` remains the requested model and
must produce a stopped result when the CLI rejects it; it must
not be replaced by a default.

The CLI controls are version-sensitive. The implementation is grounded against
Claude Code `2.1.220` and Codex CLI `0.146.0`; each live acceptance record must
include the version/help command output, exact argv, stdout/stderr, exit status,
and extracted identifier. A future CLI with incompatible help output is a
stopped condition until its adapter and evidence are updated.

The standalone `codex-judge` command retains its current read-only Codex
acquisition, grounded judgment, direct fix, verification, and audit-log
behavior for non-cycle use. The cycle uses the skill-owned independent-review
contract instead.

## Consequences

Runtime selection, model provenance, launch identifiers, rejection details, and
the execution-manifest digest become explicit evidence in trackers and
receipts. CLI adapter tests use recording executables and the public entry
point, while live acceptance probes prove the installed Claude and Codex
executables actually run. Schema tests alone are insufficient.

CLI subprocesses trade native host integration for portability. The controls
are explicit argument lists, no shell expansion, per-role access/sandbox,
caller-workspace `cwd`, cold-launch omission of resume flags, exact command and
stream evidence, version/help grounding, and a stop policy for non-zero exits,
missing identifiers, unsupported lifecycle operations, or model/effort drift.

The procedure gains a small resolver and launcher boundary, and callers must
provide the detected host plus any role overrides. A rejected requested model
stops the cycle rather than silently recovering, preserving the caller's
selection and making availability failures visible.
