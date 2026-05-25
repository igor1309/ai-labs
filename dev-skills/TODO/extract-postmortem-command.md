---
date: 2026-05-25
model: claude-opus-4-7
description: "Migrate user-level /postmortem into dev-skills plugin as a skill"
---

# Migrate `/postmortem` into dev-skills as a skill

## Current state

- Lives at `~/.claude/commands/postmortem.md` (user-level only, not distributable).
- Invocation: `/postmortem <skill-name-or-topic>`. Uses `$ARGUMENTS` (intake-style).
- Body asks the model to reflect on the current session and propose polish/tweaks/fixes for the named skill, plus adjacent skills worth adding/tweaking. Demands session-grounded evidence; rejects generic best-practice filler.
- Existing front matter (`author`, `version: "0.1.0"`, `description`, `argument-hint`) is already SKILL.md-shaped — minimal restructuring needed.

## Why move it into dev-skills

- Distributable to teammates / other machines via the plugin install path.
- Versioned alongside the skills it is meant to critique (`skill-review`, `doc-drift-audit`, etc.).
- Namespaced as `/dev-skills:postmortem` so it sits next to `/dev-skills:intake`.

## Target shape: skill, not flat command

Per Claude Code plugin docs (*"Use `skills/` for new plugins"*), ship as a skill at `dev-skills/public/postmortem/SKILL.md`, not a flat `commands/postmortem.md`. Skills live alongside their peers (`skill-review`, `intake`, `discuss`) and match the rest of the dev-skills inventory. `$ARGUMENTS` is supported in skills. Postmortem itself stays manual-invocation only — see step 1's `disable-model-invocation: true`.

## Decisions resolved

- **Path**: `dev-skills/public/postmortem/SKILL.md`.
- **User-level copy at `~/.claude/commands/postmortem.md`**: delete after the plugin version verifies in the public skills repo, so invocation routes cleanly to `/dev-skills:postmortem`.

## Steps

1. Create `dev-skills/public/postmortem/SKILL.md`:
   - Front matter: `name: postmortem`, `author: Igor Malyarov`, `version: "0.1.0"`, `description:` (one-line concrete trigger — when to invoke), `argument-hint: "<skill-name>"`, `disable-model-invocation: true` (intentionally manual; see open questions).
   - Body: current user-level body, `$ARGUMENTS` semantics preserved.
2. Cross-link from `dev-skills/public/skill-review/SKILL.md`: note `postmortem` is a lighter, session-scoped sibling. Bump `skill-review` version by PATCH.
3. Update `dev-skills/public/.claude-plugin/marketplace.json`:
   - Add `./postmortem` to the `skills` array in alphabetical position (between `./jtbd` and `./pr-ci-watch`).
   - Add `postmortem` to the plugin's long `description` string (it enumerates every skill — new entries must be listed there too).
   - Bump `metadata.version` by MINOR (new skill).
4. Bump `dev-skills/public/.codex-plugin/plugin.json` `version` in lockstep with `marketplace.json` (required per `dev-skills/.claude/CLAUDE.md`).
5. Add entry to `dev-skills/docs/log.md` (newest first): postmortem v0.1.0 — what it does, why it lives here, marketplace version.
6. Branch + PR per `dev-skills/.claude/CLAUDE.md`:
   - Dedicated branch off `trunk` (trunk is protected).
   - `gh pr create --base trunk --title "..." --body "..."`.
   - `gh pr merge <n> --merge --auto --delete-branch`.
7. Post-merge verification (~1 min after merge):
   - CI: `gh run list --repo igor1309/skills --limit 1 --json status,conclusion,name`.
   - Release version matches marketplace: `gh release list --repo igor1309/skills --limit 1`.
   - Skill exists in skills repo: `gh api repos/igor1309/skills/contents/postmortem/SKILL.md --jq '.name'`.
8. Once step 7 passes, delete `~/.claude/commands/postmortem.md`.

## Schema notes

- `marketplace.json` does NOT need a separate `commands` array. Plugin component directories (`skills/`, `commands/`, `agents/`, `hooks/`) are auto-discovered at the plugin root (the directory containing `.claude-plugin/`, which here is `dev-skills/public/`).

## Open questions (non-blocking)

- Should this live in dev-skills, or in a separate "session-meta" plugin alongside `cold-start-checkpoint`? Both are session-lifecycle aids, not authoring/review skills. Defer — can be re-homed later without breaking distribution.
- Auto-trigger via `SessionEnd` hook? Currently intentionally manual (see chat-session 2026-05-25 rationale). Defer.

## Tracking

- This TODO file is the tracking artifact; no separate GitHub issue required. File one only if collaborators need external visibility.
