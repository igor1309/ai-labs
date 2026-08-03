---
date: 2026-08-03
model: gpt-5.6
description: "Top-level implementation plan for separating adversarial-cycle orchestration from Claude and Codex runtime profiles."
status: proposed
---

# Adversarial Cycle Claude and Codex Runtime Portability Implementation Plan

## Outcome

Keep one runtime-neutral `adversarial-cycle` orchestration contract and move
model, effort, launcher, and independent-review choices into two skill-owned
execution profiles: Claude and Codex. The Codex profile exposes an atomic
`luna-max` preset (`gpt-5.6-luna` with `max` reasoning) for any configurable
role. Explicit caller selections are preserved exactly; a launch that rejects
the selected model stops the cycle and is recorded, without fallback.

This plan implements the requirements in the
[runtime portability intake](../research/codex-claude-runtime-portability-intake.md).
It changes process configuration only. No Vortex application code, product
tests, simulator state, or product behavior is in scope.

The earlier Phase 5 acceptance index is invalid for executable portability: its
host bridges invoked the installed CLIs and injected their responses into
callback-only adapters. It is superseded by the live subprocess evidence
required by this corrected plan. Historical commits and the original intake
remain unchanged; this correction records the invalid claim rather than
rewriting its history.

## Grounding Snapshot

Grounded on 2026-08-03 against:

- `adversarial-cycle/SKILL.md`, `evidence-discipline.md`, `backlog/backlog.md`,
  and `backlog/dod.md`;
- `/Users/igormalyarov/.claude/commands/codex-judge.md` and its owning
  `claude-config` repository;
- installed `claude 2.1.220`, which accepts explicit `--model` and `--effort`;
- installed `codex-cli 0.146.0`, whose `exec` command accepts `--model`,
  configuration overrides, read-only sandboxing, and persisted last output;
- the installed Claude CLI contract: `claude --print --output-format json
  --model <model> --effort <effort> --permission-mode <mode>`, with prompts on
  stdin and a returned `session_id`;
- the installed Codex CLI contract: `codex exec --json --model <model>
  --sandbox <mode> --cd <workspace> --output-last-message <path> -`, with
  `-c model_reasoning_effort=<effort>` for the exact effort and a returned
  `thread.started.thread_id`;
- the installed follow-up contracts: `claude --resume <session_id>` and
  `codex exec resume --json <thread_id> -`;
- the installed lifecycle inspection surface `claude agents --json --cwd
  <workspace>` and the Codex persisted session identifier;
- the current Codex default (`gpt-5.6-sol`, `high`) and the required Luna Max
  pairing (`gpt-5.6-luna`, `max`).

The paired static-agent pattern is precedent for runtime-specific syntax, but
is not the chosen shape here. A cycle creates fresh role agents per artifact and
must accept per-run overrides, so static duplicated Planner/Implementer/Reviewer
agents would duplicate orchestration and constrain selection.

## Chosen Design

### Ownership boundary

| Layer | Owns | Must not own |
|---|---|---|
| `SKILL.md` | lifecycle, role responsibilities, review rounds, tracker transitions, watch policy, terminal states, receipt contract, invocation of the neutral launcher/lifecycle boundaries | vendor/model names, CLI argument construction, fallback selection, adapter result interpretation beyond the shared contract |
| `runtime/claude.toml` | Claude executable, defaults, access mapping, and independent review | orchestration decisions or CLI implementation |
| `runtime/codex.toml` | Codex executable, defaults, sandbox mapping, and the `luna-max` preset | orchestration decisions or CLI implementation |
| `scripts/resolve-runtime-profile.py` | profile validation, host selection, preset expansion, override precedence, resolved JSON manifest | spawning agents or choosing fallbacks |
| `scripts/launch-runtime-agent.py` | executable neutral `launch(manifest, role, task, review_round_spent)` boundary, adapter selection from the manifest, shared launch-result validation | role sequencing, fallback, tracker transitions, review judgment, fix ownership |
| `scripts/launchers/claude.py` | map one resolved role to a Claude CLI subprocess, enforce its access mode, and normalize its JSON/session response | changing resolved model/effort, retrying with another model, orchestration decisions |
| `scripts/launchers/codex.py` | map one resolved role to a Codex CLI subprocess, enforce its sandbox, and normalize its JSONL/thread response | changing resolved model/effort, retrying with another model, orchestration decisions |
| `scripts/runtime-lifecycle.py` | neutral status, follow-up, and cancellation boundary over persisted CLI launch records and the selected adapter | changing model/effort, hiding unsupported lifecycle operations, or mutating cycle decisions |
| `independent-review.md` | read-only findings contract, independence classification, audit fields, and fix routing | direct application of accepted fixes |
| `codex-judge.md` | standalone human-invoked judge → fix → log workflow | acting as the cycle's review adapter |

Runtime profiles live inside the skill because they configure this procedure.
No persistent global Codex profile, new `.claude/agents/` entry, or new
`.codex/agents/` entry is introduced.

### Runtime profile contract

Both TOML files use schema version 1 and define these required entries:

- host runtime, launcher adapter, and executable name;
- Planner, Implementer, cold Reviewer, escalation, and independent-review
  model plus effort and access (`read-only` or `workspace-write`);
- independent-review launcher and either `cross-runtime` or
  `same-runtime-fresh-pass`; concrete model identifiers are recorded
  separately so the audit can state whether the models actually differ;
- unavailable-model policy fixed to `stop`;
- zero or more atomic named presets.

The default mappings are:

| Host | Planner | Implementer | Reviewer | Escalation | Independent review |
|---|---|---|---|---|---|
| Claude | `opus` / `high`, read-only | `sonnet` / `medium`, workspace-write | `opus` / `high`, read-only | `opus` / `high`, read-only | direct read-only Codex, `gpt-5.6-sol` / `high`, `cross-runtime` |
| Codex | `gpt-5.6-sol` / `high`, read-only | `gpt-5.6-terra` / `medium`, workspace-write | `gpt-5.6-sol` / `high`, read-only | `gpt-5.6-sol` / `xhigh`, read-only | fresh read-only Codex, `gpt-5.6-luna` / `max`, `same-runtime-fresh-pass` |

The Codex profile defines `luna-max` as the inseparable pair
`model = "gpt-5.6-luna"` and `reasoning_effort = "max"`. It is selectable for
Planner, Implementer, Reviewer, escalation, or independent review. Combining
the preset with a conflicting explicit effort is a validation error.

### Selection and failure semantics

The resolver applies exactly this precedence per role:

1. explicit caller literal model and effort;
2. explicit caller named preset;
3. selected host profile default.

The host selects its matching profile; a caller cannot label a Codex host as
Claude or the reverse. Resolved values are passed to the runtime at each launch,
not persisted as global defaults.

### Executable launcher boundary

`scripts/launch-runtime-agent.py` is the one executable seam shared by
orchestration. Its required input is the canonical resolved execution manifest
from `resolve-runtime-profile.py`, plus the role, artifact-specific task prompt,
and the orchestrator-supplied `review_round_spent` value. The manifest provides
the selected adapter, executable, runtime, exact model/effort, access, and
context mode. The launcher validates that the role exists and dispatches to
exactly one concrete CLI adapter.

`scripts/launchers/claude.py` runs the configured executable with
`--print --output-format json --model <model> --effort <effort>` and the
adapter-owned permission mapping (`plan` for read-only and `acceptEdits` for
the implementer's workspace-write scope). A cold launch does not pass
`--resume` or `--continue`; the returned JSON must contain the session
identifier needed by follow-up operations.

`scripts/launchers/codex.py` runs the configured executable as
`exec --json --model <model> -c model_reasoning_effort=<effort> --sandbox
<read-only|workspace-write> --cd <workspace> --output-last-message <path> -`.
The prompt is supplied on stdin, the first `thread.started.thread_id` is the
stored identifier, and a cold launch has no resume argument. The adapter never
uses the old native-spawn vocabulary or an external host bridge.

`scripts/runtime-lifecycle.py` is the neutral executable boundary for the
identifier promised by the tracker. `status` reads the persisted launch record
and, while a process is active, consults the runtime's status surface;
`follow-up` dispatches the runtime's verified resume command with the same
resolved model, effort, and access; and `cancel` terminates a still-running
recorded subprocess or returns a structured unsupported/completed result. Each
operation preserves the selected profile and never chooses a fallback.

Both adapters execute without a callback injection. They use an argument-list
subprocess with no shell, the caller's workspace as `cwd`, and a per-launch
evidence record containing the exact argv, cwd, stdout, stderr, exit status,
identifier, and canonical result. Read-only roles receive no write-capable CLI
mode. The implementer receives only the caller-provided workspace; no extra
directory is added. A non-zero exit returns the exact CLI failure stream once,
with no retry or alternate model. Tests replace the executable on `PATH` with a
recording stub, so they exercise the same public entry point.

Both adapters return the same canonical launch-result object:

| Field | Contract |
|---|---|
| `role` | Exact requested role from the manifest |
| `runtime` | `claude` or `codex` from the manifest |
| `requested_model` | Exact resolved model passed to the CLI |
| `requested_effort` | Exact resolved effort passed to the CLI |
| `status` | Exactly `accepted` or `rejected` |
| `runtime_task_or_agent_id` | CLI session/thread identifier when accepted; `null` when rejected |
| `adapter_error` | `null` when accepted; exact unmodified CLI failure output when rejected |
| `review_round_spent` | Echo of the orchestrator's already-decided input; the adapter cannot infer or change it |

The adapters perform translation and result normalization only. They do not
choose role order, charge review rounds, select fallbacks, update the tracker,
judge findings, or route fixes. A rejection returns the exact failure once. The
orchestrator consumes that result through its existing `stopped` transition;
neither the shared launcher nor an adapter retries with a different model.

No profile declares a fallback model. If a selected model or effort is rejected
at launch, the orchestrator records the role, requested values, adapter error,
and spent/not-spent review round, transitions the cycle to `stopped`, freezes
the worktree, and returns the existing stopped receipt. The requested value is
never replaced silently.

### Review and audit semantics

Rename the shared gate from “Codex review/codex audit” to “independent review/
independent audit.” Each audit records the resolved reviewer, runtime, model,
effort, launcher, and independence classification. The classification is a
fact about that pass. “Cross-model” may be reported only when the recorded
orchestrator and independent-review model identifiers actually differ;
“cross-vendor” may be reported only for the `cross-runtime` adapter when its
recorded providers differ.

The independent reviewer is read-only. The orchestrator judges its findings
and routes every accepted fix back to the Planner or Implementer that owns the
artifact, preserving follow-up commits, the two-round cap, and the audit log.
The cycle never invokes the standalone direct-fix `codex-judge` workflow.

Existing in-progress trackers remain resumable: a committed legacy
`codex-audit` entry is interpreted as an independent audit with
`classification = legacy-codex-review`. Historical commits and tracker keys are
not rewritten. New tracker transitions and receipts use the neutral names and
include the resolved execution-manifest digest.

## Repositories and Commit Order

| Repository | Current branch | Planned policy |
|---|---|---|
| `/Users/igormalyarov/Developer/Fora/iFora/iOS-app/ios.config` | `trunk` | explicit-path commits on `trunk`; preserve unrelated dirty paths; no push |

The existing `/Users/igormalyarov/.claude/commands/codex-judge.md` already
states the standalone ownership boundary and was read during grounding. It
does not need a task-owned edit unless implementation proves a contract gap.

Before every commit:

```bash
git status --short
git diff --cached --name-only
git diff --check
```

Expect: every staged path belongs to the current phase, unrelated existing
changes remain unstaged, and the phase diff has no whitespace errors.

## Delivery Map

| Phase | Outcome | Repository | Commit |
|---|---|---|---|
| 1 | Corrected CLI subprocess decision and invalid-evidence record | `ios.config` | `correct adversarial cycle cli portability contract` |
| 2 | Executable profiles, resolver, adapters, and lifecycle boundary | `ios.config` | `launch adversarial cycle through cli adapters` |
| 3 | Public-entry deterministic subprocess and permission tests | `ios.config` | `cover adversarial cycle cli execution contract` |
| 4 | Live Claude/Codex miniature cycles and superseding evidence | `ios.config` | `prove adversarial cycle cli portability` |
| 5 | Full gates, self-review, and scoped hygiene correction | `ios.config` | `close adversarial cycle cli portability gaps` |

## Phase 1 — Correct the Runtime Boundary

**Objective:** Correct the committed design before production edits without
altering the authoritative intake or historical acceptance claims.

**Work:**

1. Update this plan and the ADR to select CLI subprocess adapters for both
   runtimes. Remove native-spawn as a requirement and state the exact verified
   Claude and Codex command contracts, including model/effort and permission
   arguments.
2. Add the lifecycle boundary and its status/follow-up/cancel responsibilities
   to the design. Record risks: CLI version drift, output-schema drift, process
   cancellation limits, shell injection, workspace escape, and session
   persistence. Record controls: version/help grounding, argument-list
   execution, exact argv evidence, no shell, explicit sandbox/access modes,
   cold-launch omission of resume flags, and no fallback.
3. Mark the existing host-bridge/native-spawn acceptance index invalid and
   superseded. Preserve the intake and historical commits byte-for-byte.

### Phase 1 Gate

```bash
python3 - <<'PY'
from pathlib import Path

plan = Path('.claude/skills/adversarial-cycle/adr/codex-claude-runtime-portability-implementation-plan.md').read_text()
adr = Path('.claude/skills/adversarial-cycle/adr/codex-claude-runtime-portability.md').read_text()
required = [
    'CLI subprocess', 'gpt-5.6-luna', 'model_reasoning_effort',
    'runtime-lifecycle.py', 'no fallback', 'superseded',
]
missing = [value for value in required if value not in plan + adr]
if missing:
    raise SystemExit(f'missing: {missing}')
print('corrected contract: PASS')
PY
git diff --check
```

Expect: `corrected contract: PASS`, exit 0 for `git diff --check`, the intake
has no diff, and the staged set contains only the plan and ADR.

## Phase 2 — Implement CLI Adapters and Lifecycle

**Objective:** Make a resolved valid launch executable through the shipped
public entry point with exact caller-selected values and least privilege.

**Work:**

1. Add executable/access fields to both profiles. The only workspace-write role
   is Implementer; Planner, Reviewer, escalation, and independent review are
   read-only.
2. Extend the resolver manifest with those fields while preserving explicit
   literal and `luna-max` overrides, exact effort, and `unavailable_model_policy
   = "stop"` without a fallback field.
3. Replace callback-only launchers with argument-list subprocess adapters. Claude
   uses `--print --output-format json --model --effort` and maps access to
   `--permission-mode`; Codex uses `exec --json --model`,
   `-c model_reasoning_effort=...`, `--sandbox`, `--cd`, and
   `--output-last-message`. Parse Claude `session_id` and Codex
   `thread.started.thread_id`; preserve exact stdout/stderr and exit status in
   the per-launch evidence record.
4. Add `scripts/runtime-lifecycle.py` with executable `status`, `follow-up`, and
   `cancel` operations. Follow-up uses the verified Claude `--resume` or Codex
   `exec resume` contract and the same resolved model/effort/access. Cancel
   terminates an active recorded process and reports completed/unsupported
   states explicitly.
5. Keep cold launches fresh by omitting resume/continue arguments and do not
   inject a custom host bridge or callback in production.

### Phase 2 Gate

```bash
python3 -m unittest discover \
  -s .claude/skills/adversarial-cycle/scripts/tests \
  -p 'test_*.py'
python3 .claude/skills/adversarial-cycle/scripts/resolve-runtime-profile.py \
  --host codex --set implementer=luna-max
```

Expect: all current tests exit 0; the manifest contains
`gpt-5.6-luna`/`max` with `caller-preset`, access fields, and no fallback; a
direct launch with a valid manifest no longer returns “primitive is not
configured”; and the lifecycle script exists with all three operations.

## Phase 3 — Prove the Public Entry Contract

**Objective:** Exercise the same production entry point with deterministic
stub executables and remove callback injection as the acceptance seam.

**Work:**

1. Before production implementation, add a public-entry test that resolves a
   valid manifest and expects an accepted launch without injecting a callback.
   Run it against the old implementation, capture the real failure, and commit
   nothing at RED.
2. Add recording stub `claude` and `codex` executables in tests. Invoke
   `resolve-runtime-profile.py` followed by `launch-runtime-agent.py` as child
   processes, with the stub directory first on `PATH`.
3. Assert exact argv, stdin prompt, cwd, model, effort, permission/sandbox,
   cold-launch absence of resume flags, stdout/stderr, exit code, identifier
   extraction, canonical result fields, and one-attempt/no-fallback rejection.
4. Exercise read-only roles against a stub that attempts an edit and assert the
   configured read-only mode; exercise Implementer with only the requested
   workspace. Exercise lifecycle status, follow-up, and cancellation through
   the executable boundary.

### Phase 3 Gate

```bash
python3 -m unittest discover \
  -s .claude/skills/adversarial-cycle/scripts/tests \
  -p 'test_*.py'
git diff --check
```

Expect: the suite exits 0; no production test passes a callback to the public
launcher; stubs record exact runtime-specific CLI arguments; all result and
lifecycle assertions pass; and the diff has no whitespace errors.

## Phase 4 — Run Live Miniature Cycles and Replace Evidence

**Objective:** Prove both installed runtimes through the shipped entry point,
including Luna Max, and make every acceptance claim falsifiable.

**Work:**

1. Create a disposable fixture repository and deterministic brief whose sole
   implementation step produces one known text artifact.
2. Resolve and launch a Claude cycle through the public entry point. Capture
   command/evidence records, session identifier, manifest digest, tracker,
   review/audit records, follow-up/status proof, receipt, and clean final tree.
3. Recreate the same fixture and launch Codex with
   `--set implementer=luna-max`. Capture the actual argv proving
   `gpt-5.6-luna`, `model_reasoning_effort=max`, read-only/workspace controls,
   the returned thread identifier, lifecycle proof, and clean final tree.
4. Exercise the unavailable explicit model through stub executables and prove
   exact rejection, exit status, one attempt, and no profile-default launch.
5. Replace the acceptance index with a dated evidence index that begins with
   the invalid/superseded host-bridge verdict and records only PASS cells backed
   by committed command/evidence artifacts. Preserve zero-finding/zero-fix
   independent-review results when no findings are returned.

### Phase 4 Gate

Inspect the acceptance index and every referenced evidence artifact.

Expect: Claude and Codex both pass the public-entry launch; Luna Max appears in
the recorded Codex argv and returned thread evidence; all required result,
permission, cold-launch, no-fallback, lifecycle, tracker, receipt, and hygiene
claims have a command/output/exit-status artifact; and the superseded claims
are explicitly labeled rather than silently retained as PASS.

## Phase 5 — Final Gates and Self-Review

**Objective:** Verify the exact final tree, correct the historical Phase 1
trailing-blank-line warning in a scoped follow-up if it remains applicable, and
report all limitations.

**Checks:**

1. Run the full current Python suite, resolver smoke commands for both profiles,
   static runtime-neutral contract checks, direct production smokes for Claude,
   Codex, Luna Max, rejection, and lifecycle operations.
2. Run `git diff --check` for every task commit and inspect `git log --check`
   for the task-owned Phase 1 commits. If the Phase 1 trailing-blank-line
   warning remains, remove only that blank line in a separate scoped commit and
   rerun its gate.
3. Run the current `codex-judge` command directly in read-only mode against the
   final task diff, judge every finding against the actual plan/ADR/code, write
   the required audit log before any accepted fix, and verify accepted fixes.
4. Confirm the final status preserves all unrelated dirty paths and no push,
   reset, revert, amend, or branch switch occurred.

### Phase 5 Gate

Expect: every check exits 0; every acceptance criterion is PASS with a
referenced artifact; no fail/warning remains open; the final diff contains only
task-owned changes; and the report names any unavailable live operation instead
of claiming completion.

## Traceability

| Intake requirement or unknown | Corrected plan coverage |
|---|---|
| Preserve Planner, per-step Implementer, cold Reviewer, caps, tracker, evidence, and receipt | Phases 2, 4, and 5 |
| Move runtime-specific models and tools outside orchestration | Phases 1–3 |
| One runtime-neutral process with separate Claude/Codex executable configurations | Phases 1–3 |
| Explicit caller model/effort overrides and Luna Max selection | Phases 2–4 |
| Exact requested model/effort and no silent fallback | Phases 2–4 |
| Executable Claude and Codex adapters through the public entry point | Phases 2–4 |
| Least privilege, cold launches, identifier watch/follow-up lifecycle | Phases 2–4 |
| Keep independent-review meaning accurate | Phases 1, 2, and 4 |
| Preserve `codex-judge` standalone ownership | Phase 1 and final review |
| Preserve historical intake/acceptance history while superseding invalid evidence | Phases 1 and 4 |
| Keep application code and product behavior out of scope | Scope guard in every phase |

## Stop Conditions

Stop and preserve the last green commit when a runtime rejects a documented
default or Luna Max mapping; a CLI changes/omits requested model or effort; a
read-only role can edit; the implementer can escape its workspace; a cold
launch resumes prior context; an identifier cannot drive status/follow-up; a
rejection retries or falls back; exact failure output is lost; a lifecycle
operation remains prose-only; a legacy tracker requires rewriting; a live run
lacks tracker/audit/receipt/model provenance; or unrelated dirty paths would be
staged.

These are contract failures requiring plan/ADR revision. They are not grounds
for a silent fallback or a weaker proof.

## Authoring-Time Check Status

| Check surface | Current result |
|---|---|
| `ios.config` Git root and current `trunk` | available; dirty unrelated paths preserved |
| Python TOML-capable runtime | available: Python 3.14.6 |
| Claude version/help | available: Claude Code 2.1.220; `--model`, `--effort`, `--print`, JSON, permission, resume, and agents help read |
| Codex version/help | available: codex-cli 0.146.0; `exec`, JSON, model, config, sandbox, cd, output, resume, and lifecycle help read |
| Public production RED | required before Phase 2 production edits |
| Full live cycles | at risk until Phase 4; mandatory and cannot be replaced by schema tests |

## Plan Completion Criteria

Implementation is complete only when the corrected documentation, executable
profiles/adapters/lifecycle boundary, public-entry stub tests, live Claude and
Codex evidence, unavailable-model negative control, full gates, and adversarial
self-review are committed; every PASS has falsifiable evidence; no fail or
warning is open; and unrelated pre-existing changes remain outside the commits.
