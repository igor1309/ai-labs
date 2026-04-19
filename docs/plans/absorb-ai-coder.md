---
date: 2026-04-19
model: claude-opus-4-6
description: "Plan to absorb ai-coder repository into ai-labs with full git history"
---

# Plan: Absorb ai-coder into ai-labs

## Goal

Merge `~/dev/ai-coder/` into this monorepo with full git history. Relocate content per the agreed mapping. Fix workflows post-merge. Update references.

## Content Mapping

| ai-coder source | ai-labs destination |
|---|---|
| `guides/` | `migrate-to-skills/guides/` |
| `dev-skills/` | `dev-skills/` |
| `prompts/` | `migrate-to-skills/prompts/` |
| `insights/` | `docs/insights/` |
| `debates/` | `docs/debates/` |
| `reading/` | `docs/reading/` |
| `sandbox/` | `sandbox/` |
| `tools/` | `tools/` |
| `_inbox/` | `_inbox/` |
| `gemini/` | `gemini/` |

## Approach: Subtree Merge with Renames

Use `git merge --allow-unrelated-histories` to bring in ai-coder history, then move files to their final locations in a follow-up commit. This preserves full commit history and blame.

## Worktree

All work happens in a dedicated worktree: `worktrees/absorb-ai-coder` on branch `absorb/ai-coder`.

## Steps

### Step 1: Create worktree and add ai-coder remote

- Create worktree: `git worktree add worktrees/absorb-ai-coder -b absorb/ai-coder`
- Inside the worktree, add remote: `git remote add ai-coder ~/dev/ai-coder`
- Fetch: `git fetch ai-coder`

### Step 2: Merge ai-coder history

- `git merge ai-coder/trunk --allow-unrelated-histories -m "merge ai-coder repository with full history"`
- Resolve any conflicts (unlikely since destinations don't overlap, but `README.md`, `.github/` may conflict — keep ai-labs versions, stage ai-coder versions under new names).

### Step 3: Handle merge conflicts

Expected conflicts:
- **`README.md`** — keep ai-labs version (ai-coder's README becomes `docs/ai-coder-README.md` or is discarded if redundant)
- **`.github/workflows/`** — ai-coder brings `sandbox-todo-issues.yml` and `sync-skills-public.yml`. These should land in `.github/workflows/` alongside existing ai-labs workflows (no name conflicts)
- **`CLAUDE.md`** / `AGENTS.md` — ai-coder's `CLAUDE.md` is a symlink to `AGENTS.md`. Keep ai-labs `CLAUDE.md`. Discard ai-coder's `AGENTS.md` (its content is already migrated to skills or is ai-coder-specific)
- **`.claude/`** — keep ai-labs version. Discard ai-coder's `.claude/` directory

Commit: "resolve merge conflicts: keep ai-labs versions for shared files"

### Step 4: Relocate ai-coder content to final destinations

Move files per the content mapping table. Each `git mv`:

```
git mv guides migrate-to-skills/guides
git mv prompts migrate-to-skills/prompts
# dev-skills/ already at root — no move needed
git mv insights docs/insights
git mv debates docs/debates
git mv reading docs/reading
# sandbox/ already at root — no move needed
# tools/ already at root — no move needed
# _inbox/ already at root — no move needed
# gemini/ already at root — no move needed
```

Remove ai-coder-only root files that don't belong in ai-labs:
- `AGENTS.md` (if survived merge — ai-coder specific)
- `TODO.md` from ai-coder (empty, conflicts with `docs/TODO.md`)
- `docs/` from ai-coder (ai-coder had its own `docs/log.md` and `docs/archive/` — move `docs/archive/` to `docs/ai-coder-archive/` if valuable, otherwise discard)

Commit: "relocate ai-coder content to final destinations"

### Step 5: Fix workflow — `sync-skills-public.yml`

Update paths in the workflow:
- **Trigger path filter**: `dev-skills/public/**` — unchanged (dev-skills stays at root)
- **Step "Checkout ai-coder"**: rename to "Checkout repository" (cosmetic, it's now ai-labs)
- **rsync source path**: `dev-skills/public/` — unchanged
- **publishignore path**: `dev-skills/public/.publishignore` — unchanged

Since `dev-skills/` stays at root, this workflow needs only the cosmetic rename of the checkout step name.

Commit: "fix sync-skills-public workflow: update step name post-absorption"

### Step 6: Fix workflow — `sandbox-todo-issues.yml`

This workflow delegates to `igor1309/ci-shared/.github/workflows/sandbox-todo-issues.yml@trunk`. The reusable workflow likely scans for TODO/FIXME in files. Since `sandbox/` stays at root, path patterns probably still work.

Verify: read the ci-shared reusable workflow to confirm it doesn't hardcode paths. If it does, update paths or the workflow inputs.

Commit (if changes needed): "fix sandbox-todo-issues workflow paths post-absorption"

### Step 7: Update `ci.yml` path filters

The `ci.yml` `paths-ignore` currently excludes `docs/**` and `**/*.md`. New directories (`sandbox/`, `tools/`, `dev-skills/`, `migrate-to-skills/`, `_inbox/`, `gemini/`) are not code projects — changes to them should NOT trigger CI builds for oracle/nomos/etc.

Add to `paths-ignore`:
```yaml
- "sandbox/**"
- "tools/**"
- "dev-skills/**"
- "migrate-to-skills/**"
- "_inbox/**"
- "gemini/**"
```

Commit: "update ci.yml paths-ignore for absorbed ai-coder directories"

### Step 8: Update global AGENTS.md reference

Update `~/.codex/AGENTS.md` to replace `~/dev/ai-coder/guides/` with the local path. This is outside the repo — note it for manual action or handle in a separate commit to the dotfiles.

### Step 9: Clean up remote and update docs

- Remove the `ai-coder` remote: `git remote remove ai-coder`
- Update `docs/TODO.md`: mark task #2 as done
- Update `docs/log.md` with the absorption entry
- Update `README.md` Components table if needed
- Update `docs/ai-coder-absorption-rationale.md` with a "Done" note or move to an archive

Commit: "mark ai-coder absorption complete, update docs"

### Step 10: Push and create PR

- Push branch `absorb/ai-coder`
- Create PR against `trunk` with `--merge --auto --delete-branch`
- PR title: "absorb ai-coder into ai-labs with full history"

## Post-Merge

- Verify workflows run correctly on trunk
- Archive or delete `~/dev/ai-coder/` repo (manual, outside this plan)
- Secrets needed in ai-labs: `PUBLIC_REPO_PAT` (for `sync-skills-public.yml`) — verify it's already configured or add it

## Risks

- **Secrets**: `sync-skills-public.yml` uses `secrets.PUBLIC_REPO_PAT`. Must verify this secret exists in ai-labs GitHub settings. If not, the workflow will fail silently on first trunk push.
- **ci-shared reusable workflow**: `sandbox-todo-issues.yml` calls into `igor1309/ci-shared`. Need to verify it works without repo-specific assumptions.
- **Large merge commit**: The unrelated-histories merge will be a large commit in the PR. This is expected and acceptable for a history-preserving absorption.
