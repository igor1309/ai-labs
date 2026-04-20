---
date: 2026-04-19
model: claude-sonnet-4-6
description: "Research on AGENTS.md / CLAUDE.md organization best practices for AI coding agents"
---

# AGENTS.md / CLAUDE.md Organization Best Practices

## Summary

The community has converged on a clear pattern: keep the root instruction file short and use it as a **discovery doc** — a brief entry point that points to separate topic-specific files loaded on demand. This pattern is called **progressive disclosure**. Files that violate it (300+ lines of mixed rules) cause measurable degradation in instruction-following.

Key findings from research across official Anthropic docs, HumanLayer, Builder.io, GitHub Blog, augmentcode.com, and community discussions:

- Anthropic officially targets **under 200 lines** per CLAUDE.md file.
- Community consensus places the ceiling at **300 lines**; best-in-class examples (HumanLayer) stay **under 60 lines**.
- Research (arxiv.org/pdf/2507.11538, cited by HumanLayer) shows LLMs can follow ~150–200 instructions with reasonable consistency; instruction-following quality **decays uniformly** as count increases — not just for late rules but for all of them.
- Claude Code injects its own system prompt (~50 instructions). This means CLAUDE.md is competing for a shared budget.
- Bloated root files cause Claude to ignore half the rules — Anthropic's own best-practices page states: "Bloated CLAUDE.md files cause Claude to ignore your actual instructions."

---

## Official Anthropic Guidance

Sources: [docs.anthropic.com/en/docs/claude-code/memory](https://docs.anthropic.com/en/docs/claude-code/memory), [docs.anthropic.com/en/docs/claude-code/best-practices](https://docs.anthropic.com/en/docs/claude-code/best-practices), [claude.com/blog/using-claude-md-files](https://www.claude.com/blog/using-claude-md-files)

### Size target

> "Target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence. If your instructions are growing large, split them using imports or `.claude/rules/` files."

### Include vs. exclude

| Include | Exclude |
|---|---|
| Bash commands Claude cannot guess | Anything Claude can infer from reading code |
| Code style rules that differ from defaults | Standard language conventions Claude already knows |
| Testing instructions and preferred test runners | Detailed API documentation (link instead) |
| Repository etiquette (branch naming, PR conventions) | Information that changes frequently |
| Architectural decisions specific to the project | Long explanations or tutorials |
| Developer environment quirks, required env vars | File-by-file descriptions of the codebase |
| Common gotchas or non-obvious behaviors | Self-evident practices like "write clean code" |

### Splitting mechanisms (Claude Code–native)

Claude Code supports three mechanisms for breaking up a large CLAUDE.md:

1. **`@path/to/file` imports** — referenced files are expanded inline at load time. Up to 5 levels of recursion. Use to keep the root file as an index.
2. **`.claude/rules/*.md`** — files here auto-load every session (no `@` needed). With a `paths:` YAML frontmatter field, a rule file loads *only* when Claude reads files matching the glob — saving context for unrelated work.
3. **`.claude/skills/`** — on-demand domain knowledge invoked by name or loaded when relevant. Not part of every session's startup context.

### File hierarchy (Claude Code)

```
~/.claude/CLAUDE.md          ← personal, all projects
<repo>/CLAUDE.md             ← project-wide (committed)
<repo>/CLAUDE.local.md       ← personal project overrides (gitignored)
<subdir>/CLAUDE.md           ← loaded on demand when working in that directory
<repo>/.claude/rules/*.md    ← always-loaded or path-scoped modular rules
<repo>/.claude/skills/       ← on-demand skills
```

---

## Progressive Disclosure Pattern

Source: [humanlayer.dev/blog/writing-a-good-claude-md](https://humanlayer.dev/blog/writing-a-good-claude-md), [medium.com/towards-artificial-intelligence/writing-a-good-claude-md](https://medium.com/towards-artificial-intelligence/writing-a-good-claude-md-c40a32b39dfa)

The recommended structure for larger projects:

```
agent_docs/
  |- building_the_project.md
  |- running_tests.md
  |- code_conventions.md
  |- service_architecture.md
  |- database_schema.md
  |- service_communication_patterns.md
```

Then CLAUDE.md / AGENTS.md lists these files with a one-line description each, and instructs the agent to read only those relevant to the current task.

**Key principle:** prefer pointers over copies. Reference `file:line` locations rather than embedding code snippets that will go stale.

**Why it works:** CLAUDE.md goes into every session. Non-universal content (e.g., database schema rules) dilutes the signal-to-noise ratio and causes Claude to apply the irrelevant rule — or miss the relevant one entirely.

---

## What Belongs in the Root File vs. Separate Files

### Root file (CLAUDE.md / AGENTS.md) — universal, session-agnostic

- One-sentence project description (WHY)
- Tech stack + versions (WHAT)
- Key directory layout — enough to orient, not exhaustive
- Build, test, lint commands (exact, copy-pasteable)
- Non-obvious architectural decisions and their rationale
- Hard constraints / invariants ("never write to prod DB from tests")
- Pointer section: list of topic-specific doc files with brief descriptions
- Critical gotchas every engineer (human or AI) trips on

### Extract to separate files — conditional or domain-specific

| Topic | Where |
|---|---|
| Detailed coding conventions | `.claude/rules/conventions.md` or `agent_docs/code_conventions.md` |
| Testing patterns and fixtures | `.claude/rules/testing.md` (path-scoped to `**/*.test.*`) |
| Database schema and migration rules | `agent_docs/database_schema.md` |
| Service communication / API patterns | `agent_docs/service_communication_patterns.md` |
| Git workflow, branch naming, PR conventions | `agent_docs/git_workflow.md` or `.claude/rules/git.md` |
| Language-specific rules in a polyglot repo | `.claude/rules/typescript.md`, `.claude/rules/go.md`, etc. — path-scoped |
| Framework-specific guidance | `.claude/rules/react.md` path-scoped to `**/*.tsx` |
| Security constraints | `.claude/rules/security.md` |
| Release / deploy process | `agent_docs/release_process.md` |
| Subagent / orchestration config | `AGENTS.md` entries or `.claude/agents/` |

### What to remove entirely

- Code style rules that a linter/formatter already enforces (use hooks instead).
- Codebase overviews / directory listings — research shows agents find files just as fast without them, and the tokens are wasted.
- Task-specific instructions that only apply sometimes.
- Auto-generated content (`/init` output tends to hurt more than help if left unedited).

---

## Real-World Organization Examples

### HumanLayer (< 60 lines)

Root CLAUDE.md under 60 lines. Points to `agent_docs/` for domain-specific context. Full breakdown at [humanlayer.dev/blog/writing-a-good-claude-md](https://humanlayer.dev/blog/writing-a-good-claude-md).

### github/gh-aw (AGENTS.md with skills directory)

Uses a root AGENTS.md that instructs the agent to be "lazy" about skills — reference `skills/` only when specialized knowledge is genuinely needed. Skills are not loaded by default. Pattern explicitly documented in the file: "Only reference skills when you actually need their specialized knowledge."

Source: [github.com/github/gh-aw/blob/main/AGENTS.md](https://github.com/github/gh-aw/blob/main/AGENTS.md)

### augmentcode.com recommended template

Suggests splitting at 150–200 lines. Root file stays as org-wide standards and global commands; subdirectory AGENTS.md files carry package-specific rules.

```
project/
├── AGENTS.md              # Root: org-wide standards, global commands
├── apps/
│   ├── web/
│   │   └── AGENTS.md      # Web app overrides
│   └── api/
│       └── AGENTS.md      # API service overrides
```

Source: [augmentcode.com/guides/how-to-build-agents-md](https://www.augmentcode.com/guides/how-to-build-agents-md)

### PrimeLine 2-tier rules architecture

Separates `.claude/rules/` (behavioral defaults, auto-loaded, ≤200 lines each) from `knowledge/rules/` (deep guides, loaded on demand). Root CLAUDE.md = project identity only.

> "CLAUDE.md = project identity (stack, paths, constraints). `.claude/rules/` = behavioral defaults. `knowledge/rules/` = deep guides (loaded on demand)."

Source: [primeline.cc/blog/claude-md-rules](https://primeline.cc/blog/claude-md-rules)

### OpenAI repo

88 nested AGENTS.md files. Root sets org-wide standards; each package owns its own file. Closest file wins; explicit user chat prompts override everything.

### Effloow recommended structure

```
project/
├── CLAUDE.md              # Under 100 lines at root
├── .claude/
│   └── rules/
│       ├── conventions.md
│       ├── testing.md
│       └── git.md
└── docs/
    └── agent/
        ├── testing.md
        ├── architecture.md
        └── database.md
```

Source: [effloow.com/articles/claude-md-best-practices-setup](https://effloow.com/articles/claude-md-best-practices-setup)

---

## AGENTS.md vs. CLAUDE.md

| Aspect | CLAUDE.md | AGENTS.md |
|---|---|---|
| Primary audience | Claude Code | Any AI tool (Cursor, Copilot, Codex CLI, Gemini CLI) |
| Format | Plain Markdown + `@import` syntax | Plain Markdown |
| Auto-loaded | Yes (Claude Code) | Yes (30+ tools) |
| Nested/hierarchical | Yes | Yes (closest wins) |
| Path-scoped rules | Via `.claude/rules/` frontmatter | Depends on tool |
| Skills / subagent config | `.claude/skills/`, `.claude/agents/` | AGENTS.md `### Agents` section |

**For multi-tool teams:** put shared rules in AGENTS.md; add a minimal CLAUDE.md that references it (`See @AGENTS.md`) or symlink the two files.

**For Claude Code–only teams:** use CLAUDE.md with `@import` and `.claude/rules/` for full feature support.

---

## Recommendations for a 300+ Line AGENTS.md

Based on all sources, the actionable refactor path for a large existing AGENTS.md:

1. **Audit for universality.** Every line that only applies to some tasks should be extracted. If it is not true on every session, it should not be in the root file.

2. **Identify topic clusters.** Group rules by domain: TDD/testing, Swift conventions, git workflow, commit standards, log/doc maintenance, CI/CD, Docker, etc.

3. **Extract each cluster to a dedicated file** under `docs/guides/` (or `agent_docs/`). Name files by topic in kebab-case.

4. **Rewrite the root as a discovery doc:**
   - Project overview (2–3 sentences)
   - Tech stack (brief)
   - Key commands (build, test)
   - Pointer table: file → what it covers → when the agent should read it

5. **Move always-applicable behavioral rules to `.claude/rules/`** so they are auto-loaded without cluttering the root.

6. **Move path-specific rules** (e.g., Swift-only conventions) to `.claude/rules/swift.md` with `paths: ["**/*.swift"]` frontmatter so they only load during Swift work.

7. **Target root file size:** under 100 lines ideally; under 200 lines as a hard ceiling.

---

## Sources

- [Anthropic — How Claude remembers your project (official docs)](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Anthropic — Best Practices for Claude Code (official docs)](https://docs.anthropic.com/en/docs/claude-code/best-practices)
- [Anthropic blog — Using CLAUDE.md files](https://www.claude.com/blog/using-claude-md-files)
- [HumanLayer — Writing a good CLAUDE.md](https://humanlayer.dev/blog/writing-a-good-claude-md)
- [Towards AI / Kushal Banda — Writing a Good CLAUDE.md](https://medium.com/towards-artificial-intelligence/writing-a-good-claude-md-c40a32b39dfa)
- [Builder.io — Improve your AI code output with AGENTS.md](https://www.builder.io/blog/agents-md)
- [GitHub Blog — How to write a great agents.md: Lessons from 2,500+ repos](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/)
- [agentsmd/agents.md — Official AGENTS.md spec (OpenAI / AAIF)](https://github.com/openai/agents.md)
- [agents.md — Official website](https://agents.md/)
- [augmentcode.com — How to Build Your AGENTS.md (2026)](https://www.augmentcode.com/guides/how-to-build-agents-md)
- [The Prompt Shelf — AGENTS.md Best Practices](https://thepromptshelf.dev/blog/agents-md-best-practices)
- [Effloow — The Perfect CLAUDE.md](https://effloow.com/articles/claude-md-best-practices-setup)
- [PrimeLine — CLAUDE.md Rules: Split Instructions Across Files](https://primeline.cc/blog/claude-md-rules)
- [heyuan110 / Bruce — CLAUDE.md Best Practices](https://www.heyuan110.com/posts/ai/2026-03-05-claude-code-claudemd-best-practices/)
- [claudelab.net — CLAUDE.md and AGENTS.md Complete Guide](https://claudelab.net/en/articles/claude-code/claude-md-agents-md-complete-guide)
- [morphllm.com — CLAUDE.md Examples and Best Practices 2026](https://www.morphllm.com/claude-md-examples)
- [CODITECT — Claude.md Best Practices Research Report](https://docs.coditect.ai/research/claude-md-best-practices-research)
- [github/gh-aw AGENTS.md (real-world example)](https://github.com/github/gh-aw/blob/main/AGENTS.md)
- [Reddit r/ClaudeAI — Managing Large CLAUDE.md Files with Document References](https://www.reddit.com/r/ClaudeAI/comments/1lr6occ/tip_managing_large_claudemd_files_with_document/)
- [arxiv.org/pdf/2507.11538 — Evaluating AGENTS.md (instruction-following research)](https://arxiv.org/pdf/2507.11538)
