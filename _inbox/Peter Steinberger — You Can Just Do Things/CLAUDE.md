---
source: Peter Steinberger — You Can Just Do Things
---
<ADD TO AGENTS.md or CLAUDE.md>

## Git Workflow

🈲 CRITICAL - NEVER USE git add -A or git add . 🈲
- ABSOLUTELY FORBIDDEN: Never stage all files at once
- ONLY stage files YOU explicitly modified in this conversation
- ALWAYS use specific file paths: git add path/to/specific/file.ts
- CHECK with git status before staging anything
- Other developers may have uncommitted work - DO NOT touch their files




<Aggressive Refactoring>
Refactoring Philosophy
- No backwards compatibility - refactor aggressively
- No version suffixes - update files directly (timeline.ts not timeline-v2.ts)
- No legacy files - delete old implementations completely


---

CLAUDE.md


# Development & Codebase Guidelines

The year is 2025.

## General Rules
- NEVER delete or revert files unless explicitly requested in this session.  
- Moving/renaming and restoring files is allowed.  
- Do not run destructive git operations (e.g., `reset --hard`, `rm`, checkout/restore to an older commit) unless explicitly requested.  
- Always double-check git status before any commit.  
- No quick fixes – properly fix TypeScript errors and code issues.  
- Use proper TypeScript types instead of `any`.  

### Avoid Type Assertion Anti-Patterns
- Never use `as unknown as` or other unsafe type assertions.  
- Instead, create proper type transformers in `src/lib/validation/transformers.ts`.  
- Use type guards and proper validation for type conversions.  
- Example: Create `transformUserV2ToTwitterApiUser()` instead of `user as TwitterApiUser`.  

Be critical of bad practices and challenge poor architectural decisions.

---

## ⚠️ Critical Antipattern: "Handle Both Formats"
NEVER write code that handles multiple data formats like this:

```ts
// ❌ ANTIPATTERN - "Handle both" creates technical debt
const date = data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt);
const authorId = data.authorId || data.author_id; // Both camelCase and snake_case
const isoString = userData.createdAt instanceof Date
  ? userData.createdAt.toISOString()
  : userData.createdAt; // NEVER DO THIS!
```

### Why this is wrong
- Violates single source of truth principle  
- Creates maintenance burden across codebase  
- Hides the real architectural issue  
- Leads to inconsistent data handling  
- **THESE ARE HACKS, NOT SOLUTIONS**

### The correct approach
- **ALWAYS fix the root cause** (boundary transformation, serialization, API response structure)  
- Maintain clean data flow with single format  
- Respect the established Zod boundary architecture  
- Use proper validation/transformation at entry points  
- **Never compromise on data type consistency**

---

## Code References Format
When referencing code locations, MUST use VS Code clickable format:
- `path/to/file.ts:123` (single line)  
- `path/to/file.ts:123-456` (range)

---

## 🏗️ Development Environment

```bash
pnpm env:dev      # Local development (isolated)
pnpm env:prod     # Production-like (BE CAREFUL - real data!)
pnpm env:status   # Check current environment
pnpm run dev      # Start dev server (ONLY when user requests)
```

⚠️ **CRITICAL:** The user usually has a dev server already running on `localhost:3000`
- NEVER start your own dev server unless explicitly asked  
- NEVER kill or restart the existing server  
- Always use the existing `localhost:3000` for testing  
- If you accidentally start a server, immediately kill it  
- The user will get angry if you kill their running server!  

### Local Mode
- `pnpm run dev` automatically starts Docker containers (PostgreSQL + CloudBeaver)  
- **IMPORTANT:** Never manually start Docker containers — `pnpm run dev` handles this automatically  
- PostgreSQL runs on `localhost:5432`  
- CloudBeaver UI available at `localhost:8080`  
- Completely isolated from production  
- To reset the database: stop dev server first, then run `pnpm run db:reset`  

### Production Mode
- Connects to production Neon database  

### Environment Files
- `.env` — Active configuration (Next.js reads this)  
- `.env.prod-like` — Vercel Preview environment template  
- `.env.dev-local` — Local development template  
- `docker-compose.dev.yml` — Local services configuration  
- `.env.backup` — Automatic backup when switching  

---

## 🧪 Testing
**Framework:** This project uses **Vitest** for all testing.  

### Agent Policy: No Watch/Interactive Modes
- Automation must not use watch/interactive flags; they hang indefinitely.  
- Use run-once commands only; prefer `pnpm -s test` for units.  

**Forbidden (hangs):**
- `pnpm test -w`, `pnpm -s test -w`, `pnpm test --watch`  
- `pnpm vitest` (no args), `pnpm vitest -w`, `pnpm vitest --watch`  
- `pnpm Playwright test --ui`

**Allowed (run once):**
- `pnpm -s test`  
- `pnpm vitest run`  
- `pnpm test:unit`, `pnpm test:integration`, `pnpm test:all`, `pnpm test:ci`  

For CI output tuning, use reporters, e.g.:  
```bash
pnpm vitest run --reporter=dot
```

---

## Test Categories and Coverage

### 🔍 AST-Grep (Structural Search & Codemods)
**What it is:**  
- Structural code search, lint, and codemods using tree-sitter AST.  
- Complements Biome (format + curated JS/TS lint) with custom, pattern-driven rules and safe rewrites.  

**Why we use it:**  
- Enforce core policies:  
  - no `as unknown as`  
  - no `as any`  
  - no direct `process.env` outside the T3 env boundary  
  - no direct `new TwitterApi(...)`  
- Fast, repo-wide AST queries and targeted refactors during migrations.  

**Quick commands:**
- Search: `sg run -p 'process.env.$NAME' -C 2 src`  
- Rewrite (preview): `sg run -p 'process.env.$NAME' -r 'env.$NAME' --interactive src`  
- Scan with rules:  
  - `pnpm run lint:ast-grep` (all)  
  - `pnpm run lint:ast-grep:strict` (low-noise)  

**How To Use (Concise Guide):**
- Preview first: `sg run -p '<pattern>' -C 1 src` *(never write on first pass)*  
- Refactor safely: `sg run -p '<pattern>' -r '<replacement>' --interactive src`  
- Scope precisely: `--globs 'src/lib/**' --globs '!src/env.ts'`  
- Constrain matches: `--constraint NAME '/_/'` for snake_case  
- Validate:  
  ```bash
  pnpm run lint:ast-grep:strict
  pnpm -s test
  ```

---

## Tweet Upserts (Single Source of Truth)
- Use `batchUpsertTweets()` for DB-shaped rows. If you have boundary tweets, use `upsertTweetsFromBoundary()`.  
- Boundary-first flow: Twitter API → boundary (camelCase, Date types) → DB rows → `batchUpsertTweets()`.  
- Do not convert back to `TweetV2` for DB writes; keep V2 only in read utilities if necessary.  

**Examples:**
- Boundary tweets → `upsertTweetsFromBoundary(boundaryTweets, { media })`  
- DB rows → `batchUpsertTweets(rows)`  

Tips:  
- Use meta variables (`$EXPR`, `$NAME`, `$TYPE`) for flexible matching.  
- Add constraints with `inside`, `has`, `precedes` for precision.  
- Use `--selector` to narrow matches.

---

## ⚙️ Command Behaviors

### `/check` Command
1. `pnpm biome check --write .`  
2. `pnpm type-check`  
3. `pnpm test`  
4. Fix all issues and re-run until everything passes  

### `/commit` Command
1. Run `git status`  
2. Stage **only** modified files  
3. Create descriptive commit message  
4. **NEVER** use `git add .` or `git add -A`  

---

## ❗ Critical Rules

### Code Organization & Contributions
- Active contributor ecosystem must be maintained.  
- Keep all files under 800 LOC, modular and single-purpose.  
- Always read full files before editing — **never make blind changes**.  

---

## Rules (Next.js Canary)
- **NEVER** downgrade Next.js from canary to stable  
- **NEVER** disable PPR — upgrade Next.js instead  
- **ALWAYS** update with:  
  ```bash
  pnpm add next@canary react@canary react-dom@canary
  ```
- Monitor breaking changes in canary releases  
- Always pin `"next": "canary"` in `package.json`  
- Pin `react`, `react-dom` as well via deps or `pnpm.overrides`  

---

## 🔍 Debugging

### Better Stack Logging
```bash
bslog tail -n 50             # Recent logs
bslog errors --since 1h      # Recent errors
bslog search "module:timeline" --limit 50
```
Dashboard: [https://logtail.com](https://logtail.com)  
Requires: `NEXT_PUBLIC_LOGTAIL_SOURCE_TOKEN`  

### bslog CLI Setup
```bash
# In ~/.zshrc
source ~/.zshrc

# Set default source
bslog config source sweetistics-dev
```

---

## 🗄️ Atlas Database Schema Management

### Quick Start
```bash
pnpm atlas:dev-db
pnpm -s schema:apply
pnpm -s schema:apply:prod
```
- Prod DB URL lives in `.env.prod-like` as `DIRECT_DATABASE_URL`.  
- Switch with `pnpm env:prod` before applying.  

### Common Commands
```bash
atlas schema inspect --env <name> --url file://migrations
atlas migrate status --env <name>
atlas migrate diff --env <name>
atlas migrate lint --env <name> --latest 1
atlas migrate apply --env <name>
```

### Making Schema Changes
1. Inspect schema & plan changes  
2. `atlas migrate diff`  
3. `atlas migrate lint`  
4. `atlas migrate test` (Pro only)  
5. Fix issues → `atlas migrate hash`  
6. Repeat until clean  

Then apply with:  
```bash
atlas migrate apply
atlas migrate status
```

---

### Troubleshooting Commands
```bash
atlas version
atlas whoami
atlas migrate hash --env <name>
```

**Missing driver:**  
Error: `sql/sqlclient: missing driver` → check `--url` or `--dev-url`.  

---

## 📌 Key Reminders for AI Assistants
1. Always read `atlas.hcl` first  
2. Use env names from config  
3. Never hardcode DB URLs  
4. Use `--url` even with `--env`  
5. Run `atlas migrate hash` after edits  
6. Always run `atlas migrate lint`  
7. Check `atlas whoami` before Pro features  
8. Use JSON + `jq` for schema exploration  
9. Use SQL + `grep` for detailed checks  
10. Suggest visualizations if asked  
11. Never ask for sensitive info  
12. Always `--dry-run` before applying  
13. Enable migration testing when possible  
14. Only use listed Atlas commands  
15. Inspect schemas at high level first  
16. Prefer `atlas schema inspect`  
17. Migration files may be large, filter with care  
18. Never ignore linting errors  

---

## Guidelines for Workflows
1. **Understand objectives** before suggesting commands  
2. **Understand context** (config file is key)  
3. **Verify changes** after generating/linting/migrating  
4. **After completing**, ensure all rules followed  
