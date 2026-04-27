---
date: 2026-04-27
model: claude-opus-4-7
description: "Review of session-digest-v2-implementation.md against ADR-003, the V2 spec, and repo TDD/process conventions. Round 2: all prior findings resolved."
---

# Review: session-digest-v2-implementation.md

## Scope

Reviewed `session-digest/docs/plans/session-digest-v2-implementation.md` against:

- `session-digest/docs/specs/session-digest-v2.md`
- `session-digest/docs/adr/adr-003-session-digest-local-ledger-synthesis.md`
- Current source: `session-digest/src/inputs.ts`, `session-digest/src/config.ts`, `session-digest/src/cli.ts`
- Repo conventions: `~/.codex/AGENTS.md` and project `CLAUDE.md` (strict-TDD discipline, process gates, release/versioning, README components, log scope)

## Round 2 Verdict

All 14 findings from Round 1 are resolved. The plan is ready to execute.

## Round 1 Findings — Resolution Status

### F1 — RED test for 25 MB input cap

- **Round 1:** fail. RED asserted only "non-zero exit" on `25 MB + 1` bytes — passes against current `> 1 MB` rejection.
- **Round 2:** resolved. Plan line 116 now asserts the oversize error mentions `25 MB`, which fails today because `inputs.ts:31` reports `1 MB`.

### F2 — RED for incomplete provider pair skip

- **Round 1:** fail. The `??`-chained selection in `config.ts:62` already skips incomplete pairs; RED would not fail. Real spec delta is whitespace trimming.
- **Round 2:** resolved. Plan line 156 now uses whitespace-only `NOMOS_API_KEY` / `NOMOS_MODEL` and asserts OpenRouter is selected; this fails today because `configFromPair` does not trim.

### F3 — Strict-TDD violation: RED for not-yet-existing modules

- **Round 1:** warning. Multiple "Expected: FAIL because module does not exist" steps; compilation errors are not RED.
- **Round 2:** resolved. Execution Lock line 29 now states the rule globally, and Tasks 3, 4, 5, 6, 9 each include a "Step 1: Create compile-only … skeleton" sub-step before the RED.

### F4 — RED/GREEN steps lump two TDD phases

- **Round 1:** warning. Folded steps lose the "run the failing test" anchor.
- **Round 2:** resolved. Execution Lock line 30 explicitly defines `RED/GREEN` as shorthand for two required sub-steps (RED captured first, then GREEN).

### F5 — Task 1 Step 4 mislabeled "RED/GREEN"

- **Round 1:** warning. The `--` rejection already exists in `cli.ts:34`; no RED is possible.
- **Round 2:** resolved. Step relabeled "Add regression test for `--` rejection" with "Expected: PASS without production changes."

### F6 — Missing session-digest package version bump

- **Round 1:** warning. V2 architecture replacement needs a major bump for the release pipeline to tag it.
- **Round 2:** resolved. Task 13 Step 4 bumps `session-digest/package.json` from `0.0.1` to `2.0.0` and aligns `package-lock.json` via `npm install --package-lock-only -w session-digest`.

### F7 — README Components table / repo-level log not addressed

- **Round 1:** warning. The component description shifts from Deep Agents to local ledger + bounded synthesis; project `CLAUDE.md` requires both updates.
- **Round 2:** resolved. Task 13 Step 5 covers the root `README.md` Components row update and the repo-level `docs/log.md` entry.

### F8 — `compressor_version` constants introduced twice

- **Round 1:** warning. Constants exposed twice across two RED cycles.
- **Round 2:** resolved. Task 4 Step 3 ("GREEN for ledger metadata using constants") exposes the constants on first use. Step 9 now scopes only to documenting version-bump rules, not constant introduction.

### F9 — Refactor bundled into Task 9

- **Round 1:** warning. Moving `defaultChatModel` belonged outside the synthesis Red/Green sequence; destination was ambiguous ("model.ts or synthesis.ts").
- **Round 2:** resolved. New Task 10 "Extract chat-model factory" pins the destination to `session-digest/src/model.ts` with its own RED/GREEN/gate/commit (`session-digest: extract chat model factory`).

### F10 — Six H2 sections in order not asserted

- **Round 1:** warning. Spec test #35 (six `##` sections in fixed order) had no explicit assertion.
- **Round 2:** resolved. Task 12 Step 5 ("RED/GREEN for final digest section order") asserts the six headings in documented order.

### F11 — Sub-anchor format `record:<n>/<segment>` not exercised

- **Round 1:** warning (low). Spec line 227 allows slash sub-segments; no test covered them.
- **Round 2:** resolved. Task 4 Step 6 asserts at least one content-block-derived event uses `record:<n>/block:<m>` while preserving the `record:<n>` prefix.

### F12 — `ParsedRecord.type: string` too strict

- **Round 1:** warning (low). Forced parser to invent or reject for type-less records, conflicting with the "MUST NOT fail on unknown type" rule.
- **Round 2:** resolved. Task 3 Step 3 now declares `type?: string`, and Step 6 clarifies that type-less parsed JSON is not a recognized Claude Code record and must not produce ledger events.

### F13 — Test isolation: real `~/.session-digests/`

- **Round 1:** warning (low). Plan didn't pin `deps.baseDir` to a temp directory.
- **Round 2:** resolved. Execution Lock line 31 makes a temp `deps.baseDir` an invariant, and Task 12 Step 1 reinforces it ("must pass a temporary `deps.baseDir` and remove it with `t.after`").

### F14 — Manifest regeneration silent in closeout

- **Round 1:** warning (low). Release-units regeneration not addressed.
- **Round 2:** resolved. Task 13 Step 6 conditions manifest regeneration on whether `session-digest` is listed in `release-units.config.toml`; today it is not, so the step instructs no edit but pins the rule for future inclusion.

## Pass Items Worth Keeping

- Execution Lock now codifies repo TDD discipline (no compile-error RED, RED/GREEN shorthand rule, baseDir isolation invariant).
- Each new module gets an explicit compile-only skeleton step before the first RED.
- Keep/Adapt/Replace/Retire taxonomy in "Existing Code Decision" remains concrete and actionable.
- File Map distinguishes Create/Modify/Delete.
- Per-task gate commands use `run_silent.sh` per project `CLAUDE.md`.
- Task 10 isolates the chat-model factory extraction with its own commit.
- Task 13 covers version, README, repo log, and release-units check before the manual acceptance run.
- Manual acceptance step (Task 13 Step 8) matches spec done criteria.
- Plan honors "no push" repeatedly.

## Optional Polish (non-blocking)

- Task 10 Step 1 ("RED for model factory import") may benefit from an explicit "create `model.ts` skeleton with re-exported stubs" sub-step before the RED, mirroring Tasks 3/4/5/6/9. The global rule in the Execution Lock already covers this, but pinning it inside Task 10 would make the extraction symmetric with the other module introductions.

No further blocking findings.
