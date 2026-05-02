---
date: 2026-02-07
model: claude-opus-4-6
description: "Implementation plan for moving dev-skills repo into ai-coder via git subtree"
---

# Plan: Move dev-skills into ai-coder

## Context

The `dev-skills` repo (77 commits, 7 published Claude Code skills) and `ai-coder` repo (guides, prompts, tools for AI-assisted development) serve related purposes. Consolidating them eliminates repo sprawl and co-locates all AI coding assets. Full git history preserved via `git subtree add` (no squash) so per-file history remains traceable after the original repo is archived.

## Steps

### Step 1: Subtree add

```bash
git remote add dev-skills https://github.com/igor1309/dev-skills.git
git fetch dev-skills
git subtree add --prefix=dev-skills dev-skills trunk
```

All 77 commits merge into ai-coder's history, fully reachable. `git log dev-skills/public/tdd-interactive/SKILL.md` will show the file's full evolution.

**Result**: `dev-skills/public/`, `dev-skills/docs/`, `dev-skills/TODO/`, `dev-skills/.claude/`, `dev-skills/.github/` all exist under ai-coder.

### Step 2: Move GitHub Actions workflow

Move `dev-skills/.github/workflows/sync-public.yml` to `.github/workflows/sync-skills-public.yml` (root-level, since GitHub only reads from root `.github/workflows/`).

Update the workflow:
- Trigger path: `public/**` → `dev-skills/public/**`
- Remove the separate checkout of dev-skills repo (it's now part of this repo)
- Copy from `dev-skills/public/*` directly
- `PUBLIC_REPO_PAT` secret needs to be added to the `ai-coder` repo settings on GitHub (manual)

### Step 3: Update dev-skills `.claude/CLAUDE.md`

Fix the hardcoded path (`/Users/igormalyarov/Developer/my-apps/dev-skills/` → relative reference). This file serves as scoped instructions for the `dev-skills/` subdirectory.

### Step 4: Clean up dev-skills `.github/`

Delete `dev-skills/.github/` (the workflow has been moved to root). Avoids confusion about which workflow is active.

### Step 5: Manual merge of `docs/log.md` (user does this)

Flag the collision:
- `docs/log.md` — ai-coder's log (5 entries, 2025-09 to 2025-12)
- `dev-skills/docs/log.md` — dev-skills log (rich, 2025-10 to 2026-02)

User decides how to merge.

### Step 6: Remove the dev-skills remote

```bash
git remote remove dev-skills
```

### Step 7: Commit all post-subtree changes

Single commit for Steps 2-6: workflow move, CLAUDE.md fix, .github cleanup.

### Step 8: Archive `igor1309/dev-skills` on GitHub

```bash
gh repo archive igor1309/dev-skills --yes
```

## Files Modified

- `.github/workflows/sync-skills-public.yml` — new (moved from `dev-skills/.github/`)
- `dev-skills/.github/` — deleted
- `dev-skills/.claude/CLAUDE.md` — path fix

## Files NOT Modified (user action)

- `docs/log.md` + `dev-skills/docs/log.md` — manual merge decision

## Verification

1. `git log --oneline dev-skills/` — confirms subtree history is present
2. `ls dev-skills/public/` — confirms all 7 skills landed
3. `cat .github/workflows/sync-skills-public.yml` — confirms workflow adapted
4. `cat dev-skills/.claude/CLAUDE.md` — confirms path updated
5. Push to trunk, verify GitHub Actions workflow triggers on `dev-skills/public/**` changes
6. Verify `PUBLIC_REPO_PAT` secret is configured on ai-coder repo (manual)
