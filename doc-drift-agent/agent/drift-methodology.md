---
date: 2026-05-09
model: claude-opus-4-7
description: "Drift categories the doc-drift-agent looks for, with detection signals, evidence shape, and false-positive filters; mirrors the doc-drift-audit skill's discipline against rewriting/restructuring/style passes"
---

# Drift Methodology

Defines what drift the agent looks for, what evidence it must attach to a finding, and what to ignore. Faithful to the source intent (`doc-drift-agent/docs/automated-doc-drift-review-and-fix-suggestions-intent.md`) and ADR (`doc-drift-agent/docs/adr-specialized-openclaw-agent-readme-drift-review.md`). The discipline mirrors the existing `doc-drift-audit` skill (`dev-skills/public/doc-drift-audit/SKILL.md`): factual mismatches only, no rewriting, no restructuring, no style passes.

## Scope

In scope:

- Factual claims in a README contradicted by another README, by the repo state, or by the README's own backing code/config.

Out of scope (mirrors `doc-drift-audit`):

- Formatting — header numbering, list punctuation, markdown structure, capitalization.
- Style — word choice, sentence structure, tone, verbosity.
- Additions — new sections, new explanations, expanded examples, status markers like `(completed)` or `(planned)`.
- Restructuring — converting blockquotes to lists, reorganizing, adding front-matter fields the doc never had.

A finding that turns out to be a formatting or style preference is discarded. It is not drift.

## Categories

The agent emits findings under exactly three categories. Every finding declares one.

### 1. README ↔ README

**Definition.** A claim made in one README is contradicted by a claim in another README within the inventory (`doc-drift-agent/agent/readme-inventory.md`).

**Detection signals.**

- The same component is described two different ways (different responsibility, different stack, different deployment target) in the root `## Components` table and the project README.
- A cross-reference in one README points at a path or a component name that another README disagrees with (renamed, removed, sub-pathed).
- Two READMEs disagree about a release-unit boundary or a tag namespace for the same project.

**Evidence shape.** Each finding must attach:

- Path and line number of the claim in the originating README.
- Path and line number of the contradicting claim in the other README.
- Verbatim quote of both claims.

**False positives to skip.**

- Different *level of detail* is not contradiction. The root README says "personal capture service"; `notio/README.md` describes the backend's webhook path — both can be true at once.
- Different *audiences* is not contradiction. A root entry framed for outsiders and a project README framed for operators routinely diverge in voice.
- Different *time horizon* is not contradiction. "On hold" in one place and "configured but unused" in another describe the same state.

### 2. README ↔ repo state

**Definition.** A claim in any README is contradicted by the actual repo state: file paths, directory layout, configured release units, the `## Components` table inventory.

**Detection signals.**

- A README references a path (`<dir>/<file>`, `scripts/foo.sh`, a config key) that does not exist in the working tree at the inventory's scoped depth.
- A README names a function, command, npm script, or environment variable that the corresponding code/config does not define.
- A new top-level project directory exists in the repo but does not have a row in the root README `## Components` table (or vice versa — a `## Components` row points at a project that has no top-level directory).
- A README claims a removed feature still works.
- A README documents a release unit that is not in `release-units.toml` (or vice versa).

**Evidence shape.** Each finding must attach:

- Path and line number of the README claim.
- The repo-state evidence: missing path (with the path searched), or commit ref that removed/renamed the artifact, or contradicting line in `release-units.toml` / `release-units.config.toml` / a config file.
- For "new top-level dir not in Components": the new directory's path and the line range of the existing Components table.

**False positives to skip.**

- Drift candidates already recorded in `doc-drift-agent/agent/readme-inventory.md` under "Components without a top-level project README" or "Project READMEs without a Components-table row" are *known absences*, not findings — unless the inventory itself is stale.
- Paths that exist below the inventory's scoped depth (e.g. `dragoman/docs/README.md`, `tools/wt/README.md`) are out of scope for the agent. A README referencing them is not drift.
- Excluded directories (`node_modules/`, `vendor/`, `.build/`, `worktrees/`, `dist/`, `.wrangler/`) are not part of repo state for this purpose.

### 3. Internal consistency

**Definition.** A README claims behavior that the README's own backing code, config, or scripts do not support.

**Detection signals.**

- A README documents a CLI flag the project's source does not parse.
- A README's "how to run" section uses a command, package script, or environment variable that the project's `package.json`, `Dockerfile`, `docker-compose.yml`, or build script does not define.
- A README documents a Docker image tag, port, or volume that the project's compose/Dockerfile contradicts.
- A README documents an API endpoint, route, or response field that the project's source does not implement.

**Evidence shape.** Each finding must attach:

- Path and line number of the README claim.
- Path and line number of the project file that contradicts it (source, config, script).
- Verbatim quote of both.

**False positives to skip.**

- Forward-looking claims ("planned", "next") that the README itself marks as not yet implemented.
- Generic shell snippets used as illustration ("`npm install`", "`docker build .`") rather than as project-specific instructions.
- Examples that obviously stand in for user-specific values (placeholder hostnames, fake tokens).

## Cross-cutting rules

These apply to every category.

- Every finding must carry both the doc-side claim and the contradicting evidence. A claim with no evidence is discarded.
- Every suggested fix must be the **minimum edit** that resolves the drift. No surrounding cleanup, no restructuring.
- The agent never edits files other than READMEs. Code, config, and script edits are out of scope even when the simplest "fix" would be to change the code instead of the doc — the maintainer makes that call on the PR, not the agent.
- The agent never merges or approves PRs (per ADR).

## Refresh policy

The categories and signals here are pinned by the source intent and ADR. Add a new signal to an existing category only when the maintainer confirms the new signal is in scope. Add a new category only by amending the source intent first; this document follows, it does not lead.
