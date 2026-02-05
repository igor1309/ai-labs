---
name: doc-drift-audit
description: >
  This skill should be used when the user asks to "audit documentation",
  "check if docs are up to date", "verify docs match code",
  "run a doc drift audit", "find stale documentation",
  "check README accuracy", or after large refactors that may have left
  documentation out of sync with the codebase. Detects factual mismatches
  between markdown documentation and code — wrong names, signatures, paths,
  behaviors. Does not rewrite, reformat, or improve docs.
version: "1.0.0"
author: Igor Malyarov
---

# Documentation Drift Audit

**Strict protocol — follow exactly.** The guardrails against over-editing are the entire point. Do not adapt, shorten, or skip steps.

## Purpose

Verify that markdown documentation accurately describes the current codebase. Nothing more.

Documentation drift means: the doc says X, the code does Y. Find those cases. Do not improve, restructure, reformat, or rewrite documentation.

## Scope

### In scope

- Wrong function names, signatures, or types
- Wrong behavior descriptions
- Wrong file paths
- Missing or renamed parameters
- Removed features still documented
- New features not documented

### Out of scope — do not touch

- **Formatting**: header numbering, list punctuation, markdown structure, capitalization.
- **Style**: word choice, sentence structure, tone, verbosity.
- **Additions**: new sections, new explanations, expanded examples, status markers.
- **Restructuring**: converting blockquotes to lists, reorganizing, adding frontmatter fields.

Discard any finding that is formatting or style — it is not drift.

## Workflow

### 1. Preparation

1. Run `git status` and record the current state.
2. If there are staged changes, note which files — exclude those from the audit.
3. Discover markdown files to audit:
   - Use `Glob` with `**/*.md` to find all markdown files.
   - Exclude `node_modules/`, `vendor/`, `.build/`, and similar generated directories.
   - Present the file list to the user for confirmation. Remove any files the user excludes.

### 2. Audit Execution

**Adaptive strategy based on file count:**

- **1–2 files**: Process inline — read each doc file and verify claims against code directly, without launching subagents.
- **3+ files**: Launch one subagent per doc file in parallel using the Task tool with `subagent_type: "Explore"`. Explore agents cannot Edit/Write — this enforces read-only structurally, not just by instruction.

#### Subagent Rules

- Subagents are **read-only researchers**. They must NOT edit files.
- Prompt each subagent using the template in **`references/agent-prompt-template.md`**.
- Subagent output is a report, not a patch — extract only factual mismatch claims from their output.

### 3. Review Subagent Output

Review each reported mismatch individually:

1. Is this a factual code-vs-doc contradiction? If no → discard.
2. Does the report include both the doc claim and code evidence? If no → verify independently before accepting.
3. Is the suggested fix a minimal correction or a rewrite? If rewrite → discard.
4. Would the fix change the document's meaning or voice? If yes → flag for user decision.

Never batch-accept findings. A subagent may conflate formatting fixes with semantic drift.

### 4. Present Findings

Present a single consolidated report to the user:

```
## Documentation Drift Report

### [file path]
- Line X: says "[claim]" — actual: [what code does]. Suggested fix: [minimal correction].
- ...

### [file path]
- No drift found.
```

**Wait for user approval before making any edits.**

### 5. Apply Fixes (after approval only)

- Edit only the specific words or lines that are factually wrong.
- Preserve the document's existing structure, formatting, and voice.
- Do not add content, sections, or annotations.
- Run `git diff` after edits — the diff must be minimal and obviously correct.

## Anti-patterns

- Rewriting a document "while we're at it" — this is not a rewrite pass.
- Reporting formatting violations as drift — `1)` vs `1.` is not drift.
- Adding status markers like `(completed)` or `(planned)` — that is new content.
- Stripping semantic punctuation (quotes, emphasis) for "consistency" — that destroys meaning.
- Expanding terse docs with implementation details — brevity may be intentional.
- Letting subagents edit files — they research; edits happen only after user approval.

## Additional Resources

### Reference Files

- **`references/agent-prompt-template.md`** — exact prompt template for subagents performing doc verification.
