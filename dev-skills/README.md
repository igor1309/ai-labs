# Dev Skills - Development Repository

Development workspace for reusable agent skills inside `ai-labs`.

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

### Development

- Work on skills in `public/` folder
- Maintain development docs in `docs/`
- Track work-in-progress in `TODO/`
- Skill-local development folders may live next to `SKILL.md` as `sandbox/`, `research/`, and `archive/`

### Publishing

The canonical publishing workflow lives in [`.claude/CLAUDE.md`](.claude/CLAUDE.md) — author front-matter gate, marketplace update, version bump, log entry, branch + PR + auto-merge, and post-merge verification. After the PR merges, a GitHub Action syncs `public/` to [igor1309/skills](https://github.com/igor1309/skills).

#### Publish Exclusions

Local development folders under `public/` are intentionally not published to the public skills repository:

- `sandbox/`
- `research/`
- `archive/`

They are excluded by `public/.publishignore` and a case-insensitive cleanup step in `.github/workflows/sync-skills-public.yml`.

## Public Repository

Users install skills from: https://github.com/igor1309/skills

```
/plugin marketplace add igor1309/skills
```

See `public/.claude-plugin/marketplace.json` for the current published skill catalog. The public skills repo (`igor1309/skills`) is intentionally kept without a top-level `README.md` so web agents can install it without authentication friction.
