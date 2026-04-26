---
date: 2026-04-26
model: claude-opus-4-7
description: "Implementation plan for the session-digest CLI prototype defined by ADR-001 and its spec."
---

# Session Digest Implementation Plan

> **For Claude:** Task 1 is scaffold-only harness setup, not a RED/GREEN task: compilation errors are not RED, and the bootstrap test is a runner sanity check. From Task 2 onward, use the `dev-skills:strict-tdd` skill. Each task's RED list is a queue of one-test micro-steps, not a batch: write exactly one listed test, run that one test, confirm a compiling failing assertion for the missing behavior, stop after RED unless the user explicitly approved auto-continue, then write only enough production code to make that one test pass before moving to the next listed test. Each task still ends with a targeted test run, the full task gates, and a commit on a passing state.

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
    clock.ts              # `defaultClock = () => new Date()` — only sanctioned `new Date(` site
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

- Task 1 is non-TDD scaffolding. It exists only to install the workspace, loader, and permanent bootstrap sanity test.
- Strict TDD applies from Task 2 onward. Every `RED` bullet is one independent micro-step:
  1. Add exactly one test from the current task's RED queue.
  2. Run that test by file and test-name pattern, for example `node --import tsx --test session-digest/tests/<file>.test.ts --test-name-pattern '^<test_name>$'`.
  3. Confirm the code compiles and fails by assertion for the missing behavior. Compilation errors are not RED.
  4. Stop after RED unless the user explicitly approved auto-continue for the task.
  5. Implement the minimum production code for that one failing test.
  6. Re-run the same targeted command to reach GREEN.
  7. Repeat with the next RED bullet only after the current one is green.
- TDD: every behavior task starts with one failing test, then minimal code to green, then refactor.
- **Commit on green, every task.** Each task MUST end with a passing-test commit. Do not start the next task until the previous task's commit lands on a green suite. Do not bundle multiple tasks into one commit. Do not commit on red, ever.
- Per-project CI isolation (CLAUDE.md): if any CI is added later, it goes in a dedicated `session-digest-core.yml` workflow — but ADR-001 puts CI out of scope for v1, so this plan does NOT add CI.
- Local targeted test command per task: `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/<file>.test.ts`. Direct tight-loop equivalent: `node --import tsx --test session-digest/tests/<file>.test.ts`.
- Local iteration without NIM creds: `node --import tsx --test session-digest/tests/*.test.ts --test-skip-pattern='live nim'`. The live test (Task 9) is unconditionally collected and unconditionally fails on missing creds per spec test 13; the skip pattern is a developer aid for tight iteration loops on non-live tasks, never a CI gate.
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

## Task 1 — Scaffold the TypeScript workspace (non-TDD setup)

**Goal:** bootable, empty package wired into the root npm workspaces; `tsc --noEmit` and `node --test` both green with one trivially-passing bootstrap test. This task is harness setup, not strict TDD: the bootstrap test verifies test discovery and the `tsx` loader, but it is not a RED for missing product behavior.

**Files:**

- Create `session-digest/package.json`.
- Create `session-digest/tsconfig.json`.
- Create `session-digest/src/cli.ts` (one-line `export {}` placeholder).
- Create `session-digest/.gitignore` (`node_modules/`, `dist/`, `*.log`).
- Create `session-digest/tests/_bootstrap.test.ts` containing a single trivially-passing assertion (`test("bootstrap", () => {})`). This file is **kept permanently**, not deleted in Task 2. It guarantees the test runner has at least one test to discover under directory-based discovery and acts as a sanity check that the `tsx` loader is wired correctly. The leading underscore makes its purpose obvious in alphabetical listings.
- Edit root `package.json`:
  - append `"session-digest"` to `workspaces`;
  - do NOT modify the existing `node --test` invocation in `scripts.test`. Instead, add a new `scripts["test:session-digest"]` entry equal to `node --import tsx --test session-digest/tests/*.test.ts`, and chain it onto `scripts.test` with ` && npm run test:session-digest`. Hoist `tsx` to the root `devDependencies`. This isolates the `tsx` ESM loader to a child process that only walks `session-digest/tests/*.test.ts`, eliminating loader contamination of legacy `oracle/`, `nomos/`, `web-scout/`, `corpus-scout/`, and `scripts/` test paths.
  - Do NOT migrate to `npm test --workspaces --if-present`. The current root `scripts.test` runs tests from non-workspace paths (`oracle/packages/*`, `oracle/apps/*`, `scripts/release/tests/*`, `scripts/tests/*`) that a workspace-delegated form would silently drop. A workspace migration, if desired later, is its own ADR-able change with explicit decisions about those paths.

**`session-digest/package.json` essentials:**

- `name: "session-digest"`, `version: "0.0.1"`, `private: true`, `type: "module"`.
- `engines: { node: ">=20.10 <23" }`.
- Dependencies: `deepagents`, `@langchain/openai`, `@langchain/core`, `dotenv`.
- Dev dependencies: `tsx`, `typescript`, `@types/node`.
- `scripts.test`: `node --import tsx --test tests/*.test.ts`.
- `scripts["test:file"]`: `node --import tsx --test`. This script accepts explicit file paths after `--` and MUST NOT use `--test-only`.
- No `bin` field. The CLI is invoked via `npx -w session-digest tsx src/cli.ts <path>`.

**`tsconfig.json` essentials:**

- `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, `noEmit: true`, `esModuleInterop: true`, `skipLibCheck: true`.

**Steps:**

1. Write `package.json`, `tsconfig.json`, placeholder `src/cli.ts`, `tests/_bootstrap.test.ts`, `.gitignore`.
2. Update root `package.json`: append `"session-digest"` to workspaces; add `scripts["test:session-digest"]` = `node --import tsx --test session-digest/tests/*.test.ts`; chain it onto `scripts.test` by appending ` && npm run test:session-digest` (do NOT alter the legacy `node --test` invocation); hoist `tsx` to root devDeps. Run `npm install` so the workspace links and the lockfile updates.
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

- Export `main(argv: string[], stdout: Writable, stderr: Writable, deps?: MainDeps): Promise<number>` where `MainDeps = { clock?: () => Date; baseDir?: string; fsLike?: Pick<typeof fs.promises, "stat" | "readFile" | "writeFile" | "mkdir"> }`. All `deps` fields are optional; defaults wire at the composition root (this function): `clock = defaultClock` (imported from `./clock.js`, per NodeNext ESM import specifier rules), `baseDir = path.join(os.homedir(), ".session-digests")`, `fsLike = fs.promises`. Tests pass explicit `deps` to control time, output location, and filesystem behavior. **Do not mutate `process.env.HOME` in tests** — `deps.baseDir` is the explicit injection point. This `deps` bag is the single composition-root injection for the entire CLI; later tasks (3, 6, 7, 8, 9) thread its fields into the helpers they introduce, never adding new globals. Task 8 widens `MainDeps` with one optional field (`model?: BaseChatModel`) so the orchestrator's LLM is itself injectable; that widening is documented in Task 8 to keep this task free of LangChain types. No other field is added to `MainDeps` after this task.
- Create `session-digest/src/clock.ts` exporting `export const defaultClock: () => Date = () => new Date();`. This is the **only** sanctioned `new Date(` site in `src/`; it is intentionally segregated so Task 7's static count test (`cli.ts` + `output.ts`) can stay at `0` while still permitting a real default clock at the composition root.
- Parse argv manually (no `commander` / `yargs` — those introduce flag surface). Accept exactly one positional argument; reject any token starting with `-`.
- On violation: write a one-line error to `stderr`, return non-zero.
- **Production code under `src/` MUST write to the injected `stdout`/`stderr` streams. `console.log` and `console.error` are forbidden in `src/**/*.ts`.** This is the structural defense for spec test 11 (stdout contains exactly the digest path).

**Run:**

- `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/cli-args.test.ts`.
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
- `test_eacces_from_stat_maps_to_unreadable_error` — pass a recording `fsLike` stub via `cli.main`'s `deps.fsLike` (Task 2 signature) whose `stat(path)` rejects with `Object.assign(new Error("EACCES"), { code: "EACCES" })`. Assert: `cli.main` returns non-zero, `stderr` carries an `EACCES`-style message, AND the stub recorded a `stat` call with the input path. Recording the call is what ties the test to production — without it, a regression where `validateInputPath` reaches around `fsLike` to `import * as fs from "node:fs"` would still pass. This formulation is portable across root, Docker, macOS ACLs, and CI; the previous parent-mode-000 approach was none of those things.
- `test_validate_input_path_invokes_injected_fs_stat_on_happy_path` — pass a recording `fsLike` stub whose `stat(path)` resolves with a regular-file `Stats` (`isFile() === true`, `size === 100`). After `validateInputPath` returns, assert the stub recorded `stat` was called with the input path. Pairs with the EACCES test above to enforce that production goes through the injection on **both** branches; without this complement, the EACCES test alone does not prove the injection point is wired and a buggy impl could ignore `fsLike` entirely on the success path.
- `test_empty_file_returns_error` (write zero bytes).
- `test_file_over_one_megabyte_returns_oversize_error` (write 1 MB + 1 byte). Also asserts `stderr` contains the substring `1 MB` to pin the user-facing wording without locking exact prose.

Each test asserts: non-zero exit through `cli.main`, concise message on `stderr`, no output file written under a temp `baseDir`.

**GREEN:**

- `validateInputPath(path: string, fsLike: Pick<typeof fs.promises, "stat">): Promise<void>` throws a typed `InputError` per failure mode; `cli.main` catches and translates to `(exitCode, stderrMessage)`. `fsLike` is supplied by `cli.main` from `deps.fsLike ?? fs.promises` (Task 2 signature). Production code under `inputs.ts` MUST route every fs operation through `fsLike` — direct `import * as fs from "node:fs"` inside `inputs.ts` is a layering violation that the happy-path recording test is designed to catch.
- 1 MB constant lives in `inputs.ts` as a module-level `const ONE_MB = 1024 * 1024`; size and file-type checks both use `fsLike.stat`. After `stat`, branch on `stat.isFile()` (false → `InputError.NotAFile`) before checking size. Broken symlinks surface as `ENOENT` from `stat` and map to `InputError.MissingFile`. `EACCES` from `stat` (or any subsequent `fsLike.open`/`fsLike.readFile`) maps to `InputError.Unreadable`.

**Run:** `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/inputs.test.ts`.

**Commit:** `cli: validate input file presence, readability, size`.

---

## Task 4 — JSONL parsing rules (spec tests 5, 6, 18)

**Goal:** best-effort JSONL extraction matching the spec's pinned lenient semantics and Claude Code message shape.

**Files:**

- `session-digest/src/inputs.ts` — extend with `parseSession(path: string, fsLike: Pick<typeof fs.promises, "readFile">): Promise<Message[]>` where `Message = { role: string; content: string }` (post-flatten). `fsLike` is the same injection point established in Task 3; `cli.main` (Task 8) supplies it from `deps.fsLike ?? fs.promises`.
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
- `test_parse_session_invokes_injected_fs_read_file_on_happy_path` — call `parseSession(path, recordingStub)` **directly** (no `cli.main` — wiring is deferred to Task 8). The stub's `readFile(path, "utf8")` resolves with the contents of `session.valid.jsonl`. After `parseSession` returns, assert the stub recorded `readFile` called with the input path. This pins the injection on the success branch so a regression that bypasses `fsLike` (e.g. `import * as fs from "node:fs"` inside `parseSession`) cannot pass — mirroring the `validateInputPath` happy-path stub from Task 3.
- `test_parse_session_eacces_from_read_file_maps_to_unreadable_error` — call `parseSession(path, recordingStub)` directly. The stub's `readFile` rejects with `Object.assign(new Error("EACCES"), { code: "EACCES" })`. Assert `parseSession` rejects with `InputError.Unreadable` and the stub recorded one `readFile` call with the input path. This pins the EACCES-from-`readFile` branch that Task 3 GREEN already promises but does not test.

**GREEN:**

- Production code in `parseSession` MUST route every fs read through the injected `fsLike`. Direct `import * as fs from "node:fs"` inside this function is a layering violation that the happy-path recording test is designed to catch. (Mirrors Task 3 GREEN's `inputs.ts` discipline for `validateInputPath`.)
- Read full contents via `fsLike.readFile(path, "utf8")`, then split on `/\r?\n/`. The 1 MB ceiling is enforced by `validateInputPath` (Task 3) before `cli.main` reaches `parseSession`, so whole-file reads are bounded. Streaming/`readline` is not used, since it would require widening `fsLike` to include `createReadStream`.
- Lines that are empty after `.trim()` are skipped silently.
- Lines that fail `JSON.parse` are skipped silently. Track a counter of "parsed JSON values"; if zero non-blank lines parse, raise `InputError.NonJsonl`.
- UTF-8 BOM handling is intentionally not special-cased in v1. A BOM on the first line makes that line fail `JSON.parse`, and the existing lenient skip-on-parse-error semantics decide the result: later usable records can still succeed; otherwise the file falls into the same `NonJsonl` or `NoUsableMessages` error paths as any other skipped first line.
- For each parsed JSON value, evaluate against the spec's "usable Claude Code message" shape: `record.type ∈ {"user","assistant"}`, `record.message.role` is a non-empty string, and `flattenContent(record.message.content)` returns a non-empty string. `flattenContent`:
  - if `content` is a string, return it;
  - if `content` is an array, return the concatenation of `block.text` for each entry where `block.type === "text"` and `block.text` is a non-empty string;
  - otherwise return `""`.
- Records of any other shape (including `tool_use`, `tool_result`, `system`, summary, unknown) are skipped without error.
- Zero usable messages after at least one parsed line → `InputError.NoUsableMessages`.

**Run:** `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/inputs.test.ts`.

**Commit:** `inputs: parse JSONL best-effort with whitespace tolerance`.

---

## Task 5 — Config bootstrap and validation (spec tests 7, 8, 9)

**Goal:** `.env` discovery + `.env.example` bootstrap + required-key checks.

**Files:**

- `session-digest/src/config.ts`.
- `session-digest/tests/config.test.ts`.

**Test isolation:** pass an explicit `baseDir` argument so `~/.session-digests/` resolves under `mkdtemp()`; do not mutate `HOME`. Failure-mode tests (EACCES, write-side wiring, `process.env` non-mutation) inject a recording `fsLike` stub instead of touching real fs, mirroring Task 3's pattern. Provide a small fixture helper that yields the resolved config dir for any happy-path tests that still use real fs.

**RED:**

- `test_missing_env_creates_env_example_via_injected_fs_writefile` — recording `fsLike` stub: `readFile(<baseDir>/.env, "utf8")` rejects with `Object.assign(new Error("ENOENT"), { code: "ENOENT" })`; `writeFile` resolves. Assert: `loadConfig` rejects with `ConfigError` whose message contains the substring `.env.example`; the stub recorded exactly one `writeFile` call with path `<baseDir>/.env.example`, the documented body, **and `options.flag === "wx"`** (exclusive-create flag pins the no-overwrite contract structurally — without this assertion, an impl that omits the flag passes the test while silently clobbering an existing `.env.example`); the stub recorded **no** `writeFile` to `<baseDir>/.env` (spec: never create real `.env` with empty secrets). This test pins the bootstrap branch's injection — without recording the `writeFile` call, an impl that bypasses `fsLike` for the write would still pass.
- `test_missing_env_with_existing_env_example_does_not_overwrite_and_emits_same_error` — stub `readFile(.env)` rejects ENOENT; stub `writeFile` rejects with `Object.assign(new Error("EEXIST"), { code: "EEXIST" })` (simulates `.env.example` already on disk). Assert: `loadConfig` rejects with the **same** `ConfigError` substring `.env.example` as the bootstrap-success test (user-facing wording is identical either way — the user's action item is the same: fill in `.env`); stub recorded exactly one `writeFile` attempt at `<baseDir>/.env.example` with `flag: "wx"`. Pins the "do not overwrite; emit the same `ConfigError` and proceed" contract.
- `test_missing_api_key_returns_error` — stub `readFile` resolves with a `.env` body containing `NVIDIA_MODEL=foo` only. Assert `loadConfig` rejects with `ConfigError` whose message contains the substring `NVIDIA_API_KEY`.
- `test_missing_model_returns_error` — symmetric; stub `readFile` resolves with `NVIDIA_API_KEY=k` only; substring `NVIDIA_MODEL`.
- `test_load_config_eacces_on_env_read_returns_config_error` — stub `readFile` rejects with `Object.assign(new Error("EACCES"), { code: "EACCES" })`. Assert `ConfigError` whose message contains the substring `permission` (distinct from the `.env.example` and `NVIDIA_*` substrings above so the three error branches are reviewably distinguishable); stub recorded exactly one `readFile` at `<baseDir>/.env` and **zero** `writeFile` calls. Closes the EACCES-on-`.env` branch that Task 3's discipline already promises but that real-fs tests cannot reach on a stock dev box.
- `test_load_config_invokes_injected_fs_read_file_on_happy_path` — stub `readFile` resolves with a valid `.env` body (`NVIDIA_API_KEY=k\nNVIDIA_MODEL=m`). After `loadConfig` resolves, assert the returned value equals `{apiKey: "k", model: "m"}` AND the stub recorded one `readFile` at `<baseDir>/.env`. Pairs with the EACCES test to enforce injection on **both** branches; without this complement, a buggy impl could ignore `fsLike` on the success path (mirrors Task 3 line 199).
- `test_load_config_does_not_mutate_process_env` — stub `readFile` resolves with `NVIDIA_API_KEY=sentinel-${randomUUID()}\nNVIDIA_MODEL=m`. After `loadConfig` resolves, assert `process.env.NVIDIA_API_KEY` does not equal the sentinel value. Confirms `dotenv.parse(buffer)` is used and `dotenv.config()` is not — `process.env` must remain untouched so successive tests cannot leak credentials between fixtures.

> The "no preflight call" rule from spec line 111 is a sequencing invariant: invalid creds MUST surface on the first NIM call, not before. A structural defense IS added in Task 8 (`test_invalid_creds_fail_on_first_model_call_not_before`): a fake model whose first `_call` throws asserts `cli.main` reaches `agents.run` and exits non-zero only after the model is invoked exactly once. This distinguishes "preflight ran" from "first NIM call failed" cheaply and closes spec line 113. The complementary structural check — `config.ts` does not import `agents.ts` — remains a PR-review concern.

**GREEN:**

- `loadConfig(baseDir: string, fsLike: Pick<typeof fs.promises, "readFile" | "writeFile">): Promise<Config>` returns `{ apiKey, model }` or rejects with `ConfigError`. `fsLike` is supplied by `cli.main` from `deps.fsLike ?? fs.promises` (Task 2 signature; line 168's `Pick` set already covers `readFile | writeFile`, no widening needed). Production code in `loadConfig` MUST route every fs operation through `fsLike` — direct `import * as fs from "node:fs"` inside `config.ts` is a layering violation that the recording-stub tests above are designed to catch (mirrors Task 3 GREEN's `inputs.ts` discipline for `validateInputPath`).
- Read `.env` via a single `await fsLike.readFile(path.join(baseDir, ".env"), "utf8")`. Map errors by `code`: `ENOENT` → bootstrap branch: `await fsLike.writeFile(path.join(baseDir, ".env.example"), body, { flag: "wx" })`; if that rejects with `EEXIST`, swallow it (the example already exists; do not overwrite — preserve any user comments or annotations); other errors from this `writeFile` rethrow. In either bootstrap sub-case (newly written or already existed), throw `ConfigError("create ~/.session-digests/.env from .env.example")` so the user sees an identical action item. `EACCES` from the `.env` read → `ConfigError("cannot read ~/.session-digests/.env: permission denied")`; other `readFile` errors rethrow. The single-syscall read probe avoids a `stat`+`read` TOCTOU and keeps the `Pick` set minimal (no `stat` needed); `<baseDir>` is guaranteed to exist by `cli.main`'s preflight `mkdir` (Task 8 GREEN flow), so `loadConfig` does not need to `mkdir` itself.
- Parse the body with `dotenv.parse(buffer)` — pure, returns a plain object, never mutates `process.env`. Do **not** call `dotenv.config()`.
- If parsed `NVIDIA_API_KEY` is absent or empty → `ConfigError` whose message contains `NVIDIA_API_KEY`. Same for `NVIDIA_MODEL`.
- No model-validation network call.
- Do not import `agents.ts` from `config.ts`.

**Run:** `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/config.test.ts`.

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

- `computeDigestPath(inputPath, nowUtc, baseDir)` returns the target path. `nowUtc` is a `Date` value (not a clock function) — the clock lives at `cli.main`'s composition root via `deps.clock` (Task 2 signature).
- `writeDigest(path, body, fsLike)` creates the parent dir (`fsLike.mkdir({ recursive: true })`) and writes only the body via `fsLike.writeFile`. No copy of input. `fsLike` flows in from `cli.main`.
- `cli.main` calls `clock()` **exactly once**, stores the result as `nowUtc`, and threads the same instant into both `computeDigestPath` and the front-matter assembler in Task 7. Two `new Date()` calls straddling a second boundary would otherwise let the filename's timestamp diverge from `generated_at`; one call removes that flake source. The single-call invariant is enforced at runtime by Task 7's advancing-clock test and statically by Task 7's `test_cli_main_and_output_contain_no_direct_date_construction` check (which forbids `new Date(` and `Date.now(` in `cli.ts` + `output.ts`; the only sanctioned `Date` construction lives in `clock.ts`).

**Run:** `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/output.test.ts`.

**Commit:** `output: compute timestamped digest path and write body`.

---

## Task 7 — Front matter and body skeleton (spec tests 15, 17)

**Goal:** structural correctness of the generated Markdown.

**Files:**

- `session-digest/src/output.ts` — extend.
- `session-digest/src/sections.ts` — shared section constants and types.
- `session-digest/tests/output.test.ts` — extend.

**RED:**

- `test_front_matter_contains_required_keys_with_correct_values`:
  - keys present: `title`, `source_path`, `provider`, `model`, `generated_at`.
  - `title === "Session Digest"` (literal — pinned by ADR-001 front-matter example).
  - `provider === "nvidia_nim"` (literal).
  - `model === <configured NVIDIA_MODEL>`.
  - `source_path === path.resolve(<cli arg>)` (no symlink follow; do NOT use `fs.realpath`). The fixture path passed to `cli.main` MUST be absolute (constructed via `path.join(mkdtemp(), "session.jsonl")`) so `path.resolve` is idempotent and the assertion proves the production contract rather than tautologically matching test-side computation. A relative-path scenario, if needed later, is its own test.
  - `generated_at` matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/` (RFC 3339 / ISO 8601, second precision, literal `Z`).
- `test_clock_is_invoked_at_most_once_and_filename_matches_generated_at` — pass `deps.clock` to `cli.main` as a recording stub that returns strictly increasing instants on successive calls (`t0`, `t0 + 5s`, `t0 + 10s`, ...). After `cli.main` returns 0, assert: (a) `clock.callCount === 1` (the load-bearing assertion — catches an impl that calls the injected clock more than once and would diverge filename from `generated_at`), AND (b) the filename's UTC second-truncation equals the `generated_at` second-truncation. A fixed-instant clock cannot catch a multi-call impl because both calls return the same value; an advancing clock with a call-count assertion catches the actual bug class.
- `test_cli_main_and_output_contain_no_direct_date_construction` — static check: read `session-digest/src/cli.ts` and `session-digest/src/output.ts` as text and count occurrences of `new Date(` and `Date.now(`. Assert the combined count across both files is `0`. The serializer must use the already-`Date`-typed `nowUtc` parameter (`nowUtc.toISOString()`) and the composition root must use `defaultClock` from `./clock.js` — neither file is allowed to construct a `Date` directly. `clock.ts` is the single sanctioned `new Date(` site and is excluded from the count by construction (it is not in the file list). Without this segregation, runtime tests cannot catch a bypass impl whose two `new Date()` calls land in the same millisecond. Excluded from the count: occurrences inside `/* */` or `//` comments, and inside string literals (use a tolerant regex; pin the exact pattern in the test source so review can verify it isn't over-permissive).
- `test_default_clock_file_contains_single_sanctioned_date_constructor` — static check: read `session-digest/src/clock.ts` as text and assert it contains exactly the single exported default clock implementation `export const defaultClock: () => Date = () => new Date();` and no `Date.now(` occurrence. This pins the file that Task 7's broader static check intentionally excludes; without it, an implementor could add a second date constructor inside `clock.ts` and still pass the `cli.ts` + `output.ts` scan.
- `test_body_contains_six_h2_sections_in_documented_order`:
  - exact sequence: `Session summary`, `Outcome`, `Useful decisions`, `Failure or friction points`, `Next-session improvements`, `Evidence notes`.
  - extracted by regex over `^## ` headers; assert the list equals the expected list.
- `test_body_order_is_independent_of_input_record_iteration_order` — call `assembleDigest` with a `sections` object whose keys are inserted in **reverse** of the documented order; assert the body still emits the documented order. The previous test would pass on an `Object.keys(sections)`-iterating impl (because JS preserves insertion order); this one pins the invariant to the `SECTION_NAMES` tuple — the actual contract.

**GREEN:**

- `assembleDigest(frontMatter: FrontMatter, sections: Record<SectionName, string>): string`.
- `SECTION_NAMES` lives in `sections.ts` as a module-level `as const` tuple so the order is single-sourced across output assembly, agent merging, and prompt rendering.
- `SectionName` is derived from `SECTION_NAMES` (`type SectionName = typeof SECTION_NAMES[number]`); no duplicate section-name union is hand-written.
- `FrontMatter` is a `type` with the five required fields; serializer emits YAML between `---` lines (hand-rolled — do not introduce a YAML lib for five string fields).
- `generated_at` is serialized as `nowUtc.toISOString().replace(/\.\d{3}Z$/, "Z")` (drop milliseconds, keep `Z`). `nowUtc: Date` is threaded in from `cli.main` (Task 6 GREEN) — the front-matter assembler MUST NOT call `new Date(...)` itself; doing so would both duplicate the clock reach and break Task 7 RED's static count assertion.

**Run:** `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/output.test.ts`.

**Commit:** `output: assemble front matter and six-section body`.

---

## Task 7.5 — Deep Agents API spike + architecture amendment (ends with docs commit)

**Goal:** observe `deepagents` and `@langchain/openai` API behavior against the actually-installed versions, and write a binding architecture amendment that either confirms or replaces Task 8's section-ownership model. The amendment is the gate for Task 8 — if it contradicts the assumed model, Task 8's RED list is redrafted before any test is written.

**Why this is bigger than a "spike":** Task 8 currently assumes (a) `createDeepAgent` exposes per-subagent JSON envelopes the orchestrator can merge by ownership, and (b) section-ownership is a viable extraction strategy. Both are unverified. If either fails, "merge by subagent identity" is meaningless and a different extraction strategy must be designed. Pretending otherwise pushes architectural risk into the middle of Task 8 RED. An amendment file (not an in-place edit) is required because observed findings may *replace* prior assumptions, not just fill them in.

**Steps:**

1. Verify the runtime deps installed by Task 1 are present in the workspace: `npm ls -w session-digest deepagents @langchain/openai @langchain/core`.
2. Write a throwaway probe script (e.g., `session-digest/scripts/probe-deepagents.ts`) that:
   - constructs `createDeepAgent` with three trivial subagents named per ADR-001 (`Extractor`, `Improver`, `Evidence checker`);
   - passes a recording `FakeListChatModel` (from `@langchain/core/utils/testing`) seeded with ~50 sentinel responses tagged with their array index; if exhausted, log the observed call count and re-run with a larger array rather than failing silently;
   - invokes the agent on a 3-message fixture;
   - logs the first 200 chars of every `BaseChatModel._call` `messages[]` argument across the run, and reports whether any prompt seen by the model contains the literal substring `Extractor`, `Improver`, or `Evidence checker`;
   - logs the **structure of the agent's return value**: per-subagent outputs the orchestrator can attribute by subagent identity, vs a single aggregated final message, vs something else;
   - logs total `model._call` invocation count, the `name` field accepted by `createDeepAgent` (does it reject spaces? require kebab-case?), the constructor field names that `ChatOpenAI` accepts for NIM (`apiKey` vs `openAIApiKey`, top-level `baseURL` vs `configuration: { baseURL }`), and the installed-version import subpath for `BaseChatModel` (for example, `@langchain/core/language_models/chat_models` vs `@langchain/core/language_models`).
3. Write `session-digest/docs/plans/session-digest-architecture-amendment.md` with required front matter (`date`, `model`, `description` per CLAUDE.md markdown conventions) and these four required sections:
   - **API observations** — the pinned values verbatim: subagent name format accepted, `ChatOpenAI` constructor field names, `BaseChatModel` import subpath, per-run LLM call count for the 3-message fixture, routing-substring observation, final-message structure. End with an **Other findings** subsection for anything observed that the predefined questions did not anticipate (this is the explicit slot for unknown unknowns).
   - **Section-extraction strategy decision** — explicitly answer: *does `createDeepAgent` expose per-subagent outputs the orchestrator can attribute to a specific subagent?* If YES, confirm Task 8's section-ownership model. If NO, propose the replacement strategy (e.g., "single prompt asking the model for all six sections in one envelope; ADR-001's three-subagent invariant becomes a generation-time concern, not an extraction-time concern"). The decision is binding for Task 8.
   - **Fake-LLM strategy** — name the strategy Task 8 will use (RoutingFake, IdempotentEnvelopeFake, or other) and justify it against the API observations. RoutingFake requires the routing-substring observation = YES. IdempotentEnvelopeFake means each subagent sees the same envelope on every call and the orchestrator filters by subagent identity (only viable if per-subagent attribution exists). A third option may be introduced if findings demand it.
   - **Task 8 redraft required?** — explicit `YES` or `NO`. If `YES`, list the specific subsections of Task 8 that must be redrafted (Architecture / Section extraction strategy / Test injection / RED tests / GREEN flow) before its RED begins.
4. Delete the probe script.
5. Commit (docs-only): `session-digest plan: deepagents architecture amendment`.

**Verification:** the amendment file exists under `session-digest/docs/plans/`, has the required front matter, and contains explicit (not `TBD`) answers in all four required sections. Gate command: `test -f session-digest/docs/plans/session-digest-architecture-amendment.md && ! grep -E '^\s*(YES|NO|.*: )TBD\b' session-digest/docs/plans/session-digest-architecture-amendment.md`. The commit lands on a green test suite (only docs change).

**Why a separate amendment file rather than editing Task 8 in place:** observed findings may invalidate Task 8's premises. An amendment can replace, not just fill in, prior assumptions; an in-place edit cannot. Reviewers can also diff the amendment against Task 8 to see exactly which assumptions changed and why.

---

## Task 8 — Deep Agents wiring + happy path (spec tests 10, 11)

**Goal:** end-to-end success with a fake LLM. Subagent prompts are first-class artifacts of this task — quality of the digest is dominated by them.

**Pre-condition:** Task 7.5 has been run and committed, and `session-digest/docs/plans/session-digest-architecture-amendment.md` exists with explicit (not `TBD`) answers in its four required sections. **If the amendment's "Task 8 redraft required?" section says `YES`, redraft the listed subsections of this Task 8 as a docs-only commit *before* any RED test is written.** The amendment supersedes any architectural assumptions in the rest of Task 8 if they conflict — the prose below describes the *expected default* (section-ownership model) but is provisional until the amendment confirms it.

**Files:**

- `session-digest/src/agents.ts` — exports `agents.run(messages, model)`, `agents.buildAgent({ model })`, and `defaultNimModel(config: Config): ChatOpenAI`. `defaultNimModel` constructs `ChatOpenAI` directly using the field names pinned by Task 7.5's amendment (no provider abstraction, no wrapper). Dependency direction: `agents.ts → config.ts` (agents imports `Config`); never the reverse. `agents.ts` is necessarily NIM-aware per ADR-001's no-abstraction rule — this is by design, not a layering violation.
- `session-digest/src/cli.ts` — wire the full flow; composition root for `MainDeps` (Task 2 signature).
- `session-digest/src/prompts/extractor.md`, `improver.md`, `evidence-checker.md` — checked-in prompt template files. Each prompt names its inputs (parsed messages, prior subagent outputs) and the output schema via an owned-section placeholder rendered from `SECTION_OWNERS`; prompt files MUST NOT manually duplicate literal owned section names. The exact prompt-shape is provisional pending Task 7.5's amendment — if the amendment changes the section-extraction strategy, prompts are redrafted accordingly.
- `session-digest/src/sections.ts` — extended with `SECTION_OWNERS`, keyed by ADR role labels and typed from `SectionName`.
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

The orchestrator parses each subagent's final message via `withStructuredOutput(z.object({ sections: z.record(z.string()) }))` (or, if `withStructuredOutput` does not chain through `createDeepAgent`, by parsing the final assistant message as JSON inside `agents.run`). Section ownership is represented once in `SECTION_OWNERS`:

- Extractor → `Session summary`, `Outcome`, `Useful decisions`, `Failure or friction points`.
- Improver → `Next-session improvements`.
- Evidence checker → `Evidence notes`.

The orchestrator merges the three `sections` maps into one `Record<SectionName, string>` and passes it to `assembleDigest`. A missing required section MUST raise an error inside `agents.run` (caught by `cli.main` → non-zero exit). A required section whose flattened body has zero non-blank lines MUST be treated as missing and raised through the same error path; empty strings and whitespace-only strings are not valid extracted sections. This makes section extraction deterministic and testable with a routing fake.

**Test injection (provisional — superseded by Task 7.5's amendment "Fake-LLM strategy" section if it names a different approach):**

- **`MainDeps` is widened in this task** with `model?: BaseChatModel` (imported from the `BaseChatModel` subpath pinned by Task 7.5's amendment; expected default is `import type { BaseChatModel } from "@langchain/core/language_models/chat_models"`). This is the only post-Task-2 addition to the deps bag.
- `agents.buildAgent({ model })` accepts a model object.
- `cli.main` resolves `model = deps.model ?? defaultNimModel(config)` after `loadConfig` returns, then calls `agents.buildAgent({ model })`.
- Spec tests 10, 11, and 13's sequencing satisfier MUST go through `cli.main` with `deps.model` set to the fake — they are end-to-end tests of the composition root. Direct unit tests of `agents.run` (e.g., merge logic, missing-section error class) are allowed but do not satisfy spec tests 10/11/13.
- `defaultNimModel(config)` MUST be a pure constructor: build the LangChain client object, store creds, do NOT probe the endpoint. Any network I/O at construction time breaks the "no preflight" invariant (spec line 113).
- **Strategy A — RoutingFake** (viable only if the amendment confirms subagent-name substrings reach the model AND per-subagent attribution exists in the return value): a small custom subclass of `BaseChatModel` (or wrapper around `FakeListChatModel`) returns a canned response keyed by substring match on the incoming prompt — when the prompt contains `Extractor`, return the Extractor JSON envelope; same for Improver and Evidence checker.
- **Strategy B — IdempotentEnvelopeFake** (viable only if the amendment confirms per-subagent attribution exists but substrings do NOT reach the model): a fake whose `_call` returns the **same** envelope on **every** invocation. The envelope contains all six sections. Each subagent sees the same envelope; the orchestrator filters the merge by subagent identity (Extractor → owns 4 sections, Improver → 1, Evidence checker → 1). The "missing required section" RED test removes the `Next-session improvements` key from the shared envelope. Loses the ability to detect "orchestrator routed Improver's response to Evidence checker" (since responses are identical) — that bug is only catchable under Strategy A.
- **Strategy C — single-call envelope** (viable if the amendment finds NO per-subagent attribution at all — `createDeepAgent` returns one aggregated final message): the architecture collapses to one model call returning all six sections; the section-ownership model is replaced and Task 8's RED list is redrafted. This case forces the amendment's "Task 8 redraft required?" answer to `YES`.
- The chosen strategy is named in the amendment's "Fake-LLM strategy" section before Task 8 RED begins.

**RED:**

Each RED test below seeds a placeholder `<tmpHome>/.session-digests/.env` containing `NVIDIA_API_KEY=fake` and `NVIDIA_MODEL=fake` so `loadConfig` succeeds. The injected `deps.model` makes the placeholder values unused at runtime; their only purpose is to let the config-loading stage of `cli.main` complete without a real key on the dev box.

- `test_valid_session_produces_digest_at_expected_path` — given the fixture, a temp `baseDir`, and `deps.model = fake`, calling `cli.main(argv, stdout, stderr, deps)` writes a Markdown file under `<baseDir>/`; file exists; body has the six sections in order. **No `process.env.HOME` mutation; no direct call to `agents.run`.**
- `test_stdout_contains_only_created_digest_path` — assert exact equality (path string + single trailing `\n`) and that `stderr` is empty on success.
- `test_each_section_has_at_least_one_non_blank_line_of_content` — for every H2 in the generated digest, assert there is at least one non-blank line between this header and the next (or EOF). This is a structural quality gate that catches the empty-agent failure mode; it does not assert any specific content.
- `test_missing_or_blank_required_section_in_subagent_output_fails_run` — feed the fake a response where `Next-session improvements` is absent, then a response where it is present but empty (`""`), and then a response where it is present but whitespace-only. Strategy A: malformed Improver envelopes such as `{"sections": {}}`, `{"sections": {"Next-session improvements": ""}}`, and `{"sections": {"Next-session improvements": " \n\t "}}`; Strategy B: the same malformed shapes in the shared envelope. For each case, assert `cli.main` returns non-zero with the same concise stderr/error class. Test calls `cli.main` with `deps.model = fake`; does NOT call `agents.run` directly.
- `test_invalid_creds_fail_on_first_model_call_not_before` — `deps.model` is a fake whose `_call` throws a synthetic auth error on first invocation, with a counter on `_call` invocations. Call `cli.main(argv, stdout, stderr, deps)`. Assert: `loadConfig` succeeded (the fake's call counter would be `0` if config had thrown first), `_call` counter is exactly `1`, and `cli.main` returned non-zero. This pins spec line 113's "no preflight" sequencing invariant — the fake substitutes for the real NIM endpoint, so this is a sequencing assertion, not an auth assertion. Real-credential auth is covered by Task 9.
- `test_build_agent_does_not_call_model_before_run` — pass a fake model that records `_call` invocations, call `agents.buildAgent({ model })`, and assert the model call count is still `0` before invoking `agents.run`. This separates construction-time purity from the "first model call fails" CLI sequencing test above; a preflight hidden inside `buildAgent` would otherwise be hard to distinguish from the first real `agents.run` call.
- `test_default_nim_model_is_pure_constructor` — call `defaultNimModel({ apiKey: "fake", model: "fake" })` directly and assert it returns a `ChatOpenAI` instance without throwing an auth/network error. The test MUST NOT make a real HTTP request; it is a structural guard that `defaultNimModel` only stores configuration and leaves invalid-credential failures to the first NIM call.
- `test_first_run_with_missing_basedir_writes_env_example_and_exits_with_bootstrap_error` — set `deps.baseDir = path.join(mkdtemp(), "session-digests-subdir")` (parent exists, subdir does NOT); do not seed `.env` or `.env.example`. Call `cli.main(argv, stdout, stderr, deps)` with the valid fixture and `deps.model = fake`. Assert: `cli.main` returns non-zero; `stderr` contains the substring `.env.example`; `<baseDir>` now exists on disk; `<baseDir>/.env.example` exists on disk with the documented body; no other files exist under `<baseDir>`. Pins the preflight `mkdir(baseDir, { recursive: true })` step — without it, the first-run flow rejects with raw `ENOENT` from `writeFile` instead of the user-facing bootstrap `ConfigError`, silently reopening the missing-baseDir regression.
- `test_rendered_prompts_use_section_owners_without_manual_section_name_drift` — render all three prompt templates through the production prompt renderer. Assert each rendered prompt includes exactly the section names owned by its ADR role (`Extractor`, `Improver`, `Evidence checker`) and no other `SECTION_NAMES` values. Also read the raw prompt template files and assert none of them contains any literal `SECTION_NAMES` value; they must contain only the owned-section placeholder. This pins prompt section names to `SECTION_OWNERS` instead of duplicated prose.

**GREEN:**

- Implement `agents.run(messages, model): Promise<Record<SectionName, string>>` (section name → content). Validation happens before calling `assembleDigest`: for each `SECTION_NAMES` entry, require at least one non-blank line after flattening the section body; treat absent, empty, and whitespace-only values as the same missing-section error.
- Implement `renderPrompt(role, template)` (or equivalent local helper) that replaces the owned-section placeholder with section names derived from `SECTION_OWNERS[role]`. The rendered text, not the raw template, is passed to Deep Agents.
- Write the three prompt template files. Each prompt:
  - states its input shape;
  - states its output schema (the JSON envelope `{ "sections": { "<owned section name>": "<markdown>" } }`, with exact owned section names rendered from `SECTION_OWNERS`, not typed manually in the prompt file);
  - is referenced from `agents.ts` via `fs.readFileSync(new URL("./prompts/<name>.md", import.meta.url), "utf8")`.
- `cli.main` flow: validate argv → resolve `baseDir = deps.baseDir ?? path.join(os.homedir(), ".session-digests")` → resolve `clock = deps.clock ?? defaultClock` (imported from `./clock.js`, per NodeNext ESM import specifier rules) and `fsLike = deps.fsLike ?? fs.promises` → validate input (passing `fsLike`) → parse JSONL (passing `fsLike`) → `await fsLike.mkdir(baseDir, { recursive: true })` (preflight: ensures `<baseDir>` exists for `loadConfig`'s `.env.example` bootstrap on first run; idempotent on subsequent runs; uses the `mkdir` already declared in `MainDeps.fsLike` Pick set at line 168 — no widening) → `await loadConfig(baseDir, fsLike)` (Task 5 signature; `loadConfig` is `async` and routes all `.env` reads/`.env.example` writes through `fsLike`) → call `clock()` **exactly once**, store as `nowUtc` → resolve `model = deps.model ?? defaultNimModel(config)` (pure constructor; no network) → run agent with `model` → merge sections → assemble digest (passing `nowUtc` to both `computeDigestPath` and the front-matter assembler) → write file under `baseDir` (passing `fsLike`) → write absolute path to stdout → return 0.

**Run:** `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/agents-fake.test.ts`.

**Commit:** `agents: wire deep agents end-to-end with fake llm test`.

---

## Task 9 — Live NIM smoke test (spec test 13)

**Goal:** at least one local test that **actually calls the NVIDIA NIM endpoint** end-to-end. This is the only test that hits the network; that is intentional, per the spec.

**Files:**

- `session-digest/tests/agents-live.test.ts`.

**Rules:**

- Test is collected and runs unconditionally — no `t.skip`, no `node:test --skip`, no environment-gated skip markers.
- Missing or empty `NVIDIA_API_KEY` or `NVIDIA_MODEL` is a **test failure**, not a skip (spec test 13).
- **Test artifacts MUST NEVER land under the user's actual `~/.session-digests/`.** The real-home credential-discovery path is read-only, and the digest-output path is decoupled in the test setup. The test copies resolved credentials into a temp `baseDir` and invokes the SUT (`cli.main`) with that explicit `deps.baseDir`, so any CLI bootstrap/write behavior is confined to the temp directory.
- **Credential plumbing (in this exact order):**
  1. Read `NVIDIA_API_KEY` and `NVIDIA_MODEL` from `process.env`; for any missing value, read the user's real `$HOME/.session-digests/.env` with a read-only test helper using `fs.readFile` and `dotenv.parse`. Do **not** call `loadConfig` during credential discovery because it may create `.env.example`. Fail the test (do not skip) if either value is missing or empty after both sources are consulted.
  2. `mkdtemp()` a `tmpHome`. Write `tmpHome/.session-digests/.env` containing the two values from step 1.
  3. Snapshot the user's real `~/.session-digests/` directory listing as a `Map<filename, size>` into `before`. Treat `ENOENT` from `fs.readdir` as an empty map (a fresh dev machine has no `~/.session-digests/` until first run; the snapshot must not crash before the SUT executes). Surface `EACCES` as a distinct test-environment failure with a message naming the unreadable path — it is not a SUT bug.
  4. Invoke `cli.main(argv, stdout, stderr, { baseDir: path.join(tmpHome, ".session-digests") })` — the explicit `deps.baseDir` is the **only** sanctioned mechanism. **Do not mutate `process.env.HOME`.** HOME mutation in an in-process `node:test` runner leaks across parallel/sequential tests and survives thrown exceptions; `deps.baseDir` is leak-free, type-checked, and self-documenting in the SUT signature.
  5. After: assert the digest exists under `tmpHome/.session-digests/`. Snapshot the user's real `~/.session-digests/` listing into `after` (same ENOENT-as-empty rule). The snapshot is **defense-in-depth**, not the primary assertion: assert `before ⊆ after` by name+size — every entry in `before` must be present in `after` with the same size; new entries in `after` are tolerated. The SUT is invoked only with `deps.baseDir = tmpHome/.session-digests` (Task 6: `computeDigestPath`/`writeDigest` are baseDir-parameterized; Task 5: `loadConfig` receives the same temp baseDir), so any new entry under the real dir can only come from a third-party writer (another shell, a daemon) and does not indicate SUT contamination. The previous strict-equality assertion was racy because background daemons or other shells could write to that dir independently of this test.
- **Cleanup:** the test body writes the real `NVIDIA_API_KEY` to `tmpHome/.session-digests/.env`; `mkdtemp` does NOT auto-clean. Register cleanup on the line immediately after `mkdtemp` via `t.after(() => fs.rm(tmpHome, { recursive: true, force: true }))` (preferred) or wrap steps 2–5 in `try/finally` with the same `fs.rm` call. Cleanup MUST run even if any assertion throws or the SUT rejects. `force: true` makes the rm idempotent (no ENOENT noise); `recursive: true` removes the `.env` and the generated digest together. Prefer `t.after()` because `node:test` reports an after-hook failure as a separate diagnostic rather than masking the original test exception. Additionally, write the `.env` with `mode: 0o600` so the file is unreadable by other users in the brief window between creation and rm (defense-in-depth; does not replace cleanup).
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

**Run:** `./scripts/run_silent.sh "tests" npm run test:file -w session-digest -- tests/agents-live.test.ts` (requires real `NVIDIA_API_KEY` / `NVIDIA_MODEL`; this test is intentionally not isolated from the network).

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
