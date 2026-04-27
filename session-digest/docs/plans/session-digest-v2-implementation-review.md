---
date: 2026-04-27
model: claude-opus-4-7
description: "Review of session-digest-v2-implementation.md against ADR-003, the V2 spec, and repo TDD/process conventions."
---

# Review: session-digest-v2-implementation.md

## Scope

Reviewed `session-digest/docs/plans/session-digest-v2-implementation.md` against:

- `session-digest/docs/specs/session-digest-v2.md`
- `session-digest/docs/adr/adr-003-session-digest-local-ledger-synthesis.md`
- Current source: `session-digest/src/inputs.ts`, `session-digest/src/config.ts`, `session-digest/src/cli.ts`
- Repo conventions: `~/.codex/AGENTS.md` and project `CLAUDE.md` (strict-TDD discipline, process gates, release/versioning, README components, log scope)

## Overall Verdict

Solid structure (chunks + tasks + gates + commits), but several RED tests are designed in a way that won't actually fail against the current code, the plan blurs strict-TDD boundaries CLAUDE.md calls out, and a few cross-repo housekeeping items are missing.

## Findings

### F1 — RED test for 25 MB cap doesn't catch the bug it claims to catch

- **Verdict:** fail
- **Location:** plan lines 111–118 (Task 1 Step 2)
- **Why:** Step says "writes `25 MB + 1` bytes and asserts non-zero exit before parsing/model work." Current `inputs.ts:158` rejects everything `> 1 MB`, so a 25 MB+1 byte input already triggers `InputError.oversize` and the test passes. CLAUDE.md is explicit: RED means tests fail with an assertion expressing the missing behavior. This RED would not fail.
- **Fix:** Make the RED assert one of (a) error message contains `25 MB` (against current `inputs.ts:31` text "1 MB"), or (b) a file of size `1 MB + 1` … `25 MB` does NOT trigger oversize and is accepted. Option (a) is the cleaner gate.

### F2 — RED test for "incomplete provider pair skip" doesn't target the real change

- **Verdict:** fail
- **Location:** plan lines 152–158 (Task 2 Step 1)
- **Why:** Current `config.ts:62` already short-circuits via `nomosConfig(parsed) ?? openRouterConfig(parsed) ?? nvidiaConfig(parsed)`, and `configFromPair` returns `undefined` when key or model is empty. So "incomplete Nomos + complete OpenRouter ⇒ OpenRouter selected" is already the existing behavior; the test will PASS against current code. The actual spec delta (line 65 of spec) is **trim-aware** completeness ("non-empty after trimming whitespace"). Today, a key set to `"   "` is treated as complete and would be selected.
- **Fix:** Make the RED use whitespace-only `NOMOS_API_KEY` / `NOMOS_MODEL` and assert OpenRouter wins. That genuinely fails today and proves the trim fix in Step 2.

### F3 — Strict-TDD violation: RED steps for not-yet-existing modules

- **Verdict:** warning
- **Location:** Task 3 Step 1 (lines 186–191), Task 4 Step 1 (lines 240–252), Task 5 Step 1 (lines 304–306), Task 6 Step 1 (lines 338–342), Task 9 Step 1 (lines 436–447). All say "Expected: FAIL because module does not exist."
- **Why:** `~/.codex/AGENTS.md`: *"Compilation errors ARE NOT `RED` (in TDD). `RED` means code including tests compile but tests fail with assertion that expresses the missing behavior."* Failing to import an absent module is a compile error, not RED.
- **Fix:** For each of those tasks, prepend a sub-step "Create skeleton with stub return shape so the test compiles" before the RED step. The RED then asserts the *behavior*, not module existence.

### F4 — "RED/GREEN for X" lumps two TDD phases into one step

- **Verdict:** warning
- **Location:** Task 1 Step 4 (line 128); Task 3 Steps 3–5 (lines 213–224); Task 4 Steps 3–7 (lines 257–289); Task 5 Steps 3–4 (lines 311–317); Task 6 Steps 3–4 (lines 346–352); Task 7 Step 3 (line 374); Task 8 Steps 3–4 (lines 408–415); Task 9 Steps 3–5 (lines 451–462); Task 11 Steps 3–4 (lines 545–551).
- **Why:** `strict-tdd` skill (referenced from CLAUDE.md) requires a distinct RED step (run, observe failure) before GREEN. Folding them collapses the discipline the repo asks for and removes the "run the failing test" anchor that catches false-RED cases like F1/F2.
- **Fix:** Either split each into two checkbox lines (RED, GREEN), or add an explicit instruction at the top of the plan saying "every `RED/GREEN for X` is shorthand for two consecutive steps; both must be run separately and the RED output captured."

### F5 — Task 1 Step 4 is mislabeled "RED/GREEN" but is just a regression test

- **Verdict:** warning
- **Location:** plan lines 128–134
- **Why:** `cli.ts:34` already rejects any `argv[0]` starting with `-`, including `--`. There's no behavior change, so no RED is possible. Step says "Keep existing behavior, but add a test that confirms `--` is rejected" — that's regression coverage, not TDD.
- **Fix:** Drop the "RED" framing. Re-label the step as "Add regression test for `--` rejection (no behavior change)." Optionally add a real RED for the spec wording "any `-`-leading token" if the current single-arg check is insufficient (it is sufficient because `argv.length !== 1` rejects multi-arg cases first).

### F6 — Plan doesn't bump session-digest package version for V2

- **Verdict:** warning
- **Location:** Task 10 (lines 474–502) lists `package.json`/`package-lock.json` modifications only for dependency removal; Task 12 doesn't touch versions.
- **Why:** Project `CLAUDE.md`: *"Versioning: bump only the packages with code changes, keep `package.json` and `package-lock.json` root versions aligned, and update lockfile entries when package versions change."* And `release-units.config.toml` uses package-version-keyed tags. A V2 architecture replacement is at minimum a major bump; the plan never specifies it, so the release pipeline won't tag the V2.
- **Fix:** Add a step in Task 12 (before the manual acceptance run) to bump `session-digest/package.json` (likely `2.0.0`), keep `package-lock.json` aligned, and run `node scripts/release/generate-manifest.js` if `release-units.toml` is generator-managed. State the chosen version explicitly so the implementer doesn't have to guess.

### F7 — "Components" table / log scope coverage not addressed

- **Verdict:** warning
- **Location:** Task 12 (lines 559–598) updates project log only.
- **Why:** Project `CLAUDE.md` "## README Components Table" requires updating root `README.md` "Components" row when a component's role changes. V2 changes the description (Deep Agents → local ledger + bounded synthesis). Also `CLAUDE.md` says *"if both scopes are changed, update both logs"*; replacing Deep Agents/Anthropic deps and shifting architecture is repo-level. Plan only updates `session-digest/docs/log.md`.
- **Fix:** Add explicit sub-steps in Task 12: (a) update the Components row in repo `README.md` if its description is now stale; (b) add a one-line entry to repo `docs/log.md` reflecting the V2 cutover (since dependency removal and architecture replacement are repo-scope).

### F8 — `compressor_version` constants are introduced twice

- **Verdict:** warning
- **Location:** Task 4 Step 1 (line 247 asserts `compressor_version: "1.0.0"`) vs Step 7 (lines 280–289 introduces constants).
- **Why:** Step 1's GREEN must already use `"1.0.0"` somewhere; Step 7 then "exposes" constants. Either Step 1 hard-codes the literal (and Step 7 is a refactor) or Step 7 should be Step 2. As written it implies two RED cycles for the same fact.
- **Fix:** Move "expose constants" to Step 2 (right after the RED in Step 1), so the GREEN uses the constants from the start. Drop Step 7 or repurpose it for the version-bump *rules* documentation rather than constant introduction.

### F9 — Task 9 Step 6 is a refactor inside a feature task

- **Verdict:** warning
- **Location:** plan lines 464–466 ("Move `defaultChatModel`, proxy fetch helper… into `model.ts` or `synthesis.ts`")
- **Why:** A strict-TDD task should not bundle a structural move at the end of a Red/Green sequence; the commit message `session-digest: synthesize digest from bounded context` won't reflect the move. The "or" leaves placement ambiguous.
- **Fix:** Promote Step 6 to its own task between Tasks 9 and 10, with its own gate and commit (e.g., `session-digest: extract chat-model factory`). Pin the destination file (`session-digest/src/model.ts`) instead of "or".

### F10 — Spec test #35 (six H2 sections in order) not explicitly covered

- **Verdict:** warning
- **Location:** Task 9 Step 1 (lines 437–447) only says "returns six sections"; Task 11 doesn't assert section order/names in digest body.
- **Why:** Spec line 81–97 fixes the section names and order. Without an explicit assertion, a fake model returning six sections in a different order would still pass.
- **Fix:** Add a sub-step in Task 9 (or Task 11 Step 1) that asserts the digest Markdown contains exactly the six `## ` headings in the documented order.

### F11 — Sub-anchor format from spec (`record:194/block:2`) not exercised

- **Verdict:** warning (low)
- **Location:** spec line 227 vs Task 4 Step 3 (line 257)
- **Why:** Spec allows `anchor` to use slash-separated child segments. Plan tests only the bare `record:<n>` shape. If implementers don't add tests, the sub-anchor format may either be missing or quietly broken.
- **Fix:** Either drop sub-anchors as a non-required feature in the V2 implementation (and call that out), or add a Task 4 sub-step asserting at least one event uses a `record:<n>/<segment>` anchor (e.g., for content-block-level `tool_use`).

### F12 — `ParsedRecord.type: string` is too strict for the spec's tolerance rule

- **Verdict:** warning (low)
- **Location:** plan line 207
- **Why:** Spec line 202: "MUST NOT fail solely because a record has an unknown type or unknown field." If a record has no top-level `type` at all, declaring `type: string` forces the parser to either invent a value or reject the line. Better to model it honestly so the compiler can decide what to do.
- **Fix:** Type as `type?: string` (or `type: string | null`), and clarify the parser's behavior for type-less records in Task 3 Step 5.

### F13 — Test isolation: filesystem side effects on `~/.session-digests`

- **Verdict:** warning (low)
- **Location:** Task 11 Step 1 (lines 517–524), Task 8 Step 3 (line 410)
- **Why:** Plan says "fake config; deterministic fake model; injected clock" but doesn't pin `baseDir` to a temp directory. Existing `cli.ts:41` defaults to `~/.session-digests`, which would mutate the real user dir during tests.
- **Fix:** State explicitly that all CLI integration tests pass `deps.baseDir = <tmp>` (and clean up). Worth making this an invariant in the plan's preamble so each test author follows it.

### F14 — Final Closeout doesn't include manifest regeneration / release-units

- **Verdict:** warning (low)
- **Location:** plan lines 600–607
- **Why:** Per project `CLAUDE.md` "Release Process", `release-units.toml` is generated; if version changes, regeneration runs through `scripts/release/generate-manifest.js`. Plan's closeout is silent.
- **Fix:** Add a closeout sub-step (conditional on F6 version bump): "regenerate `release-units.toml` via `node scripts/release/generate-manifest.js`; commit if changed."

## Pass Items Worth Keeping

- Execution Lock with worktree/branch preflight — clear and matches `process-gates`.
- Keep/Adapt/Replace/Retire taxonomy in "Existing Code Decision" — concrete and actionable.
- File Map distinguishes Create/Modify/Delete clearly.
- Per-task gate commands use `run_silent.sh` per `CLAUDE.md`.
- Manual acceptance step (Task 12 Step 5) — matches spec done criteria.
- Plan honors "no push" repeatedly.

## Suggested Edit Order

Land F1, F2, F3 first — they're test-design correctness issues that change what gets written. F6/F7 next (release/repo housekeeping) since they shift Task 12's scope. F4/F5/F8/F9 are structural cleanups; F10–F14 are smaller polish.
