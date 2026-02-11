# Dev Skills

Custom skills for Claude Code, focusing on interactive development workflows and career advancement tools for software engineers.

## Skills

### Architecture Specification Review

Review architecture specifications for completeness, appropriate abstraction level, and separation of concerns.

**Key features:**
- Evaluates boundaries, flows, constraints, and extension points
- Ensures specs stay at the right abstraction level
- Built-in self-evaluation checkpoint to prevent over-specification demands
- Distinguishes between architectural concerns and implementation details
- Respects explicitly deferred decisions

**Use when:** Reviewing top-level, implementation-agnostic architecture documents that define system boundaries, responsibilities, flows, and constraints without prescribing implementation details.

**Documentation:** See [arch-spec-review/SKILL.md](arch-spec-review/SKILL.md)

### Discuss

Collaborative discussion mode for exploring ideas, designs, and implementation approaches before taking action. Prevents premature implementation and ensures alignment before any code is written.

**Key features:**
- Agent takes positions — shares opinions, recommendations, and preferences instead of hiding behind neutral questions
- Read-only exploration — codebase and web research without any file changes
- Questions carry a lean — default to recommending, not just presenting menus
- One-question-at-a-time approach to clarify high-impact unknowns
- Structured options with contextual labels when discrete choices exist
- Clear guardrails: only the user can exit discuss mode
- Named anti-patterns to avoid common discussion failures

**Use when:** You want to explore, reason about, or align on a problem before building. Say "let's discuss", "let's think about", "before we build", or similar.

**Documentation:** See [discuss/SKILL.md](discuss/SKILL.md)

### Documentation Drift Audit

Verify that markdown documentation accurately describes the current codebase. Detects factual mismatches between docs and code — wrong names, signatures, paths, behaviors. Does not rewrite, reformat, or improve docs.

**Key features:**
- Strict protocol against over-editing — guardrails are the point
- Parallel subagent audit for 3+ files, inline for 1–2
- Read-only subagents with structured prompt template
- Individual mismatch review before accepting findings
- Minimal fixes only after user approval

**Use when:** Auditing documentation accuracy, checking if docs match code after refactors, finding stale or drifted documentation.

**Documentation:** See [doc-drift-audit/SKILL.md](doc-drift-audit/SKILL.md)

### Intake

Task intake for implementation assignments. The agent reads all referenced documents and explores the codebase, then demonstrates understanding before auto-transitioning to plan mode.

**Key features:**
- Mandatory exploration — agent reads docs and codebase before asking questions
- Skill-aware — scans available skills for domain knowledge (wiring patterns, composition APIs, flow architecture, conventions) that may not exist anywhere else
- Structured playback: What I'm Building, What I'm Touching, Key Constraints, Open Questions
- Smart depth — primary doc thoroughly, references as needed, not exhaustive
- Spec is authoritative — agent implements what the spec says, never silently deviates
- Auto-transitions to plan mode when understanding is confirmed
- Subagent exploration for large codebases

**Use when:** You have a well-prepared task document (spec, plan, PR) and want the agent to understand it before planning. Say `/intake` followed by the task reference.

**Documentation:** See [intake/SKILL.md](intake/SKILL.md)

### Job Search Strategy

Comprehensive job search strategy toolkit for analyzing job postings, discovering hidden insights, interviewing candidates to match skills, developing targeted skills, and executing creative outreach strategies.

**Key features:**
- Deep job posting analysis scripts
- Candidate skill discovery through targeted interviews
- Strategic research and outreach guides
- Creative application formats and strategies
- Skill gap identification and development plans

**Use when:** Strategizing job searches, preparing tailored applications, developing competitive advantages, or coaching candidates through the job hunt process.

**Documentation:** See [job-search-strategy/SKILL.md](job-search-strategy/SKILL.md)

### RPI Research

Research phase for task execution. Investigate the codebase, build understanding, report findings without changing code or proposing solutions.

**Key features:**
- Restates task understanding to catch misinterpretation early
- Explores relevant files, patterns, and conventions
- Reports findings, risks, and unknowns
- Asks clarifying questions when needed
- Large-scope mode for broad investigations (grouped pattern families, coverage summaries)
- Optional save-to-file for findings

**Use when:** Starting any non-trivial task. Describe the task, then invoke `/rpi-research` to get research output before planning or implementing.

**Documentation:** See [rpi-research/SKILL.md](rpi-research/SKILL.md)

### Swift Package Manifest

Clean, maintainable Package.swift creation and editing using the static property pattern from Facebook iOS SDK.

**Key features:**
- Eliminates magic strings with static properties
- Type-safe manifest organization
- Clear extension-based structure
- Alphabetical ordering for maintainability
- Swift 6 compatibility

**Use when:** Creating new Package.swift files, refactoring existing ones, adding modules/targets to Swift packages, or organizing Swift Package Manager manifests.

**Documentation:** See [swift-package-manifest/SKILL.md](swift-package-manifest/SKILL.md)

### TDD Interactive

Interactive Test-Driven Development workflow with reviewer-in-the-loop. Implements the RED-GREEN-REFACTOR cycle with two mandatory verification gates where a reviewer (human or AI) approves work before progression.

**Key features:**
- Two verification gates: at RED (failing test) and REFACTOR (code quality)
- Immutable git history (no amending or force pushing)
- Systematic escalation protocol for when agents get stuck
- Language-specific test runner guidance
- Review guidelines for both executing agent and reviewer

**Use when:** Implementing features, bug fixes, or refactoring using test-first methodology with step-by-step verification.

**Documentation:** See [tdd-interactive/SKILL.md](tdd-interactive/SKILL.md)

### TDD Scaffold Review

Evaluates test name scaffolds for TDD readiness by determining if each test name provides enough specification clarity to write a failing test.

**Key features:**
- Assesses whether test names clearly define testable behavior
- Identifies ambiguous or underspecified tests
- Provides minimal clarifying questions for unclear tests
- Generates structured Markdown reports

**Use when:** Reviewing test scaffolds, evaluating executable specifications, or assessing whether test names are ready for TDD implementation.

**Documentation:** See [tdd-scaffold-review/SKILL.md](tdd-scaffold-review/SKILL.md)

## Installation

### Via Claude Code

Add this marketplace to Claude Code:

```
/plugin marketplace add igor1309/skills
```

Then install the skills you want:

```
/plugin install arch-spec-review
/plugin install discuss
/plugin install doc-drift-audit
/plugin install intake
/plugin install job-search-strategy
/plugin install rpi-research
/plugin install swift-package-manifest
/plugin install tdd-interactive
/plugin install tdd-scaffold-review
```

### Manual Installation

Alternatively, copy any skill folder to your Claude Code skills directory:

```bash
# Install individual skills
cp -r arch-spec-review ~/.claude/skills/
cp -r discuss ~/.claude/skills/
cp -r doc-drift-audit ~/.claude/skills/
cp -r intake ~/.claude/skills/
cp -r job-search-strategy ~/.claude/skills/
cp -r rpi-research ~/.claude/skills/
cp -r swift-package-manifest ~/.claude/skills/
cp -r tdd-interactive ~/.claude/skills/
cp -r tdd-scaffold-review ~/.claude/skills/

# Or install all skills at once
cp -r arch-spec-review discuss doc-drift-audit intake job-search-strategy rpi-research swift-package-manifest tdd-interactive tdd-scaffold-review ~/.claude/skills/
```

## Usage

Claude Code will automatically load skills from the skills directory.

### Architecture Specification Review

Invoke when reviewing architecture specifications to ensure they maintain appropriate abstraction levels.

**Example prompt:**
```
Review this architecture specification for completeness and appropriate abstraction level.
```

Or:
```
Evaluate this architecture document to ensure it defines system boundaries without prescribing implementation details.
```

### Discuss

Invoke when you want to explore an idea or align on an approach before building.

**Example prompt:**
```
Let's discuss how to add caching to the API layer.
```

Or:
```
Before we build — I want to think through the authentication redesign.
```

### Documentation Drift Audit

Invoke after refactors or when you suspect docs have fallen out of sync with code.

**Example prompt:**
```
Audit the documentation in this repo for drift — find where docs don't match the code.
```

Or:
```
Check if the README still accurately describes the current API.
```

### Intake

Invoke when you have a task assignment with referenced documents and want the agent to understand before planning.

**Example prompt:**
```
/intake implement step 3 from docs/feature-spec.md, see also docs/api-contracts.md
```

Or:
```
Your task is to implement PR #42 from sandbox/feature-plan.md
/intake
```

### Job Search Strategy

Invoke when analyzing job postings or developing application strategies.

**Example prompt:**
```
Analyze this job posting and help me develop a targeted application strategy.
```

Or:
```
Help me identify skill gaps and create a development plan for this role.
```

### RPI Research

Invoke after describing a task to get research output before planning or coding.

**Example prompt:**
```
Add caching to the API layer.
/rpi-research
```

Or:
```
The login flow has a bug where session tokens expire too early.
/rpi-research
```

### Swift Package Manifest

Invoke when creating or refactoring Package.swift files.

**Example prompt:**
```
Create a Package.swift using the static property pattern for [package description].
```

Or:
```
Refactor this Package.swift to use the clean static property pattern.
```

### TDD Interactive

Invoke the skill by requesting interactive Test-Driven Development with verification gates.

**Example prompt:**
```
Implement [task/test] using Test-Driven Development with step-by-step verification gates.
I am the reviewer and will approve at each checkpoint.
```

**What to expect:**
- Claude will announce: "I'm using the TDD Interactive skill..."
- You'll approve work at two points: after RED (failing test) and after REFACTOR
- Just say "go" to approve and proceed

### TDD Scaffold Review

Invoke when you have test names and need to verify they're ready for TDD implementation.

**Example prompt:**
```
Review this test scaffold to determine if the test names are clear enough to write failing tests.
```

## License

MIT

## Author

Igor Malyarov
