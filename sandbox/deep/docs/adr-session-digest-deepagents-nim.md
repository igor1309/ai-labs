---
title: ADR — Session Digest Exploration Prototype with Deep Agents and NVIDIA NIM
date: 2026-04-26
status: accepted
model: GPT-5.5 Thinking
version: 1.0
---

# ADR: Session Digest Exploration Prototype with Deep Agents and NVIDIA NIM

## Status

Accepted.

## Context

The goal is to learn and evaluate LangChain Deep Agents with free NVIDIA NIM APIs through a practical, bounded utility: generating a postmortem mini-digest from one real Claude Code session.

The prototype should avoid a toy “hello world” while staying small enough to support fast exploration. It should exercise Deep Agents’ orchestration, filesystem/context use, role delegation, and artifact generation without introducing product-scale concerns such as indexing, scheduling, persistence, provider abstraction, or service deployment. This prototype intentionally exercises Deep Agents’ filesystem/context handling on a real local session artifact without introducing an index.

## Decision

Build a local CLI prototype named `session-digest`.

The CLI accepts one real Claude Code local session JSONL file and generates one Markdown postmortem digest into `~/.session-digests`.

Command shape:

```bash
session-digest path/to/session.jsonl
```

On success, stdout prints only the created digest path.

## Scope

### In scope

- Local CLI usage.
- One real Claude Code local session JSONL file as input.
- Best-effort JSONL extraction.
- Markdown digest output.
- Fixed digest section structure.
- NVIDIA NIM as the LLM provider.
- Deep Agents used for digest orchestration.
- Local live tests that may call NVIDIA NIM.
- Output and local config under `~/.session-digests`.

### Out of scope

- HTTP endpoint.
- Watched folder mode.
- Service deployment.
- CI for the exploration phase.
- Indexing.
- Multi-session digesting.
- Persistence model beyond generated Markdown files.
- Repo/worktree awareness.
- Provider abstraction.
- Automated scheduling.
- Chunking.
- Compression.
- Multi-pass summarization.
- Generic transcript adapters.
- Secret scanning or redaction.
- Copying raw session inputs.
- CLI API-key arguments.

## Input source

The first input source is a real Claude Code local session JSONL file.

The file path is passed explicitly to the CLI.

The prototype performs minimal best-effort extraction sufficient for digesting:

- read valid JSONL records;
- skip unknown record shapes;
- fail only if no usable messages are found.

The prototype does not treat arbitrary files as valid input.

## Input size limit

The maximum input file size is **1 MB**.

If the input file exceeds the limit, the CLI fails explicitly.

Example error:

```text
Input file exceeds 1 MB max size for exploration prototype.
Trim the session or choose a smaller Claude Code JSONL file.
```

No trimming, selection, chunking, compression, or multi-pass summarization is supported in v1.

## Output

The output is a Markdown digest.

The output directory is fixed:

```text
~/.session-digests
```

The CLI creates this directory automatically if it does not exist.

Output filenames always include a timestamp suffix. This also avoids filename collisions, for example:

```text
session.2026-04-26-1015.digest.md
```

The CLI writes only the generated Markdown digest. It never copies the raw Claude JSONL input.

## Digest structure

The v1 digest uses a fixed action-oriented postmortem structure:

```markdown
# Session Digest

## Session summary

## Outcome

## Useful decisions

## Failure or friction points

## Next-session improvements

## Evidence notes
```

The primary optimization target is actionability.

The hard quality constraint is factual traceability: non-obvious claims should be grounded in lightweight evidence notes.

## Evidence model

The prototype uses lightweight evidence notes.

Important claims should include short source references when available, such as section, line, record, or turn markers.

The prototype does not require exhaustive claim-level citations.

## Deep Agents responsibility

Deep Agents is responsible for digest orchestration only:

- read one session file;
- plan the digest sections;
- delegate analysis to fixed role subagents;
- produce the final Markdown digest.

Deep Agents does not manage indexing, persistence, scheduling, provider abstraction, repo state, or worktree state.

## Deep Agents subagents

The prototype uses a fixed role split:

| Subagent | Responsibility |
|---|---|
| Extractor | Identifies summary, outcome, decisions, and friction points. |
| Improver | Proposes concrete next-session improvements. |
| Evidence checker | Verifies that important claims have lightweight evidence notes. |

## NVIDIA NIM usage

The prototype uses NVIDIA NIM as the LLM provider.

The first version uses a single configured NIM model for all Deep Agents roles.

A future direction is to support two NIM model tiers:

- cheaper/faster model for extraction;
- stronger model for synthesis or critique.

Provider abstraction is explicitly out of scope for v1.

## Configuration and credentials

Configuration is local to:

```text
~/.session-digests/.env
```

Required keys:

```env
NVIDIA_API_KEY=...
NVIDIA_MODEL=...
```

There is no default model.

The CLI fails fast if either required key is missing or empty.

The CLI does not perform a preflight model validation call. Invalid API key or model configuration fails on the first NIM call.

If `.env` is missing, the CLI creates:

```text
~/.session-digests/.env.example
```

with the following contents:

```env
NVIDIA_API_KEY=
NVIDIA_MODEL=
```

It does not create a fake `.env` file with empty secrets.

Passing the API key as a CLI argument is out of scope.

External secret management is out of scope.

## Privacy and retention

The tool is local-only, but selected session content is sent to NVIDIA NIM.

The user is responsible for selecting a safe Claude Code JSONL file.

No redaction or secret scanning is performed in v1.

The raw input file is never copied.

The digest front matter includes the source file path for local traceability.

## Digest front matter

Each generated digest includes front matter with traceability metadata:

```yaml
---
title: Session Digest
source_path: /path/to/source/session.jsonl
provider: nvidia_nim
model: <configured NVIDIA_MODEL>
generated_at: <timestamp>
---
```

## CLI behavior

### Success

On success, stdout prints the created digest path only.

Example:

```text
/Users/example/.session-digests/session.2026-04-26-1015.digest.md
```

### Invalid input

The CLI fails fast with a concise stderr error and non-zero exit for:

- missing input file;
- unreadable input file;
- unsupported input shape, meaning the file is not JSONL or contains no extractable Claude Code messages;
- empty file;
- file larger than 1 MB;
- no usable messages found;
- missing `NVIDIA_API_KEY`;
- missing `NVIDIA_MODEL`.

## Tests

The exploration prototype uses local tests.

CI is explicitly out of scope for this phase.

Test coverage should include:

- invalid input fails;
- oversized input fails;
- valid fixture writes Markdown to `~/.session-digests`;
- stdout prints the created path only;
- timestamp suffix avoids filename collisions;
- missing `.env` creates `.env.example`;
- missing `NVIDIA_API_KEY` fails;
- missing `NVIDIA_MODEL` fails.

At least one local integration test or smoke test should call NVIDIA NIM directly. CI remains out of scope for the exploration phase.

## Success criterion

The prototype is successful if it can produce a usable digest from one real Claude Code session file and at least one next-session improvement is worth reusing.

Running end-to-end is not sufficient by itself.

## Consequences

### Positive

- Produces a real artifact, not a toy demo.
- Keeps the prototype bounded and cheap to run.
- Exercises Deep Agents orchestration and role delegation.
- Uses real Claude Code session data early.
- Keeps local artifact handling simple.
- Avoids premature product architecture.

### Negative

- No large-session support.
- No automatic redaction before sending content to NIM.
- No provider portability in v1.
- No CI confidence during the exploration phase.
- No index or cross-session learning.
- Manual selection of safe, small input files is required.

### Tradeoffs

The prototype deliberately favors direct exploration over production hardening.

The main risk is sending sensitive local session content to an external model provider. This is accepted for v1 because the tool is local-only and the user explicitly selects the input file.

The second major tradeoff is rejecting large sessions instead of chunking or compressing them. This keeps the first version inspectable and easier to evaluate.

## Future directions explicitly deferred

- Two-tier NIM model configuration: cheaper/faster extraction model and stronger synthesis/critique model.
- Adapter boundary for multiple session sources.
- Claude Code parser hardening against known session record schemas.
- Multi-session digesting.
- Local index for normalized session evidence.
- Larger-session support through chunking, selection, or compression.
- Optional watched-folder workflow.
- Callable tool integration inside Regentara.
- Provider abstraction after the NIM-first learning goal is complete.
- CI integration after the exploration phase.
- Optional evidence appendix or stricter claim-level citation model.
- Optional redaction or secret scanning before NIM calls.

## Decision summary

| Concern | Decision |
|---|---|
| ADR scope | Prototype scope + architecture slice |
| Use surface | Local CLI |
| CLI command | `session-digest path/to/session.jsonl` |
| Input source | One real Claude Code local session JSONL file |
| JSONL parsing | Best-effort extraction |
| Max input size | 1 MB |
| Oversized behavior | Explicit fail |
| Trimming/chunking/compression | Out of scope |
| Output format | Markdown |
| Output directory | `~/.session-digests` |
| Output naming | Always timestamped filename |
| Success stdout | Created digest path only |
| Digest structure | Fixed action-oriented postmortem |
| Evidence model | Lightweight evidence notes |
| Deep Agents role | Digest orchestration only |
| Subagents | Extractor, Improver, Evidence checker |
| Provider | NVIDIA NIM |
| Model selection | Required `NVIDIA_MODEL` in `.env` |
| API key | Required `NVIDIA_API_KEY` in `.env` |
| Preflight validation | None |
| `.env` handling | Create `.env.example` if missing |
| Raw input retention | Do not copy raw input |
| Source path in digest | Include in front matter |
| Provider/model metadata | Include in front matter |
| Redaction | Out of scope |
| Tests | Local tests only |
| CI | Out of scope for exploration phase |
| Success criterion | At least one reusable next-session improvement |
