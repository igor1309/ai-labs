---
date: 2026-04-28
model: gpt-5
description: "TODO plan for learning from agent-develop-review-loop and applying selected ergonomics to Regentara"
---

# Learn From Develop Review Loop TODO

## Source

- Prior art: `https://github.com/geserdugarov/agent-develop-review-loop`
- Compared commit: `74cd387a0cd20c408e9baac635288224ef626d08`
- Regentara baseline: current `regentara` MVP workflow runner and ADR/spec set.

## Execution Mode

Execution mode: auto-continue
Human review between tasks: no
Worktree mode: create new
Expected worktree: `worktrees/regentara-develop-review-loop-learnings`
Expected branch: `codex/regentara-develop-review-loop-learnings`
Push policy: no push
Final archive behavior: move this plan to `regentara/docs/plans/implemented/` after every TODO is implemented, verified, logged, and committed.
Preflight check: [ ] done

## Comparison

`agent-develop-review-loop` is an operationally useful prototype of one exact implement-review-fix loop. It assumes the target project is the current working directory, verifies that the task file, `claude`, `codex`, and a git worktree are available, records `START_REF="$(git rev-parse HEAD)"`, and then repeats a concrete sequence: Claude edits the working tree, Codex reviews `git diff "$START_REF"`, and Claude receives the previous Codex review as the next fix prompt. The review surface is deliberately cumulative, so each review evaluates the whole delta from loop start instead of only the latest fix.

Its control contract is plain text and sentinel-based. Codex must end each review with exactly one final-line token, `REVIEW_PASSED` or `REVIEW_FAILED`; the script checks only the last few lines with an anchored grep and treats anything other than a final passing sentinel as failure. Runtime artifacts are simple local files under `.develop-review-loop/`: Claude logs, Codex review files, and a final `summary.md` with task path, iteration count, verdict, start ref, duration, and final review file. The companion watcher follows the newest artifact, making the loop easy to observe without understanding any internal state model.

The prototype also has intentionally weak boundaries. Claude is prompted not to commit, but the script does not mechanically prevent commits or verify that no commit happened. It relies on uncommitted working-tree diffs as the handoff surface, keeps policy as a hard-coded pass/fail sentinel loop with a maximum iteration cap, and has no typed agent contracts, provider routing, JSON schema validation, persistent run identity, artifact immutability model, or separable review policy.

Regentara is the inverse tradeoff. It is a governed orchestration package that validates `agents.yaml` and `models.yaml`, invokes configured provider CLIs, validates runtime JSON against configured schemas, persists runs under `~/.regentara/runs/`, preserves artifact invariants, and delegates every post-review routing decision to an injected `ReviewFixPolicy`. Its core loop is provider-agnostic and policy-driven: Producer creates work evidence, Reviewer returns a structured verdict, policy decides `complete-ok`, `complete-fail`, or `remediate`, and Remediator produces the next valid task.

The lesson is not to copy the Bash script wholesale. Regentara should preserve its stronger contracts and explicit boundaries, but borrow the prototype's product ergonomics where they expose real workflow value: schema-bound provider result adapters for built-in runners, a simple way to watch current progress, and a runnable local demo path.

## TODO

Implement in this order: provider structured result adapters first, watch/progress ergonomics second, batteries-included local demo third. The demo should reuse the provider result adapters and watcher rather than defining parallel behavior.

### 1. Add Provider Structured Result Adapters

- [x] Verify the installed native structured-output surfaces for the built-in runner adapters Regentara ships first and document the concrete flags Regentara will use: Claude Code `--output-format json` / `--json-schema`, and Codex `exec --output-schema <FILE>` plus `--output-last-message <FILE>` when needed.
- [ ] Implement the Claude Code adapter around the verified behavior of Claude Code 2.1.112: `claude -p --output-format json --json-schema <schema-json> <prompt>` exits 0 on a valid response and writes a JSON result wrapper to stdout; the semantic payload is `structured_output`, and `session_id` is available in the same wrapper.
- [ ] Do not use `claude -p --tools "" <prompt>` in adapter invocation as tested; that form was treated as missing a prompt in this CLI version. Revisit tool-disabling separately only with a verified invocation form.
- [ ] Implement the Codex adapter around the verified behavior of Codex CLI 0.125.0: `codex exec --output-schema <schema-file> --output-last-message <output-file> <prompt>` exits 0 on a valid response, writes clean schema-matching JSON to stdout, and writes the same clean semantic JSON to the output file.
- [ ] Treat Codex `--json` stdout as diagnostic/event stream, not semantic output; when `--json` is used, `--output-last-message` still provides the clean schema-matching semantic output file.
- [ ] Capture Codex stderr as diagnostics because it includes warnings, session/header information, and plugin/analytics noise even when the semantic output succeeds.
- [ ] Define runner adapter selection under ADR-007 catalog semantics: route `runner` values remain catalog strings, so settings validation must not hard-code a closed runner whitelist.
- [ ] If a selected catalog runner has no provider structured result adapter, fail clearly with a named error such as `no provider structured result adapter for runner: <runner>`.
- [ ] Define that each agent's semantic result must be JSON produced through the runner's native structured-output mode and matching its configured schema; non-JSON prose is an agent/runtime failure, not an input to be repaired.
- [ ] Generate or materialize the configured per-agent JSON Schema for the provider CLI invocation.
- [ ] Build role-specific prompts that include the task context and explicitly require the final semantic result to satisfy the schema.
- [ ] Lock the workspace rule: for this plan, Regentara is invoked from the target workspace, and provider CLIs run in that same invocation cwd.
- [ ] Do not treat `runDirectory` as the agent workspace. Use it only for Regentara-owned run artifacts, provider result files if needed, and diagnostic/session references.
- [ ] Extend `ProviderCliInput` or introduce a runner-adapter input with `agentId`, `provider`, `runner`, `model`, `prompt`, `outputSchema`, and `executionInput`; use the Orchestrator's already-selected invocation cwd for process execution, and include run-scoped artifact/reference paths only for Regentara-owned capture and diagnostics.
- [ ] Invoke provider CLIs through runner-specific adapters that declare the exact semantic result channel separately from diagnostic stdout, stderr, event streams, and session references.
- [ ] Treat missing semantic result, malformed JSON, schema-invalid JSON, or provider CLI schema-enforcement failure as runtime failures under the existing fail-fast ADR.
- [ ] Preserve stdout, stderr, provider event stream references, and session paths only as diagnostics unless the runner adapter explicitly declares stdout as the native semantic result channel; the Orchestrator must pass only validated semantic JSON to the next agent.
- [ ] Remove semantic fallback from raw stdout once provider structured result adapters exist; stdout, stderr, and event streams may be diagnostics only.
- [ ] Reject heuristic extraction from LLM prose, including first-JSON-block scraping, markdown fenced JSON scraping, and marker-delimited JSON emitted as normal assistant text.
- [ ] Cover Claude-style structured output, Codex-style structured output, missing output file, malformed JSON, schema-invalid JSON, and diagnostic-only stdout in tests.
- [ ] Cover ADR-007 catalog behavior in tests: arbitrary runner strings remain valid settings, but execution fails clearly when no provider structured result adapter exists.

### 2. Add Watch and Progress Ergonomics

- [ ] Define the minimal run progress surface Regentara should expose without weakening artifact immutability.
- [ ] Add an append-only operational event log, likely `events.jsonl`, under each run directory.
- [ ] Emit events for agent start, agent end, policy decision, runtime failure, and completion.
- [ ] Keep authored artifacts immutable; progress state belongs in operational events, not artifact rewrites.
- [ ] Start with a documented shell recipe for following the latest run event log.
- [ ] Treat `regentara watch [--run latest|<run-id>]` as a follow-up unless this task explicitly adds subcommand parsing to the CLI.
- [ ] Include run ID, current agent, current decision state, and final status in the watched surface.
- [ ] Verify the watch path against a fake or sample run directory.
- [ ] Add a short ADR/spec note before implementation if event logging materially defines the deferred progress-recording mechanism from the artifact ADR.

### 3. Add a Batteries-Included Local Demo

- [ ] Create `regentara/examples/local-demo/`.
- [ ] Use the same `agents.yaml` and `models.yaml` content as the runtime bootstrap examples in `src/settings/example-bootstrap.js`; the local demo must not define a divergent settings template.
- [ ] Add a demo runner, such as `run-demo.js`, that imports Regentara composition and injects a demo `ReviewFixPolicy`.
- [ ] Define the demo policy as acceptable review -> `complete-ok`, rejected review with remaining budget -> `remediate`, and exhausted budget -> `complete-fail`.
- [ ] Keep the demo policy outside production composition so Regentara still requires explicit policy injection for real use.
- [ ] Make the demo testable without real provider credentials by injecting fake provider execution and fake CLI availability.
- [ ] Verify the demo path with a local smoke command and document the exact command in the demo README.
- [ ] Verify demo/bootstrap alignment so first-run examples and local-demo settings do not diverge silently.

## Verification

Docs-only changes to this plan require:

- [ ] Markdown front matter is present.
- [ ] Exactly one `#` title is present.
- [ ] Execution mode, human review behavior, worktree mode, expected worktree, expected branch, push policy, final archive behavior, and preflight status are declared.
- [ ] Regentara log is updated when this plan is created or materially changed.
- [ ] Git diff is limited to the plan, relevant log entries, and any later files required by checked TODOs.
