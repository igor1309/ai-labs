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
Claude model assignments, a Codex review command, and native launch concepts.
That coupling prevents the same procedure from being driven by Claude or
Codex, makes caller-selected models undefined, and leaves the ownership of
review fixes ambiguous.

This decision is based on the [runtime portability intake](../research/codex-claude-runtime-portability-intake.md),
which is the provenance for the requirements and observed runtime constraints.
The change is limited to process configuration. Vortex application code,
product tests, simulator state, and product behavior remain out of scope.

## Decision

Keep one runtime-neutral `adversarial-cycle` orchestration contract. Store
runtime-specific defaults and model choices in skill-owned profiles:

- `runtime/claude.toml` describes the Claude host and Claude launcher.
- `runtime/codex.toml` describes the Codex host, Codex launcher, and the
  atomic `luna-max` preset (`gpt-5.6-luna` with `max` reasoning).

Profiles are skill resources interpreted at run time. They do not modify
global Claude or Codex defaults, persistent agent definitions, or caller
configuration.

The shared orchestration resolves one canonical execution manifest before the
first spawn and passes that manifest, the role, the artifact-specific task,
and the orchestrator-supplied `review_round_spent` value through
`scripts/launch-runtime-agent.py` for every launch. The shared boundary chooses
the adapter named in the manifest and validates the shared result contract.
It does not perform orchestration.

### Ownership boundary

| Layer | Owns | Must not own |
|---|---|---|
| `SKILL.md` | Lifecycle, role responsibilities, review rounds, tracker transitions, watch policy, terminal states, receipts, and calls to the neutral launcher | Vendor/model names, native launcher names or arguments, fallback selection, review judgment, or fix routing inside an adapter |
| `runtime/claude.toml` | Claude defaults for Planner, Implementer, cold Reviewer, escalation, and independent review, plus the `claude` adapter identifier | Orchestration or native launch implementation |
| `runtime/codex.toml` | Codex defaults, the `codex` adapter identifier, and `luna-max` | Orchestration or native launch implementation |
| `scripts/resolve-runtime-profile.py` | Profile validation, host selection, preset expansion, and override precedence | Spawning agents or choosing fallbacks |
| `scripts/launch-runtime-agent.py` | Neutral launch input, adapter dispatch from the manifest, and shared result validation | Role sequencing, fallback, tracker transitions, review judgment, or fix ownership |
| `scripts/launchers/claude.py` | Translation from one resolved role to a Claude Task/subagent launch and native response normalization | Changing model/effort, retrying, or making orchestration decisions |
| `scripts/launchers/codex.py` | Translation from one resolved role to a native Codex subagent spawn and native response normalization | Changing model/effort, retrying, or making orchestration decisions |
| `independent-review.md` | Read-only findings, independence classification, audit fields, and owner-routed fixes | Applying accepted fixes directly |
| `codex-judge.md` | Standalone human-invoked judge → fix → log workflow | Acting as the cycle's review adapter |

### Profile schema and defaults

Both profiles use schema version 1 and provide the host runtime, launcher
adapter, Planner, Implementer, cold Reviewer, escalation, and independent
review model/effort values. They also provide the independent-review launcher,
an independence classification, concrete model identifiers for audit records,
the unavailable-model policy, and zero or more atomic presets.

The defaults are fixed as follows:

| Host | Planner | Implementer | Reviewer | Escalation | Independent review |
|---|---|---|---|---|---|
| Claude | `opus` / `high` | `sonnet` / `medium` | `opus` / `high` | `opus` / `high` | direct read-only Codex, `gpt-5.6-sol` / `high`, `cross-runtime` |
| Codex | `gpt-5.6-sol` / `high` | `gpt-5.6-terra` / `medium` | `gpt-5.6-sol` / `high` | `gpt-5.6-sol` / `xhigh` | fresh Codex agent, `gpt-5.6-luna` / `max`, `same-runtime-fresh-pass` |

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
adapter, exact model and effort, and context mode.

`scripts/launchers/claude.py` passes the manifest's model and effort to the
Claude Task/subagent primitive. For `context_mode = "cold"`, it creates a
fresh subagent whose prompt contains only the artifact-specific upstream
contract and task inputs named by the cycle.

`scripts/launchers/codex.py` passes the manifest's model as `model`, the effort
as `reasoning_effort`, and `fork_turns = "none"` for
`context_mode = "cold"` to native Codex subagent spawn. It never substitutes a
CLI `codex exec` process for native spawn.

Both adapters return the same canonical launch-result object:

| Field | Contract |
|---|---|
| `role` | Exact requested role from the manifest |
| `runtime` | `claude` or `codex` from the manifest |
| `requested_model` | Exact model passed to the native primitive |
| `requested_effort` | Exact effort passed to the native primitive |
| `status` | Exactly `accepted` or `rejected` |
| `runtime_task_or_agent_id` | Native identifier when accepted; `null` when rejected |
| `adapter_error` | `null` when accepted; exact unmodified native adapter error when rejected |
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
  spawn and emits a canonical manifest; every role launch uses that manifest.
- A Claude manifest reaches only the Claude adapter, and a Codex manifest
  reaches only the Codex adapter.
- Every native launch receives the exact resolved model and effort. Cold Codex
  launches receive `fork_turns = "none"`.
- Every result includes all canonical fields; acceptance includes the native
  task/agent identifier and rejection includes no identifier.
- Rejection preserves the exact adapter error, makes exactly one native launch
  attempt, does not change model or effort, does not retry, and stops the cycle
  without fallback.
- Adapters never sequence roles, spend review rounds, judge findings, route
  fixes, or mutate tracker state.
- Profiles are runtime resources and do not alter global defaults.

## Compatibility

The implementation must accept both installed host runtimes and the defaults
recorded above. The Codex `luna-max` selection must resolve to
`gpt-5.6-luna` / `max`. An explicit model such as
`unavailable-runtime-portability-test-model` remains the requested model and
must produce a stopped result when a fake native primitive rejects it; it must
not be replaced by a default.

The standalone `codex-judge` command retains its current read-only Codex
acquisition, grounded judgment, direct fix, verification, and audit-log
behavior for non-cycle use. The cycle uses the skill-owned independent-review
contract instead.

## Consequences

Runtime selection, model provenance, launch identifiers, rejection details, and
the execution-manifest digest become explicit evidence in trackers and
receipts. Native adapter tests can verify translation with recording/fake
primitives without invoking providers. Live acceptance probes remain necessary
to prove nested Claude and Codex execution; schema tests alone are insufficient.

The procedure gains a small resolver and launcher boundary, and callers must
provide the detected host plus any role overrides. A rejected requested model
stops the cycle rather than silently recovering, preserving the caller's
selection and making availability failures visible.

