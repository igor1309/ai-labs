# Dev Skills - Development Repository

Private development repository for Claude Code skills.

## Structure

```
dev-skills/
├── public/              # Public skills (synced to igor1309/skills)
│   ├── tdd-interactive/
│   ├── .claude-plugin/
│   ├── README.md
│   └── LICENSE
├── docs/               # Development documentation
├── TODO/               # Work-in-progress tracking
└── .claude/            # Local Claude configurations
```

## Workflow

**Development:**
- Work on skills in `public/` folder
- Maintain development docs in `docs/`
- Track work-in-progress in `TODO/`

**Publishing:**
- Push to `trunk` branch
- GitHub Action automatically syncs `public/` → [igor1309/skills](https://github.com/igor1309/skills) (public)
- Manual trigger available via workflow dispatch

## Public Repository

Users install skills from: https://github.com/igor1309/skills

```
/plugin marketplace add igor1309/skills
```
