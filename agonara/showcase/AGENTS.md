# Publishing Agonara's showcase

Read `../README.md` for private project context before writing for visitors.
The public README lives in `public/README.md`; never copy the private README
or other prose docs into it. Read the public README for private context,
internal tools, home paths and assumptions a stranger cannot follow.

Retake the screenshots when the `/learn` or `/admin` screens they show
change. From `agonara/`, `node showcase/screenshots.mjs <directory>` seeds a
demo program through the API on an in-memory instance and captures student
navigation, a Quick Check attempt, the curator's coverage gaps and the
Admin board. Convert each to WebP with `cwebp -q 82 -resize 1600 0
-resize_mode down_only` into `public/screenshots/`, and look at every one
before committing it.

Rewrite the public README when its modules, screens, setup commands or
screenshots no longer match the app. The owner approves each rewrite
before it is pushed.

The export carries the app, its tests, the OpenAPI document and what
`compose.yaml` needs to build and run it locally. The deployment, backup,
restore, rollback and smoke scripts, the staging and production compose
files, `docs/` other than `docs/api/`, `skills/` and the skills-publishing
scripts stay private, and so do the tests that check them. When a new test
reads a file the export leaves out, exclude the test with the reason, or make
it read only exported files. Tests that assert no home path reaches a
response may hold placeholder `/Users/` paths; `[[allow_marker]]` names each
such file, and every path in them must be a placeholder.

From the ai-labs repository root, after committing the intended snapshot:

```sh
node scripts/showcase/export.js agonara
node scripts/showcase/export.js agonara --push
```

The first command is a dry run: it prints a temporary directory after marker
and secret scans and `npm ci && npm test` pass. Inspect that directory before
publishing, and run `docker compose build` in it. Both commands need Node
with `path.matchesGlob`, git and gitleaks; the check needs npm and network
access for its clean install. The push also needs an existing
`igor1309/agonara` GitHub repository, an authenticated `gh` and git
credentials, and a clean ai-labs worktree. The exporter never creates
repositories.

The public `.gitignore` stands in for the ai-labs one, which the export
does not carry. Commit `showcase/public/` along with each intended change.
The exporter reads HEAD, so edits and untracked files are not published.
After the first sync, pin `igor1309/agonara` on the owner's GitHub profile
manually.
