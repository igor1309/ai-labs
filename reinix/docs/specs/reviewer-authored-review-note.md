---
date: 2026-04-29
model: claude-opus-4-7
description: "Spec for Reinix reviewer-authored review notes based on ADR-012."
---

# Reviewer-Authored Review Note Spec

## Goal

The Reviewer agent authors a Markdown review note alongside its structured verdict on every round, and Reinix persists the note as a durable per-round run artifact referenced from the round's `agent-end` event.

## Public Interface

### Reviewer Output Schema

The built-in reviewer output schema (`reinix://schemas/reviewer-output`) requires three top-level fields:

- `verdict`: existing string field.
- `verification`: existing object (unchanged from the verification contract).
- `summary`: new non-empty string containing the Reviewer-authored review note in Markdown.

The schema fragment:

```text
type: object
required: [verdict, verification, summary]
properties:
  summary: { type: string, minLength: 1 }
  verification: { ...existing verification schema... }
```

### Persisted Review Note

When a reviewer round completes successfully, Reinix writes:

```text
<run-directory>/review-NN.md
```

where `NN` is the two-digit zero-padded round index. The Nth successful reviewer round of a run persists `review-NN.md`: the first persists `review-01.md`, the second `review-02.md`, and so on.

### Agent-End Event Reference

The reviewer round's `agent-end` event includes the persisted artifact's run-relative path:

```text
reviewNoteReference: "review-NN.md"
```

The field appears only on reviewer `agent-end` events, never on producer or remediator events.

## Behavior Rules

### Reviewer Output Validation

- The built-in `reinix://schemas/reviewer-output` schema lists `summary` in `required` and declares `summary: { type: "string", minLength: 1 }`.
- Reviewer outputs missing `summary`, with a non-string `summary`, or with an empty `summary` must fail schema validation as `RuntimeFailure`.
- Inline reviewer output schemas in `agents.yaml` that omit `summary` from `required` must fail startup with `StartupValidationFailure`. The failure message must point to either `schemaRef: reinix://schemas/reviewer-output` or including `summary` (string, required) in the inline schema.

### Persistence

- On a successful reviewer round, Reinix persists the round's `summary` content as `review-NN.md` in the run directory before emitting the round's `agent-end` event.
- Round index `NN` is rendered with two-digit zero padding (`01`, `02`, …) and is assigned per the Nth-successful-round rule above.
- Reinix preserves the reviewer-authored content exactly.
- Reinix must not overwrite an existing `review-NN.md`.
- Persistence failure must fail the run with `RuntimeFailure`.
- Reinix must not inspect, parse, normalize, or branch on `summary` content.
- Reviewer rounds that fail before producing valid output (e.g. provider error, schema validation failure) do not persist a review note for that round and do not consume a round index.

### Agent-End Event Reference

- Successful reviewer `agent-end` events include `reviewNoteReference: "review-NN.md"`.
- Producer and remediator `agent-end` events must not include `reviewNoteReference`.
- Failed reviewer rounds (provider error or schema validation failure) must not include `reviewNoteReference`.
- The `reviewNoteReference` value must be the same relative path Reinix persisted for that round.

### Orchestrator Boundary

- The Orchestrator must persist review notes from per-round Reviewer output only, never from policy output.
- The Orchestrator must not pass review note content into policy decisions, remediator input, or any field other than the round's persisted artifact and event reference.
- The Orchestrator must not become aware of Plan/Code phases, Git branches, worktrees, commits, or pull requests to support review notes.
- Policy session contents remain opaque to the Orchestrator.

## Tests (Required)

1. Built-in reviewer schema must require `summary` as a non-empty string and reject missing, non-string, or empty `summary`.
2. `resolveAgentSettings` must accept inline reviewer schemas that require `summary` (string).
3. `resolveAgentSettings` must reject inline reviewer schemas that omit `summary` from `required`, with a message pointing at `schemaRef: reinix://schemas/reviewer-output` or the missing field.
4. `resolveAgentSettings` must continue to accept reviewer configurations that use `schemaRef: reinix://schemas/reviewer-output`.
5. `runWorkflow` must persist `review-01.md` containing the reviewer's `summary` exactly, on the first reviewer round of a run.
6. `runWorkflow` must include `reviewNoteReference: "review-01.md"` on the first reviewer round's `agent-end` event.
7. `runWorkflow` must persist `review-02.md` for the second reviewer round of a remediated run, leaving `review-01.md` untouched.
8. `runWorkflow` must include `reviewNoteReference: "review-02.md"` on the second reviewer round's `agent-end` event.
9. `runWorkflow` must not write `review-NN.md` for failed reviewer rounds (provider failure or schema validation failure).
10. `runWorkflow` must not include `reviewNoteReference` on producer or remediator `agent-end` events.
11. `runWorkflow` must fail with `RuntimeFailure` when review note persistence fails.
12. `runWorkflow` must not pass `summary` content into `ReviewFixPolicy.decide` input or remediator input.
13. Reviewer prompt must explicitly direct the reviewer to populate `summary` with a Markdown narrative covering what was reviewed, what verification was performed, and the reasoning behind the verdict.

## Done Criteria

- Built-in `reinix://schemas/reviewer-output` requires a non-empty string `summary`.
- Inline reviewer output schemas missing `summary` fail at startup validation.
- Reviewer prompt directs the reviewer to author the review note narrative.
- `runWorkflow` persists `review-NN.md` per reviewer round and references it from the round's `agent-end` event.
- Failed reviewer rounds, producer rounds, and remediator rounds produce no `review-NN.md` and no `reviewNoteReference`.
- The Orchestrator does not parse, log, or pass `summary` content into other agent or policy inputs.
- Required tests pass.
