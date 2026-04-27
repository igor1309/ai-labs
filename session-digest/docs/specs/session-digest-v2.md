---
date: 2026-04-27
model: gpt-5
description: "Spec for the ADR-003 session-digest V2 CLI with persisted local ledgers and bounded model synthesis."
---

# Spec: `session-digest` V2 CLI

## Goal

Implement the `session-digest` V2 CLI owned by the `session-digest` project: one Claude Code JSONL session path produces one persisted local ledger and one Markdown digest under `~/.session-digests/`.

## Public Interface

### Command

```bash
session-digest <path-to-session.jsonl>
session-digest --ledger-only <path-to-session.jsonl>
```

- One positional argument: filesystem path to a Claude Code JSONL session file.
- Optional `--ledger-only` mode flag before the positional path.
- No API-key CLI argument.
- The current workspace invocation remains `npx -w session-digest tsx src/cli.ts <path>` until a packaging spec adds a `bin` shim.
- V2 rejects every other `-`-leading token instead of interpreting flags or a `--` sentinel.

### Success Output

- Exit code `0`.
- `stdout`: the absolute path of the created digest file, followed by one newline.
- `stderr`: empty.

In `--ledger-only` mode, success output changes to the absolute path of the created ledger file, followed by one newline.

### Failure Output

- Non-zero exit code.
- `stdout`: empty.
- `stderr`: one concise error message, followed by one newline.

### Configuration File

Configuration lives at `~/.session-digests/.env`.

Supported provider key pairs remain the ADR-002 set:

```env
NOMOS_API_KEY=
NOMOS_MODEL=
NOMOS_BASE_URL=

OPENROUTER_API_KEY=
OPENROUTER_MODEL=

NVIDIA_API_KEY=
NVIDIA_MODEL=
```

Provider priority when more than one complete pair is present:

1. Nomos.
2. OpenRouter.
3. NVIDIA NIM.

No provider has a default model.

A provider pair is complete when both its `*_API_KEY` and `*_MODEL` values are non-empty after trimming whitespace. Incomplete pairs are skipped during selection. The CLI fails only when zero complete supported provider pairs exist.

### Output Directory

All generated artifacts are written under `~/.session-digests/`. The CLI creates the directory when it does not exist.

### Digest Artifact

Digest filename pattern:

```text
<input-stem>.<YYYY-MM-DD-HHMMSS>.digest.md
```

All timestamps are UTC. `generated_at` is ISO-8601 with millisecond precision. Filename timestamps represent the same instant as `generated_at`, truncated to seconds and formatted in UTC.

The digest body keeps the existing six-section structure:

```markdown
# Session Digest

## Session summary

## Outcome

## Useful decisions

## Failure or friction points

## Next-session improvements

## Evidence notes
```

Digest front matter MUST contain these keys:

```yaml
---
title: Session Digest
source_path: /absolute/path/to/source.jsonl
provider: nomos
model: x-ai/grok-4.1-fast
generated_at: 2026-04-27T00:00:00.000Z
compressor_strategy: claude-jsonl-v1
compressor_version: 1.1.0
ledger_path: /Users/example/.session-digests/session.2026-04-27-000000.ledger.json
source_bytes: 1536754
source_records: 350
ledger_bytes: 191927
model_context_bytes: 40978
---
```

### Ledger Artifact

Ledger filename pattern:

```text
<input-stem>.<YYYY-MM-DD-HHMMSS>.ledger.json
```

The ledger is a derived JSON artifact. It MUST NOT contain a verbatim copy of the raw input file.

The ledger and digest filenames for a full digest run share the same timestamp. If either target path already exists, the CLI MUST fail before writing either artifact.

In `--ledger-only` mode, only the ledger path is considered a target artifact. An existing digest path for the same timestamp MUST NOT cause failure because no digest is written.

Ledger top-level shape:

```json
{
  "schema": "session-digest-ledger",
  "schema_version": "1.0.0",
  "compressor_strategy": "claude-jsonl-v1",
  "compressor_version": "1.1.0",
  "source": {
    "path": "/absolute/path/to/source.jsonl",
    "bytes": 1536754,
    "records": 350
  },
  "parse": {
    "skipped_records": 0
  },
  "events": [],
  "model_context": {
    "bytes": 40978,
    "sections": []
  }
}
```

Ledger event objects MUST include:

- `anchor`: stable source reference such as `record:194`;
- `kind`: event category;
- `source_record`: one-based source record number.

Ledger event objects MAY include type-specific fields such as `role`, `text`, `tool`, `tool_call_id`, `related_tool_call_id`, `command`, `status`, `file_path`, `output_bytes`, `key_lines`, `related_anchor`, and `skill`.

## Behavior Rules

### Argument Validation

The CLI MUST fail before file or config work when invoked with:

- zero positional arguments;
- more than one positional argument;
- any token beginning with `-` except `--ledger-only` in the first position with exactly one following path.

### Input Validation

The CLI MUST fail before model calls when:

- the input path does not exist;
- the input path is not a file;
- the input file is unreadable;
- the input file is empty;
- the input file is larger than `25 MB`;
- zero non-blank lines parse as JSON;
- no Claude Code session records are recognized.

The `25 MB` limit is a local compiler safety guard, not a model-context target.

The `25 MB` input cap is independent of the model context budget. An input below `25 MB` may still fail after compilation with `model context budget exceeded`.

### JSONL Parsing

The parser MUST:

- read non-blank lines independently;
- skip malformed non-blank lines and count them in `parse.skipped_records`;
- preserve the one-based record number for every parsed line;
- recognize Claude Code records with top-level `type`;
- preserve known metadata when present: `uuid`, `parentUuid`, `sessionId`, `timestamp`, `cwd`, `gitBranch`;
- preserve message roles when present;
- preserve content block types when present;
- recognize `tool_use` and `tool_result` blocks inside message content arrays;
- recognize top-level `toolUseResult` when present.

The parser MUST NOT fail solely because a record has an unknown type or unknown field.

Any single recognized Claude Code record is sufficient for parsing to succeed. Heavy recovery is surfaced through `parse.skipped_records`, not through `stderr` warnings.

### Ledger Compilation

The compiler MUST produce a ledger from parsed records before any model call.

The compiler MUST retain anchors for:

- user-visible text;
- assistant text;
- tool calls;
- tool results;
- top-level `toolUseResult` values;
- file-history snapshots;
- errors or failed tool results;
- observable command/test/build outcomes;
- observable file paths and artifact paths;
- observable commits or verification milestones.

The compiler MUST retain `tool_use.id` as `tool_call_id` on tool-call events when present.
The compiler MUST retain `tool_result.tool_use_id` as `related_tool_call_id` on tool-result events when present.
For `Skill` tool calls, the compiler MUST retain `input.skill` as `skill` when present.

The compiler MUST compact bulky tool output into derived facts. It MUST preserve output byte counts and selected key lines instead of copying full output into the model context.

The compiler MUST NOT copy the raw JSONL file or persist raw input lines as a separate artifact.

Anchor format is `record:<n>` where `<n>` is the one-based source record number. Event-specific sub-references MAY append slash-separated child segments, such as `record:194/block:2`, but the prefix MUST remain the source record anchor.

Compressor versioning rules:

- bump `compressor_version` major when the ledger schema changes;
- bump minor when retained-event coverage or compaction rules change;
- bump patch for behavior-preserving fixes.

### Model Context Budget

The compiler MUST derive a bounded model context from the ledger.

Default maximum model context size: `250,000` UTF-8 bytes.

`model_context_bytes` is the UTF-8 byte length of the serialized model-facing context: the ledger-derived `model_context` payload. Synthesis instructions and provider-required system framing are not counted.

If the derived model context exceeds the budget after deterministic compaction, the CLI MUST fail before a model call with a message that includes `model context budget exceeded`.

The CLI MUST NOT silently truncate the model context to fit the budget.

### Model Synthesis

The model receives only the bounded model context and synthesis instructions.

The model MUST NOT receive:

- raw JSONL;
- the V1 flattened full transcript;
- full unbounded tool outputs;
- the full persisted ledger when it exceeds the model context budget.

The digest generator MUST use the selected ADR-002 provider and configured model.

The model client is replaceable for testing. Tests MAY substitute a deterministic fake model.

In `--ledger-only` mode, the CLI MUST skip configuration loading, digest schema loading, provider selection, model creation, synthesis, digest assembly, and digest writing.

### Artifact Writing

On success, the CLI MUST write exactly:

- one ledger JSON file;
- one digest Markdown file.

The digest front matter `ledger_path` MUST equal the absolute path of the written ledger file.

The digest front matter byte and record counts MUST match the source and ledger artifacts from that run.

The ledger file is written and closed before the digest is composed. `ledger_bytes` is the byte size of the closed ledger file on disk.

On failure before artifact writing, the CLI MUST write no digest and no ledger.

On model failure after ledger creation, the CLI MAY leave the ledger file in place and MUST write no digest. The failure message MUST include the ledger path.

In `--ledger-only` mode, successful artifact writing creates exactly one ledger JSON file and no digest Markdown file.

### Raw Input Retention

The CLI MUST NOT create a copy of the raw input JSONL under `~/.session-digests/`.

The ledger MUST be derived. It MUST NOT contain every raw source line or any field whose purpose is to reconstruct the full original JSONL file.

### Evidence

Non-obvious digest claims MUST be backed by evidence anchors in `Evidence notes`.

Evidence anchors MUST refer to ledger event anchors, not byte offsets.

## Tests (required)

1. Zero positional arguments return non-zero, write only `stderr`, and perform no file/config work.
2. More than one positional argument returns non-zero and writes only `stderr`.
3. Any unsupported flag-like token returns non-zero and writes only `stderr`.
4. Missing input path returns non-zero before config/model work.
5. Directory input returns non-zero before config/model work.
6. Unreadable input returns non-zero before config/model work.
7. Empty input returns non-zero before config/model work.
8. Input larger than `25 MB` returns non-zero before parsing and model work.
9. Non-JSONL input returns non-zero when zero non-blank lines parse.
10. JSONL with no recognized Claude Code records returns non-zero.
11. Malformed lines are skipped when at least one valid Claude Code record exists, and `parse.skipped_records` records the skipped count.
12. Parsed records preserve one-based source anchors.
13. The compiler recognizes message text, `tool_use`, `tool_result`, and top-level `toolUseResult`.
14. The compiler emits tool output byte counts without copying full bulky output into model context.
15. The compiler emits file path references when observable in tool inputs or outputs.
16. The compiler emits failed tool results or error-like output as error events.
17. A valid session writes one ledger JSON and one digest Markdown file.
18. Successful `stdout` contains exactly the digest path.
19. Ledger top-level metadata contains schema, schema version, compressor strategy, compressor version, source path, source bytes, source records, and skipped record count.
20. Digest front matter contains all canonical derived-artifact metadata fields.
21. Digest front matter `ledger_path` points to the ledger written in the same run.
22. Source byte and record counts in digest front matter match the input file.
23. Ledger byte size in digest front matter matches the closed ledger file on disk.
24. Model context byte size in digest front matter equals the serialized ledger-derived `model_context` byte length and is at or below `250,000`.
25. Model context budget overflow returns non-zero before model call and includes `model context budget exceeded`.
26. An input below `25 MB` that compiles over the model context budget fails at the model context budget gate.
27. Successful run does not copy the raw JSONL file under `~/.session-digests/`.
28. Ledger content cannot reconstruct every raw source line from the input fixture.
29. Missing configured provider credentials return non-zero before model call.
30. Incomplete provider pairs are skipped during selection.
31. Provider selection order among complete pairs is Nomos, OpenRouter, NVIDIA NIM.
32. Model call receives bounded model context, not raw JSONL or the V1 flattened transcript.
33. The model client can be replaced by a deterministic fake in tests.
34. Model failure after ledger creation reports the ledger path and writes no digest.
35. Generated digest contains the six documented H2 sections in order.
36. Evidence notes include ledger anchors for non-obvious claims in the fake-model success path.
37. `generated_at` is UTC ISO-8601 with millisecond precision, and artifact filename timestamps are the same instant truncated to seconds in UTC.
38. If either target artifact path already exists, the CLI fails before writing either artifact.
39. `--ledger-only` writes one ledger JSON file, writes no digest, prints exactly the ledger path, and skips model invocation.
40. `--ledger-only` ignores an existing digest path for the same timestamp while still requiring the ledger path to be available.

## Done Criteria

Automated:

- The V2 CLI satisfies all behavior rules above.
- All required tests pass locally.
- The generated digest front matter is sufficient to identify the compressor strategy/version and the exact derived ledger artifact used for synthesis.

Manual acceptance:

- A real Claude Code session larger than `1 MB` produces a ledger and digest without sending raw JSONL to the model.
