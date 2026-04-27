---
date: 2026-04-27
model: gpt-5
description: "Implementation plan for the ADR-003 session-digest V2 CLI with local ledgers and bounded synthesis."
---

# Session Digest V2 Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:executing-plans` to implement this plan. Use `superpowers:subagent-driven-development` only if the human explicitly authorizes subagents for the execution session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the ADR-003 and `session-digest-v2.md` contract: one Claude Code JSONL session produces one persisted derived ledger and one Markdown digest under `~/.session-digests/`.

**Architecture:** Replace V1's lossy parser plus full-session Deep Agents orchestration with a deterministic local compiler and direct bounded model synthesis. The CLI keeps ADR-002 provider routing and existing digest sections, but it writes a ledger before synthesis and sends only the serialized `model_context` payload to the configured model.

**Tech Stack:** TypeScript ESM, Node.js `node:test`, `tsx`, `@langchain/openai`, `@langchain/core`, `dotenv`, `undici`, existing `./scripts/run_silent.sh` gates.

---

## Execution Lock

- Worktree required: yes.
- Expected worktree: `*/ai-labs.worktrees/deep-nvidia`.
- Expected branch: `deep-nvidia`.
- Preflight check: [ ] done.
- Before Step 1, run `git worktree list --porcelain` and `git branch --show-current`.
- Emit: `Preflight: worktree=<path>, branch=<branch>, separate_worktree=pass`.
- Do not push. The user has repeatedly instructed not to push.
- Auto-continue mode is enabled for this plan. After a task reaches GREEN, required gates pass, the plan tracker is updated, and the local commit is created, continue to the next task without waiting for human review.
- Self-review remains mandatory, but it is an internal agent check, not a human approval checkpoint. Pause only for failed gates, unclear scope, missing credentials or external-service access, destructive operations, or an explicit user interruption.
- Strict TDD applies: one failing test, run it, make it pass, then continue.
- Compilation/import errors are not RED. When a task introduces a new module, create the smallest compile-only skeleton first, then write a failing assertion against behavior.
- Any step labeled `RED/GREEN` below is shorthand for two required sub-steps: first add and run the RED test to capture the failing assertion, then implement the minimum GREEN code and rerun the same targeted command.
- All CLI integration tests MUST inject a temporary `deps.baseDir` and clean it up. No test may write to the real `~/.session-digests/`.
- Each task ends with targeted test, full `session-digest` test gate, build gate, log update if meaningful, and one local commit.
- Required gates for code/config changes:
  - `./scripts/run_silent.sh "tests" npm test -w session-digest`
  - `./scripts/run_silent.sh "build" npx tsc --noEmit -p session-digest`

## Existing Code Decision

Keep and adapt:

- `session-digest/src/cli.ts`: keep the composition root and stream-based `main`; rewire pipeline from parse/messages/Deep Agents to validate/parse/compile/write-ledger/synthesize/write-digest.
- `session-digest/src/config.ts`: keep provider selection and proxy-compatible configuration; update incomplete-pair semantics and `.env.example` if needed.
- `session-digest/src/clock.ts`: keep as the single `new Date()` default-clock site.
- `session-digest/src/sections.ts`: keep the six digest sections; remove Deep Agents role ownership exports when no longer referenced.
- `session-digest/src/output.ts`: keep digest assembly concepts, but split path computation and front matter for digest and ledger artifacts.

Replace or retire:

- `session-digest/src/inputs.ts`: replace flattened `Message[]` parsing with source validation plus structured Claude JSONL record parsing.
- `session-digest/src/agents.ts`: retire Deep Agents orchestration from the main path. Preserve reusable `defaultChatModel` and proxy fetch behavior by moving it to a new synthesis/model module.
- `session-digest/src/prompts/*.md`: remove from the main path when `agents.ts` is retired; keep only if a later spec adds bounded role-specific artifacts.
- `session-digest/tests/agents-fake.test.ts`: replace with direct synthesis/fake-model tests.
- V1 tests that assert a single digest-only artifact or `1 MB` cap must be rewritten for V2's ledger plus digest contract and `25 MB` input cap.

Do not change:

- Root workspace registration.
- ADR-002 provider routing concept.
- Raw input non-retention.
- Digest section names and order.

## File Map

Create:

- `session-digest/src/session-records.ts`: parsed source record types, JSONL parsing, parse recovery count, source metadata.
- `session-digest/src/ledger.ts`: ledger schema constants, compiler, event construction, compressor version rules, model-context byte budget.
- `session-digest/src/artifacts.ts`: digest and ledger path computation, collision checks, ledger writing, closed-file byte measurement.
- `session-digest/src/synthesis.ts`: direct model-call prompt construction, fake-model seam, section parsing.
- `session-digest/tests/session-records.test.ts`
- `session-digest/tests/ledger.test.ts`
- `session-digest/tests/artifacts.test.ts`
- `session-digest/tests/synthesis.test.ts`
- `session-digest/tests/cli-v2.test.ts`
- new fixtures under `session-digest/tests/fixtures/v2/`

Modify:

- `session-digest/src/cli.ts`
- `session-digest/src/config.ts`
- `session-digest/src/output.ts`
- `session-digest/src/sections.ts`
- existing tests that still cover reusable CLI/config/output behavior
- `session-digest/package.json` and `package-lock.json` only if retiring `deepagents` / `@langchain/anthropic`
- `session-digest/docs/log.md`

Delete when no longer referenced:

- `session-digest/src/agents.ts`
- `session-digest/src/prompts/extractor.md`
- `session-digest/src/prompts/improver.md`
- `session-digest/src/prompts/evidence-checker.md`
- `session-digest/tests/agents-fake.test.ts`

---

## Chunk 1: Input Contract And Provider Semantics

### Task 1: V2 input validation and argument contract

**Files:**

- Modify: `session-digest/src/inputs.ts`
- Modify: `session-digest/src/cli.ts`
- Modify/Test: `session-digest/tests/inputs.test.ts`
- Modify/Test: `session-digest/tests/cli-args.test.ts`

- [ ] **Step 1: Preflight**

Run: `git worktree list --porcelain` and `git branch --show-current`.

Expected: current worktree is `/Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs.worktrees/deep-nvidia`, branch `deep-nvidia`.

- [ ] **Step 2: RED for `25 MB` input cap**

Add or update one test that writes `25 * 1024 * 1024 + 1` bytes and asserts the oversize error mentions `25 MB`.

Run: `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/inputs.test.ts`

Expected: FAIL because current code reports `1 MB`.

- [ ] **Step 3: GREEN for `25 MB` input cap**

Change `ONE_MB` to `MAX_INPUT_BYTES = 25 * 1024 * 1024` and update the error text to name `25 MB`.

Run the same targeted command.

Expected: PASS.

- [ ] **Step 4: Add regression test for `--` rejection**

Keep existing behavior, but add a test that confirms `--` is rejected, documenting reserved flag behavior.

Run: `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/cli-args.test.ts`

Expected: PASS without production changes.

- [ ] **Step 5: Task gate and commit**

Run:

- `./scripts/run_silent.sh "tests" npm test -w session-digest`
- `./scripts/run_silent.sh "build" npx tsc --noEmit -p session-digest`

Commit: `session-digest: update v2 input gates`

### Task 2: Provider complete-pair selection

**Files:**

- Modify: `session-digest/src/config.ts`
- Modify/Test: `session-digest/tests/config.test.ts`

- [ ] **Step 1: RED for incomplete provider pair skip**

Add a test with whitespace-only `NOMOS_API_KEY` / `NOMOS_MODEL` and complete OpenRouter config. Assert OpenRouter is selected.

Run: `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/config.test.ts`

Expected: FAIL because current config treats whitespace-only strings as complete.

- [ ] **Step 2: GREEN for complete-pair rule**

Implement `isCompletePair(apiKey, model)` using trim. Skip incomplete pairs during selection. If zero complete pairs exist, keep concise missing-credentials errors.

- [ ] **Step 3: RED/GREEN for provider order among complete pairs**

Assert Nomos wins over OpenRouter and OpenRouter wins over NVIDIA when each pair is complete.

- [ ] **Step 4: Task gate and commit**

Run full session-digest test and build gates.

Commit: `session-digest: define provider pair selection`

---

## Chunk 2: Claude JSONL Parsing And Ledger Compilation

### Task 3: Parsed source records

**Files:**

- Create: `session-digest/src/session-records.ts`
- Create/Test: `session-digest/tests/session-records.test.ts`
- Add fixtures under: `session-digest/tests/fixtures/v2/`

- [ ] **Step 1: Create compile-only parser skeleton**

Create `session-digest/src/session-records.ts` with exported placeholder types and a stub `parseSessionRecords` function returning an empty parsed session. This step exists only to avoid import/compilation failures; do not implement behavior.

- [ ] **Step 2: RED for source anchors**

Create a fixture with two valid JSONL records and one blank line. Assert parsed records preserve one-based source record anchors `record:1` and `record:3`.

Run: `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/session-records.test.ts`

Expected: FAIL by assertion because the skeleton returns no records.

- [ ] **Step 3: GREEN for parser behavior**

Implement:

```ts
export type ParsedSession = {
  source: { path: string; bytes: number; records: number };
  parse: { skipped_records: number };
  records: ParsedRecord[];
};

export type ParsedRecord = {
  anchor: `record:${number}`;
  source_record: number;
  type?: string;
  raw: Record<string, unknown>;
};
```

Read file through injected `readFile`; split by line; skip blanks; parse JSON; count malformed lines.

- [ ] **Step 4: RED/GREEN for malformed-line recovery**

Add a malformed line fixture. Assert one valid recognized record succeeds and `parse.skipped_records === 1`.

- [ ] **Step 5: RED/GREEN for no recognized records**

Assert parsed JSON with no Claude Code records throws an input error.

- [ ] **Step 6: RED/GREEN for metadata preservation**

Assert `uuid`, `parentUuid`, `sessionId`, `timestamp`, `cwd`, `gitBranch`, message role, content block types, and top-level `toolUseResult` are exposed in parsed record helpers or typed fields. Type-less parsed JSON records are not recognized Claude Code records; they may be counted as parsed JSON but must not produce ledger events.

- [ ] **Step 7: Task gate and commit**

Run full session-digest test and build gates.

Commit: `session-digest: parse claude session records`

### Task 4: Ledger schema and event compiler

**Files:**

- Create: `session-digest/src/ledger.ts`
- Create/Test: `session-digest/tests/ledger.test.ts`
- Modify: `session-digest/src/session-records.ts` only if parser types need small additions

- [ ] **Step 1: Create compile-only ledger skeleton**

Create `session-digest/src/ledger.ts` with exported constants, placeholder ledger types, and a stub `compileLedger` function returning minimal metadata and no events. This step exists only to keep imports compiling.

- [ ] **Step 2: RED for ledger metadata**

Assert compiling a parsed session returns:

- `schema: "session-digest-ledger"`
- `schema_version: "1.0.0"`
- `compressor_strategy: "claude-jsonl-v1"`
- `compressor_version: "1.0.0"`
- source path/bytes/records
- `parse.skipped_records`

Expected: FAIL.

- [ ] **Step 3: GREEN for ledger metadata using constants**

Expose constants from the start and use them in metadata:

```ts
export const COMPRESSOR_STRATEGY = "claude-jsonl-v1";
export const COMPRESSOR_VERSION = "1.0.0";
```

Implement `compileLedger(parsedSession): Ledger` with metadata and empty events/model context.

- [ ] **Step 4: RED/GREEN for event anchors**

Assert emitted events include `anchor`, `kind`, and `source_record`.

- [ ] **Step 5: RED/GREEN for message/tool event coverage**

Add tests for:

- user text event;
- assistant text event;
- `tool_use` event;
- `tool_result` event;
- top-level `toolUseResult` event.

- [ ] **Step 6: RED/GREEN for sub-anchor format**

Assert at least one content-block-derived event uses an anchor like `record:<n>/block:<m>` while preserving the `record:<n>` prefix.

- [ ] **Step 7: RED/GREEN for tool output compaction**

Use a bulky tool result fixture. Assert ledger records `output_bytes` and selected `key_lines`, while model context does not contain the full output.

- [ ] **Step 8: RED/GREEN for file/error/command events**

Assert observable file paths, Bash commands, failed tool results, and error-like output create typed facts.

- [ ] **Step 9: RED/GREEN for compressor version rules**

Assert tests or docs in this module name the version bump rules from the spec: major for schema changes, minor for retained-event coverage or compaction-rule changes, patch for behavior-preserving fixes.

- [ ] **Step 10: Task gate and commit**

Run full session-digest test and build gates.

Commit: `session-digest: compile local session ledger`

### Task 5: Bounded model context

**Files:**

- Modify: `session-digest/src/ledger.ts`
- Modify/Test: `session-digest/tests/ledger.test.ts`

- [ ] **Step 1: Add compile-only model-context serializer stub**

Add an exported `serializeModelContext` placeholder if it does not already exist. This step exists only to keep imports compiling.

- [ ] **Step 2: RED for model context byte count**

Assert `model_context.bytes` equals the UTF-8 byte length of serialized `model_context`, excluding synthesis instructions.

- [ ] **Step 3: GREEN for stable serialization**

Implement a deterministic serializer helper, for example `serializeModelContext(modelContext): string`, and compute bytes from that string.

- [ ] **Step 4: RED/GREEN for `250,000` budget overflow**

Add fixture or generated events that compile over budget. Assert compiler/CLI-facing function throws `model context budget exceeded` before model call.

- [ ] **Step 5: RED/GREEN for no silent truncation**

Assert overflow does not return a shortened context.

- [ ] **Step 6: Task gate and commit**

Run full session-digest test and build gates.

Commit: `session-digest: bound model context`

---

## Chunk 3: Artifact Writing And Digest Metadata

### Task 6: Artifact paths, UTC timestamps, and collisions

**Files:**

- Create: `session-digest/src/artifacts.ts`
- Modify: `session-digest/src/output.ts`
- Modify/Test: `session-digest/tests/output.test.ts`
- Create/Test: `session-digest/tests/artifacts.test.ts`

- [ ] **Step 1: Create compile-only artifacts skeleton**

Create `session-digest/src/artifacts.ts` with placeholder exports for `computeArtifactPaths` and collision checking. This step exists only to keep imports compiling.

- [ ] **Step 2: RED for shared timestamp artifact paths**

Assert digest and ledger paths share the same UTC second timestamp and extensions `.digest.md` / `.ledger.json`.

- [ ] **Step 3: GREEN for artifact path helper**

Implement `computeArtifactPaths(inputPath, nowUtc, baseDir)` returning both paths.

- [ ] **Step 4: RED/GREEN for millisecond `generated_at`**

Update output formatting to keep millisecond precision, e.g. `2026-04-27T00:00:00.000Z`.

- [ ] **Step 5: RED/GREEN for collision fail-fast**

Assert if either target path exists, no artifact is written and the CLI exits non-zero.

- [ ] **Step 6: Task gate and commit**

Run full session-digest test and build gates.

Commit: `session-digest: compute v2 artifact paths`

### Task 7: Ledger write and closed-file byte measurement

**Files:**

- Modify: `session-digest/src/artifacts.ts`
- Create/Modify Test: `session-digest/tests/artifacts.test.ts`

- [ ] **Step 1: RED for ledger write**

Assert writing a ledger creates parent directory and writes one JSON ledger file.

- [ ] **Step 2: GREEN for ledger writer**

Implement `writeLedger(ledgerPath, ledger, fsLike)` using injected fs.

- [ ] **Step 3: RED/GREEN for closed-file byte size**

Assert `ledger_bytes` source for digest metadata is measured from the closed file on disk, not the in-memory pre-write string.

- [ ] **Step 4: Task gate and commit**

Run full session-digest test and build gates.

Commit: `session-digest: write ledger artifact`

### Task 8: Digest front matter and raw retention rules

**Files:**

- Modify: `session-digest/src/output.ts`
- Modify/Test: `session-digest/tests/output.test.ts`
- Modify/Test: `session-digest/tests/cli-v2.test.ts`

- [ ] **Step 1: RED for canonical front matter fields**

Assert digest front matter includes:

- `compressor_strategy`
- `compressor_version`
- `ledger_path`
- `source_bytes`
- `source_records`
- `ledger_bytes`
- `model_context_bytes`

- [ ] **Step 2: GREEN for V2 front matter**

Extend `FrontMatter` and `assembleDigest`.

- [ ] **Step 3: RED/GREEN for raw input non-retention**

Assert successful run writes ledger and digest only, and no raw `.jsonl` copy under `~/.session-digests/`.

- [ ] **Step 4: RED/GREEN for ledger cannot reconstruct every raw fixture line**

Use a fixture with a bulky raw line. Assert ledger does not contain that raw line verbatim.

- [ ] **Step 5: Task gate and commit**

Run full session-digest test and build gates.

Commit: `session-digest: emit v2 digest metadata`

---

## Chunk 4: Direct Model Synthesis

### Task 9: Replace Deep Agents with direct synthesis seam

**Files:**

- Create: `session-digest/src/synthesis.ts`
- Create/Test: `session-digest/tests/synthesis.test.ts`
- Modify: `session-digest/tests/agents-fake.test.ts` only as an intermediate step before deletion

- [ ] **Step 1: Create compile-only synthesis skeleton**

Create `session-digest/src/synthesis.ts` with placeholder exported types and a stub `synthesizeDigest` function. This step exists only to keep imports compiling.

- [ ] **Step 2: RED for fake synthesis client**

Define a minimal model seam:

```ts
export type DigestModel = {
  invoke(input: unknown): Promise<unknown>;
};
```

Add a test that a deterministic fake receives serialized model context and returns six sections.

- [ ] **Step 3: GREEN for synthesis module**

Implement `synthesizeDigest({ model, modelContext }): Promise<Record<SectionName, string>>`.

- [ ] **Step 4: RED/GREEN for raw JSONL not sent**

Assert model input does not contain raw JSONL fixture text or V1 flattened transcript shape.

- [ ] **Step 5: RED/GREEN for evidence anchors**

Fake model returns evidence notes with `record:<n>` anchors; assert digest includes them.

- [ ] **Step 6: RED/GREEN for model failure contract**

Assert a synthesis failure after ledger creation reports the ledger path and writes no digest.

- [ ] **Step 7: Task gate and commit**

Run full session-digest test and build gates.

Commit: `session-digest: synthesize digest from bounded context`

### Task 10: Extract chat-model factory

**Files:**

- Create: `session-digest/src/model.ts`
- Create/Test: `session-digest/tests/model.test.ts`
- Modify: `session-digest/src/agents.ts`
- Modify: `session-digest/tests/agents-fake.test.ts`

- [ ] **Step 1: RED for model factory import**

Add tests around `defaultChatModel` and shell proxy behavior through `session-digest/src/model.ts`.

- [ ] **Step 2: GREEN for model factory extraction**

Move `defaultChatModel`, proxy fetch helper, and config-to-ChatOpenAI construction from `agents.ts` into `model.ts`. Keep behavior unchanged.

- [ ] **Step 3: Task gate and commit**

Run full session-digest test and build gates.

Commit: `session-digest: extract chat model factory`

### Task 11: Retire Deep Agents path

**Files:**

- Delete: `session-digest/src/agents.ts`
- Delete: `session-digest/src/prompts/extractor.md`
- Delete: `session-digest/src/prompts/improver.md`
- Delete: `session-digest/src/prompts/evidence-checker.md`
- Delete/Replace: `session-digest/tests/agents-fake.test.ts`
- Modify: `session-digest/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: RED for no Deep Agents import**

Add or adapt a test/static check asserting `session-digest/src/**/*.ts` has no `deepagents` import.

- [ ] **Step 2: Remove Deep Agents files and imports**

Delete V1-only prompt files and orchestration tests.

- [ ] **Step 3: Remove unused dependencies**

Run `npm uninstall -w session-digest deepagents @langchain/anthropic` if no code imports them.

- [ ] **Step 4: Task gate and commit**

Run full session-digest test and build gates.

Commit: `session-digest: remove deep agents v1 path`

---

## Chunk 5: CLI Integration And Acceptance

### Task 12: Wire V2 CLI pipeline

**Files:**

- Modify: `session-digest/src/cli.ts`
- Create/Modify Test: `session-digest/tests/cli-v2.test.ts`
- Modify existing CLI tests as needed

- [ ] **Step 1: RED for successful V2 run**

Test `main` with:

- valid Claude JSONL fixture;
- fake config;
- deterministic fake model;
- injected clock.

Assert exit `0`, stdout digest path only, one ledger and one digest written.
All test setup must pass a temporary `deps.baseDir` and remove it with `t.after`.

- [ ] **Step 2: GREEN for V2 pipeline**

Implement pipeline:

1. validate args;
2. validate input path;
3. parse source records;
4. compile ledger/model context;
5. mkdir base dir;
6. load provider config;
7. compute artifact paths;
8. collision check;
9. write ledger;
10. measure closed ledger size;
11. synthesize digest sections;
12. write digest;
13. print digest path.

- [ ] **Step 3: RED/GREEN for pre-artifact failures**

Assert argument/input/config/budget failures write no ledger and no digest.

- [ ] **Step 4: RED/GREEN for post-ledger model failure**

Assert ledger remains, digest does not exist, stderr includes ledger path.

- [ ] **Step 5: RED/GREEN for final digest section order**

Assert generated digest Markdown contains exactly the six documented `## ` section headings in order.

- [ ] **Step 6: Task gate and commit**

Run full session-digest test and build gates.

Commit: `session-digest: wire v2 cli pipeline`

### Task 13: Final compatibility cleanup

**Files:**

- Modify: tests that still assert V1-only behavior
- Modify: `session-digest/docs/log.md`
- Modify: `session-digest/package.json`
- Modify: `package-lock.json`
- Modify: root `README.md`
- Modify: root `docs/log.md`
- Maybe modify: `session-digest/docs/specs/session-digest.md` only to mark it as V1/historical if needed

- [ ] **Step 1: Remove or rewrite V1-only tests**

Remove assertions that successful runs write only one digest file. Replace with V2 assertions where not already covered.

- [ ] **Step 2: Preserve V1 docs as historical**

Do not delete `session-digest/docs/specs/session-digest.md`. It documents V1. Only add a short note if needed that V2 is specified in `session-digest-v2.md`.

- [ ] **Step 3: Update log**

Add one concise `session-digest/docs/log.md` entry for implementation completion.

- [ ] **Step 4: Bump package version**

Bump `session-digest/package.json` from `0.0.1` to `2.0.0` and update the corresponding `package-lock.json` workspace entry. Use `npm install --package-lock-only -w session-digest` or an equivalent non-destructive npm command.

- [ ] **Step 5: Update repo-level docs**

Update the root `README.md` Components table row for `session-digest` so it describes the V2 local-ledger and bounded-synthesis architecture rather than Deep Agents/NVIDIA NIM. Add a concise root `docs/log.md` entry because the component role and dependency surface changed at repo scope.

- [ ] **Step 6: Release manifest check**

Check whether `session-digest` is listed in `release-units.config.toml`. It is not listed at plan creation time. If it remains absent, do not edit `release-units.toml`. If a later change adds it as a release unit, run `node scripts/release/generate-manifest.js` and commit any manifest update.

- [ ] **Step 7: Final gates**

Run:

- `./scripts/run_silent.sh "tests" npm test -w session-digest`
- `./scripts/run_silent.sh "build" npx tsc --noEmit -p session-digest`

- [ ] **Step 8: Manual acceptance run**

Run the CLI against a real Claude Code session larger than `1 MB` using configured Nomos credentials. Confirm:

- ledger is written;
- digest is written;
- stdout is digest path only;
- raw JSONL is not copied;
- digest front matter points to the ledger.

- [ ] **Step 9: Commit**

Commit: `session-digest: complete v2 ledger pipeline`

## Final Plan Closeout

- [ ] Do not push unless the user explicitly asks.
- [ ] Run full root gates if implementation touched dependencies or shared package files:
  - `./scripts/run_silent.sh "tests" npm test`
  - `./scripts/run_silent.sh "build" npx tsc --noEmit`
- [ ] Archive this plan after implementation completes by moving it to `session-digest/docs/plans/implemented/` and committing the move.
