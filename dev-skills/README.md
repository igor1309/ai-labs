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
- Skill-local development folders may live next to `SKILL.md` as `sandbox/`, `research/`, and `archive/`

### Publish Exclusions

Local development folders under `public/` are intentionally not published to the public skills repository:

- `sandbox/`
- `research/`
- `archive/`

They are excluded by `public/.publishignore` and a case-insensitive cleanup step in `.github/workflows/sync-skills-public.yml`.

**Publishing:**
1. Move skill to `public/<skill-name>/` when ready
2. Update `public/.claude-plugin/marketplace.json` — add skill entry, bump `version`, update `description` if needed
3. Update `public/README.md`
4. Commit and push to `trunk` branch
5. GitHub Action automatically syncs `public/` → [igor1309/skills](https://github.com/igor1309/skills) (public)
6. Manual trigger available via workflow dispatch

## Public Repository

Users install skills from: https://github.com/igor1309/skills

```
/plugin marketplace add igor1309/skills
```
