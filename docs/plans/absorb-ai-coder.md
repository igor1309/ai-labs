---
date: 2026-04-19
model: gpt-5.4
description: "Preservation-first plan to absorb ai-coder into ai-labs under an ai-coder subtree"
---

# Plan: Absorb ai-coder into ai-labs

## Review Findings

### Finding 1

**Location:** `docs/plans/implemented/absorb-ai-coder.md:51-79`

**Title:** `[P1] Plan discards repo-level assets during absorption`

The draft treats ai-coder's `README.md`, `AGENTS.md`, `.claude/`, and parts of `docs/` as conflict fallout to discard or archive opportunistically. That breaks the stated goal of preserving ai-coder's value and history as a usable repository, not just as a bag of content directories. Absorption should preserve those artifacts intact first, then migrate or retire them only through explicit follow-up decisions.

### Finding 2

**Location:** `docs/plans/implemented/absorb-ai-coder.md:13-30`

**Title:** `[P1] Plan conflates preservation with restructuring`

The plan immediately remaps ai-coder content into ai-labs-specific destinations, which couples repository absorption to a second, higher-risk information architecture change. That makes it hard to verify what was preserved, increases conflict surface, and contradicts the rationale that absorption is independent from later skills migration. A safer first phase is to import ai-coder under a dedicated prefix unchanged, then do any content moves in separate follow-up work.

## Goal

Absorb `~/dev/ai-coder/` into this monorepo with full git history while preserving the repository intact under `ai-coder/`. Do not restructure or discard ai-coder content during the absorption step.

## Architecture

Phase 1 is a pure preservation step: import the external repository as a subtree under `ai-coder/` so every ai-coder path remains available without colliding with existing ai-labs files. Phase 2, if ever approved, is a separate migration effort that may selectively move or retire content only after the preserved import is reviewed in place.

## Tech Stack

Git subtree, Markdown plans, existing ai-labs worktree workflow.

## Execution Lock

- Worktree required: yes
- Expected worktree: `ai-labs/worktrees/absorb-ai-coder`
- Expected branch: `absorb/ai-coder`
- Preflight check: [x] done

## Current Status

- [x] Branch reset from the risky merge sequence back to `9214fc75`
- [x] `ai-coder` remote added and fetched from `~/dev/ai-coder`
- [x] `ai-coder` imported under `ai-coder/` with `git subtree add --prefix=ai-coder ai-coder trunk`
- [x] Follow-up content promotions executed incrementally (`_inbox`, `insights`, `reading`, `debates`, `prompts`, `guides`, `dev-skills`, `sandbox`, `tools`, `gemini`)
- [x] `ai-coder/docs/` moved into `dev-skills/docs/`
- [ ] Follow-up restructuring evaluated and approved separately

## Phase 1: Preservation Import

### Scope

Import the ai-coder repository unchanged under `ai-coder/` and preserve tracked repo-level assets at import time, including:

- `ai-coder/README.md`
- `ai-coder/AGENTS.md`
- `ai-coder/CLAUDE.md`
- `ai-coder/docs/log.md`
- `ai-coder/docs/archive/`
- all existing ai-coder top-level content directories

Local-only, untracked files such as `~/dev/ai-coder/.claude/settings.local.json` are out of scope for Git-based absorption.

Later approved follow-up steps on this branch moved `ai-coder/docs/` into `dev-skills/docs/`.

### Why This Structure

- No path overlap with existing ai-labs files
- No merge-conflict triage for root-level files
- Preservation is easy to verify by inspection
- Later migration decisions stay optional and reviewable

### Steps

#### Step 1: Reset the branch to the pre-merge state

- Reset `absorb/ai-coder` to commit `9214fc75`
- Keep only the dedicated worktree and branch; remove the risky merge-derived history from this branch

Verification:

- `git rev-parse HEAD` equals `9214fc759e2d7645f2b746100aa5ff8577e1ac46` before re-import

#### Step 2: Add the source repository as a remote

- Add remote `ai-coder` pointing to `~/dev/ai-coder`
- Fetch `ai-coder/trunk`

Verification:

- `git remote -v` lists `ai-coder`
- `git branch -r` includes `ai-coder/trunk`

#### Step 3: Import ai-coder under a dedicated prefix

- Run `git subtree add --prefix=ai-coder ai-coder trunk`
- Accept the subtree commit created by Git

Verification:

- `test -f ai-coder/README.md`
- `test -f ai-coder/AGENTS.md`
- `test -L ai-coder/CLAUDE.md`
- `test -f ai-coder/docs/log.md`

#### Step 4: Rewrite the plan to match the actual strategy

- Replace the old merge-and-relocate plan with this preservation-first plan
- Record that restructuring is explicitly out of scope for Phase 1

Verification:

- Plan no longer instructs discarding repo-level ai-coder assets
- Plan no longer maps ai-coder directories into ai-labs destinations during absorption

## Phase 2: Optional Post-Import Migration

Phase 2 started after the Phase 1 import and has been executed incrementally on this branch. Continue to treat each move as its own small plan or reviewable step.

Applied so far:

1. `_inbox/` moved to repo root
2. `insights/` moved to repo root
3. `reading/` moved to repo root
4. `debates/` moved to repo root
5. `prompts/` moved to repo root
6. `guides/` moved to `migrate-to-skills/guides/`
7. `dev-skills/` moved to repo root
8. `sandbox/` moved to repo root
9. `tools/` moved to repo root
10. `gemini/` moved to repo root
11. `ai-coder/docs/` moved to `dev-skills/docs/`

Continue with this discipline for any further moves:

1. Decide whether keeping `ai-coder/` intact is already sufficient.
2. If not, pick one directory at a time to migrate.
3. Preserve or explicitly replace any repo-level artifact before deleting it.
4. Verify workflows, docs, and references after each discrete move.

## Out of Scope

- Moving `guides/`, `prompts/`, `insights/`, `debates/`, `reading/`, or other ai-coder paths into ai-labs-native destinations during Phase 1
- Discarding `ai-coder` root files because they duplicate ai-labs concerns
- Updating global dotfiles such as `~/.codex/AGENTS.md`
- Archiving or deleting the standalone `~/dev/ai-coder` repository

## Risks

- The subtree import is a large commit, but its content is mechanically isolated under `ai-coder/`, which keeps review risk bounded.
- Future restructuring can still lose information if done in bulk; keep any Phase 2 work incremental.
- The temporary `ai-coder` remote should be removed only after the branch no longer needs it.
