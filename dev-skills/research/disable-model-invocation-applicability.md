---
date: 2026-06-21
model: claude-opus-4-8
description: "Why `disable-model-invocation` yields little token win for the dev-skills collection — router-based auto-invocation architecture limits the safe disable-set to ~5 utility/orchestrator skills"
---

# `disable-model-invocation` Applicability to dev-skills

## Source

Matt Pocock, *"v1: 63% Token Reduction, /ask-matt, /writing-great-skills"* — skills changelog v1 announcement, aihero.dev (Jun 18, 2026): <https://www.aihero.dev/skills/skills-changelog-v1-announcement>

Cross-checked against the official frontmatter reference: <https://code.claude.com/docs/en/skills> and the open subagent bug <https://github.com/anthropics/claude-code/issues/43809>.

## What the feature is

`disable-model-invocation: true` is a SKILL.md frontmatter boolean. When set, the skill's **description is no longer included in the context the model reviews to choose a skill** — so the model can no longer auto-invoke it. The skill stays user-invocable as a `/slash` command.

Matt's framing is a **token-cost** argument, not a side-effects one:

> When you set this flag on a skill, its description no longer gets included in the context window that the model reviews when deciding which skill to invoke. This simple change achieves a 63% reduction in token cost for skill descriptions.

He pairs it with a taxonomy:

- **User-invoked** — orchestrate workflows; only run when you type them → `disable-model-invocation: true`.
- **Model-invoked** — focused tasks the model reaches for automatically → left enabled. In his engineering set only ~5 stay model-invoked (`/diagnosing-bugs`, `/tdd`, `/domain-modeling`, `/codebase-design`, `/grilling`).

And an extraction pattern: pull a shared loop into a *model-invoked* skill (`/grilling`) that other (disabled) user-invoked skills reference, so shared logic stays reachable without bloating descriptions.

## Why it largely does not apply to this collection

Matt's split works because his architecture is **"the user types the orchestrator."** This repo's architecture is the opposite — **"the model auto-invokes the right skill"** — driven by two mechanisms:

1. `using-dev-skills` acts as a router (the local equivalent of `/ask-matt`) that the model consults at session start to pick and invoke a skill.
2. The project `CLAUDE.md` issues *"Use the X skill"* directives for ~a dozen skills (strict-tdd, process-gates, implementation-plan, spec-writing, release-process, composition-root, protocol-owned-by-client, docker-discipline, adr-governance, arch-doc-review, pr-ci-watch, …) — i.e. the model is *instructed* to auto-reach them.

This creates three hard constraints on adopting the flag here:

1. **A disabled skill is not in the model's Skill list, so the model cannot invoke it.** Any `CLAUDE.md` "Use the X skill" directive or router instruction *breaks* for a disabled skill — the same failure shape as the subagent bug.
2. **Subagent bug [#43809](https://github.com/anthropics/claude-code/issues/43809):** disabled skills can't be invoked by subagents even when the parent references them. Skills run inside Agent/Workflow fan-outs (`test-runner`, the review skills) must stay enabled.
3. **Token win scales with description length.** Most discipline skills here already have terse one-line descriptions, so disabling them saves almost nothing. The payoff is concentrated in a handful of long, keyword-stuffed descriptions.

**Conclusion: the safe disable-set is ~5 skills, and changing only those is not worth a coordinated refactor.** The feature fights this collection's router design rather than helping it. The token-reduction headline (63%) assumes Matt's "user types orchestrators" model and does not transfer.

## Classification (snapshot, 2026-06-21)

### Already disabled (correct)
- `postmortem` — session-wrap you type.
- `check-domain` — utility; avoids accidental external lookups.

### KEEP — model-invoked by design
Auto-invoked via `CLAUDE.md`, the `using-dev-skills` ladder, or by subagents; disabling breaks routing or hits #43809:

`using-dev-skills`, `cold-start-checkpoint`, `strict-tdd`, `tdd-interactive`, `process-gates`, `implementation-plan`, `spec-writing`, `adr-governance`, `composition-root`, `protocol-owned-by-client`, `docker-discipline`, `release-process`, `pr-ci-watch`, `bug-analysis`, `test-runner`, `arch-doc-review`, `arch-reviewer`, `arch-spec-review`, `component-arch-review`, `rest-contract-review`, `doc-drift-audit`, `tdd-scaffold-review`, `executable-spec-scaffolding`, `feature-spec-protocol`, `state-machine-spec-dod`, `state-machine-impl-dod`, `tactical-action-plan-guide`, `ios-simulator-install`, `simulator-settings`, `debug-print`, `testing-schedulers`, `swift-package-manifest`, `discuss`, `intake`.

### DISABLE candidates — user-typed, no auto-invoke path, longest descriptions
| Skill | Rationale | Caveat |
|---|---|---|
| `job-search-strategy` | Off-domain toolkit; very long keyword-heavy desc taxing every dev session's routing context for ~zero relevance. Highest token win. | none |
| `best-free-openrouter-llm` | Utility you type; external fetch; long desc. | none |
| `traceability-review` | Desc says "when the user *explicitly* asks"; has `/traceability-review` command. Internal passes can still run as subagents. | Don't wrap the *parent* skill in a fan-out if disabled. |
| `skill-review` | Launched deliberately; long keyword-stuffed desc is pure routing cost. | Keep enabled if ever run inside an audit *workflow over many skills* (#43809). |
| `handoff` | You type "write a handoff"/"resume"; writes a file. | "resume" stops being model-triggerable when disabled. |

### Borderline — depends on actual invocation habit
- `jtbd` — keyword-triggered ("JTBD", "job story") suggests model auto-detect (KEEP); but if only ever typed `/jtbd`, the long desc is disable-worthy.
- `synopsis` — small-ish desc, model-reachable for READMEs; marginal either way; lean KEEP.
- `debug-print` — action skill, usually typed, but small desc and Swift-flow-reachable; lean KEEP.

## Decision

Do **not** adopt `disable-model-invocation` broadly. If any change is made later, limit it to the 5 candidates above, weighing each against the #43809 subagent constraint. Revisit if the router architecture is replaced by a user-types-orchestrators model, or if #43809 is fixed and a measured description-token budget justifies the change.
