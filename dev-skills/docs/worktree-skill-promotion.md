---
date: 2026-06-24
model: claude-opus-4-8
description: "Intake brief — promote the worktree skill into dev-skills as a self-contained, globally distributed skill, with bundled scripts and a stable gitwt symlink"
---

# Worktree skill promotion — intake brief

## What I'm building

Make the `worktree` skill **globally available and self-contained** by moving it
into the `dev-skills` plugin and bundling the scripts it depends on as skill
payload, so it works on any machine after install with no pre-existing tooling.

Concretely:

- The skill becomes the **single source of truth** for the worktree scripts. Its
  `scripts/` directory holds the *real* files:
  - `git-worktree-create` — the worktree creator, **moved out of** the
    `igor1309/dev-tools` repo.
  - `ensure-shared-config-links.sh` — the shared-config sync script, **moved out
    of** `ai-labs/tools/ensure-shared-config-links/`.
- The skill ships through the standard dev-skills publishing pipeline to
  `igor1309/skills`, which auto-updates into the local plugin marketplace
  checkout.
- The global `gitwt` command becomes a **symlink to the published skill's
  bundled script** at the stable marketplace path (not the SHA-versioned cache).
- `tools/wt/` is **deprecated in place** (README note pointing to `gitwt`/the
  skill); not deleted.

When done: `gitwt` works everywhere, tracks the published skill, and depends on
nothing in any working repo; the sync script is part of the skill; the `wt`/
`gitwt` confusion is documented away.

## What I'm touching

- `dev-skills/public/worktree/SKILL.md` — new skill (relocated from the
  session-created `.claude/skills/worktree/SKILL.md`, which is untracked).
- `dev-skills/public/worktree/scripts/git-worktree-create` — moved from
  `dev-tools/bin/git-worktree-create`.
- `dev-skills/public/worktree/scripts/ensure-shared-config-links.sh` — moved from
  `ai-labs/tools/ensure-shared-config-links/`.
- `dev-skills/public/.claude-plugin/marketplace.json` — skills array (alphabetical),
  long `description` enumeration, `metadata.version` bump (currently `1.51.0`).
- `dev-skills/public/.codex-plugin/plugin.json` — `version` bump to match.
- `dev-skills/docs/log.md` — publish log entry.
- `tools/ensure-shared-config-links/` — becomes a symlink into the skill copy (or
  is removed with references repointed); dogfooding decision captured below.
- `tools/wt/README.md` — deprecation note.
- **`igor1309/dev-tools` repo (separate):** remove the moved `git-worktree-create`
  and repoint/remove the `bin/gitwt → git-worktree-create` symlink.
- `~/.claude/rules/worktrees.md` (global, added this session) — reconcile with the
  skill so there is one source of truth (decision below).
- `~/bin/gitwt` (or `dev-tools/bin/gitwt`) — symlink to the marketplace skill path.

## Findings

- `Scope:` Verified dev-skills layout, both plugin manifests, the publish workflow,
  the canonical publishing procedure, the two worktree helpers, the dev-tools repo,
  and the local plugin install structure. Excluded unrelated working-tree changes on
  the prior branch (cairana products sync).
- `Pattern evidence:` Bundling executable scripts in a skill is an established
  pattern — `ios-simulator-install/scripts/*.sh`, `job-search-strategy/scripts/*.py`,
  `best-free-openrouter-llm/scripts/*.py`. Skills are told their base directory at
  load time and invoke `<base>/scripts/<x>` directly.

- **`gitwt` is already tracked and already a symlink.** It lives in
  `igor1309/dev-tools` as `bin/git-worktree-create` (tracked); `bin/gitwt` is a
  symlink → `git-worktree-create`. (This corrects an earlier wrong assumption that
  gitwt was an untracked one-off.)
- **`gitwt` vs `wt` schemes diverge** and are incompatible:
  - `gitwt`: create-only, local refs, base default `HEAD`, dir
    `<parent>/<repo>.worktrees/<safe-branch>` (dot `.worktrees`).
  - `wt` (`tools/wt/wt.sh`): typed prefix `feat|fix|chore|rel`, `git fetch`, base
    default `origin/trunk`, dir `<repo>-worktrees/wt-<prefix>-<name>` (hyphen).
  - The sync script's hard convention (`<repo>.worktrees/<name>` → `<repo>.config`)
    matches `gitwt`'s dot scheme and **not** `wt`'s hyphen scheme.
- **Stable vs rotating plugin paths** (the crux of the symlink decision):
  - `~/.claude/plugins/marketplaces/dev-skills/` is a real git clone of
    `igor1309/skills` at a **fixed path**, `autoUpdate: true`, containing published
    skills *with* their `scripts/`. **This is the stable symlink target.**
  - `~/.claude/plugins/cache/dev-skills/dev-skills/<sha>/` is keyed by **commit
    SHA** (`installed_plugins.json`: `version: "74cf9918fb03"`, matching
    `gitCommitSha`); it rotates on every publish. **Never symlink here.**
- **Publishing procedure** (`dev-skills/.claude/CLAUDE.md`): front-matter `author:
  Igor Malyarov` gate → place in `public/<skill>/` → update marketplace.json (skills
  array alphabetical + long-description enumeration + `metadata.version`) → bump
  `.codex-plugin/plugin.json` version to match → bump SKILL.md `version` (semver) →
  log entry → dedicated branch → PR into `trunk` → `--merge --auto --delete-branch`
  → post-merge verify against `igor1309/skills`.
- **Publish sync** (`.github/workflows/sync-skills-public.yml`) fires on push to
  `trunk` touching `dev-skills/public/**`; `rsync -a` (preserves the executable bit)
  to `igor1309/skills`, honoring `.publishignore` (`sandbox/ research/ archive/
  evals/ TODO.md HANDOFF.md` — `scripts/` is **not** excluded, so it ships).

## Key constraints

- Published skill installs into **arbitrary repos** → it must be self-contained;
  bundled scripts (real files, not symlinks) are the mechanism.
- SKILL.md front-matter must include `author: Igor Malyarov`, `name`, `version`,
  `description` or publishing is blocked.
- `marketplace.json metadata.version` and `.codex-plugin/plugin.json version` must
  stay equal and both bump on publish; skills array is **alphabetical**; the skill
  must also be added to the plugin's long `description` enumeration.
- `trunk` is protected — dedicated branch + PR + auto-merge only.
- Symlink target must be the **stable marketplace checkout**, never the SHA cache.
- `wt` and `git-worktree-create` are **tracked** — every change is a real diff with
  history; dev-tools edits are a second-repo concern.

## Decisions settled

1. **Canonical home = the skill** (`dev-skills/public/worktree/scripts/`). Real
   files there; machine tools point into it.
2. **Both scripts are bundled** (creator + sync) so the skill is self-contained.
3. **`gitwt` symlink target** = `~/.claude/plugins/marketplaces/dev-skills/worktree/
   scripts/git-worktree-create` (stable, auto-updating, tracks the *published*
   skill).
4. **`wt` = deprecate in place** (README note → gitwt/the skill); no deletion.

## Risks, unknowns & sequencing

- **Ordering dependency (hard):** the `gitwt` symlink and the dev-tools cleanup
  cannot complete until the skill is *published and auto-pulled* into the marketplace
  checkout. Implementation order: move+author in this worktree → PR → merge →
  publish sync → marketplace auto-update → then symlink + dev-tools removal.
- **Dangling symlink window:** moving `git-worktree-create` out of dev-tools dangles
  `dev-tools/bin/gitwt`. Until the published skill is live, dogfood by temporarily
  pointing the symlink at the ai-labs working copy
  (`…/dev-skills/public/worktree/scripts/git-worktree-create`).
- **Published copy lags dev copy:** the marketplace symlink reflects the *published*
  skill, not unpublished local edits. Acceptable for a "just works" tool; note it.
- **ai-labs `tools/ensure-shared-config-links/` disposition** (open sub-decision):
  symlink into the skill copy (live dogfood) vs remove and repoint references. Lean:
  symlink, consistent with "dogfooding is the way of living."
- **Global `~/.claude/rules/worktrees.md` overlap:** keep a thin rule that points to
  the skill, or remove it once the skill exists. Lean: keep a one-liner pointer to
  avoid two drifting sources.

## Out of scope

- Reworking `wt`'s behavior or scheme (only a deprecation note).
- Changes to other dev-skills or the publish workflow itself.
- The unrelated cairana products-sync work on the prior branch.
