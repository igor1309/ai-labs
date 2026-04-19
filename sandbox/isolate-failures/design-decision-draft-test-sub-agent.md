---
date: 2026-01-18
model: gpt-5.2
inspiration: "[Agent Design Is Still Hard | Armin Ronacher's Thoughts and Writings](https://lucumr.pocoo.org/2025/11/21/agents-are-hard/)"
---

# Design Decision Draft: Test Execution via Read-Only Sub-Agent

## Status
Draft → Approved for implementation

## Context / Problem
Running tests during AI-assisted development produces high-entropy output:
- repetitive failures
- build system noise
- flaky test artifacts
- verbose logs with low decision value

When test execution is performed in the same agent that authors code, this noise pollutes reasoning context and degrades iteration quality.

We need a mechanism that:
- preserves *decision-grade* failure signal
- keeps the main agent’s context clean
- enforces a strict separation between **code authoring** and **code execution**

## Decision
Introduce a **Test Sub-Agent** with *read-only* access to the repository.

The sub-agent:
- **executes tests only**
- **cannot modify code or repository state**
- **returns minimal output on success**
- **returns structured, compressed output on failure**

The main agent:
- authors code
- interprets structured failure reports
- decides next actions

## High-Level Architecture

```
Main Agent
  ├─ writes / modifies code
  ├─ requests test execution
  └─ consumes structured test results
        ▲
        │
Test Sub-Agent
  ├─ read-only repo access
  ├─ runs tests
  ├─ extracts failure signal
  └─ enforces zero-mutation policy
```

## Sub-Agent Responsibilities

### Allowed
- Run test commands
- Read files
- Inspect repository state
- Parse logs
- Detect flakiness via limited re-runs
- Produce structured summaries

### Explicitly Forbidden
- Editing any file in the repository
- Applying patches
- Formatting or linting
- Creating commits, branches, or tags
- Modifying project configuration
- Persisting changes inside the repo

Violation is treated as a **hard failure**.

## Enforcement Mechanisms

### 1. Filesystem Isolation
- Sub-agent runs in:
  - read-only worktree **or**
  - read-only mounted repo **or**
  - clone with filesystem permissions set to read-only
- Writable temp space allowed only outside repo (e.g. `/tmp/test-run-*`)

### 2. Command Allowlist
Only execution and inspection commands are permitted.

Examples:
- Test runners: `swift test`, `xcodebuild test`, `npm test`, `pytest`
- Inspection: `cat`, `ls`, `rg`, `sed` (no `-i`), `git diff`, `git status`, `git log`

Explicitly denied:
- Editors
- Patch utilities
- Formatters
- `git commit`, `git checkout`, `git push`, `git apply`

### 3. Post-Run Integrity Check
After execution:
```bash
git status --porcelain
git diff --name-only
```

Both **must be empty**.  
Non-empty result ⇒ policy violation.

## Execution Protocol

### Step 1 — Initial Run
- Run the requested test command once.
- Capture:
  - exit code
  - duration
  - raw output (internal only)

### Step 2 — Success Path
Return:
```
success (<duration>, <test_count>)
```

No logs, no summaries, no commentary.

### Step 3 — Failure Path
On non-zero exit code:

1. Identify **primary failure**
   - first failing test / first compiler error / first crash
2. Generate **failure fingerprint**
   - stable hash derived from:
     - error type
     - first error line
     - top stack frame(s)
   - volatile data stripped (paths, line numbers where needed)

3. Compare with previous fingerprint
   - if identical and repo unchanged → minimal report
   - if new or changed → full structured report

### Optional Step — Flake Detection
Only if failure category is plausibly flaky:
- timeouts
- async ordering issues
- known flaky test suites

One rerun maximum.

If rerun passes:
```
success (flaky_suspected: true, failed_once: <fingerprint>)
```

## Failure Report Schema (Decision-Grade)

```yaml
command:
  - swift test

environment:
  toolchain:
    swift: 5.9.2
    xcode: 15.1
  platform: macOS 14.2

result:
  exit_code: 1
  duration: 94s

failure_fingerprint: 8f3c1e2a

primary_failure:
  category: assertion_failure
  location:
    file: ItemListReducerTests.swift
    test: test_reload_shouldDefer_whenProcessingInProgress
  excerpt:
    - "XCTAssertEqual failed"
    - "Expected: loading"
    - "Actual: completed"

where_to_look:
  files:
    - ItemListReducer.swift
    - ItemListReducerTests.swift

novelty:
  same_as_previous: false
  previous_fingerprint: null
```

## Output Minimization Rules

- **Never return full logs**
- Maximum excerpt size is fixed (e.g. 40 lines)
- Only the *first* failure is reported
- Cascading failures are ignored unless explicitly requested

## Non-Goals
- Automatic fixing
- Automatic retries beyond flake detection
- Test prioritization or reordering
- Code ownership inference
- Performance optimization of tests

## Consequences

### Positive
- Clean main-agent context
- Deterministic iteration loop
- Clear separation of concerns
- Lower cognitive load during TDD

### Trade-offs
- Slight overhead in orchestration
- Requires disciplined schema adherence
- Debugging extremely complex failures may require explicit log request

## Implementation Notes
- This design is compatible with:
  - Codex CLI
  - Claude Code CLI
  - Gemini CLI
- Transport layer (JSON, YAML, plain text) is intentionally unspecified.
- Schema stability matters more than formatting.

---

**Bottom line:**  
Tests are treated as a *measurement instrument*, not a conversational participant.  
Only signal reaches the main agent; noise is contained.