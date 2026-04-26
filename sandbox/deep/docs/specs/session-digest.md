---
date: 2026-04-26
model: claude-opus-4-7
description: "Spec for the session-digest CLI prototype defined by ADR-001."
---

# Spec: `session-digest` CLI

## Goal

Implement the `session-digest` CLI prototype defined by [ADR-001](../adr/adr-001-session-digest-deepagents-nim.md): turn one Claude Code JSONL session into one Markdown postmortem digest under `~/.session-digests/`, using LangChain Deep Agents over NVIDIA NIM.

## Required architecture

Per ADR-001, the implementation MUST:

- use LangChain Deep Agents as the sole orchestrator for digest generation;
- use exactly three subagents with the responsibilities defined in ADR-001: Extractor, Improver, Evidence checker;
- use a single configured NVIDIA NIM model for all subagents;
- not introduce a provider abstraction layer.

## Public interface

### Command

```bash
session-digest <path-to-session.jsonl>
```

- One positional argument: filesystem path to a Claude Code JSONL session file.
- No flags in v1.
- No API-key CLI argument in v1.

### Success output

- Exit code `0`.
- `stdout`: the absolute path of the created digest file, on a single line, with no other content.

Example:

```text
/Users/example/.session-digests/session.2026-04-26-101547.digest.md
```

### Failure output

- Non-zero exit code.
- `stderr`: a concise, single-purpose error message.

Example for oversize input:

```text
Input file exceeds 1 MB max size for exploration prototype.
Trim the session or choose a smaller Claude Code JSONL file.
```

### Output file

- Directory: `~/.session-digests/` (created if missing).
- Filename pattern: `<input-stem>.<YYYY-MM-DD-HHMMSS>.digest.md`, second-precision UTC timestamp.
- Body: Markdown digest with the fixed section structure and front matter defined in ADR-001.

### Configuration file

- Path: `~/.session-digests/.env`.
- Required keys:

  ```env
  NVIDIA_API_KEY=
  NVIDIA_MODEL=
  ```

- No default model.
- API key MUST NOT be passed via CLI argument.

### `.env.example` bootstrap

If `~/.session-digests/.env` does not exist, the CLI MUST create `~/.session-digests/.env.example` with the following contents:

```env
NVIDIA_API_KEY=
NVIDIA_MODEL=
```

The CLI MUST NOT create a real `.env` file with empty secrets.

## Behavior rules

### Argument validation

The CLI MUST fail fast with a non-zero exit and a concise `stderr` error when invoked with zero positional arguments, more than one positional argument, or any flag.

### Input validation

The CLI MUST fail fast with a non-zero exit and a concise `stderr` error for each of:

1. Missing input file at the given path.
2. Unreadable input file (permission or IO error).
3. Empty input file.
4. Input file larger than 1 MB.
5. Input file is not valid JSONL.
6. Input file parses as JSONL but contains no usable Claude Code messages.

### Configuration validation

The CLI MUST fail fast with a non-zero exit and a concise `stderr` error for each of:

1. `NVIDIA_API_KEY` missing or empty in `~/.session-digests/.env`.
2. `NVIDIA_MODEL` missing or empty in `~/.session-digests/.env`.

The CLI MUST NOT perform a preflight model-validation call. Invalid API key or model values fail on the first NIM call.

### JSONL extraction

The CLI MUST:

- read valid JSONL records;
- skip records with unknown shapes;
- treat a record as a "usable Claude Code message" when it has both a non-empty role and non-empty content;
- fail with the "no usable messages" error only when zero usable messages are found.

### Output writing

The CLI MUST:

- create `~/.session-digests/` if it does not exist;
- write exactly one digest file per successful invocation;
- never copy or persist the raw input JSONL;
- include the source path, provider, model, and generation timestamp in the digest front matter as defined in ADR-001;
- emit the digest body with the six H2 sections defined in ADR-001 (`Session summary`, `Outcome`, `Useful decisions`, `Failure or friction points`, `Next-session improvements`, `Evidence notes`) in that order;
- emit only the created file path on `stdout`.

### Filename collision

The second-precision timestamp suffix MUST make collisions in normal interactive use unreachable. The CLI is not required to retry on collision in v1.

## Tests (required)

Local tests only; CI is out of scope per ADR-001.

1. Missing input file → non-zero exit, error on `stderr`.
2. Unreadable input file → non-zero exit, error on `stderr`.
3. Empty input file → non-zero exit, error on `stderr`.
4. Input file > 1 MB → non-zero exit, oversize error on `stderr`.
5. Non-JSONL input → non-zero exit, error on `stderr`.
6. JSONL with zero usable Claude Code messages → non-zero exit, error on `stderr`.
7. Missing `NVIDIA_API_KEY` → non-zero exit, error on `stderr`.
8. Missing `NVIDIA_MODEL` → non-zero exit, error on `stderr`.
9. Missing `~/.session-digests/.env` → CLI creates `~/.session-digests/.env.example` with the documented contents and exits non-zero.
10. Valid fixture session → CLI writes a Markdown digest to `~/.session-digests/` and exits zero.
11. Successful run → `stdout` contains exactly the created digest path and no other content.
12. Two successful runs in the same second over different inputs do not collide on filename when input stems differ; same input within one second is documented as a non-target case.
13. At least one local integration or smoke test calls NVIDIA NIM directly. The test MUST fail (not skip) when `NVIDIA_API_KEY` or `NVIDIA_MODEL` is absent or empty.
14. Successful run does not create or copy the raw input JSONL anywhere under `~/.session-digests/`.
15. Generated digest front matter contains `title`, `source_path`, `provider`, `model`, and `generated_at` keys with the values defined in ADR-001.
16. Invalid CLI argument count (zero or more than one positional, or any flag) → non-zero exit, error on `stderr`.
17. Generated digest body contains the six H2 sections defined by ADR-001 in the documented order.

## Done criteria

- All behavior rules are implemented.
- All tests above pass locally.
- The CLI produces a usable digest from one real Claude Code session file (per the ADR-001 success criterion).
