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

## Grounding Snapshot

Grounded on 2026-08-03 against:

- `adversarial-cycle/SKILL.md`, `evidence-discipline.md`, `backlog/backlog.md`,
  and `backlog/dod.md`;
- `/Users/igormalyarov/.claude/commands/codex-judge.md` and its owning
  `claude-config` repository;
- installed `claude 2.1.220`, which accepts explicit `--model` and `--effort`;
- installed `codex-cli 0.146.0`, whose `exec` command accepts `--model`,
  configuration overrides, read-only sandboxing, and persisted last output;
- the native Codex subagent contract, where model and reasoning effort are
  supplied at spawn time;
- the current Codex default (`gpt-5.6-sol`, `high`) and the observed Luna Max
  pairing (`gpt-5.6-luna`, `max`);
- existing paired Claude Markdown and Codex TOML subagent definitions under
  `.claude/agents/` and `.codex/agents/`.

The paired static-agent pattern is precedent for runtime-specific syntax, but
is not the chosen shape here. A cycle creates fresh role agents per artifact and
must accept per-run overrides, so static duplicated Planner/Implementer/Reviewer
agents would duplicate orchestration and constrain selection.

## Chosen Design

### Ownership boundary

| Layer | Owns | Must not own |
|---|---|---|
| `SKILL.md` | lifecycle, role responsibilities, review rounds, tracker transitions, watch policy, terminal states, receipt contract, invocation of the neutral launcher boundary | vendor/model names, native launcher names/arguments, fallback selection, adapter result interpretation beyond the shared contract |
| `runtime/claude.toml` | Claude defaults for every role and independent review, plus the `claude` adapter identifier | orchestration decisions or native launch implementation |
| `runtime/codex.toml` | Codex defaults, the `codex` adapter identifier, and the `luna-max` preset | orchestration decisions or native launch implementation |
| `scripts/resolve-runtime-profile.py` | profile validation, host selection, preset expansion, override precedence, resolved JSON manifest | spawning agents or choosing fallbacks |
| `scripts/launch-runtime-agent.py` | executable neutral `launch(manifest, role, task, review_round_spent)` boundary, adapter selection from the manifest, shared launch-result validation | role sequencing, fallback, tracker transitions, review judgment, fix ownership |
| `scripts/launchers/claude.py` | map one resolved role to a Claude Task/subagent launch and normalize its native response | changing resolved model/effort, retrying with another model, orchestration decisions |
| `scripts/launchers/codex.py` | map one resolved role to native Codex subagent spawn and normalize its native response | changing resolved model/effort, retrying with another model, orchestration decisions |
| `independent-review.md` | read-only findings contract, independence classification, audit fields, and fix routing | direct application of accepted fixes |
| `codex-judge.md` | standalone human-invoked judge → fix → log workflow | acting as the cycle's review adapter |

Runtime profiles live inside the skill because they configure this procedure.
No persistent global Codex profile, new `.claude/agents/` entry, or new
`.codex/agents/` entry is introduced.

### Runtime profile contract

Both TOML files use schema version 1 and define these required entries:

- host runtime and launcher adapter;
- Planner, Implementer, cold Reviewer, escalation, and independent-review
  model plus effort;
- independent-review launcher and either `cross-runtime` or
  `same-runtime-fresh-pass`; concrete model identifiers are recorded
  separately so the audit can state whether the models actually differ;
- unavailable-model policy fixed to `stop`;
- zero or more atomic named presets.

The default mappings are:

| Host | Planner | Implementer | Reviewer | Escalation | Independent review |
|---|---|---|---|---|---|
| Claude | `opus` / `high` | `sonnet` / `medium` | `opus` / `high` | `opus` / `high` | direct read-only Codex, `gpt-5.6-sol` / `high`, `cross-runtime` |
| Codex | `gpt-5.6-sol` / `high` | `gpt-5.6-terra` / `medium` | `gpt-5.6-sol` / `high` | `gpt-5.6-sol` / `xhigh` | fresh Codex agent, `gpt-5.6-luna` / `max`, `same-runtime-fresh-pass` |

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
Claude or the reverse. Resolved values are passed to the runtime at each spawn,
not persisted as global defaults.

### Executable launcher boundary

`scripts/launch-runtime-agent.py` is the one executable seam shared by
orchestration. Its required input is the canonical resolved execution manifest
from `resolve-runtime-profile.py`, plus the role, artifact-specific task prompt,
and the orchestrator-supplied `review_round_spent` value. The manifest provides
the selected adapter, runtime, exact model/effort, and context mode. The launcher
validates that the role exists and dispatches to exactly one concrete adapter:

- `scripts/launchers/claude.py` calls the Claude Task/subagent primitive with
  the manifest's model and effort. `context_mode = "cold"` creates a fresh
  subagent whose prompt contains only the artifact-specific upstream contract
  and task inputs named by the cycle.
- `scripts/launchers/codex.py` calls native Codex subagent spawn with the
  manifest's model as `model`, effort as `reasoning_effort`, and
  `fork_turns = "none"` for `context_mode = "cold"`. It never substitutes a
  CLI `codex exec` process for native spawn.

The production host supplies its native launch primitive to its adapter. Tests
supply recording/fake primitives through the same adapter interface. Both
adapters return the same canonical launch-result object:

| Field | Contract |
|---|---|
| `role` | Exact requested role from the manifest |
| `runtime` | `claude` or `codex` from the manifest |
| `requested_model` | Exact resolved model passed to the native primitive |
| `requested_effort` | Exact resolved effort passed to the native primitive |
| `status` | Exactly `accepted` or `rejected` |
| `runtime_task_or_agent_id` | Native task/agent identifier when accepted; `null` when rejected |
| `adapter_error` | `null` when accepted; exact unmodified native adapter error when rejected |
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
| `/Users/igormalyarov/.claude` | `trunk` | explicit-path commit for `commands/codex-judge.md`; no push |

Execution starts only after the intake and this plan are committed in
`ios.config`; creating this plan does not itself authorize a commit or launch a
cycle.

Before every implementation commit:

```bash
git -C <repository> status --short
git -C <repository> diff --cached --name-only
```

Expect: every staged path belongs to the current phase; unrelated existing
changes remain unstaged. Stage 3 removes the cycle's dependency on
`codex-judge` before Stage 4 narrows that command's documented ownership, so
the cross-repository sequence has no broken intermediate state.

## Delivery Map

| Phase | Outcome | Repository | Commit |
|---|---|---|---|
| 1 | Runtime boundary and compatibility decision | `ios.config` | `define adversarial cycle runtime portability contract` |
| 2 | Executable profiles, resolver, and native launcher adapters | `ios.config` | `add adversarial cycle runtime profiles and launchers` |
| 3 | Runtime-neutral orchestration, tracking, and independent review | `ios.config` | `make adversarial cycle orchestration runtime neutral` |
| 4 | Standalone `codex-judge` ownership boundary | `~/.claude` | `separate codex judge from cycle review ownership` |
| 5 | Claude, Codex, Luna Max, and failure-policy acceptance evidence | `ios.config` | `verify adversarial cycle runtime portability` |

## Phase 1 — Record the Runtime Boundary

**Objective:** Commit the durable architecture decision before changing the
procedure.

**Work:**

1. Add `adr/codex-claude-runtime-portability.md` with status, context,
   decision, invariants, compatibility policy, consequences, and the intake as
   provenance.
2. Freeze the ownership table, profile schema, defaults, override precedence,
   Luna Max mapping, no-fallback behavior, independent-review vocabulary, and
   legacy tracker interpretation defined in this plan.
3. Freeze the neutral launcher input/result contracts, concrete adapter paths,
   cold-context mappings, and adapter non-ownership rules defined in this plan.
4. State that profiles are skill resources interpreted at run time and do not
   modify global Claude or Codex defaults.

### Phase 1 Gate

```bash
python3 - <<'PY'
from pathlib import Path

path = Path('.claude/skills/adversarial-cycle/adr/codex-claude-runtime-portability.md')
text = path.read_text()
required = [
    'status:', '## Decision', '## Invariants', '## Compatibility',
    'gpt-5.6-luna', 'unavailable', 'legacy-codex-review',
    'launch-runtime-agent.py', 'runtime_task_or_agent_id',
    'review_round_spent',
]
missing = [value for value in required if value not in text]
if missing:
    raise SystemExit(f'missing: {missing}')
print('ADR: PASS')
PY
```

Expect: `ADR: PASS` and the commit contains only the ADR.

## Phase 2 — Add Profiles, Resolution, and Native Launchers

**Objective:** Make runtime selection and caller overrides deterministic,
inspectable, launchable through one shared contract, and independently
testable.

**Work:**

1. Add `runtime/claude.toml` and `runtime/codex.toml` with the exact defaults
   above.
2. Add `scripts/resolve-runtime-profile.py`. It accepts the detected host and
   repeatable role overrides, validates the profile, expands presets, rejects
   conflicting preset fields, and prints a canonical JSON execution manifest.
3. Add `scripts/launch-runtime-agent.py`, `scripts/launchers/claude.py`, and
   `scripts/launchers/codex.py` with the input, mapping, cold-context, result,
   and rejection contracts above.
4. Add `scripts/tests/test_resolve_runtime_profile.py` with tests for both
   default profiles, required roles, literal override precedence, Luna Max
   expansion, conflicting effort rejection, host/profile mismatch rejection,
   missing required fields, and stop-without-fallback behavior.
5. Add `scripts/tests/test_runtime_launchers.py`. Inject recording Claude Task
   and Codex native-spawn primitives and assert their exact arguments. Inject
   accepted and rejected fake results and assert every shared result field,
   exact error preservation, task/agent identifier handling, and unchanged
   `review_round_spent` echo.
6. Include negative tests proving a Claude manifest cannot reach the Codex
   adapter, a Codex manifest cannot reach the Claude adapter, cold Codex roles
   use `fork_turns = "none"`, and neither rejection invokes a second primitive
   or changes the requested model/effort.
7. Capture the required failing tests before adding the resolver/launchers,
   then commit only after both test modules are green.

### Phase 2 Gate

```bash
python3 -m unittest discover \
  -s .claude/skills/adversarial-cycle/scripts/tests \
  -p 'test_*.py'
python3 .claude/skills/adversarial-cycle/scripts/resolve-runtime-profile.py \
  --host codex --set implementer=luna-max
```

Expect: the test command exits 0; the resolved JSON contains
`"model":"gpt-5.6-luna"`, `"reasoning_effort":"max"`, and
`"source":"caller-preset"` for Implementer; no fallback field exists. The
recording Claude primitive receives its configured `model` and `effort`; the
recording Codex primitive receives `model = "gpt-5.6-luna"`,
`reasoning_effort = "max"`, and `fork_turns = "none"`. Accepted fakes return
their native identifier; rejected fakes preserve their exact error, return no
identifier, echo the supplied review-round value, and record exactly one native
launch attempt.

## Phase 3 — Make the Cycle Runtime-Neutral

**Objective:** Preserve the full cycle while removing Claude/Codex choices from
shared orchestration and resolving review-fix ownership.

**Work:**

1. Add `independent-review.md` with the read-only findings contract, audit
   fields, independence classifications, finding judgment, owner-routed fixes,
   and the two-round rule.
2. Update `SKILL.md` to resolve one profile before the first spawn, pass the
   canonical execution manifest to `launch-runtime-agent.py` for every role,
   and record the manifest plus every canonical launch result in the tracker.
3. On `accepted`, continue using the returned native task/agent identifier for
   watch and follow-up operations. On `rejected`, record the exact adapter error
   and enter the existing `stopped` transition without another launch.
4. Replace hard-coded Opus/Sonnet/Codex wording with role/profile references;
   keep role count, cold-reviewer creation, watch behavior, tracker commits,
   evidence discipline, stop/done states, and receipts unchanged.
5. Extend tracker and receipt fields with profile path/digest and the resolved
   runtime/model/effort/launcher per artifact.
6. Add the legacy `codex-audit` resume rule. Do not rewrite prior trackers.
7. Keep `evidence-discipline.md` runtime-neutral; change it only if a concrete
   runtime-specific phrase is found during the phase diff.
8. Add a static contract test that fails when shared orchestration reintroduces
   the profile-owned model names, names `Task`/`spawn_agent` directly, or calls
   `codex-judge` as its gate.

### Phase 3 Gate

```bash
python3 -m unittest discover \
  -s .claude/skills/adversarial-cycle/scripts/tests \
  -p 'test_*.py'
rg -n '(Planner \(opus\)|Implementer \(sonnet\)|escalate to Opus|codex-judge flow|Claude Task|spawn_agent)' \
  .claude/skills/adversarial-cycle/SKILL.md
```

Expect: all tests exit 0; `rg` exits 1 with no matches; inspection of
`SKILL.md` still shows one Implementer per step, a fresh cold Reviewer, the
two-round cap, committed tracker transitions, watch/recovery, `done`/`stopped`,
and receipt requirements.

## Phase 4 — Clarify `codex-judge` Ownership

**Objective:** Preserve the useful standalone command while preventing it from
being mistaken for the cycle adapter.

**Work:**

1. Update `/Users/igormalyarov/.claude/commands/codex-judge.md` to state that
   its judge → direct-fix → log behavior is for standalone invocation.
2. Point cycle callers to the skill-owned read-only independent-review
   contract; do not duplicate the runtime profiles or cycle procedure in the
   global command.
3. Preserve the current read-only Codex acquisition, grounded judgment, direct
   fix, verification, and audit-log behavior for non-cycle use.

### Phase 4 Gate

```bash
git -C /Users/igormalyarov/.claude diff --check
rg -n 'standalone|adversarial-cycle|direct-fix|read-only' \
  /Users/igormalyarov/.claude/commands/codex-judge.md
```

Expect: `git diff --check` exits 0; all four boundary terms are present; the
commit contains only `commands/codex-judge.md`.

## Phase 5 — Prove Both Runtimes and Failure Semantics

**Objective:** Exercise the procedure, including Luna Max selection, instead of
accepting schema-only portability.

**Work:**

1. Create one disposable fixture repository and one committed miniature brief
   whose only implementation step adds a deterministic text artifact.
2. Run the cycle once from Claude with profile defaults. Capture the canonical
   manifest, Claude adapter input/result, native Task identifier, tracker,
   review records, independent audit, terminal receipt, and clean final trees.
3. Recreate the fixture from the same base and run once from Codex with
   `implementer=luna-max`. Capture the same manifest-shaped input and canonical
   result, native agent identifier, and cycle artifacts. Prove the Codex adapter
   launched the Implementer with `gpt-5.6-luna`, `max` reasoning, and cold
   context.
4. Exercise `model = "unavailable-runtime-portability-test-model"` through a
   rejecting fake primitive behind each adapter. Prove both adapters return the
   same rejected-result shape, preserve the exact adapter error and supplied
   review-round value, and never launch the profile default. Do not spend a real
   provider request on a deliberately invalid model name.
5. Confirm accepted independent-review findings, if any, were fixed by the
   owning Planner/Implementer in follow-up commits. A run with no accepted
   findings records zero routed fixes and still satisfies the check.
6. Add a dated `research/runtime-portability-acceptance.md` evidence index with
   host versions, fixture base SHA, terminal SHAs, resolved manifests, artifact
   paths, and per-cell verdicts. Do not copy run history into `SKILL.md`.

### Phase 5 Gate

Inspect the committed acceptance index and both terminal trackers.

Expect these exact verdict cells:

| Cell | Expect |
|---|---|
| Claude defaults | `PASS` with the Claude profile digest and configured role values |
| Shared launcher input | `PASS` when both live adapters consume the same canonical manifest schema and role envelope |
| Claude launcher mapping | `PASS` with requested model/effort, cold-context proof, and native Task identifier |
| Claude independent review | `PASS` classified `cross-runtime`, with providers and models recorded |
| Codex defaults | `PASS` with the Codex profile digest |
| Luna Max override | `PASS` with `gpt-5.6-luna` / `max` and caller-preset provenance |
| Codex launcher mapping | `PASS` with native spawn arguments, `fork_turns = "none"`, and native agent identifier |
| Codex independent review | `PASS` classified `same-runtime-fresh-pass`, with models recorded |
| Shared launch result | `PASS` when accepted/rejected Claude and Codex results contain every contract field |
| Unavailable explicit model | `PASS` only when both adapters preserve the exact rejection, terminal state is `stopped`, and no fallback launch exists |
| Fix ownership | `PASS` with owner follow-up commit(s), or an explicit zero-accepted-findings record |
| Legacy tracker fixture | `PASS` without rewriting the legacy tracker |
| Receipt compatibility | `PASS` with existing brief/app/run-doc SHAs plus execution-manifest digest |
| Worktree hygiene | `PASS` with clean fixture code and run-doc trees |

The phase is blocked if either host runtime cannot complete its live probe. A
schema test is not a substitute for the missing runtime verdict.

## Traceability

| Intake requirement or unknown | Plan coverage |
|---|---|
| Preserve Planner, per-step Implementer, cold Reviewer, caps, tracker, evidence, and receipt | Phases 1, 3, and 5 |
| Move runtime-specific models and tools outside orchestration | Phases 1–3 |
| Map one canonical execution manifest to concrete Claude and Codex native launch primitives | Phases 2, 3, and 5 |
| Normalize accepted/rejected native launches without moving orchestration into adapters | Phases 2, 3, and 5 |
| Default Claude and Codex configurations | Phase 2 |
| Select Luna Max in Codex | Phases 2 and 5 |
| Preserve caller override; do not silently replace unavailable model | Phases 1, 2, and 5 |
| Keep independent-review meaning accurate | Phases 3 and 5 |
| Resolve cycle owner routing versus `codex-judge` direct fixes | Phases 3 and 4 |
| Record runtime profile and concrete models in tracker | Phases 3 and 5 |
| Verify nested/runtime execution rather than command syntax alone | Phase 5 |
| Preserve current evidence discipline | Phases 3 and 5 |
| Keep application code and product behavior out of scope | Scope guard in every phase |

## Stop Conditions

Stop the implementation and preserve the last green commit when:

- a runtime rejects a documented default or `luna-max` mapping;
- host detection cannot distinguish Claude from Codex without caller guessing;
- either adapter accepts the other runtime's manifest, changes requested
  model/effort, omits a launch-result field, loses the exact native error,
  retries after rejection, or launches without the required cold context;
- `SKILL.md` must name a native Task/spawn primitive instead of using the
  neutral launcher boundary;
- a legacy tracker cannot resume without rewriting committed history;
- the independent-review adapter can edit the target before findings are
  judged;
- a cross-repository phase would require staging unrelated user work;
- a live acceptance run lacks a tracker, audit, receipt, or model provenance.

These are contract failures requiring plan/ADR revision. They are not grounds
for a silent fallback or a weaker proof.

## Authoring-Time Check Status

| Check surface | Current result |
|---|---|
| `ios.config` and `~/.claude` Git roots | available |
| Python TOML-capable runtime | available: Python 3.14.6 |
| Claude model/effort flags | available: Claude Code 2.1.220 |
| Codex model/config/read-only/output flags | available: codex-cli 0.146.0 |
| Future ADR/profile/resolver/launcher/static-test commands | executable shape grounded; expected to fail until their phase creates the named artifact |
| Full Claude and Codex miniature cycles | at risk until Phase 5; they are mandatory and cannot be replaced by static checks |

## Plan Completion Criteria

Implementation is complete only when all five phase commits exist in order,
every phase gate is PASS, both native adapters have deterministic contract
proof and live requested-model/effort evidence, the two runtime probes and the
unavailable-model negative control are committed in the acceptance index, no
fail or warning is open, and unrelated pre-existing changes in either
repository remain outside the phase commits.
