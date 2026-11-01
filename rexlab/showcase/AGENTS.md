# Publishing RexLab's showcase

Read `../README.md` for private project context before writing for visitors.
The public README lives in `public/README.md`; never copy the private README
or other prose docs into it. Read the public README for private context,
internal tools, home paths and assumptions a stranger cannot follow.

Retake the screenshots when the screens or their artwork change. From
`rexlab/`, run `npm run build` and `npx vite preview --port 4799`, then
`node showcase/screenshots.mjs http://localhost:4799 <directory>`: iPad
landscape at 2x, in English, home in both themes and one screen of each game
that shows something at its start. Dig and Find the pair start blank, so they
are left out. Convert each to WebP (`cwebp -q 82 -resize 1600 0`) into
`public/screenshots/`, and look at every one before committing it. Add a
screen to `screenshots.mjs` when a new game lands.

Rewrite the public README when the games, age levels, languages, setup
commands or screenshots no longer match the app, and keep its counts (feature
files, scenarios, test files, dinosaurs) current. It explains the app to a
visitor, with pictures, the live game's link and the MIT licence. The owner
approves each rewrite before it is pushed.

From the ai-labs repository root, after committing the intended snapshot:

```sh
node scripts/showcase/export.js rexlab
node scripts/showcase/export.js rexlab --push
```

The first command is a dry run: it prints a temporary directory after marker
and secret scans and `sh scripts/test.sh` pass. Inspect that directory before
publishing. Both commands need Node with `path.matchesGlob`, git and gitleaks;
the check needs npm and network access for its clean install. The push also
needs an existing `igor1309/rexlab` GitHub repository, an authenticated `gh`
and git credentials, and a clean ai-labs worktree. Create the public repo
manually before the first push; the exporter never creates repositories.

Commit `showcase/public/` along with each intended change. The exporter reads
HEAD, so edits and untracked screenshots are not published. After the first
sync, pin `igor1309/rexlab` on the owner's GitHub profile manually.
