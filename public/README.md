# Dev Skills

Custom skills for Claude Code, focusing on interactive development workflows and career advancement tools for software engineers.

## Skills

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

## Installation

### Via Claude Code

Add this marketplace to Claude Code:

```
/plugin marketplace add igor1309/skills
```

Then install the skills you want:

```
/plugin install tdd-interactive
/plugin install tdd-scaffold-review
/plugin install swift-package-manifest
/plugin install job-search-strategy
```

### Manual Installation

Alternatively, copy any skill folder to your Claude Code skills directory:

```bash
# Install individual skills
cp -r tdd-interactive ~/.claude/skills/
cp -r tdd-scaffold-review ~/.claude/skills/
cp -r swift-package-manifest ~/.claude/skills/
cp -r job-search-strategy ~/.claude/skills/

# Or install all skills at once
cp -r tdd-interactive tdd-scaffold-review swift-package-manifest job-search-strategy ~/.claude/skills/
```

## Usage

Claude Code will automatically load skills from the skills directory.

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

## License

MIT

## Author

Igor Malyarov
