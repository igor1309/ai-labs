---
date: 2026-05-16
model: claude-opus-4-7
description: "Canonical Agent Skills specification and skill-creation guidance from agentskills.io, with implications for skill-review"
---

# Agent Skills Canonical Specification — agentskills.io

Synthesized from seven pages of the canonical Agent Skills documentation at `agentskills.io`. This is the cross-client spec (Claude Code, OpenAI Codex, and other compliant clients), distinct from Anthropic's Claude Code-specific docs at `code.claude.com`.

## 1. Specification — https://agentskills.io/specification

### Required and optional frontmatter fields

| Field | Required | Constraints |
|---|---|---|
| `name` | Yes | Max 64 chars. Lowercase letters, numbers, hyphens only. No leading/trailing/consecutive hyphens. **Must match parent directory name.** |
| `description` | Yes | **Max 1024 chars.** Non-empty. Describes what the skill does and when to use it. |
| `license` | No | License name or reference to a bundled license file. |
| `compatibility` | No | Max 500 chars. Only if the skill has specific environment requirements. |
| `metadata` | No | Arbitrary key-value map. **`version` lives here**, e.g. `metadata.version: "1.0"`. |
| `allowed-tools` | No | Space-separated string of pre-approved tools. Marked **Experimental**. Example: `Bash(git:*) Bash(jq:*) Read`. |

### Key spec rules

- A skill is a directory containing at minimum a `SKILL.md` file. Optional subdirectories: `scripts/`, `references/`, `assets/`.
- **There is no top-level `version` field.** Version is `metadata.version`.
- Body: no format restrictions; recommended sections are step-by-step instructions, examples, edge cases. **Keep body under 500 lines / 5,000 tokens.**
- File references use relative paths from the skill root, **one level deep** — avoid nested reference chains.
- Validation CLI: `skills-ref validate ./my-skill` from `github.com/agentskills/agentskills/tree/main/skills-ref`.

### Example descriptions

- **Good:** "Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction."
- **Poor:** "Helps with PDFs."

## 2. Quickstart — https://agentskills.io/skill-creation/quickstart

- Default cross-client skills directory: `.agents/skills/` (project-level). Claude Code also scans `.claude/skills/` for compatibility.
- Three structural elements: `name` (identifier, must match folder), `description` (activation trigger), body (instructions).
- Agent reads only `name` and `description` at session start. Body loads on activation.
- Cross-client framing: "The same skill works in any compatible agent, including Claude Code and OpenAI Codex."
- Example description includes explicit trigger phrases: "Use when asked to roll a die (d6, d20, etc.), roll dice, or generate a random dice roll."

## 3. Best Practices — https://agentskills.io/skill-creation/best-practices

- **Start from real expertise, not LLM-generated generic content.** Source material: runbooks, API specs, code review comments, incident reports, VCS history.
- **Spend context wisely:** add what the agent lacks; omit what it already knows. Test: "Would the agent get this wrong without this instruction?" If no — cut it.
- **Coherent unit design.** Too narrow forces multi-skill loads with conflicting instructions; too broad reduces activation precision.
- **Aim for moderate detail.** "Overly comprehensive skills can hurt more than they help."
- **Progressive disclosure in body:** under 500 lines / 5,000 tokens; move detail to `references/`. Tell the agent *when* to load reference files: "Read `references/api-errors.md` if the API returns a non-200 status code."
- **Match specificity to fragility.** Freedom for flexible tasks (explain why); prescriptive for fragile/sequential operations.
- **Provide defaults, not menus.** Pick a default tool/approach and mention alternatives briefly. Never list equal options.
- **Favor procedures over declarations.** Teach approach, not specific answers.

### Recommended patterns

- **Gotchas** — "highest-value content in many skills." Must be in `SKILL.md`, not a reference file, because the agent may not recognize the trigger for a separate load.
- **Templates** for output format: inline for short, in `assets/` for longer/conditional.
- **Checklists** with `- [ ]` for multi-step workflows.
- **Validation loops:** do work → validate → fix → repeat.
- **Plan-validate-execute:** for batch/destructive ops.
- **Bundle scripts** when traces show the agent reinventing the same logic.

## 4. Optimizing Descriptions — https://agentskills.io/skill-creation/optimizing-descriptions

### Four writing principles

1. **Use imperative phrasing:** "Use this skill when…" not "This skill does…"
2. **Focus on user intent, not implementation mechanics.**
3. **Err on the side of being pushy:** explicitly list contexts, "even if they don't explicitly mention [keyword]."
4. **Keep it concise:** a few sentences. **Hard limit: 1024 chars.**

### Nuance

- Agents only consult skills for tasks needing capabilities beyond what they can handle alone. Simple one-step tasks may not trigger even with a matching description.

### Optimization process

- Train/validation split (~60/40) with ~20 eval queries (8-10 positive, 8-10 negative).
- Run each query 3+ times; compute trigger rate; threshold at 0.5.
- **Avoid overfitting:** don't add specific keywords from failed queries; address the general category.
- **Strong negative test cases are near-misses** (share keywords but need something different).
- ~5 iterations usually sufficient.

### Before/after example

Before: `description: Process CSV files.`

After:
```
description: >
  Analyze CSV and tabular data files — compute summary statistics,
  add derived columns, generate charts, and clean messy data. Use this
  skill when the user has a CSV, TSV, or Excel file and wants to
  explore, transform, or visualize the data, even if they don't
  explicitly mention "CSV" or "analysis."
```

The improved version: specific about capabilities, broad about trigger conditions, includes "even if they don't explicitly mention" phrasing.

## 5. Evaluating Skills — https://agentskills.io/skill-creation/evaluating-skills

### Test case structure

- **Prompt** + **Expected output** (human-readable success description) + optional **Input files**.
- Stored in `evals/evals.json` inside the skill directory.
- Start with 2-3 cases; expand after first results.
- Always run **with skill** AND **without skill** to establish baseline delta.

### Workspace structure

- `iteration-N/eval-<name>/with_skill/` and `without_skill/`, each containing `outputs/`, `timing.json`, `grading.json`.
- Aggregate stats in `benchmark.json`.

### Assertions and grading

- Add assertions **after** seeing first outputs, not before.
- Good assertions: verifiable, specific, countable. Weak: vague ("output is good") or brittle (exact string match).
- Grading: PASS/FAIL with **concrete evidence**. "Don't give the benefit of the doubt."
- **Benchmark delta** measures what the skill costs vs. what it buys. Doubling token usage for a 2-point improvement is probably not worth it.
- Blind comparison (hide which version is which) for holistic quality beyond assertions.

### Iteration

- After each iteration: give failed assertions + human feedback + execution transcripts + current `SKILL.md` to an LLM to propose improvements.
- Guidelines: generalize from feedback, keep the skill lean, explain the why, bundle repeated work.
- Stop when satisfied, feedback is consistently empty, or no meaningful improvement.

## 6. Using Scripts — https://agentskills.io/skill-creation/using-scripts

- Script references use **relative paths from the skill directory root**.
- List available scripts explicitly in `SKILL.md`.
- One-off commands (uvx, npx, etc.) are valid when an existing package already does what's needed.
- **Pin versions** in one-off commands (e.g., `npx eslint@9.0.0`).
- Self-contained scripts declare dependencies inline (PEP 723, Deno `npm:` specifiers). Run with `uv run`.
- **Hard requirement:** scripts must **avoid interactive prompts** — agents operate in non-interactive shells and will hang.
- Scripts should provide `--help` output.
- Prefer structured output (JSON, CSV); data to stdout, diagnostics to stderr.
- Design for **idempotency**, **meaningful exit codes**, **predictable output size** (truncation at 10-30K chars in many harnesses).
- State prerequisites in `SKILL.md` or use `compatibility` frontmatter.

## 7. Client Implementation — https://agentskills.io/client-implementation/adding-skills-support

- Standard discovery path: `.agents/skills/` (project- and user-level). Some clients also scan `.claude/skills/`.
- Progressive disclosure is a three-tier contract: catalog (name+desc), instructions (full body), resources (on demand).
- **Project-level skills override user-level skills** when names collide. Log a warning.
- Trust gate recommended for project-level skills (untrusted source).
- Parsing: lenient validation — warn on violations but load anyway. **Exception: missing/empty description → skip entirely.**
- Skill content can be delivered as full file (including frontmatter) or body-only. Most dedicated-tool implementations strip frontmatter.
- Catalog format: XML, JSON, or bulleted list — not mandated.
- **Protect skill content from context compaction.** Skill instructions are "durable behavioral guidance"; pruning silently degrades performance.
- `allowed-tools` is used for permission allowlisting within the activation flow.

## Cross-cutting themes

- **Description is everything at tier 1.** Every page reinforces this.
- **Progressive disclosure is the architectural invariant.** Body under 500 lines / 5,000 tokens. Tell the agent when to load references.
- **Lean > comprehensive.** Over-specified skills hurt more than they help.
- **Reasoning-based instructions outperform rigid directives.**
- **Evals are first-class artifacts.** `evals/evals.json` lives inside the skill directory.
- **Real execution traces, not just outputs.** Read the full transcript to find where the agent wasted time or ignored instructions.

## Spec (agentskills.io) vs. code.claude.com — divergences

| Topic | agentskills.io spec | code.claude.com |
|---|---|---|
| `description` max length | **1024 chars** | **1,536 chars** (combined with `when_to_use`, configurable) |
| `version` field | **`metadata.version` only** (no top-level `version`) | Practice: top-level `version` common (including in our own skills) |
| Discovery path | `.agents/skills/` (canonical) | `.claude/skills/` (pragmatic compatibility) |
| `allowed-tools` syntax | Space-separated string, **Experimental** | Implemented, behavior may differ |
| `compatibility` field | Documented, noted as rare | Not surfaced prominently |
| `evals/evals.json` | Documented as standard | Not surfaced |

## Concrete recommendations for `skill-review`

### Missing checks the current skill should add

1. **`name` matches parent directory name** — common violation, clients warn but load.
2. **`version` field placement** — flag any skill with a top-level `version:` field. Per spec, `version` belongs under `metadata:`. **Note: our own `skill-review/SKILL.md` currently has top-level `version: "1.1.1"` — this is itself a spec deviation worth deciding on before publishing the next version.**
3. **Description imperative framing** — does the description use "Use when…" or equivalent?
4. **Non-obvious trigger coverage** — flag descriptions that omit the "even if they don't explicitly mention X" clause for implicit triggers.
5. **Body size gate** — flag bodies over 500 lines or estimated >5,000 tokens.
6. **Reference file load conditions** — each `references/` link should be gated with "read this when X," not generic "see references/."
7. **Generic advice detection** — flag phrases like "handle errors appropriately," "follow best practices for," "ensure security."
8. **Eval directory presence** — note whether `evals/evals.json` exists.
9. **`allowed-tools` syntax** — if present, validate space-separated string; note Experimental status.
10. **Description approaching 1024-char limit** — flag at ~900 chars.

### Severity alignment with what clients enforce

- **Skip-level (highest):** Missing or empty `description`. Clients skip the skill — not a warning.
- **Error-level:** Unparseable YAML frontmatter. Clients skip.
- **Warning-level:** `name` mismatch with directory, name >64 chars, invalid characters.
- **Style/advisory:** Description missing imperative framing, body >500 lines, no `evals/`, generic advice, top-level `version` field.

## Sources

- https://agentskills.io/specification
- https://agentskills.io/skill-creation/quickstart
- https://agentskills.io/skill-creation/best-practices
- https://agentskills.io/skill-creation/optimizing-descriptions
- https://agentskills.io/skill-creation/evaluating-skills
- https://agentskills.io/skill-creation/using-scripts
- https://agentskills.io/client-implementation/adding-skills-support
