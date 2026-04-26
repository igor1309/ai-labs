# Log

## 2026-04-26

- Confirmed the local Nomos proxy can route `session-digest` through OpenRouter `x-ai/grok-4.1-fast` and write a real small-session digest.
- Made Nomos the preferred configured provider so project-scoped proxy usage wins over direct OpenRouter once `NOMOS_API_KEY` is present.
- Added OpenAI-compatible provider routing for OpenRouter and Nomos while keeping NVIDIA NIM as the legacy fallback path.
- Captured ADR-002 and updated local docs after NVIDIA NIM probes showed model stalls or missing Deep Agents-owned sections.
- Confirmed the Nemotron 3 Super full CLI probe still stalls for the small real session despite fast raw tool-call support.
- Loosened missing-section handling to emit placeholders and hardened prompts to treat Claude session JSON as transcript data instead of live instructions.
- Recorded NVIDIA NIM model probe results to preserve which free hosted models returned, timed out, or supported Deep Agents tool calls.
- Added a local README with repo-root and anywhere-safe CLI invocation examples for real Claude session JSONL files.
- Made the documented `tsx src/cli.ts <path>` invocation execute the CLI instead of silently exiting.
- Added scoped shell-proxy support for NVIDIA NIM calls so the CLI can use configured proxy env vars without global HTTP transport changes.
- Wired the fake Deep Agents success path end to end, including prompt ownership, task-message section extraction, and CLI digest writing.
- Redrafted Task 8 around the observed Deep Agents task-message API and made the `@langchain/anthropic` runtime dependency decision explicit.
- Recorded Deep Agents API observations and the Task 8 redraft decision: extract section envelopes from task tool messages correlated by `tool_call_id`.
- Added digest front matter serialization and fixed six-section Markdown assembly from a shared section-name tuple.
- Added timestamped digest path computation and disciplined digest writing that creates only the target Markdown file.
- Added `.env` loading for NVIDIA credentials, `.env.example` bootstrap behavior, required-key validation, and process-env isolation.
- Added lenient Claude Code JSONL parsing with whitespace tolerance, skipped malformed lines, usable message extraction, and injected read-file error handling.
- Added input path validation for missing, unreadable, non-file, empty, and oversized session files before parsing or output work begins.
- Added CLI arity validation so v1 rejects missing paths, extra paths, and flags before any file or config work.
- Scaffolded the `session-digest` TypeScript workspace and root test wiring so the CLI prototype has isolated package-local build and test gates.
- Recorded explicit user approval to auto-continue through RED/GREEN micro-steps and task boundaries without human-review stops when gates pass.
- Broke the plan-review loop by removing the transient review artifact and tightening the implementation plan around ADR-preserving Deep Agents probing, fake-run file assertions, and new-project checklist state.
- Closed implementation-plan review gaps by adding the execution lock, moving CLI success assertions behind the fake-model task, and making JSON parsing the declared v1 structured-output path.
- Hardened the implementation plan through review: live smoke tests stay out of the real home directory, targeted test commands select files correctly, strict TDD is expressed as one-test micro-steps, and support tests are allowed only when they enforce the spec/ADR envelope.
- Added ADR traceability to the implementation plan so every ADR-001 invariant maps to responsible tasks and verification gates before coding starts.
- Defined the TypeScript implementation path for the local CLI prototype: standalone `session-digest` workspace, Node test/build gates, fixed Deep Agents orchestration, NVIDIA NIM wiring, and no provider abstraction.
- Accepted the v1 architecture and spec for turning one Claude Code JSONL session into one Markdown digest under `~/.session-digests/`, with fixed digest sections, traceability front matter, lenient JSONL parsing, and explicit config validation.
- Established the project collateral: top-level `session-digest` docs, Deep Agents/NVIDIA NIM use-case notes, landing mockups, README component coverage, and LOC dashboard/project-checklist registration.
