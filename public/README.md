# Dev Skills

Custom skills for Claude Code, focusing on interactive development workflows.

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

## Installation

### Via Claude Code

Add this marketplace to Claude Code:

```
/plugin marketplace add igor1309/skills
```

Then install the skills you want:

```
/plugin install tdd-interactive
```

### Manual Installation

Alternatively, copy the `tdd-interactive` folder to your Claude Code skills directory:

```bash
cp -r tdd-interactive ~/.claude/skills/
```

## Usage

Claude Code will automatically load skills from the skills directory.

### Invoking TDD Interactive

Invoke the skill by requesting interactive Test-Driven Development with verification gates.

**Recommended prompt:**
```
Implement [task/test] using Test-Driven Development with step-by-step verification gates.
I am the reviewer and will approve at each checkpoint.
```

**What to expect:**
- Claude will announce: "I'm using the TDD Interactive skill..."
- You'll approve work at two points: after RED (failing test) and after REFACTOR
- Just say "go" to approve and proceed

## License

MIT

## Author

Igor Malyarov
