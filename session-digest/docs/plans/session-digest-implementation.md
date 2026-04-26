---
date: 2026-04-26
model: claude-opus-4-7
description: "Implementation plan for the session-digest CLI prototype defined by ADR-001 and its spec."
---

# Session Digest Implementation Plan

> **For Claude:** Use the `dev-skills:strict-tdd` skill while executing this plan. Each task ends with a targeted test run and a commit on a passing state.

**Goal:** Implement the `session-digest` CLI per [`../specs/session-digest.md`](../specs/session-digest.md) and [`../adr/adr-001-session-digest-deepagents-nim.md`](../adr/adr-001-session-digest-deepagents-nim.md): one Claude Code JSONL → one Markdown digest under `~/.session-digests/`, using LangChain Deep Agents over NVIDIA NIM.

**Source of truth:** the spec. Acceptance is the 18 spec tests plus the behavior rules. Do not invent tests outside that envelope; do not skip tests inside it.

**Tech stack:**

- Node.js ≥ 20, TypeScript, ESM modules.
- [`deepagents`](https://www.npmjs.com/package/deepagents) (LangChain Deep Agents, TypeScript port).
- [`@langchain/openai`](https://www.npmjs.com/package/@langchain/openai) `ChatOpenAI` configured with `baseURL: "https://integrate.api.nvidia.com/v1"` — NIM exposes an OpenAI-compatible API and there is no native `ChatNVIDIA` class in langchainjs. ADR-001 forbids a provider abstraction layer; `ChatOpenAI` is used directly.
- `dotenv` for `~/.session-digests/.env`.
- `node:test` + `node:assert/strict` for tests (matches `corpus-scout` precedent in this repo).
- `tsx` as the runtime loader so `tsc --noEmit` is the only TypeScript build gate (matches `npx tsc --noEmit` in CLAUDE.md).

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
  tests/
    cli-args.test.ts
    inputs.test.ts
    config.test.ts
    output.test.ts
    agents-fake.test.ts   # fake-LLM integration; happy path
    agents-live.test.ts   # live NIM smoke; hits the real NIM endpoint
    fixtures/
      session.valid.jsonl
      session.empty.jsonl
      session.no-usable.jsonl
      session.whitespace.jsonl
      session.not-jsonl.txt
```

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
- Local test command per task: `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/<file>` (or the simpler `node --import tsx --test session-digest/tests/<file>` during a tight iteration loop).
- Full-suite gate before commit at the end of each task: `./scripts/run_silent.sh "tests" npm test -w session-digest` AND `./scripts/run_silent.sh "build" npx tsc --noEmit -p session-digest` MUST both pass before staging files. If either fails, fix on the same task — do not commit.
- Commits are short, imperative, lowercase per AGENTS.md.

**Spec test coverage map** (each spec test number maps to the task that closes it):

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

**Goal:** bootable, empty package wired into the root npm workspaces; `tsc --noEmit` and `node --test` both green with zero tests.

**Files:**

- Create `session-digest/package.json`.
- Create `session-digest/tsconfig.json`.
- Create `session-digest/src/cli.ts` (one-line empty `export {}` placeholder).
- Create `session-digest/.gitignore` (`node_modules/`, `dist/`, `*.log`).
- Edit root `package.json`: append `"session-digest"` to `workspaces`.
- Edit root `package.json` `scripts.test`: append `session-digest/tests/**/*.test.ts` to the `node --test` invocation, with the `tsx` loader.

**`session-digest/package.json` essentials:**

- `name: "session-digest"`, `version: "0.0.1"`, `private: true`, `type: "module"`.
- `bin: { "session-digest": "./src/cli.ts" }` — invoked via `tsx` shebang or `npx -w session-digest tsx src/cli.ts`. Do NOT add a `dist/` build step in v1.
- Dependencies: `deepagents`, `@langchain/openai`, `@langchain/core`, `dotenv`.
- Dev dependencies: `tsx`, `typescript`, `@types/node`.
- `scripts.test`: `node --import tsx --test tests/**/*.test.ts`.

**`tsconfig.json` essentials:**

- `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, `noEmit: true`, `esModuleInterop: true`, `skipLibCheck: true`.

**Steps:**

1. Write `package.json`, `tsconfig.json`, placeholder `src/cli.ts`, `.gitignore`.
2. Update root `package.json` (workspaces + test glob) and run `npm install` so the workspace is linked and the lockfile is updated.
3. Verify both gates with **zero tests**:
   - `./scripts/run_silent.sh "build" npx tsc --noEmit -p session-digest` → green.
   - `./scripts/run_silent.sh "tests" npm test -w session-digest` → green (no tests is OK).
4. Commit: `scaffold session-digest typescript workspace`.

**Verification:** typecheck passes; `node --test` runs and exits 0 with no collected tests; root `npm test` still passes for the rest of the repo.

---

## Task 2 — CLI argument arity (spec test 16)

**Goal:** fail-fast on bad argv before any I/O.

**Files:**

- `session-digest/src/cli.ts` (replace placeholder with real entry).
- `session-digest/tests/cli-args.test.ts`.

**RED — write failing tests first:**

- `test_main_exits_nonzero_when_no_positional_arg`
- `test_main_exits_nonzero_when_more_than_one_positional_arg`
- `test_main_exits_nonzero_when_any_flag_is_passed` (e.g. `--help`, `-h`, `--anything`)
- Each test asserts non-zero exit code and a non-empty `stderr` string.

Tests call `main(argv, stdout, stderr)` in-process with captured streams (e.g. `Writable`-backed string sinks). No subprocess spawning in this task.

**GREEN — minimal code:**

- Export `main(argv: string[], stdout: Writable, stderr: Writable): Promise<number>`.
- Parse argv manually (no `commander` / `yargs` — those introduce flag surface). Accept exactly one positional argument; reject any token starting with `-`.
- On violation: write a one-line error to `stderr`, return non-zero.
- Add a thin `#!/usr/bin/env -S npx tsx` shebang or invoke via `npx -w session-digest tsx src/cli.ts` — bin wiring is verified manually, not by tests.

**Run:** `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/cli-args.test.ts`.

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
- `test_unreadable_file_returns_error` (`chmod(path, 0o000)` inside try/finally; restore mode in finally so cleanup works).
- `test_empty_file_returns_error` (write zero bytes).
- `test_file_over_one_megabyte_returns_oversize_error` (write 1 MB + 1 byte).

Each test asserts: non-zero exit through `cli.main`, concise message on `stderr`, no output file written under a temp `HOME`.

**GREEN:**

- `validateInputPath(path: string): Promise<void>` throws a typed `InputError` per failure mode; `cli.main` catches and translates to `(exitCode, stderrMessage)`.
- 1 MB constant lives in `inputs.ts` as a module-level `const ONE_MB = 1024 * 1024`; size check uses `fs.stat`.

**Run:** `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/inputs.test.ts`.

**Commit:** `cli: validate input file presence, readability, size`.

---

## Task 4 — JSONL parsing rules (spec tests 5, 6, 18)

**Goal:** best-effort JSONL extraction matching the spec.

**Files:**

- `session-digest/src/inputs.ts` — extend with `parseSession(path): Promise<Message[]>`.
- `session-digest/tests/inputs.test.ts` — extend.
- Fixtures: `session-digest/tests/fixtures/session.not-jsonl.txt`, `session.no-usable.jsonl`, `session.whitespace.jsonl`, `session.valid.jsonl`.

**RED:**

- `test_non_jsonl_input_returns_error` (uses `not-jsonl.txt`).
- `test_jsonl_with_zero_usable_messages_returns_error` (records with empty `role`/`content` or unknown shapes).
- `test_jsonl_with_interleaved_blank_and_whitespace_lines_parses_when_one_usable_message_present` (`whitespace.jsonl`).

**GREEN:**

- Iterate lines (`readline` on a stream, or split-then-parse for ≤1 MB inputs).
- Lines that are empty after `.trim()` are skipped silently.
- Each non-empty line is `JSON.parse`-d; a single failed parse triggers the "non-JSONL" error (`InputError.NotJsonl`).
- A record is "usable" iff `role` and `content` are both non-empty strings.
- Records with unknown shapes are skipped (no error).
- Zero usable messages → `InputError.NoUsableMessages`.

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
- `test_missing_api_key_returns_error` — `.env` exists but `NVIDIA_API_KEY` is empty/absent.
- `test_missing_model_returns_error` — `.env` exists but `NVIDIA_MODEL` is empty/absent.
- `test_no_preflight_call_when_credentials_present` — config loading does not import or instantiate `ChatOpenAI`. Implementation: keep `ChatOpenAI` import inside `agents.ts` only and assert via a static check (`grep`-style) inside the test.

**GREEN:**

- `loadConfig(baseDir: string): Config` returns `{ apiKey, model }` or throws `ConfigError`.
- If `<baseDir>/.env` is missing: write `.env.example` with the documented body, throw `ConfigError("create ~/.session-digests/.env from .env.example")`.
- If `.env` exists but `NVIDIA_API_KEY` is empty/missing → `ConfigError`.
- Same for `NVIDIA_MODEL`.
- No model-validation network call.

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
- `test_successful_run_does_not_copy_raw_input_anywhere_under_session_digests` — after writing a placeholder body, walk the directory tree and assert no file equals the input bytes and no file has the input filename.

**GREEN:**

- `computeDigestPath(inputPath, nowUtc, baseDir)` returns the target path.
- `writeDigest(path, body)` creates the parent dir (`fs.mkdir({ recursive: true })`) and writes only the body. No copy of input.
- Inject the clock as a parameter; default to `() => new Date()` returning UTC.

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
  - `provider === "nvidia_nim"` (literal).
  - `model === <configured NVIDIA_MODEL>`.
  - `source_path === <absolute path of input>` (`path.resolve`).
- `test_body_contains_six_h2_sections_in_documented_order`:
  - exact sequence: `Session summary`, `Outcome`, `Useful decisions`, `Failure or friction points`, `Next-session improvements`, `Evidence notes`.
  - extracted by regex over `^## ` headers; assert the list equals the expected list.

**GREEN:**

- `assembleDigest(frontMatter: FrontMatter, sections: Record<SectionName, string>): string`.
- `SECTION_NAMES` is a module-level `as const` tuple so the order is single-sourced.
- `FrontMatter` is a `type` with the five required fields; serializer emits YAML between `---` lines (hand-rolled — do not introduce a YAML lib for five string fields).

**Run:** `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/output.test.ts`.

**Commit:** `output: assemble front matter and six-section body`.

---

## Task 8 — Deep Agents wiring + happy path (spec tests 10, 11)

**Goal:** end-to-end success with a fake LLM.

**Files:**

- `session-digest/src/agents.ts`.
- `session-digest/src/cli.ts` — wire the full flow.
- `session-digest/tests/agents-fake.test.ts`.
- `session-digest/tests/fixtures/session.valid.jsonl`.

**Architecture (per ADR-001):**

- One Deep Agent built via `createDeepAgent` with three subagents named exactly: `Extractor`, `Improver`, `Evidence checker`.
- One model instance (`ChatOpenAI` configured for NIM), shared across all subagents — pass it via the `model` option to `createDeepAgent` so subagents inherit it.
- Subagents return structured section content; the orchestrator hands sections to `assembleDigest`.
- No provider abstraction layer — call `ChatOpenAI` directly with `baseURL: "https://integrate.api.nvidia.com/v1"`, `apiKey: config.apiKey`, `model: config.model`.

**Test injection:**

- `agents.buildAgent({ model })` accepts a model object. Tests pass a `FakeListChatModel` (from `@langchain/core/utils/testing`) returning canned section text per role.
- `cli.main` calls `agents.buildAgent({ model: defaultNimModel(config) })`; tests bypass the default by calling `agents.run(messages, fakeModel)` directly.

**RED:**

- `test_valid_session_produces_digest_at_expected_path` — given the fixture and a temp `HOME`, the run writes a Markdown file under `<HOME>/.session-digests/`; file exists; body has the six sections in order.
- `test_stdout_contains_only_created_digest_path` — assert exact equality (path string + single trailing `\n`) and that `stderr` is empty on success.

**GREEN:**

- Implement `agents.run(messages, model): Promise<Record<SectionName, string>>` (section name → content).
- `cli.main` flow: validate argv → validate input → parse JSONL → load config → build NIM model from config → run agent → assemble digest → write file → write absolute path to stdout → return 0.

**Run:** `./scripts/run_silent.sh "tests" npm test -w session-digest -- --test-only tests/agents-fake.test.ts`.

**Commit:** `agents: wire deep agents end-to-end with fake llm test`.

---

## Task 9 — Live NIM smoke test (spec test 13)

**Goal:** at least one local test that **actually calls the NVIDIA NIM endpoint** end-to-end. This is the only test that hits the network; that is intentional, per the spec.

**Files:**

- `session-digest/tests/agents-live.test.ts`.

**Rules:**

- Test is collected and runs unconditionally — no `t.skip`, no `node:test --skip`, no environment-gated skip markers.
- Missing or empty `NVIDIA_API_KEY` or `NVIDIA_MODEL` is a **test failure**, not a skip (spec test 13). The test reads from `process.env` first, then falls back to `~/.session-digests/.env` via `loadConfig`.
- When credentials are present, the test runs the CLI against `session.valid.jsonl` and asserts:
  - exit code 0;
  - a digest file is created under a temp `HOME`-rooted `~/.session-digests/`;
  - the digest contains the six H2 sections in order (structural assertion only — content is non-deterministic);
  - the digest front matter `provider` is `nvidia_nim` and `model` matches the configured `NVIDIA_MODEL`.
- Test is allowed to take real wall-clock time. Use `t.test(..., { timeout: 60_000 })` so a single NIM round-trip fits.
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
3. Run: `npx -w session-digest session-digest /absolute/path/to/session.jsonl` (or invoke directly via `tsx session-digest/src/cli.ts <path>`).
4. Inspect the resulting digest:
   - All six H2 sections are non-empty.
   - At least one `Next-session improvements` entry is worth reusing (ADR-001 success criterion).
   - `Evidence notes` references concrete record/turn markers.
5. Record the run + verdict in `session-digest/docs/log.md` (create if missing).

**No commit unless step 5 produces a docs change.**

---

## Done criteria (mirrors the spec)

- [ ] All 18 spec tests pass locally via `./scripts/run_silent.sh "tests" npm test -w session-digest`.
- [ ] `npx tsc --noEmit -p session-digest` is clean.
- [ ] `session-digest <path>` produces a digest file matching the spec's filename, front matter, and section structure.
- [ ] The CLI never copies the raw JSONL input.
- [ ] No provider abstraction layer was introduced (`ChatOpenAI` is used directly inside `agents.ts`).
- [ ] Exactly three subagents are configured: Extractor, Improver, Evidence checker.
- [ ] One real-session manual run produces a digest with at least one reusable next-session improvement.

## Out of scope (do not pursue without a new ADR)

Per ADR-001 Non-Goals: HTTP surface, watched folder, CI, multi-session, indexing, repo awareness, provider abstraction, scheduling, chunking, generic transcript adapters, redaction, raw-input copying, CLI API-key arguments.
