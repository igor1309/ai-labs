---
date: 2026-04-27
model: gpt-5
description: "Empirical probe showing whether local semantic compression can reduce a real Claude Code session before model synthesis."
---

# Session Compression Probe

## Purpose

This probe checks whether a local session interpreter can reasonably compress real Claude Code JSONL before sending anything to a capable model. The goal is not to prove a final architecture. The goal is to ground the V2 discussion in observed session structure and rough compression ratios.

## Input

Session file:

```text
/Users/igormalyarov/.claude/projects/-Users-igormalyarov-Developer-Fora-iFora-iOS-App-ios/e6ff6488-4d3f-4154-931e-452293243a9b.jsonl
```

Observed input shape:

```text
raw_bytes:      1,536,754
lines:          350
parsed_records: 350
parse_errors:   0
```

## Record Composition

```text
assistant:             175 records,   343,751 raw bytes
user:                  137 records, 1,162,152 raw bytes
file-history-snapshot:  20 records,    20,196 raw bytes
system:                 11 records,     6,734 raw bytes
permission-mode:         2 records,       212 raw bytes
attachment:              2 records,     2,540 raw bytes
queue-operation:         2 records,       725 raw bytes
last-prompt:             1 record,         94 raw bytes
```

The large `user` byte count is mostly not human-authored prose. It is dominated by tool result data stored on user records.

## Dominant Fields

```text
toolUseResult: 879,329 bytes across 113 records
message:       465,015 bytes across 312 records
snapshot:       17,802 bytes across 20 records
```

`toolUseResult` alone accounts for roughly 57% of the raw session. This is the main reason semantic compression looks feasible: the session contains a large amount of machine-readable tool output that can often be represented as status, command, key lines, byte counts, and evidence anchors.

## Simulated Compression Results

The probe used a throwaway local `python3` script with no LLM and no embeddings. It parsed JSONL, preserved anchors, compacted tool inputs, summarized tool results with conservative line selection, and kept user text plus tool/error summaries for a model-facing digest context.

```text
compiled_event_ledger: 191,927 bytes,  8.0x compression, 12.5% of raw
semantic_event_ledger: 127,772 bytes, 12.0x compression,  8.3% of raw
digest_model_context:   40,978 bytes, 37.5x compression,  2.7% of raw
```

## Interpretation

The rough `10x-50x` compression expectation is plausible for this sample, with an important distinction:

- a fairly complete structured ledger reached about `8x`;
- a semantic model-facing digest context reached about `37.5x`;
- the compression came from understanding Claude Code record structure, not arbitrary truncation.

This supports local semantic compilation as a serious V2 direction. It does not mean every session will compress equally. Dense design discussions should compress less than tool-heavy implementation sessions because user requirements, decisions, and reasoning should be preserved conservatively.

## Compression Mechanism

The strongest compression comes from replacing bulky tool output with typed facts. For example, a large terminal result can become:

```json
{
  "anchor": "record:194",
  "tool": "Bash",
  "status": "failed",
  "output_bytes": 86365,
  "key_errors": ["selected error lines"],
  "resolved": true
}
```

This keeps the information needed for a digest while avoiding raw output duplication.

## Implication For V2 Discussion

The next design discussion should treat local session interpretation as a grounded option. The model should probably receive a compact semantic context with evidence anchors, not raw JSONL and not the current flattened `{ role, content }` transcript.

Embeddings are not required to explain this first compression win. They may still be useful later for retrieval over very large or multi-session corpora, but this probe shows that schema-aware local compilation alone can produce a major size reduction.
