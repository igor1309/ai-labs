# Regentara Log

## 2026-04-28

- Verified current Claude Code and Codex CLI structured-output behavior from the repo root and recorded the adapter contracts in the learning plan.
- Aligned the `agent-develop-review-loop` learning plan with current Regentara architecture: catalog runner adapters, caller-selected workspace, structured output capture, watch/progress scope, and bootstrap-backed demo settings.
- Captured `agent-develop-review-loop` as prior art for Regentara, including cumulative diff review, sentinel-based loop control, local artifacts, watcher ergonomics, and non-committing workflow boundaries.
- adr-007 closure follow-up: marked all 37 checklist items complete in archived `adr-007-cli-settings-convention-closure.md` so the implemented artifact no longer contradicts its location.

## 2026-04-27

- adr-007 review follow-up: `validateAgent` now requires `agent.model` to be a non-empty string after `trim()`; arrays/objects/whitespace are rejected with `agents.yaml agent <id> field model must be a non-empty string`. Stored value is trimmed.
- adr-007 review follow-up: orchestrator skips default `bootstrapMissingSettings` when injected resolvers are present (and exposes `bootstrapMissingSettings` as an injectable seam) so test harnesses don't write example files under the supplied home directory.
- adr-007 review follow-up: CLI availability now validates only runners referenced by `agentSettings.agents`; unused experimental routes with unavailable runners no longer fail startup. `validateProviderCliAvailability` signature changed to `(runners, options)`.
- adr-007 review follow-up: `writeSettingsExample` now swallows only `EEXIST`; other write failures throw `StartupValidationFailure` whose message names the example path.
- adr-007 review follow-up: tightened `models.yaml` route field validation to reject empty or whitespace-only `provider`/`runner`/`model` (trim-then-non-empty); validated values are stored trimmed.
- adr-007 review follow-up: orchestrator now calls `bootstrapMissingSettings` before resolution so a true first run writes both `agents.yaml.example` and `models.yaml.example`; missing-settings errors now point to the generated example path; `models.yaml` route validation now rejects non-string `provider`/`runner`/`model`. Templates moved into `example-bootstrap.js` as the single source.
- adr-007 closure follow-up: extracted shared `writeSettingsExample` into `regentara/src/settings/example-bootstrap.js` (deduped agent/model bootstrap), dropped the redundant readFile probe in favor of `writeFile({flag:"wx"})`, and made bootstrap I/O failures swallow the error so `StartupValidationFailure` always surfaces; added a consolidated startup-validation message-naming test.
- adr-007 closure task 8: archived `mvp-workflow-runner.md` and `adr-007-cli-settings-convention-closure.md` under their respective `implemented/` directories; full gates green. All adr-007 violations closed.
- adr-007 closure task 7: tightened the "unsupported output schema reference" failure to name `agents.yaml` and the offending `schemaRef` in its message; audit confirmed every other `StartupValidationFailure` site already names the offending file or rule.
- adr-007 closure task 6: confirmed per-file partial-bootstrap independence at the orchestrator level — only the missing file's example is written when one of `agents.yaml`/`models.yaml` is present; no implementation change required, behavior emerges from tasks 4 and 5.
- adr-007 closure task 5: `resolveModelRouting` now writes `~/.regentara/models.yaml.example` (idempotent, skip if exists) before failing when no `models.yaml` is found at either location; bootstrap never creates an actual `models.yaml`.
- adr-007 closure task 4: `resolveAgentSettings` now writes `~/.regentara/agents.yaml.example` (idempotent, skip if exists) before failing when no `agents.yaml` is found at either location; bootstrap never creates an actual `agents.yaml`.
- adr-007 closure task 3: orchestrator now fails startup with `StartupValidationFailure` when `agents.yaml` references a route key not defined in `models.yaml`; error message names the offending agent and route key.
- adr-007 closure task 2: removed `SUPPORTED_PROMPT_REFS` closed whitelist from `agent-settings.js`; arbitrary prompt-ref strings now accepted; `SUPPORTED_SCHEMA_REFS` (structural) preserved.
- adr-007 closure task 1: removed closed `REQUIRED_ROUTE_KEYS`, `SUPPORTED_COMBINATIONS`, and provider/runner closed lists from `model-routing.js`; user-defined route keys and arbitrary provider/runner strings now accepted; structural field validation preserved.
- Drafted adr-007 closure plan at `regentara/docs/plans/adr-007-cli-settings-convention-closure.md` — 8 tasks: relax model-routing whitelists, relax agent-settings prompt-ref whitelist, cross-file route-key resolution, agents.yaml.example bootstrap, models.yaml.example bootstrap, partial-bootstrap, named error surface, closeout. Auto-continue mode, no push until closeout.
- Updated MVP workflow runner spec to reflect adr-007: ModelRouting reframed as catalog (no closed route-key/provider/runner whitelists); added cross-file route-key resolution rule; added first-run bootstrap rules (`*.example` writes to `~/.regentara/`, idempotent, no actual settings file creation); replaced closed-whitelist tests (prompt ref, route key inventory, provider, runner, provider/runner combination) with bootstrap and cross-ref tests; tests renumbered to 59.
- Adopted the repo-level CLI settings convention via adr-007: supersedes-in-part adr-001 (install behavior, closed prompt-ref whitelist) and adr-002 (closed route-key/provider/runner/combination whitelists, MVP coverage requirement). Classified agent identifiers and output-schema refs as structural; route keys, providers, runners, combinations, and prompt refs as catalog. Pinned first-run bootstrap shape (`agents.yaml.example`/`models.yaml.example` to `~/.regentara/`, runtime-not-installer, idempotent, exits non-zero with `StartupValidationFailure`). Spec/source/test edits and the closure plan are deliberately out of scope for this ADR.
- Implemented the Regentara MVP workflow runner as a release unit, covering settings/model validation, provider CLI orchestration, run/artifact storage, fail-fast failure handling, and review/remediation routing.
- Finalized the implementation plan from the accepted Regentara specs and ADRs.

## 2026-04-25

- ADR TODO: dropped Process Control item; TODO file removed (now empty). MVP behavior already committed by adr-005 (no timeouts; interruption stops the run); the deferral chain in adr-003 and adr-005 explicitly names a future process-control ADR and stands as the marker. Write the targeted ADR (or split into focused ADRs) when implementation surfaces a concrete pain point — hung subprocess, Ctrl+C UX, or orphaned descendants.
- ADR TODO: dropped Observability item. Observability emission inherits adr-005's fail-fast invariant (no carve-out): a failure to emit stops the run. For MVP shape (in-process, in-run-directory writes), the realistic failure modes overlap with artifact-write failures already covered. Best-effort semantics would be the right ADR trigger only when observability later crosses a network boundary (external collector, remote sink) — not now.
- ADR TODO: dropped Session & Trace Model item. Capture is already declared in adr-003 (runner and provider session references); persistence location in adr-004 (run directory, deferred metadata schema). Link/schema shape is an implementation finding against Codex/Claude Code; revisit only if implementation surfaces a non-trivial cross-reference decision.
- ADR TODO: dropped Review Contract item. Verdict schema and required evidence are agent I/O (spec); reviewer's flow authority and handoff to remediator already settled by adr-006 (orchestrator delegates routing to ReviewFixPolicy). Schema-reuse note (existing review skill) belongs in spec or `agents.yaml`.
- ADR TODO: dropped Settings Topology item. Discovery/precedence already consistent across adr-001 and adr-002; no shared "settings file" abstraction exists; secrets exclusion is permanent (Regentara does not manage credentials per adr-002), not a deferral. No new ADR needed; nothing to tighten in adr-002 (illustrative shape, not exhaustive lockdown).
- ReviewFixPolicy seam ADR (adr-006): accepted. Locks in that the Orchestrator delegates post-review routing to an injected protocol and does not adjudicate; threads an opaque session across rounds. Internals (decision values, session schema, budget mechanics) stay in spec. Orchestration doc tightened: "owns the workspace" → "runs within a selected workspace" with workspace lifecycle explicitly out of Orchestrator scope.
- Failure policy ADR (adr-005): tightened front-matter (description), defined "workflow execution has started", fixed artifact ADR cross-reference, specified pre-run interruption; renamed to `adr-005-failure-policy.md` to match numbered convention (collision with adr-004 run-artifacts resolved by renumbering failure-policy).
- ADR set complete for MVP scope: agent settings (adr-001), model routing (adr-002), CLI execution boundary (adr-003), run artifact storage and mutation policy (adr-004), failure policy (adr-005). All accepted after review.
- Reviewed and tightened all ADRs: added executive summaries, rules/invariants sections, aligned runner identifiers across ADRs, resolved cross-ADR deferral chains.
- Established ADR naming convention: `adr-NNN-<slug>.md` for numbered decisions, `regentara-adr-<slug>.md` for unnumbered.

## 2026-04-24

- Model routing ADR (adr-002): simplified route keys to `sonnet`/`opus`/`gpt`/`codex`, added MVP coverage requirement, tightened validation rules.
- Failure policy ADR: drafted and accepted — fail-fast, no retries, artifact preservation, startup vs runtime failure distinction.
- Agent settings ADR (adr-001): reviewed, added executive summary, tightened validation to match adr-002 pattern.

## 2026-04-23

- Project created — AI orchestrator (governance/routing layer over provider agents). Initial docs: naming brief, name pool, orchestration design, observability research prompt.
