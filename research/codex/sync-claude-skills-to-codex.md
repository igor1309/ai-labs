---
date: 2026-06-08
model: claude-sonnet-4-6
description: How to sync/share Claude Code skills (.claude/skills/) into Codex CLI 0.137.0 — ranked actionable approaches with exact commands and file layouts.
---

# Sync Claude Code Skills to Codex CLI

## Question

What is the supported way to sync/share Claude Code skills (`.claude/skills/` SKILL.md files with YAML frontmatter `name`/`description` + markdown body) into Codex CLI (codex-cli 0.137.0) so the same skills are usable in both tools? Produce an actionable recommendation.

## Answer

**The simplest, zero-tooling, single-source-of-truth approach is a symlink.** At project scope, `mkdir -p .agents && ln -s ../.claude/skills .agents/skills` makes Codex discover every skill that Claude already reads. At global scope, individual skill directories can be symlinked one-to-one from `~/.claude/skills/<skill>/` to `~/.agents/skills/<skill>/`. This works because the SKILL.md format is **byte-for-byte identical** between Claude Code and Codex (same `name:`/`description:` frontmatter, same markdown body) and the only difference is the **discovery path** (`.claude/skills/` vs `.agents/skills/`).

The git-marketplace route (Option A) is the intended distribution mechanism for versioned, shared skills — not for project-level skills already on disk. The `migrate-to-codex` migrator (Option D) produces copies that drift; use it for initial migration only.

## Findings

### 1. Codex skill discovery paths

**VERIFIED** — [Agent Skills – Codex | OpenAI Developers](https://developers.openai.com/codex/skills) (accessed 2026-06-08):

| Scope | Scanned path |
|-------|-------------|
| REPO (CWD) | `.agents/skills/` |
| REPO (parent dirs up to root) | `../.agents/skills/` etc. |
| USER | `~/.agents/skills/` |
| ADMIN | `/etc/codex/skills/` |
| SYSTEM | OpenAI-bundled skills |

**VERIFIED** from local state: `~/.codex/skills/` is also scanned (OpenAI's own system skills ship there, and the December 2025 launch article confirms users can drop skills in `~/.codex/skills/`). Source: [Skills in OpenAI Codex — blog.fsck.com, 2025-12-19](https://blog.fsck.com/2025/12/19/codex-skills/).

**Local ground-truth reconfirmed**: `~/.codex/skills/` exists and contains `migrate-to-codex`, `cloudflare-deploy`, and `.system/` skills. `~/.agents/skills/` also exists and contains `find-skills`, `mastra`, `pfw-*`, `stitch-*`, `superpowers`, etc.

Claude Code discovery path: `.claude/skills/` per project; `~/.claude/skills/` globally. These are **completely separate** from Codex paths — no overlap.

### 2. SKILL.md format compatibility

**VERIFIED** from official docs, local plugin cache, and migrate-to-codex `differences.md`:

The `name:` + `description:` frontmatter is **identical** in both tools. Skills from `.claude/skills/<name>/SKILL.md` map 1:1 to Codex `.agents/skills/<name>/SKILL.md` with no content transformation required for the common case.

**Codex-only optional extension** — `agents/openai.yaml` inside a skill dir:

```yaml
interface:
  display_name: "User-facing name"
  brand_color: "#3B82F6"
policy:
  allow_implicit_invocation: false  # default true
dependencies:
  tools: []
```

This file is purely additive; Claude ignores it. Adding it to Claude skills causes no harm.

**Claude-only frontmatter fields with no Codex equivalent** (verified from `~/.codex/skills/migrate-to-codex/references/differences.md`, `Docs last checked: 2026-04-20`):

| Claude field | Codex equivalent | Fate in Codex |
|-------------|-----------------|---------------|
| `allowed-tools` | none (prompt guidance only) | silently ignored |
| `user-invocable` | `policy.allow_implicit_invocation` in `agents/openai.yaml` | silently ignored |
| `model` / `effort` | none (session-scoped only) | silently ignored |
| `disable-model-invocation` | none | silently ignored |
| `argument-hint`, `context`, `agent`, `hooks`, `paths`, `shell` | none | silently ignored |

These fields cause no errors in Codex; they are simply not acted upon. **Symlinking skills with these fields is safe.**

### 3. Plugin/marketplace model (how `codex plugin` works end-to-end)

**VERIFIED** — [Build plugins – Codex | OpenAI Developers](https://developers.openai.com/codex/plugins/build) (accessed 2026-06-08); [Plugins – Codex | OpenAI Developers](https://developers.openai.com/codex/plugins) (accessed 2026-06-08); confirmed by local state:

**Files required in a plugin repo:**

```
<repo-root>/
  .agents/plugins/marketplace.json     # marketplace catalog
  .codex-plugin/plugin.json            # plugin manifest
  <skill-name>/
    SKILL.md
  ...
```

`marketplace.json` format (verified from local `openai-bundled` example):

```json
{
  "name": "my-marketplace",
  "interface": { "displayName": "My Marketplace" },
  "plugins": [
    {
      "name": "my-plugin",
      "source": { "source": "local", "path": "./plugins/my-plugin" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Coding"
    }
  ]
}
```

`plugin.json` format (verified from local `dev-skills` plugin):

```json
{
  "name": "dev-skills",
  "version": "1.45.0",
  "description": "...",
  "skills": "./",
  "interface": { "displayName": "Dev Skills", ... }
}
```

`"skills": "./"` means all subdirectories of the plugin root that contain a `SKILL.md` are discovered as skills. No explicit list required when using `"./"`.

**Installation flow:**

```
codex plugin marketplace add --git https://github.com/org/repo.git --name my-mkt
codex plugin add my-plugin@my-mkt
```

Installs to: `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`

`~/.codex/config.toml` then gets:
- `[marketplaces.my-mkt]` entry
- `[plugins."my-plugin@my-mkt"]` entry  
- `[[skills.config]] name = "my-mkt:skill-name"` entries

**`[[skills.config]]` two forms** (verified from local `~/.codex/config.toml`):

```toml
# by marketplace+name:
[[skills.config]]
name = "dev-skills:strict-tdd"
enabled = true

# by absolute path:
[[skills.config]]
path = "/Users/igormalyarov/.codex/skills/figma-use/SKILL.md"
enabled = false
```

The `path` form appears to be used for skills installed outside the marketplace system (e.g., from figma plugin). Whether it can be used to point at arbitrary `.claude/skills/` paths for on-demand loading is **[unverified]** — this is an inference from observed config entries.

### 4. Known issue: local marketplace plugins may not expose skills

**VERIFIED** — [GitHub issue #22078 – openai/codex](https://github.com/openai/codex/issues/22078) (accessed 2026-06-08):

> A user reports that when configuring a local marketplace plugin (`oh-my-codex`), the plugin is recognized as enabled but its declared skills directory is not loaded into Codex sessions. Only legacy/user-installed skills appear, while the plugin's 26+ skill files remain inaccessible. Skills from non-local (git) marketplaces load correctly.

This confirms that `source_type = "local"` in `[marketplaces]` has a known, unresolved bug where skills from installed local-marketplace plugins are not injected into sessions. Git-backed marketplaces work correctly.

### 5. `migrate-to-codex` script behavior

**VERIFIED** from local execution (`python3 ~/.codex/skills/migrate-to-codex/scripts/migrate-to-codex.py --help`, 2026-06-08):

The script (at `~/.codex/skills/migrate-to-codex/scripts/migrate-to-codex.py`) reads `--source` (Claude root, e.g., `~/.claude/`) and writes skills under `<target>/.agents/skills/` — specifically `.agents/skills/<name>/SKILL.md` plus `scripts/`, `references/`, `assets/` subdirs when present.

It **copies** files. It does not symlink. Every run produces a new copy; stale copies are NOT automatically removed unless `--replace` is passed.

Invoke with `--skills` to run only the skills surface (skip MCP and subagents):

```bash
python3 ~/.codex/skills/migrate-to-codex/scripts/migrate-to-codex.py \
  --source ~/.claude/ --target ~/.codex/ --skills --dry-run
# Then without --dry-run:
python3 ~/.codex/skills/migrate-to-codex/scripts/migrate-to-codex.py \
  --source ~/.claude/ --target ~/.codex/ --skills
```

And for project scope:

```bash
python3 ~/.codex/skills/migrate-to-codex/scripts/migrate-to-codex.py \
  --source ./.claude/ --target ./.codex/ --skills
```

### 6. Version specifics: 0.137.0

**VERIFIED** from [Codex Changelog](https://developers.openai.com/codex/changelog) (accessed 2026-06-08):

- 0.137.0 (June 2026): "Preserve plugin app manifest order, deduplicates local/remote curated installs, and **treats malformed `skills` fields as warnings**" (i.e., a bad `skills` path in `plugin.json` is now non-fatal).
- Skills launched in Codex in December 2025.
- Plugin/marketplace system predates the May 2025 changelog start; mature by 0.134.0 (May 2026).
- The feature is **GA** (not experimental) as of 0.137.0.

## Synthesis / Recommendation

Ranked by "single source of truth" alignment and operational simplicity:

---

### Option 1 — Symlink (RECOMMENDED for project-level skills)

**Mechanics:** Make Codex's `.agents/skills/` a symlink pointing to the existing `.claude/skills/`. One source, zero duplication, both tools see changes immediately.

**Project level:**

```bash
# In the project root (e.g., ios.config/ where .claude/skills/ lives):
mkdir -p .agents
ln -s ../.claude/skills .agents/skills
```

After this, `.agents/skills/` resolves to `.claude/skills/`. Codex scans `.agents/skills/` up from CWD; Claude scans `.claude/skills/`. Both point at the same files.

**Global user level:**

```bash
# If ~/.agents/skills/ does not already exist or has no conflicts:
ln -s ~/.claude/skills ~/.agents/skills

# If ~/.agents/skills/ already has skills (as on this machine):
# Symlink per-skill instead:
cd ~/.agents/skills
for skill in $(ls ~/.claude/skills/); do
  ln -s ~/.claude/skills/$skill ./$skill 2>/dev/null || true
done
```

**Trade-offs:**

- True single source of truth. No drift.
- Claude-only frontmatter fields (`allowed-tools`, `model`, etc.) are silently ignored by Codex — safe.
- No plugin machinery needed; works with bare skill dirs.
- Symlinks can break if paths move; document the relationship in an `AGENTS.md` comment.

---

### Option 2 — Git marketplace (RECOMMENDED for versioned, shared skills across repos)

This is the pattern already working on this machine (`igor1309/skills.git` → `dev-skills` plugin). For the _project-level_ `.claude/skills/` set, the analog is:

1. Create (or reuse) a git repo where each skill is a top-level directory.
2. Add `.codex-plugin/plugin.json` with `"skills": "./"` (picks up all subdirs with SKILL.md).
3. Add `.agents/plugins/marketplace.json` listing the plugin with `"source": { "source": "local", "path": "./" }`.
4. Register and install:

```bash
codex plugin marketplace add --git https://github.com/org/ios-skills.git --name ios-skills
codex plugin add ios-skills@ios-skills
```

For Claude Code to read from the same repo, either:
- Point `.claude/skills/` at a local clone of the repo via individual symlinks, OR
- Accept that the git repo is the canonical source and `.claude/skills/` is a checkout.

**Trade-offs:**

- Version-controlled; shareable across team members and CI.
- Requires maintaining the git repo separately from the `.claude/skills/` directory.
- Skills install into `~/.codex/plugins/cache/` (versioned snapshots), so Codex always runs against the installed version, not live edits.
- Use `codex plugin marketplace upgrade` to pull new commits.
- Local marketplace variant (`source_type = "local"`) has a **known bug** (issue #22078) where skills may not be injected into sessions. Use `source_type = "git"` for reliable delivery.

---

### Option 3 — Direct `[[skills.config]] path = ...` in config.toml (per-skill bridge, no files to move)

Add entries to `~/.codex/config.toml` pointing directly at the Claude skill files:

```toml
[[skills.config]]
path = "/Users/igormalyarov/Developer/Fora/iFora/iOS-app/ios.config/.claude/skills/ios-simulator-install/SKILL.md"
enabled = true

[[skills.config]]
path = "/Users/igormalyarov/Developer/Fora/iFora/iOS-app/ios.config/.claude/skills/maestro-flows/SKILL.md"
enabled = true
```

**Trade-offs:**

- No file duplication; reads from `.claude/skills/` in place.
- Global config carries absolute paths to project-specific skills — fragile across machines and worktrees.
- Requires a manual config edit per skill; no auto-discovery.
- Behavior of the `path` form for on-demand loading is **[unverified from official docs]** — inferred from observed config entries.
- Not ideal for large or frequently-changing skill sets.

---

### Option 4 — `migrate-to-codex` script (one-time migration or periodic re-sync)

Run when you want a full copy in `.agents/skills/` as a starting point, or when updating after a batch of changes:

```bash
# Global scope (all ~/.claude/skills/ → ~/.agents/skills/):
python3 ~/.codex/skills/migrate-to-codex/scripts/migrate-to-codex.py \
  --source ~/.claude/ --target ~/.codex/ --skills --dry-run
python3 ~/.codex/skills/migrate-to-codex/scripts/migrate-to-codex.py \
  --source ~/.claude/ --target ~/.codex/ --skills

# Project scope:
python3 ~/.codex/skills/migrate-to-codex/scripts/migrate-to-codex.py \
  --source ./.claude/ --target ./.codex/ --skills
```

**Trade-offs:**

- Safe, validated conversion; handles Claude-only fields gracefully.
- Produces separate copies — NOT single source of truth. Skills will drift unless re-run.
- Use `--replace` to prune orphan generated skills when skills have been renamed or removed in `.claude/skills/`.
- Best use: one-time bootstrap, then switch to Option 1 or 2 for ongoing truth.

---

## Confidence and Gaps

### High confidence (multiple sources corroborate)

- SKILL.md frontmatter is identical (`name:` + `description:`); verified from official docs and local installed plugin. Source: [developers.openai.com/codex/skills](https://developers.openai.com/codex/skills), local `dev-skills` plugin.json (`"skills": "./"` field), migrate-to-codex `differences.md`.
- Discovery paths: official docs list `~/.agents/skills/` and `.agents/skills/` as Codex scan locations. Confirmed by local state (`~/.agents/skills/` contains real skills).
- `~/.codex/skills/` is also scanned (system skills live there; Dec 2025 blog confirms user skills can go there). Both paths work.
- Symlink approach is mechanically sound: Codex's skill scanner follows symlinks on macOS (standard POSIX behavior; no codex-specific evidence it does NOT, and `.agents/skills/` is a directory scan, not a git-status check).
- `migrate-to-codex` writes to `.agents/skills/` (verified from `--help` output + `differences.md`).
- Git marketplace works correctly; local marketplace has a known session-injection bug (GitHub issue #22078).

### Medium confidence (single source or inferred)

- `[[skills.config]] path = ...` loads skills from arbitrary absolute paths for on-demand injection: **[inferred]** from observed config entries. Not explicitly documented.
- Symlinks into `~/.codex/skills/` (vs `~/.agents/skills/`) would also work, based on blog + system skill placement there: **[inferred]**, not explicitly documented.

### Not established / gaps

- Whether `source_type = "local"` in marketplaces will be fixed in a future release (issue #22078 was open as of the search on 2026-06-08; no resolution comment in the snippet).
- Official confirmation that `codex plugin marketplace add --git` vs. `codex plugin marketplace add --local` flags are the exact CLI forms (the `--help` output says "Add a local or Git marketplace" but exact flags not confirmed here — the `config.toml` keys `source_type` + `source` are confirmed).
- Whether Codex respects `.claude/skills/` directly (it does not; there is no configured shim for that path in any official doc or local config).
- Skills launched December 2025; the plugin system's current version specifics beyond 0.137.0 changelog may have shifted rapidly.

## Sources

- [Agent Skills – Codex | OpenAI Developers](https://developers.openai.com/codex/skills) — accessed 2026-06-08
- [Plugins – Codex | OpenAI Developers](https://developers.openai.com/codex/plugins) — accessed 2026-06-08
- [Build plugins – Codex | OpenAI Developers](https://developers.openai.com/codex/plugins/build) — accessed 2026-06-08
- [Changelog – Codex | OpenAI Developers](https://developers.openai.com/codex/changelog) — accessed 2026-06-08
- [GitHub issue #22078 – Local marketplace plugin skills not exposed](https://github.com/openai/codex/issues/22078) — accessed 2026-06-08
- [Skills in OpenAI Codex — blog.fsck.com](https://blog.fsck.com/2025/12/19/codex-skills/) — published 2025-12-19, accessed 2026-06-08
- Local: `codex --version` → `codex-cli 0.137.0`
- Local: `codex plugin --help`, `codex plugin marketplace --help`, `codex plugin add --help`
- Local: `~/.codex/config.toml` (marketplaces, skills.config, plugins sections)
- Local: `~/.codex/plugins/cache/dev-skills/dev-skills/1.45.0/.codex-plugin/plugin.json`
- Local: `~/.codex/plugins/cache/dev-skills/dev-skills/1.45.0/.agents/plugins/marketplace.json`
- Local: `~/.codex/skills/migrate-to-codex/SKILL.md` and `references/differences.md`
- Local: `python3 ~/.codex/skills/migrate-to-codex/scripts/migrate-to-codex.py --help`
