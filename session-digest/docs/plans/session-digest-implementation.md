---
date: 2026-04-26
model: claude-opus-4-7
description: "Implementation plan for the session-digest CLI prototype defined by ADR-001 and its spec."
---

# Session Digest Implementation Plan

> **For Claude:** Use the `dev-skills:strict-tdd` skill while executing this plan. Each task ends with a targeted test run and a commit on a passing state.

**Goal:** Implement the `session-digest` CLI per [`../specs/session-digest.md`](../specs/session-digest.md) and [`../adr/adr-001-session-digest-deepagents-nim.md`](../adr/adr-001-session-digest-deepagents-nim.md): one Claude Code JSONL → one Markdown digest under `~/.session-digests/`, using LangChain Deep Agents over NVIDIA NIM.

**Source of truth:** the spec. Acceptance is the 18 acceptance behaviors enumerated in `specs/session-digest.md` "Tests (required)" plus the behavior rules. Do not invent tests outside that envelope; do not skip tests inside it.

## Tech stack

- Node.js ≥ 20.10, < 23. TypeScript, ESM modules.
- [`deepagents`](https://www.npmjs.com/package/deepagents) (LangChain Deep Agents, TypeScript port).
- [`@langchain/openai`](https://www.npmjs.com/package/@langchain/openai) `ChatOpenAI` configured for NIM via OpenAI-compatible endpoint at `https://integrate.api.nvidia.com/v1`. ADR-001 forbids a provider abstraction layer; `ChatOpenAI` is used directly. The exact constructor field names (`apiKey` vs `openAIApiKey`, top-level `baseURL` vs nested `configuration.baseURL`) are discovered during the Task 7.5 spike against the installed version and pinned into Task 8 before any RED test is written — see [langchainjs#7356](https://github.com/langchain-ai/langchainjs/issues/7356).
- `dotenv` for `~/.session-digests/.env`.
- `node:test` + `node:assert/strict` for tests (matches `corpus-scout` precedent).
- `tsx` as the runtime loader so `tsc --noEmit` is the only TypeScript build gate.

**Layout:** the implementation, docs (spec, ADR, plans, use-case catalog), and tests all live at the **repo top level** under `session-digest/` as a standalone project. `sandbox/deep/` was exploration scaffolding and has been removed.

```
session-digest/
  package.json            # registered as an npm workspace in root package.json
  tsconfig.json           # ESM, NodeNext, strict
  src/
    cli.ts                # entrypoint, argv routing, exit codes
    inputs.ts             # input file + JSONL validation
    config.ts             # .env loading, .env.example bootstrap, validation
    output.ts             # output dir, filename, front matter, body assembly
    agents.ts             # Deep Agents wiring: Extractor, Improver, Evidence checker
    prompts/              # subagent prompts — checked in, one file per role
      extractor.md
      improver.md
      evidence-checker.md
  tests/
    _bootstrap.test.ts      # permanent — guarantees runner has ≥1 test
    cli-args.test.ts
    inputs.test.ts
    config.test.ts
    output.test.ts
    agents-fake.test.ts     # fake-LLM integration; happy path
    agents-live.test.ts     # live NIM smoke; hits the real NIM endpoint
    fixtures/
      session.valid.jsonl
      session.empty.jsonl
      session.no-usable.jsonl
      session.whitespace.jsonl
      session.garbage-then-valid.jsonl
      session.not-jsonl.txt
```

There is **no** `bin` field. The CLI is invoked as `npx -w session-digest tsx src/cli.ts <path>` (or, equivalently, from inside the workspace, `tsx src/cli.ts <path>`). Adding a `bin` shim is deferred to a packaging story that doesn't exist yet.

**Architectural invariants from ADR-001 (do not violate):**

- Sole orchestrator: LangChain Deep Agents (`deepagents` `createDeepAgent`).
- Exactly three subagents: Extractor, Improver, Evidence checker.
- Single configured NIM model for all subagents.
- No provider abstraction layer — `ChatOpenAI` is used directly; do not wrap it.
- No content scrubbing/redaction before NIM calls.
- Never copy or persist the raw input JSONL.

**Process gates:**

- TDD: every task starts with a failing test, then minimal code to green, then refactor.
- **Commit on green, every task.** Each task MUST end with a passing-test commit. Do not start the next task until the previous task's commit lands on a green suite. Do not bundle multiple tasks into one commit. Do not commit on red, ever.
- Per-project CI isolation (CLAUDE.md): if any CI is added later, it goes in a dedicated `session-digest-core.yml` workflow — but ADR-001 puts CI out of scope for v1, so this plan does NOT add CI.
- Local test command per task: `node --import tsx --test session-digest/tests/<file>` during a tight iteration loop, or `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/<file>` as the wrapped form.
- Local iteration without NIM creds: `node --import tsx --test session-digest/tests/ --test-skip-pattern='live nim'`. The live test (Task 9) is unconditionally collected and unconditionally fails on missing creds per spec test 13; the skip pattern is a developer aid for tight iteration loops on non-live tasks, never a CI gate.
- Full-suite gate before commit at the end of each task: `./scripts/run_silent.sh "tests" npm test -w session-digest` AND `./scripts/run_silent.sh "build" npx tsc --noEmit -p session-digest` MUST both pass before staging files. If either fails, fix on the same task — do not commit.
- Commits are short, imperative, lowercase per AGENTS.md.

**Spec test coverage map** (each acceptance behavior maps to the task that closes it):

| Spec test | Task |
|---:|---|
| 16 (arg arity) | 2 |
| 1 (missing file) | 3 |
| 2 (unreadable) | 3 |
| 3 (empty) | 3 |
| 4 (>1 MB) | 3 |
| 5 (non-JSONL) | 4 |
| 6 (no usable messages) | 4 |
| 18 (whitespace tolerance) | 4 |
| 9 (.env.example bootstrap) | 5 |
| 7 (missing API key) | 5 |
| 8 (missing model) | 5 |
| 14 (no raw-input copy) | 6 |
| 12 (no filename collision) | 6 |
| 15 (front matter keys + values) | 7 |
| 17 (six H2 sections, ordered) | 7 |
| 10 (valid fixture → digest) | 8 |
| 11 (stdout = path only) | 8 |
| 13 (live NIM smoke, fail-on-missing-creds) | 9 |

---

## Task 1 — Scaffold the TypeScript workspace

**Goal:** bootable, empty package wired into the root npm workspaces; `tsc --noEmit` and `node --test` both green with one trivially-passing bootstrap test.

**Files:**

- Create `session-digest/package.json`.
- Create `session-digest/tsconfig.json`.
- Create `session-digest/src/cli.ts` (one-line `export {}` placeholder).
- Create `session-digest/.gitignore` (`node_modules/`, `dist/`, `*.log`).
- Create `session-digest/tests/_bootstrap.test.ts` containing a single trivially-passing assertion (`test("bootstrap", () => {})`). This file is **kept permanently**, not deleted in Task 2. It guarantees the test runner has at least one test to discover under directory-based discovery and acts as a sanity check that the `tsx` loader is wired correctly. The leading underscore makes its purpose obvious in alphabetical listings.
- Edit root `package.json`:
  - append `"session-digest"` to `workspaces`;
  - prepend `--import tsx` to the existing `node --test` invocation, append `session-digest/tests/` to the path list, and hoist `tsx` to the root `devDependencies`.
  - Do NOT migrate to `npm test --workspaces --if-present`. The current root `scripts.test` runs tests from non-workspace paths (`oracle/packages/*`, `oracle/apps/*`, `scripts/release/tests/*`, `scripts/tests/*`) that a workspace-delegated form would silently drop. A workspace migration, if desired later, is its own ADR-able change with explicit decisions about those paths.

**`session-digest/package.json` essentials:**

- `name: "session-digest"`, `version: "0.0.1"`, `private: true`, `type: "module"`.
- `engines: { node: ">=20.10 <23" }`.
- Dependencies: `deepagents`, `@langchain/openai`, `@langchain/core`, `dotenv`.
- Dev dependencies: `tsx`, `typescript`, `@types/node`.
- `scripts.test`: `node --import tsx --test tests/`. Directory-based discovery (Node ≥18 walks the dir for `*.test.*` files) avoids shell globstar variance across zsh/bash/sh.
- No `bin` field. The CLI is invoked via `npx -w session-digest tsx src/cli.ts <path>`.

**`tsconfig.json` essentials:**

- `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, `noEmit: true`, `esModuleInterop: true`, `skipLibCheck: true`.

**Steps:**

1. Write `package.json`, `tsconfig.json`, placeholder `src/cli.ts`, `tests/_bootstrap.test.ts`, `.gitignore`.
2. Update root `package.json`: append `"session-digest"` to workspaces; prepend `--import tsx` to the existing `node --test` invocation; append `session-digest/tests/` to its path list; hoist `tsx` to root devDeps. Run `npm install` so the workspace links and the lockfile updates.
3. Verify both gates with the bootstrap test:
   - `./scripts/run_silent.sh "build" npx tsc --noEmit -p session-digest` → green.
   - `./scripts/run_silent.sh "tests" npm test -w session-digest` → green (one passing bootstrap test).
4. Run the full root `npm test` to confirm all existing test paths (including `oracle/*` and `scripts/*` non-workspace paths) still pass. Treat any regression as a Task 1 blocker.
5. Commit: `scaffold session-digest typescript workspace`.

**Verification:** typecheck passes; `node --test` runs and exits 0 with one passing bootstrap test; root `npm test` is unchanged in behavior for all other test paths.

---

## Task 2 — CLI argument arity (spec test 16)

**Goal:** fail-fast on bad argv before any I/O.

**Files:**

- `session-digest/src/cli.ts` (replace placeholder with real entry).
- `session-digest/tests/cli-args.test.ts`.
- Keep `session-digest/tests/_bootstrap.test.ts` as-is.

**RED — write failing tests first:**

- `test_main_exits_nonzero_when_no_positional_arg`
- `test_main_exits_nonzero_when_more_than_one_positional_arg`
- `test_main_exits_nonzero_when_any_flag_is_passed` (e.g. `--help`, `-h`, `--anything`)
- Each test asserts non-zero exit code and a non-empty `stderr` string.

Tests call `main(argv, stdout, stderr)` in-process with captured streams (`Writable`-backed string sinks). No subprocess spawning in this task.

**GREEN — minimal code:**

- Export `main(argv: string[], stdout: Writable, stderr: Writable): Promise<number>`.
- Parse argv manually (no `commander` / `yargs` — those introduce flag surface). Accept exactly one positional argument; reject any token starting with `-`.
- On violation: write a one-line error to `stderr`, return non-zero.
- **Production code under `src/` MUST write to the injected `stdout`/`stderr` streams. `console.log` and `console.error` are forbidden in `src/**/*.ts`.** This is the structural defense for spec test 11 (stdout contains exactly the digest path).

**Run:**

- `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/cli-args.test.ts`.
- Advisory check (manual review aid, not a gate): `grep -rEn '\bconsole\.' session-digest/src` should produce no matches. Treat any match as a smell to investigate at PR review, not an automatic failure (false positives in comments/strings are possible).

**Commit:** `cli: enforce single positional argument`.

---

## Task 3 — Input file validation (spec tests 1–4)

**Goal:** reject missing, unreadable, empty, and oversize input before parsing.

**Files:**

- `session-digest/src/inputs.ts` — pure functions, no I/O above what each rule needs.
- `session-digest/tests/inputs.test.ts`.
- Wire `cli.main` to call `inputs.validateInputPath(path)`.

**RED:**

- `test_missing_file_returns_error` (path under `mkdtemp()` that does not exist).
- `test_path_pointing_at_directory_returns_error` (path is a directory, not a file). A directory-as-input fails reliably under all dev environments and covers a real user mistake.
- `test_path_pointing_at_broken_symlink_returns_error` (`fs.symlink('/nonexistent', linkPath)`).
- `test_file_under_unreadable_parent_directory_returns_error` — under `mkdtemp()`: create `parent/`, write `parent/session.jsonl`, then `chmod(parent, 0o000)`. Assert `cli.main` returns non-zero with an `EACCES`-style message on `stderr`. `afterEach` MUST `chmod(parent, 0o700)` before `rm -rf` so cleanup succeeds. If `process.geteuid?.() === 0`, fail the test with a clear message ("run as non-root") rather than skipping — root bypasses mode-000 and would silently pass. This is the dedicated coverage for spec test 2 ("permission or IO error"); mode-000 on the *parent* directory is honored on macOS and Linux for non-root users (mode-000 on the *file* itself was unreliable under macOS ACLs, which is why the file-mode approach was abandoned).
- `test_empty_file_returns_error` (write zero bytes).
- `test_file_over_one_megabyte_returns_oversize_error` (write 1 MB + 1 byte). Also asserts `stderr` contains the substring `1 MB` to pin the user-facing wording without locking exact prose.

Each test asserts: non-zero exit through `cli.main`, concise message on `stderr`, no output file written under a temp `HOME`.

**GREEN:**

- `validateInputPath(path: string): Promise<void>` throws a typed `InputError` per failure mode; `cli.main` catches and translates to `(exitCode, stderrMessage)`.
- 1 MB constant lives in `inputs.ts` as a module-level `const ONE_MB = 1024 * 1024`; size and file-type checks both use `fs.stat`. After `stat`, branch on `stat.isFile()` (false → `InputError.NotAFile`) before checking size. Broken symlinks surface as `ENOENT` from `stat` and map to `InputError.MissingFile`. `EACCES` from `stat` (or any subsequent open/read) maps to `InputError.Unreadable`.

**Run:** `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/inputs.test.ts`.

**Commit:** `cli: validate input file presence, readability, size`.

---

## Task 4 — JSONL parsing rules (spec tests 5, 6, 18)

**Goal:** best-effort JSONL extraction matching the spec's pinned lenient semantics and Claude Code message shape.

**Files:**

- `session-digest/src/inputs.ts` — extend with `parseSession(path): Promise<Message[]>` where `Message = { role: string; content: string }` (post-flatten).
- `session-digest/tests/inputs.test.ts` — extend.
- Fixtures (sampled or hand-built to match real Claude Code shape):
  - `session-digest/tests/fixtures/session.not-jsonl.txt` — no parseable lines.
  - `session.no-usable.jsonl` — only `tool_use` / `tool_result` / unknown-shape records.
  - `session.whitespace.jsonl` — interleaved blank and whitespace-only lines around one usable record.
  - `session.valid.jsonl` — at least one user record and one assistant record using the nested `{type, message: {role, content}}` shape with `content` as both string form and array-of-text-blocks form, plus at least one interleaved `tool_use` record that MUST be skipped without error.
  - `session.garbage-then-valid.jsonl` — one unparseable line followed by one valid usable record (lenient-interpretation regression fixture).

**RED:**

- `test_non_jsonl_input_returns_error` (uses `not-jsonl.txt`).
- `test_jsonl_with_only_tool_use_and_unknown_shapes_returns_no_usable_messages_error` (uses `no-usable.jsonl`).
- `test_jsonl_with_interleaved_blank_and_whitespace_lines_parses_when_one_usable_message_present` (uses `whitespace.jsonl`).
- `test_unparseable_line_is_skipped_when_other_lines_yield_usable_messages` (uses `garbage-then-valid.jsonl`; pins the lenient parse-error semantics from the spec).
- `test_content_array_with_text_blocks_is_flattened_to_concatenated_text` — record with `message.content` = `[{type:"text",text:"a"},{type:"text",text:"b"},{type:"tool_use",...}]` flattens to `"ab"` and is usable.
- `test_content_array_with_no_text_blocks_is_not_usable` — record with only `tool_use` blocks under `message.content` is skipped.

**GREEN:**

- Iterate lines (`readline` on a stream, or split-then-parse for ≤1 MB inputs).
- Lines that are empty after `.trim()` are skipped silently.
- Lines that fail `JSON.parse` are skipped silently. Track a counter of "parsed JSON values"; if zero non-blank lines parse, raise `InputError.NonJsonl`.
- For each parsed JSON value, evaluate against the spec's "usable Claude Code message" shape: `record.type ∈ {"user","assistant"}`, `record.message.role` is a non-empty string, and `flattenContent(record.message.content)` returns a non-empty string. `flattenContent`:
  - if `content` is a string, return it;
  - if `content` is an array, return the concatenation of `block.text` for each entry where `block.type === "text"` and `block.text` is a non-empty string;
  - otherwise return `""`.
- Records of any other shape (including `tool_use`, `tool_result`, `system`, summary, unknown) are skipped without error.
- Zero usable messages after at least one parsed line → `InputError.NoUsableMessages`.

**Run:** `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/inputs.test.ts`.

**Commit:** `inputs: parse JSONL best-effort with whitespace tolerance`.

---

## Task 5 — Config bootstrap and validation (spec tests 7, 8, 9)

**Goal:** `.env` discovery + `.env.example` bootstrap + required-key checks.

**Files:**

- `session-digest/src/config.ts`.
- `session-digest/tests/config.test.ts`.

**Test isolation:** override `HOME` (or pass an explicit `baseDir` argument) so `~/.session-digests/` resolves under `mkdtemp()`. Provide a small fixture helper that yields the resolved config dir.

**RED:**

- `test_missing_env_creates_env_example_and_exits_nonzero` — asserts `.env.example` is created with the documented contents AND a real `.env` is **not** created (spec: never create real `.env` with empty secrets).
- `test_missing_api_key_returns_error` — `.env` exists but `NVIDIA_API_KEY` is empty/absent. `stderr` MUST contain the substring `NVIDIA_API_KEY`.
- `test_missing_model_returns_error` — `.env` exists but `NVIDIA_MODEL` is empty/absent. `stderr` MUST contain the substring `NVIDIA_MODEL`.

> The "no preflight call" rule from spec line 111 is a sequencing invariant: invalid creds MUST surface on the first NIM call, not before. A structural defense IS added in Task 8 (`test_invalid_creds_fail_on_first_model_call_not_before`): a fake model whose first `_call` throws asserts `cli.main` reaches `agents.run` and exits non-zero only after the model is invoked exactly once. This distinguishes "preflight ran" from "first NIM call failed" cheaply and closes spec line 113. The complementary structural check — `config.ts` does not import `agents.ts` — remains a PR-review concern.

**GREEN:**

- `loadConfig(baseDir: string): Config` returns `{ apiKey, model }` or throws `ConfigError`.
- If `<baseDir>/.env` is missing: write `.env.example` with the documented body, throw `ConfigError("create ~/.session-digests/.env from .env.example")`.
- If `.env` exists but `NVIDIA_API_KEY` is empty/missing → `ConfigError`.
- Same for `NVIDIA_MODEL`.
- No model-validation network call.
- Do not import `agents.ts` from `config.ts`.

**Run:** `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/config.test.ts`.

**Commit:** `config: bootstrap .env.example and validate required keys`.

---

## Task 6 — Output path + write discipline (spec tests 12, 14)

**Goal:** deterministic output path, directory creation, and "no raw input copy" guarantee.

**Files:**

- `session-digest/src/output.ts`.
- `session-digest/tests/output.test.ts`.

**RED:**

- `test_output_path_uses_input_stem_and_utc_second_timestamp` — assert pattern `<stem>.YYYY-MM-DD-HHMMSS.digest.md` and that the timestamp is UTC (inject a clock).
- `test_two_runs_with_different_input_stems_in_same_second_produce_distinct_paths`.
- `test_output_directory_is_created_when_missing`.
- `test_successful_run_writes_only_the_digest_file_under_session_digests` — after `cli.main`, list every regular file under `<HOME>/.session-digests/` and assert the listing is exactly `[computedDigestPath]`. Additionally assert no file under that dir has the same SHA-256 as the input file (defense in depth against a future feature that adds a second file there). This is a stronger expression of the spec's "exactly one digest file per successful invocation" + "never copy or persist the raw input" than naive bytes-equality, which has rare false-positive modes when a digest body legitimately quotes a small fixture.

> Spec line 179 documents same-input-within-one-second as a non-target case. No test asserts behavior in that scenario; the second-precision timestamp is sufficient for normal interactive use, and v1 is not required to retry on collision.

**GREEN:**

- `computeDigestPath(inputPath, nowUtc, baseDir)` returns the target path.
- `writeDigest(path, body)` creates the parent dir (`fs.mkdir({ recursive: true })`) and writes only the body. No copy of input.
- Inject the clock as a parameter; default to `() => new Date()` returning UTC.
- The `nowUtc` instant is captured **once** at the top of `cli.main` and threaded into both `computeDigestPath` and the front-matter assembler in Task 7. Two `new Date()` calls straddling a second boundary would otherwise let the filename's timestamp diverge from `generated_at`; capturing once removes that flake source.

**Run:** `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/output.test.ts`.

**Commit:** `output: compute timestamped digest path and write body`.

---

## Task 7 — Front matter and body skeleton (spec tests 15, 17)

**Goal:** structural correctness of the generated Markdown.

**Files:**

- `session-digest/src/output.ts` — extend.
- `session-digest/tests/output.test.ts` — extend.

**RED:**

- `test_front_matter_contains_required_keys_with_correct_values`:
  - keys present: `title`, `source_path`, `provider`, `model`, `generated_at`.
  - `title === "Session Digest"` (literal — pinned by ADR-001 front-matter example).
  - `provider === "nvidia_nim"` (literal).
  - `model === <configured NVIDIA_MODEL>`.
  - `source_path === path.resolve(<cli arg>)` (no symlink follow; do NOT use `fs.realpath`). The fixture path passed to `cli.main` MUST be absolute (constructed via `path.join(mkdtemp(), "session.jsonl")`) so `path.resolve` is idempotent and the assertion proves the production contract rather than tautologically matching test-side computation. A relative-path scenario, if needed later, is its own test.
  - `generated_at` matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/` (RFC 3339 / ISO 8601, second precision, literal `Z`).
- `test_generated_at_matches_the_filename_timestamp` — inject a clock returning a fixed `Date`; assert the filename's UTC timestamp seconds equal `generated_at`'s seconds. Pins the single-clock-instant invariant from Task 6 GREEN against future regressions.
- `test_body_contains_six_h2_sections_in_documented_order`:
  - exact sequence: `Session summary`, `Outcome`, `Useful decisions`, `Failure or friction points`, `Next-session improvements`, `Evidence notes`.
  - extracted by regex over `^## ` headers; assert the list equals the expected list.
- `test_body_order_is_independent_of_input_record_iteration_order` — call `assembleDigest` with a `sections` object whose keys are inserted in **reverse** of the documented order; assert the body still emits the documented order. The previous test would pass on an `Object.keys(sections)`-iterating impl (because JS preserves insertion order); this one pins the invariant to the `SECTION_NAMES` tuple — the actual contract.

**GREEN:**

- `assembleDigest(frontMatter: FrontMatter, sections: Record<SectionName, string>): string`.
- `SECTION_NAMES` is a module-level `as const` tuple so the order is single-sourced.
- `FrontMatter` is a `type` with the five required fields; serializer emits YAML between `---` lines (hand-rolled — do not introduce a YAML lib for five string fields).
- `generated_at` is serialized as `new Date(...).toISOString().replace(/\.\d{3}Z$/, "Z")` (drop milliseconds, keep `Z`).

**Run:** `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/output.test.ts`.

**Commit:** `output: assemble front matter and six-section body`.

---

## Task 7.5 — Deep Agents API spike (ends with docs commit)

**Goal:** verify `deepagents` and `@langchain/openai` API shape against actually-installed versions, before any Task 8 RED test is written. This task pays down the integration risk that would otherwise force a Task 8 mid-flight redesign.

**Steps:**

1. From `session-digest/`, install the runtime deps if not yet installed: `deepagents`, `@langchain/openai`, `@langchain/core`.
2. Write a throwaway probe script (e.g., `session-digest/scripts/probe-deepagents.ts`, ignored under `.gitignore` and deleted before the closing commit) that:
   - constructs `createDeepAgent` with three trivial subagents named per ADR-001 (`Extractor`, `Improver`, `Evidence checker`);
   - passes a `FakeListChatModel` (from `@langchain/core/utils/testing`) seeded with ~50 sentinel responses tagged with their array index;
   - invokes the agent on a 3-message fixture;
   - **logs the first 200 chars of every `BaseChatModel._call` `messages[]` argument across the run**, and reports whether any prompt seen by the model contains the literal substring `Extractor`, `Improver`, or `Evidence checker`. This is the load-bearing input for choosing Task 8's fake-LLM strategy below;
   - logs: total `model._call` invocation count, the `name` field accepted by `createDeepAgent` (does it reject spaces? require kebab-case?), and the constructor field names that `ChatOpenAI` accepts for NIM (`apiKey` vs `openAIApiKey`, top-level `baseURL` vs `configuration: { baseURL }`).
3. **Update Task 8's "Architecture" subsection in this plan in place, even when defaults are confirmed.** Write the pinned values verbatim:
   - **Subagent name format** — record the format `createDeepAgent` actually accepted (kebab-case ids vs ADR prose names); if kebab-case is required, document the mapping in `agents.ts`.
   - **Model constructor field names** — record the literal field names accepted by the installed `ChatOpenAI`.
   - **Per-run LLM call count** — record the observed invocation count for the trivial 3-message fixture.
   - **Routing-substring observation** — record whether subagent names appeared in any model-facing prompt. This selects between the two Task 8 fake-LLM strategies.
4. Delete the probe script.
5. Commit (docs-only): `session-digest plan: pin deepagents api findings`.

**Verification:** the four pinned values are written into Task 8's "Architecture" subsection (no `TBD` placeholders) and the commit lands on a green test suite (the existing suite remains green; only docs change).

**Why this task ends with a commit even when "nothing changed":** a spike whose findings live in volatile chat or in a deleted probe script is unauditable. Committing the amendment makes Task 8's pre-condition verifiable by `grep` and preserves the "commit on green every task" gate without carving out an exception.

---

## Task 8 — Deep Agents wiring + happy path (spec tests 10, 11)

**Goal:** end-to-end success with a fake LLM. Subagent prompts are first-class artifacts of this task — quality of the digest is dominated by them.

**Pre-condition:** Task 7.5 has been run and committed; subagent name format, model constructor field names, per-run LLM call count, and the routing-substring observation are pinned in the Architecture subsection below. **Reject this task if any of those values still read as `TBD`** — Task 7.5 must close before Task 8 RED begins.

**Files:**

- `session-digest/src/agents.ts`.
- `session-digest/src/cli.ts` — wire the full flow.
- `session-digest/src/prompts/extractor.md`, `improver.md`, `evidence-checker.md` — checked-in prompt files. Each prompt names its inputs (parsed messages, prior subagent outputs) and the output schema (named sections in a JSON envelope; see "Section extraction strategy" below).
- `session-digest/tests/agents-fake.test.ts`.
- `session-digest/tests/fixtures/session.valid.jsonl`.

**Architecture (per ADR-001):**

- One Deep Agent built via `createDeepAgent` with exactly three subagents matching the ADR-001 roles: Extractor, Improver, Evidence checker. Subagent id format is whatever Task 7.5 pinned (kebab-case if required by the installed `deepagents` version; ADR prose names otherwise). Display labels in prompts always use ADR prose.
- One model instance (`ChatOpenAI` configured for NIM), shared across all subagents — passed via `createDeepAgent`'s `model` option so subagents inherit it.
- No provider abstraction layer — `ChatOpenAI` is constructed directly inside `agents.ts`. Constructor field names are pinned by Task 7.5; if [langchainjs#7356](https://github.com/langchain-ai/langchainjs/issues/7356) bites, switch to nested `configuration: { baseURL }` form per the spike's findings.

**Section extraction strategy (pinned):**

Each subagent's prompt MUST instruct the model to emit a single JSON object as its final response, with the shape:

```
{ "sections": { "<Section Name>": "<markdown body>", ... } }
```

The orchestrator parses each subagent's final message via `withStructuredOutput(z.object({ sections: z.record(z.string()) }))` (or, if `withStructuredOutput` does not chain through `createDeepAgent`, by parsing the final assistant message as JSON inside `agents.run`). Section ownership:

- Extractor → `Session summary`, `Outcome`, `Useful decisions`, `Failure or friction points`.
- Improver → `Next-session improvements`.
- Evidence checker → `Evidence notes`.

The orchestrator merges the three `sections` maps into one `Record<SectionName, string>` and passes it to `assembleDigest`. A missing required section MUST raise an error inside `agents.run` (caught by `cli.main` → non-zero exit). This makes section extraction deterministic and testable with a routing fake.

**Test injection (strategy selected by Task 7.5's routing-substring observation):**

- `agents.buildAgent({ model })` accepts a model object.
- `cli.main` calls `agents.buildAgent({ model: defaultNimModel(config) })`; tests bypass the default by calling `agents.run(messages, fake)` directly.
- **Strategy A — RoutingFake** (use ONLY if Task 7.5 confirmed the substrings `Extractor`, `Improver`, `Evidence checker` appear in at least one model-facing prompt per subagent): a small custom subclass of `BaseChatModel` (or wrapper around `FakeListChatModel`) returns a canned response keyed by substring match on the incoming prompt — when the prompt contains `Extractor`, return the Extractor JSON envelope; same for Improver and Evidence checker. Eliminates dependence on planner call-ordering.
- **Strategy B — SingleEnvelopeFake** (fallback if Task 7.5 found the substrings do NOT reach the model): a counting fake returns one fixed envelope containing **all six sections** in a single response on its first call, and throws on any subsequent call. Loses per-subagent routing fidelity but still tests the merge/assemble path, the section-non-emptiness invariant, and the failure modes below. The "missing required section" RED test (below) becomes "fake returns an envelope missing the `Next-session improvements` key"; the rest of the RED list is unaffected.
- The chosen strategy is recorded in this Architecture subsection during Task 7.5's docs commit.

**RED:**

- `test_valid_session_produces_digest_at_expected_path` — given the fixture and a temp `HOME`, the run writes a Markdown file under `<HOME>/.session-digests/`; file exists; body has the six sections in order.
- `test_stdout_contains_only_created_digest_path` — assert exact equality (path string + single trailing `\n`) and that `stderr` is empty on success.
- `test_each_section_has_at_least_one_non_blank_line_of_content` — for every H2 in the generated digest, assert there is at least one non-blank line between this header and the next (or EOF). This is a structural quality gate that catches the empty-agent failure mode; it does not assert any specific content.
- `test_missing_required_section_in_subagent_output_fails_run` — feed the fake a response missing the `Next-session improvements` section (Strategy A: malformed Improver envelope `{"sections": {}}`; Strategy B: single envelope omitting that key); assert `cli.main` returns non-zero with a concise stderr.
- `test_invalid_creds_fail_on_first_model_call_not_before` — fake model whose first `_call` throws a synthetic auth error. Assert: `loadConfig` succeeded (no throw before agent construction), `agents.run` was entered, `model._call` was reached **exactly once**, and `cli.main` returned non-zero. This pins spec line 113's "no preflight" sequencing invariant — distinguishes "config-time check leaked into a network probe" from "first NIM call failed". Cheap, structural, removes a recurring code-review concern.

**GREEN:**

- Implement `agents.run(messages, model): Promise<Record<SectionName, string>>` (section name → content).
- Write the three prompt files. Each prompt:
  - states its input shape;
  - states its output schema (the JSON envelope `{ "sections": { "<owned section name>": "<markdown>" } }`, with the exact section names this subagent owns enumerated);
  - is referenced from `agents.ts` via `fs.readFileSync(new URL("./prompts/<name>.md", import.meta.url), "utf8")`.
- `cli.main` flow: validate argv → validate input → parse JSONL → load config → capture `nowUtc = new Date()` once → build NIM model from config → run agent → merge sections → assemble digest (passing `nowUtc` to both `computeDigestPath` and the front-matter assembler) → write file → write absolute path to stdout → return 0.

**Run:** `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/agents-fake.test.ts`.

**Commit:** `agents: wire deep agents end-to-end with fake llm test`.

---

## Task 9 — Live NIM smoke test (spec test 13)

**Goal:** at least one local test that **actually calls the NVIDIA NIM endpoint** end-to-end. This is the only test that hits the network; that is intentional, per the spec.

**Files:**

- `session-digest/tests/agents-live.test.ts`.

**Rules:**

- Test is collected and runs unconditionally — no `t.skip`, no `node:test --skip`, no environment-gated skip markers.
- Missing or empty `NVIDIA_API_KEY` or `NVIDIA_MODEL` is a **test failure**, not a skip (spec test 13).
- **Test artifacts MUST NEVER land under the user's actual `~/.session-digests/`.** The credential-reading path and the digest-output path are decoupled in the test setup. The SUT (`cli.main`) only reads creds via `loadConfig(baseDir)` from `<HOME>/.session-digests/.env`; the test materializes that file under a temp `HOME` so there is one source of truth.
- **Credential plumbing (in this exact order):**
  1. Read `NVIDIA_API_KEY` and `NVIDIA_MODEL` from `process.env` if non-empty; otherwise read them from the user's real `$HOME/.session-digests/.env` via `loadConfig`. Fail the test (do not skip) if either value is missing or empty after both sources are consulted.
  2. `mkdtemp()` a `tmpHome`. Write `tmpHome/.session-digests/.env` containing the two values from step 1.
  3. Set `HOME=tmpHome` (or pass `baseDir=tmpHome/.session-digests` if `cli.main` accepts it) for the duration of the run; invoke `cli.main` as the SUT.
  4. After: assert the digest exists under `tmpHome/.session-digests/`, and that the user's real `~/.session-digests/` mtime is unchanged.
- When credentials are present, the test runs the CLI against `session.valid.jsonl` and asserts:
  - exit code 0;
  - a digest file is created under the temp `~/.session-digests/`;
  - the digest contains the six H2 sections in order (structural assertion only — content is non-deterministic);
  - the digest front matter `provider` is `nvidia_nim` and `model` matches the configured `NVIDIA_MODEL`.
- Test is allowed to take real wall-clock time. Use the test-level timeout option: `test("live nim digest", { timeout: 60_000 }, async () => { ... })` so a single NIM round-trip fits.
- Watch for [langchainjs#7356](https://github.com/langchain-ai/langchainjs/issues/7356) (`ChatOpenAI` `baseURL` quirks with Nemotron). If it bites, switch to setting `configuration: { baseURL: "..." }` or update `@langchain/openai`.

**RED → GREEN:**

- Test exists and exercises `cli.main`.
- No production code changes expected unless an integration bug surfaces; if so, fix it minimally inside `agents.ts`.

**Run:** `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/agents-live.test.ts` (requires real `NVIDIA_API_KEY` / `NVIDIA_MODEL`; this test is intentionally not isolated from the network).

**Commit:** `tests: live nim smoke against real endpoint`.

---

## Task 10 — Manual acceptance against the ADR-001 success criterion

**Goal:** the prototype is "successful" only if it produces a usable digest from one real Claude Code session file (ADR-001).

**Steps:**

1. Pick one real Claude Code JSONL session ≤ 1 MB.
2. Ensure `~/.session-digests/.env` has live `NVIDIA_API_KEY` and `NVIDIA_MODEL`.
3. Run: `npx -w session-digest tsx src/cli.ts /absolute/path/to/session.jsonl`.
4. Inspect the resulting digest:
   - All six H2 sections are non-empty.
   - At least one `Next-session improvements` entry is worth reusing (ADR-001 success criterion).
   - `Evidence notes` references concrete record/turn markers.
5. Record the run + verdict in `session-digest/docs/log.md` (create if missing).

**No commit unless step 5 produces a docs change.**

---

## Done criteria

- [ ] All 18 acceptance behaviors in `specs/session-digest.md` "Tests (required)" are covered by passing automated tests, plus the supporting tests added by this plan (section non-emptiness, etc.).
- [ ] `npx tsc --noEmit -p session-digest` is clean.
- [ ] `npx -w session-digest tsx src/cli.ts <path>` produces a digest file matching the spec's filename, front matter, and section structure.
- [ ] The CLI never copies the raw JSONL input.
- [ ] No provider abstraction layer was introduced (`ChatOpenAI` is used directly inside `agents.ts`).
- [ ] Exactly three subagents are configured with the ADR-001 roles: Extractor, Improver, Evidence checker.
- [ ] Three prompt files exist under `src/prompts/` and are referenced from `agents.ts`.
- [ ] One real-session manual run produces a digest with at least one reusable next-session improvement.

## Out of scope (do not pursue without a new ADR)

Per ADR-001 Non-Goals: HTTP surface, watched folder, CI, multi-session, indexing, repo awareness, provider abstraction, scheduling, chunking, generic transcript adapters, redaction, raw-input copying, CLI API-key arguments.
