---
date: 2026-06-24
model: claude-opus-4-8
description: "Implementation plan: promote the worktree skill into dev-skills as a self-contained, globally distributed skill (bundled scripts), retire the worktree creator from dev-tools, deprecate wt, and wire a stable gitwt symlink"
---

# Worktree skill promotion — implementation plan

Implements the intake brief at `dev-skills/docs/worktree-skill-promotion.md`.

## Goal

Make the `worktree` skill globally available and self-contained: bundle its
scripts (`git-worktree-create`, `ensure-shared-config-links.sh`) as skill payload
in `dev-skills`, publish via the standard pipeline, retire the now-duplicated
creator from `igor1309/dev-tools`, deprecate `tools/wt/`, and expose `gitwt`
through a stable symlink into the auto-updating marketplace checkout.

## Execution mode

```
Mode: human-review-gated
Human review between tasks: yes
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption, publish not visible in marketplace checkout after auto-update + manual pull
Push policy: push at closeout
```

Rationale for `human-review-gated`: the plan performs irreversible/outward-facing
actions — publishing to a public repo, pushing to a second repo (`dev-tools`),
and editing host PATH/symlinks — that warrant a checkpoint before each.

## Execution lock

```
Worktree mode: reuse existing
Expected worktree: /Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs.worktrees/feature-worktree-skill
Expected branch: feature/worktree-skill
Preflight check: [ ] done
```

Task 2 (host-local) and Task 3 (`dev-tools`) operate outside this worktree; each
declares its own target in its section, consistent with task-level ownership.

## Scope guardrails

- Do not change `wt`'s behavior or scheme — deprecation note in its README only.
- Do not modify other skills or the publish workflow (`sync-skills-public.yml`).
- Do not touch the cairana products-sync work on the prior branch.
- In `dev-tools`, only retire the worktree creator + `gitwt`; no other edits.
- Do not symlink into the SHA-versioned plugin cache; only the stable marketplace
  checkout path is a valid target.

## Task 1 — ai-labs: author, bundle, and publish the worktree skill

**Objective:** Create a self-contained `worktree` skill under `dev-skills/public/`
and publish it to `igor1309/skills`.

**Worktree / branch / push:** reuse the Execution-lock worktree and branch;
push at closeout as one PR into `trunk` with auto-merge.

### Phase 1.1 — Bundle scripts + author SKILL.md

- Create `dev-skills/public/worktree/scripts/`.
- `git mv` (cross-repo is a copy+remove, see note) the creator: copy
  `dev-tools/bin/git-worktree-create` → `dev-skills/public/worktree/scripts/git-worktree-create`, preserve `+x`. (Removal from dev-tools is Task 3; the file is duplicated only during the migration window.)
- Move the sync script: `git mv tools/ensure-shared-config-links/ensure-shared-config-links.sh dev-skills/public/worktree/scripts/ensure-shared-config-links.sh`; carry its `README.md` content into the skill or `scripts/` as reference; remove the emptied `tools/ensure-shared-config-links/` dir.
- Write `dev-skills/public/worktree/SKILL.md` with required front-matter
  (`name: worktree`, `author: Igor Malyarov`, `version: "0.1.0"`, `description`).
  Body: the 3-step flow (create via bundled `scripts/git-worktree-create`; sync
  config via bundled `scripts/ensure-shared-config-links.sh`; clear leftover build
  artifacts), invoking scripts by the skill's base directory. Document the install
  step (symlink `gitwt` → marketplace path) in the skill.
- Update any in-repo references to the old `tools/ensure-shared-config-links/`
  path to the new skill location (`grep -rl` first).

**Dependencies:** none. **Risks:** dangling references to the moved sync-script
path; missing `+x` on bundled scripts. **Validation:** `grep -rn` finds no stale
`tools/ensure-shared-config-links` references; `test -x` on both bundled scripts;
`bash -n` parses both. **Completion signal:** skill dir + SKILL.md + two
executable scripts exist; no stale references.

### Phase 1.2 — Register in manifests + versions + log

- `dev-skills/public/.claude-plugin/marketplace.json`: add `"./worktree"` to the
  skills array (alphabetical → new last entry after `"./using-dev-skills"`); add
  worktree to the plugin's long `description` enumeration; bump `metadata.version`
  `1.51.0 → 1.52.0` (MINOR — new skill).
- `dev-skills/public/.codex-plugin/plugin.json`: bump `version` `1.51.0 → 1.52.0`.
- `dev-skills/docs/log.md`: add an entry for the new skill.

**Dependencies:** Phase 1.1. **Risks:** version drift between the two manifests;
non-alphabetical insertion; missing description enumeration (skill invisible to
listings). **Validation:** both manifest versions equal `1.52.0`; `jq` parses both;
`worktree` present in array + description. **Completion signal:** manifests + log
updated and parse clean.

### Phase 1.3 — Deprecate wt

- Add a deprecation note to `tools/wt/README.md` pointing to `gitwt` / the
  `worktree` skill; do not change `wt.sh`.

**Dependencies:** none. **Validation:** note present in README. **Completion
signal:** README states deprecation + pointer.

### Phase 1.4 — Gates, PR, publish, verify

- Run gates: `./scripts/run_silent.sh "tests" npm test` and
  `./scripts/run_silent.sh "build" npx tsc --noEmit`.
- Run adversarial plan review per process-gates before the PR (this plan went
  through the Codex review loop already; re-confirm no fail/warn).
- `git mv docs/plans/worktree-skill-promotion.md docs/plans/implemented/` is part
  of Final closeout, not this phase (see deviation note in Final closeout).
- Push branch; `gh pr create --base trunk`; `gh pr merge <n> --merge --auto --delete-branch`.
- Post-merge (~1 min): verify CI on `igor1309/skills`
  (`gh run list --repo igor1309/skills --limit 1`), release version matches
  (`gh release list --repo igor1309/skills --limit 1`), and skill exists
  (`gh api repos/igor1309/skills/contents/worktree/SKILL.md --jq '.name'`).
- Confirm marketplace auto-update pulled it:
  `test -x ~/.claude/plugins/marketplaces/dev-skills/worktree/scripts/git-worktree-create`;
  if absent, `git -C ~/.claude/plugins/marketplaces/dev-skills pull`.

**Dependencies:** Phases 1.1–1.3. **Risks:** protected-trunk push rejection; sync
workflow failure; auto-update lag. **Validation:** the three post-merge checks pass
and the marketplace path is executable. **Completion signal:** published skill +
scripts live in the marketplace checkout.

## Task 2 — Host-local install (post-publish)

**Objective:** Expose `gitwt` globally via the marketplace skill, and reconcile
global worktree guidance to point at the skill.

**Target:** host config — `~/bin`, `~/.claude/rules/`, `~/.codex/AGENTS.md`. No
repo commit (host artifacts). **Push policy:** n/a.

- `mkdir -p ~/bin`; `ln -s ~/.claude/plugins/marketplaces/dev-skills/worktree/scripts/git-worktree-create ~/bin/gitwt`.
- Ensure `~/bin` precedes `dev-tools/bin` on PATH (add to `~/.zshrc` if absent);
  re-source and verify `command -v gitwt` resolves to `~/bin/gitwt`.
- Smoke test: `gitwt` with no args prints usage; a dry create in a scratch repo
  succeeds (then remove the scratch worktree).
- Reconcile `~/.claude/rules/worktrees.md` to a thin pointer at the `worktree`
  skill (single source of truth); rerun `~/.claude/scripts/generate-codex-agents.sh`.
- Remove the superseded untracked `.claude/skills/worktree/SKILL.md` from the main
  ai-labs checkout.

**Dependencies:** Task 1 complete (marketplace has the script). **Risks:** PATH
precedence leaving the old `dev-tools/bin/gitwt` shadowing the new symlink; broken
AGENTS.md generation. **Validation:** `command -v gitwt` → `~/bin/gitwt`;
`readlink ~/bin/gitwt` → marketplace path; AGENTS.md regenerates and contains the
worktrees section. **Completion signal:** `gitwt` runs from the marketplace skill.

## Task 3 — dev-tools: retire the worktree creator

**Objective:** Remove the now-duplicated creator from `igor1309/dev-tools`.

**Target repo:** `/Users/igormalyarov/Developer/my-apps/dev-tools`.
**Worktree mode:** none (operate on the repo's main checkout, dedicated branch).
**Push policy:** push after task (user: "commit, push on complete").

- In dev-tools: `git rm bin/git-worktree-create bin/gitwt`; commit
  (`retire worktree creator; moved to dev-skills worktree skill`); push.
- Verify `gitwt` still resolves (to `~/bin/gitwt`) after dev-tools removal.

**Dependencies:** Task 2 complete (global `gitwt` available via `~/bin`).
**Risks:** removing dev-tools `gitwt` before the `~/bin` symlink works → no
`gitwt` on PATH. Mitigation: Task 2 strictly precedes Task 3 and is verified.
**Validation:** `git -C dev-tools status` clean + pushed; `gitwt` smoke test
passes post-removal. **Completion signal:** dev-tools no longer ships the creator;
`gitwt` works globally.

## Done criteria

- `worktree` skill published to `igor1309/skills` with both scripts executable
  (`gh api …/worktree/SKILL.md` resolves; marketplace path is `-x`).
- `marketplace.json metadata.version` == `.codex-plugin/plugin.json version` ==
  `1.52.0`; `worktree` present in skills array (alphabetical) and in the long
  description.
- `gitwt` resolves to the marketplace skill script and creates a worktree.
- `dev-tools` no longer contains `bin/git-worktree-create` or `bin/gitwt`; pushed.
- `tools/wt/README.md` carries the deprecation note; `wt.sh` unchanged.
- ai-labs PR merged; `sync-skills-public.yml` green.
- `~/.claude/rules/worktrees.md` points to the skill; `~/.codex/AGENTS.md`
  regenerated.

## Final closeout

```
Final gates: ./scripts/run_silent.sh "tests" npm test; ./scripts/run_silent.sh "build" npx tsc --noEmit; bash -n + test -x on bundled scripts; sync-skills-public.yml green; gitwt smoke test
Archive plan: move to docs/plans/implemented/ after Task 3 completes
Commit archive move: yes
Push/PR: follow push policy
```

**Deviation note (for review):** repo convention archives the plan in the *same
PR* as the implementation. Here implementation legitimately spans post-merge
host (Task 2) and second-repo (Task 3) steps that cannot ride the ai-labs PR.
Options: (a) archive in the Task 1 PR and accept that Tasks 2–3 finish after the
move; (b) keep the plan in `docs/plans/` and archive via a small follow-up commit
after Task 3. This plan chooses (b) to keep "implemented" truthful; flag if (a)
is preferred.
