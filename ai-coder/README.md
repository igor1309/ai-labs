# AI Coder

A central repository for AI-assisted software development: reusable prompts, guides, Claude Code skills, and experimental tools.

This repository contains a curated collection of instructions, skills, and tools designed to be portable and effective across various AI coding agents, including (but not limited to) `Gemini CLI` and `Claude Code`.

## Core Philosophy: Agent-Agnostic Instructions

AI tools and their interfaces evolve rapidly. This library is built on the principle that the quality of your instructions—the prompts and contextual guides—should be a durable, version-controlled asset, independent of any single tool.

By separating the "what to do" (the prompts) from the "how to do it" (the specific CLI command), we create a powerful, reusable toolkit that remains valuable even as the underlying AI agents change.

## Guides & Prompts

*   **`/guides`** — Foundational knowledge, methodologies, or style guides. Extended context documents that teach the AI *how* to think about a task.
    *   *Examples*: `tdd-essentials.md`, `arch-reviewer.md`, `debugging-analyst.md`

*   **`/prompts`** — Focused, concrete instructions for a specific task. Direct commands you give the AI.
    *   *Example*: `code-reviewer.txt`

The general pattern is to combine a **guide** (foundational context) with a **prompt** (specific command) when interacting with your chosen AI agent.

### Dev Skills (Claude Code)

The `dev-skills/` directory is the development workspace for Claude Code skills, merged into this repo via git subtree. Skills are developed here and automatically published to the public [igor1309/skills](https://github.com/igor1309/skills) repository via GitHub Actions.

**Published skills** (8 skills):

| Skill | Purpose |
|-------|---------|
| `arch-spec-review` | Review architecture specs for completeness and abstraction level |
| `discuss` | Collaborative discussion mode — explore ideas before coding |
| `doc-drift-audit` | Detect where docs no longer match the code |
| `job-search-strategy` | Job posting analysis and application strategy |
| `rpi-research` | Research phase of RPI workflow — investigate before planning |
| `swift-package-manifest` | Clean Package.swift creation using static property pattern |
| `tdd-interactive` | Interactive TDD with RED-GREEN-REFACTOR verification gates |
| `tdd-scaffold-review` | Evaluate test name scaffolds for TDD readiness |

**Install via Claude Code:**

```
/plugin marketplace add igor1309/skills
```

See [`dev-skills/public/README.md`](dev-skills/public/README.md) for full skill documentation and usage examples.
