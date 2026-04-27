---
title: ADR-001 — Session Digest Exploration Prototype with Deep Agents and NVIDIA NIM
date: 2026-04-26
status: "accepted; provider invariant superseded by ADR-002; orchestration, input-shape, and digest persistence constraints superseded by ADR-003"
model: GPT-5.5 Thinking
version: 1.1
---

# ADR-001: Session Digest Exploration Prototype with Deep Agents and NVIDIA NIM

## Status

Accepted. The NVIDIA-only provider invariant is superseded by [ADR-002](adr-002-session-digest-openai-compatible-routing.md). The V1 orchestration, input-shape, and digest persistence constraints are superseded by [ADR-003](adr-003-session-digest-local-ledger-synthesis.md).

## Executive Summary

Build a local CLI prototype, `session-digest`, that turns one Claude Code JSONL session into one Markdown postmortem digest using LangChain Deep Agents over NVIDIA NIM. The prototype is bounded so it can exercise Deep Agents orchestration, role delegation, and artifact generation without taking on product-scale concerns.

## Context

The exploration goal is to evaluate LangChain Deep Agents on free NVIDIA NIM APIs through a useful, bounded utility rather than a toy demo. Constraints:

- Free NIM tier: cost and rate sensitivity push toward small inputs and a single configured model.
- Single-user, local-only setting: no shared infrastructure, no service surface, no observability stack to lean on.
- Exploration phase: the architecture must remain cheap to change.

Rejected alternatives, all deferred to later ADRs if pursued:

- HTTP service or watched-folder daemon — unnecessary surface for a learning prototype.
- Multi-session digesting, indexing, or cross-session state — premature without a first working pass.
- Provider abstraction across NIM and other LLM vendors — postpones the actual NIM learning goal.
- Chunking, compression, or multi-pass summarization for large sessions — adds complexity before the small-session loop is understood.
- Redaction or secret scanning before NIM calls — out of scope for a tool the user invokes on a file they choose.

## Decision

The prototype MUST satisfy the following architectural invariants for v1:

- **Surface**: a local CLI named `session-digest`. The prototype MUST NOT expose an HTTP endpoint, watched-folder mode, or service deployment.
- **Provider**: NVIDIA NIM MUST be the sole LLM provider. The prototype MUST NOT introduce a provider abstraction layer.
- **Orchestration**: LangChain Deep Agents MUST be the sole orchestrator for digest generation. The role split MUST be exactly three subagents: Extractor, Improver, Evidence checker.
- **Model tier**: a single configured NIM model MUST serve all roles. Multi-tier model routing MUST NOT be introduced in v1.
- **Input**: each invocation MUST accept exactly one Claude Code local session JSONL file, ≤1 MB. The prototype MUST NOT support chunking, multi-session input, or generic transcript adapters.
- **Output**: each successful invocation MUST produce exactly one Markdown digest with the fixed section structure and traceability front matter defined below.
- **Output location**: the output and configuration directory MUST be `~/.session-digests/`. The CLI MUST create this directory if it does not exist.
- **Persistence**: generated Markdown digests MUST be the only persisted artifact. The prototype MUST NOT maintain an index, copy the raw input, or hold cross-session state.

## Rules / Invariants

### Input

- Input MUST be a real Claude Code local session JSONL file, passed explicitly to the CLI.
- Maximum input size MUST be 1 MB. Oversized input MUST fail explicitly.
- JSONL parsing MUST be best-effort: read valid records, skip unknown shapes, fail only when no usable Claude Code messages are found.
- Arbitrary files MUST NOT be accepted as valid input.

### Output

- Output MUST be a Markdown digest written under `~/.session-digests/`.
- Output filenames MUST include a second-precision timestamp suffix to avoid collisions during exploration.
- The CLI MUST NOT copy the raw Claude JSONL input.
- On success, `stdout` MUST contain only the created digest path.

### Digest structure

The v1 digest MUST use this fixed action-oriented postmortem structure:

```markdown
# Session Digest

## Session summary

## Outcome

## Useful decisions

## Failure or friction points

## Next-session improvements

## Evidence notes
```

The primary optimization target is actionability. The hard quality constraint is factual traceability: non-obvious claims MUST be grounded in lightweight evidence notes (short source references such as section, line, record, or turn markers). Exhaustive claim-level citations are NOT required.

### Digest front matter

Each generated digest MUST include front matter with traceability metadata:

```yaml
---
title: Session Digest
source_path: /path/to/source/session.jsonl
provider: nvidia_nim
model: <configured NVIDIA_MODEL>
generated_at: <timestamp>
---
```

### Deep Agents responsibility

Deep Agents MUST be responsible for digest orchestration only:

- read one session file;
- plan the digest sections;
- delegate analysis to the fixed role subagents;
- produce the final Markdown digest.

Deep Agents MUST NOT manage indexing, persistence, scheduling, provider abstraction, repo state, or worktree state.

### Subagent roles

The role split is fixed:

| Subagent | Responsibility |
|---|---|
| Extractor | Identifies summary, outcome, decisions, and friction points. |
| Improver | Proposes concrete next-session improvements. |
| Evidence checker | Verifies that non-obvious claims have lightweight evidence notes. |

### Provider

- NVIDIA NIM MUST be the LLM provider.
- A single configured NIM model MUST serve all Deep Agents roles in v1.
- A provider abstraction layer MUST NOT be introduced in v1.

### Configuration

- Configuration MUST live under `~/.session-digests/`.
- `NVIDIA_API_KEY` and `NVIDIA_MODEL` MUST both be required; there MUST be no default model.
- The CLI MUST fail fast when either required key is missing or empty.
- The CLI MUST NOT perform a preflight model-validation call.
- Passing the API key as a CLI argument MUST NOT be supported.
- External secret management is out of scope.

### Privacy and retention

- The tool is local-only, but selected session content is sent to NVIDIA NIM.
- The user is responsible for selecting a safe Claude Code JSONL file.
- Redaction and secret scanning MUST NOT be performed in v1.
- The raw input file MUST NOT be copied.
- The digest front matter MUST include the source file path for local traceability.

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

The main accepted risk is sending sensitive local session content to an external model provider. This is accepted for v1 because the tool is local-only and the user explicitly selects the input file.

The second tradeoff is rejecting large sessions instead of chunking or compressing them. This keeps the first version inspectable and easier to evaluate.

### Success criterion

The prototype is successful if it can produce a usable digest from one real Claude Code session file and at least one next-session improvement is worth reusing. Running end-to-end is not sufficient by itself.

## Non-Goals

The following are explicitly out of scope for v1 and MUST trigger a new ADR or amendment if pursued:

- HTTP endpoint, watched folder mode, or service deployment.
- CI for the exploration phase.
- Indexing or multi-session digesting.
- Persistence beyond generated Markdown files.
- Repo or worktree awareness.
- Provider abstraction.
- Automated scheduling.
- Chunking, compression, or multi-pass summarization.
- Generic transcript adapters.
- Secret scanning or redaction.
- Copying raw session inputs.
- CLI API-key arguments.

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

## Related

- Spec: [`../specs/session-digest.md`](../specs/session-digest.md) — CLI surface, exact error wording, filename format, configuration bootstrap, and test enumeration.
- Companion: [`../deepagents-nvidia-nim-use-cases.md`](../deepagents-nvidia-nim-use-cases.md) — broader use-case catalog this prototype is drawn from.

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
| Output directory | `~/.session-digests/` (MUST) |
| Output naming | Timestamped filename |
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
