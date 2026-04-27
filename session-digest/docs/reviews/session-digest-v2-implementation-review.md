---
date: 2026-04-27
model: gpt-5
description: "Code review findings for the session-digest V2 implementation"
---

# Session Digest V2 Implementation Review

## Scope

Review of the `session-digest` V2 implementation against `session-digest/docs/plans/implemented/session-digest-v2-implementation.md` and `session-digest/docs/specs/session-digest-v2.md`.

Verification during review:

- `./scripts/run_silent.sh "tests" npm test -w session-digest` passed.
- `./scripts/run_silent.sh "build" npx tsc --noEmit -p session-digest` passed.

## Findings

### Finding 1: Use Absolute Source Path In Artifacts

- Verdict: fail.
- Priority: P2.
- Location: `session-digest/src/cli.ts:53`.
- Why: The V2 spec requires `source_path` and ledger `source.path` to be absolute, but `main` passes `argv[0]` through parsing, artifact metadata, and front matter unchanged. Running `session-digest ./session.jsonl` therefore emits a relative source path.
- Fix: Canonicalize once with `path.resolve(argv[0])` after argument validation, then use that value for validation, parsing, artifact path computation, ledger metadata, and digest front matter.
- Tests: Add a CLI test invoking a relative path and asserting absolute `source_path` and ledger `source.path`.

### Finding 2: Restore Documented Digest H1

- Verdict: fail.
- Priority: P2.
- Location: `session-digest/src/output.ts:39`.
- Why: The V2 spec documents the digest body as starting with `# Session Digest` followed by the six `##` sections, but `assembleDigest` emits only front matter and the `##` sections. The front matter title does not replace the public Markdown body heading.
- Fix: Insert `# ${frontMatter.title}` after the front matter separator and before the section list.
- Tests: Add or update an output test asserting the H1 is present before the first `##` section.

### Finding 3: Map V2 Read EACCES To InputError

- Verdict: warning.
- Priority: P3.
- Location: `session-digest/src/session-records.ts:32`.
- Why: `validateInputPath` only stats the path. A file can stat successfully but fail when `parseSessionRecords` reads it, and that path currently returns the raw Node `EACCES` message instead of the existing concise `InputError.unreadable` contract.
- Fix: Catch `EACCES` around the V2 parser `readFile` call, mirroring `parseSession`.
- Tests: Add a V2 parser or `main` test with an injected `readFile` `EACCES` failure.
