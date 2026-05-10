# Dev Skills - Development Repository

Development workspace for Claude Code skills inside `ai-labs`.

Skills are developed here and published to the public [igor1309/skills](https://github.com/igor1309/skills) repository via GitHub Actions.

## Structure

```
dev-skills/
├── public/              # Public skills (synced to igor1309/skills)
│   ├── tdd-interactive/
│   └── .claude-plugin/
├── docs/               # Development documentation
├── TODO/               # Work-in-progress tracking
└── .claude/            # Local Claude configurations
```

## Workflow

**Development:**
- Work on skills in `public/` folder
- Maintain development docs in `docs/`
- Track work-in-progress in `TODO/`
- Skill-local development folders may live next to `SKILL.md` as `sandbox/`, `research/`, and `archive/`

### Publish Exclusions

Local development folders under `public/` are intentionally not published to the public skills repository:

- `sandbox/`
- `research/`
- `archive/`

They are excluded by `public/.publishignore` and a case-insensitive cleanup step in `.github/workflows/sync-skills-public.yml`.

**Publishing:**
1. Move skill to `public/<skill-name>/` when ready
2. Update `public/.claude-plugin/marketplace.json`
3. Commit on a dedicated branch, push, and open a PR into `trunk` (`trunk` is protected — direct pushes are blocked); use `gh pr merge --merge --auto --delete-branch`
4. After the PR merges, GitHub Action syncs to [igor1309/skills](https://github.com/igor1309/skills)
5. Verify CI, release version, and skill presence (see `.claude/CLAUDE.md` for details)

## Public Repository

Users install skills from: https://github.com/igor1309/skills

```
/plugin marketplace add igor1309/skills
```

See `public/.claude-plugin/marketplace.json` for the current published skill catalog. The public skills repo (`igor1309/skills`) is intentionally kept without a top-level `README.md` so web agents can install it without authentication friction.

## Description

A collection of reusable agent skills — strict TDD, process gates, release management, architecture review, and more. Developed here, *published to a public repo* via GitHub Actions sync.

## Stack

- Claude Code
- Markdown
- GitHub Actions
