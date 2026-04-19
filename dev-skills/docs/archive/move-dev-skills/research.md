---
date: 2026-02-07
model: claude-opus-4-6
description: "Research findings for moving dev-skills repo into ai-coder"
---

# Move dev-skills into ai-coder

## Task Understanding

Move the entire `dev-skills` project (currently at `/Users/igormalyarov/Developer/my-apps/dev-skills/`) into the `ai-coder` repository (`/Users/igormalyarov/Developer/ai-coder/`). This consolidates two related repositories — one for AI coding guides/prompts and one for Claude Code skills — into a single repo.

## Findings

### Source: `dev-skills` repo (`github.com/igor1309/dev-skills`)

- 77 commits on single `trunk` branch, 1.8MB total
- **Structure**: `public/` (published skills), `docs/` (log, references, research), `TODO/` (WIP tracking), `.claude/`, `.github/workflows/`
- **7 published skills** in `public/`: arch-spec-review, doc-drift-audit, job-search-strategy, research, swift-package-manifest, tdd-interactive, tdd-scaffold-review
- **Plugin manifest** at `public/.claude-plugin/marketplace.json` — this makes `public/` a Claude Code plugin installable via marketplace
- **GitHub Actions workflow** (`sync-public.yml`) syncs `public/` to the separate public repo `igor1309/skills` on push to trunk
- Has 3 untracked files (settings, TODO items) — clean otherwise
- Has its own `.claude/CLAUDE.md` with skill-development-specific instructions (versioning, alphabetical ordering, publishing workflow)

### Target: `ai-coder` repo (`github.com/igor1309/ai-coder`)

- **Structure**: `guides/`, `promps/`, `docs/`, `tools/`, `sandbox/`, `debates/`, `insights/`, `reading/`, `gemini/`, `_inbox/`
- Both repos have a `docs/` directory — ai-coder has `docs/log.md`, dev-skills has `docs/log.md`, `docs/REFERENCES.md`, `docs/research/`
- Both repos use `trunk` as main branch

### Key Integration Points

- The `public/` directory is the Claude Code plugin root — its relative path structure matters for the marketplace.json `source` and `skills` paths
- The GitHub Actions workflow references `dev-skills/public/` and needs to be updated if the directory moves
- The `.claude/CLAUDE.md` in dev-skills has project-specific instructions that would need to be merged or relocated
- `docs/log.md` exists in both repos — content collision

## Risks & Unknowns

1. **Git history**: Simple `cp`/`mv` loses the 77-commit history. Preserving history requires `git subtree` or `git filter-repo` merge, which adds complexity.
2. **`docs/` collision**: Both repos have `docs/log.md`. The dev-skills version is much richer and more current. Content needs to be merged or one directory renamed.
3. **GitHub Actions workflow**: `sync-public.yml` references the repo checkout path `dev-skills`. If moved into ai-coder, the workflow trigger paths and checkout logic change. The `PUBLIC_REPO_PAT` secret would also need to be configured on the ai-coder repo.
4. **Plugin marketplace paths**: The `marketplace.json` uses relative paths (`./arch-spec-review`, etc.). As long as `public/` keeps its internal structure, these should work regardless of where `public/` sits in the parent repo.
5. **CLAUDE.md merge**: dev-skills has its own `.claude/CLAUDE.md` with versioning rules. If merged into ai-coder's project, those instructions need a new home (either merged into ai-coder's CLAUDE.md or kept in a subdirectory scope).
6. **Naming/placement**: Where exactly inside `ai-coder`? As a top-level `dev-skills/` directory? Or should the contents be distributed (e.g., skills into a `skills/` directory, docs merged)?
7. **The `igor1309/dev-skills` GitHub repo**: After the move, what happens to it? Archive? Delete? Keep as-is?

## Decisions

1. **Preserve git history** via `git subtree add`
2. **Land in `ai-coder/dev-skills/`** initially as automatic subtree action, then rename/move as needed (e.g. `public` => `skills-public`)
3. **Manual merge** of `docs/log.md`
4. **Archive** `igor1309/dev-skills` GitHub repo after move
5. **Preserve** GitHub Actions sync workflow, adapt paths and secrets for new location
