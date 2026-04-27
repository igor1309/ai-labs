---
date: 2026-04-27
model: claude-opus-4-7
description: "Review of session-digest V2 CLI spec — executable-spec level findings against ADR-003 invariants."
---

# Review: `session-digest` V2 CLI Spec

Reviewed file: [session-digest-v2.md](session-digest-v2.md).

This is an **executable specification** (per `arch-spec-review` classification) — it pins exit codes, file shapes, byte budgets, and a numbered test list. Reviewed against ADR-003 invariants and repo spec-writing standards.

## What Works

- **ADR-003 invariants traced through cleanly**: bounded context, no raw retention, persisted ledger, compressor metadata, no silent truncation each appear as a normative rule (lines 211, 219, 222, 247, 253–255).
- **Failure boundaries are explicit**: arg validation → input validation → ledger compile → budget check → model call → artifact write. Each gate has a stated exit shape (lines 27–36).
- **Atomicity is named** for the success case (line 238: "exactly one ledger… one digest") and the partial-failure case (line 249: ledger MAY remain on model failure; no digest).
- **Test list is reverse-traceable**: tests 1–33 mostly map to a specific behavior rule above. Good for review.

## Findings

### 1. `ledger_bytes` semantics ambiguous

**Verdict**: warning.
**Location**: `session-digest-v2.md:108`, test 23 at line 287.
**Why**: Test 23 requires `ledger_bytes` match "the ledger file." But the digest is written *after* the ledger. The measurement point and ordering are not stated; an implementer could compute `ledger_bytes` from the in-memory payload pre-serialization and drift from the on-disk size.
**Fix**: under "Artifact Writing," add: "The ledger file is written and closed before the digest is composed. `ledger_bytes` is the byte size of the closed ledger file on disk."

### 2. `model_context_bytes` measurement undefined

**Verdict**: warning.
**Location**: `session-digest-v2.md:109, 215–219, 226, 288`.
**Why**: The 250,000 UTF-8 byte budget never names what is counted: (a) the serialized model-facing context payload, (b) the full prompt sent to the provider including system + synthesis instructions, or (c) only the ledger-derived `model_context.sections` JSON. Line 226 hints instructions are excluded but does not state it.
**Fix**: under "Model Context Budget," add: "`model_context_bytes` is the UTF-8 byte length of the serialized model-facing context (the ledger-derived `model_context` payload). Synthesis instructions and provider-required system framing are not counted."

### 3. `compressor_strategy` / `compressor_version` not bound to a registry

**Verdict**: warning.
**Location**: `session-digest-v2.md:103–104, 131–132`.
**Why**: The strategy id `claude-jsonl-v1` and version `1.0.0` appear only in examples. ADR-003 line 67 calls this a "stable string" but the spec has no rule for when version bumps are required (schema change? compaction-rule change? both?). Without that, the metadata is decorative.
**Fix**: add: "Bump `compressor_version` major when the ledger schema changes; minor when retained-event coverage changes; patch for behavior-preserving fixes." Or defer explicitly.

### 4. "Skip malformed lines" + "zero records → fail" leaves silent partial-success otherwise

**Verdict**: warning.
**Location**: `session-digest-v2.md:181, 274–275`.
**Why**: A corrupted file with 1 valid + 999 malformed records succeeds today. There is no rule capping skip ratio nor a metadata field exposing the skipped count; downstream readers cannot tell a clean parse from a heavily-recovered one.
**Fix**: either accept this explicitly ("any single valid record is sufficient; malformed-line counts are not surfaced") or add a stderr warning and a `parse_skipped_records` field in ledger metadata.

### 5. Provider selection vs partial credentials

**Verdict**: warning.
**Location**: `session-digest-v2.md:56–62, 292–293`.
**Why**: Behavior with a partial pair (e.g., `NOMOS_API_KEY` set, `NOMOS_MODEL` empty) is undefined. Line 56 says "more than one complete pair" — implying skip — but the spec never names the "complete pair" rule.
**Fix**: add: "A provider pair is complete when both `*_API_KEY` and `*_MODEL` are non-empty. Incomplete pairs are skipped during selection. Failure occurs only when zero complete pairs exist."

### 6. Argument validation rejects `-`-leading tokens permanently

**Verdict**: warning.
**Location**: `session-digest-v2.md:160`.
**Why**: This blocks the obvious future extension (`--version`, `--help`) and also rejects legitimate POSIX-style filenames like `./-weird.jsonl`. Not blocking, but worth calling out.
**Fix**: either explicitly defer flag parsing ("Flags reserved for a later spec; for now any `-`-leading token is rejected") or accept `--` as the end-of-flags sentinel.

### 7. `25 MB` cap vs `model context budget exceeded` precedence

**Verdict**: warning.
**Location**: `session-digest-v2.md:170, 172`, tests 8 and 25.
**Why**: A 30 MB file fails at input validation. A 20 MB file that compiles to a 300 KB context that still overflows the budget fails later. Both rules are present but the spec does not state they are independent layers.
**Fix**: under "Input Validation," add: "The 25 MB cap is independent of the model context budget; an input below 25 MB may still fail the model context budget after compilation."

### 8. `record:194` anchor format pinned by example only

**Verdict**: warning.
**Location**: `session-digest-v2.md:147`, tests 12, 21, 33.
**Why**: The format is never normatively defined. If a future event type needs sub-record anchors (e.g., a content block index), the format will drift.
**Fix**: name the format normatively: "`record:<n>` where `<n>` is the one-based source record number." Or define an anchor grammar that allows sub-references.

### 9. Test 33 "fake-model success path" lacks a corresponding rule

**Verdict**: warning.
**Location**: `session-digest-v2.md:297`.
**Why**: This is the only test that mentions a "fake model." The spec body does not establish a test-double seam. An implementer reading the spec alone won't know whether the seam is required to exist (architectural choice) or just used here.
**Fix**: under "Model Synthesis," add: "The model client is replaceable for testing. Tests MAY substitute a deterministic fake."

### 10. `generated_at` precision/timezone

**Verdict**: warning.
**Location**: `session-digest-v2.md:101`, filename pattern lines 73 and 117.
**Why**: No rule says `generated_at` must be UTC or millisecond-precision. Filename uses `<YYYY-MM-DD-HHMMSS>` without timezone. Two artifacts from the same run could disagree if the implementer uses local time for one and UTC for the other.
**Fix**: state: "All timestamps are UTC. `generated_at` is ISO-8601 with millisecond precision. Filename timestamp is the same instant truncated to seconds, formatted in UTC."

### 11. Ledger and digest filename collision

**Verdict**: warning.
**Location**: `session-digest-v2.md:73, 117`, test 17.
**Why**: Two runs against the same input within the same second collide. The CLI overwrite policy is undefined.
**Fix**: declare either "the CLI fails if the target ledger or digest path exists" or "the CLI overwrites." Given test 17 expects "exactly one of each," collision behavior matters.

### 12. Done Criteria #3 mixes manual acceptance into automated test gate

**Verdict**: warning.
**Location**: `session-digest-v2.md:303`.
**Why**: "A real Claude Code session larger than `1 MB` produces a ledger and digest" is a manual acceptance check, not a deterministic test. Mark it as a manual/release-gate criterion to avoid CI ambiguity.
**Fix**: split Done Criteria into "Automated" (tests pass) and "Manual acceptance" (real-session run).

## Clarity Index

The spec reads as a clean executable contract; the ADR-003 → spec trace is one of its strengths. The ambiguities above are mostly **measurement and edge-case definitions** — not structural gaps. Resolving findings 1, 2, 5, 10, and 11 closes the largest implementation interpretation surface.

## Not Raised (Intentionally)

- Internal compiler algorithm, ledger schema specifics, provider HTTP semantics — appropriately deferred per ADR-003.
- Multi-session/index/watch-mode — explicitly out of scope per ADR-003 non-goals.
