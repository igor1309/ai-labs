# Publishing Mizan BLE's showcase

Read `../README.md`, `../ARCHITECTURE.md` and `../NOTES.md` for private
context before writing for visitors. The public README lives in
`public/README.md`; never copy the private README or other prose docs into
it. Read it for private context, internal tools, home paths, spec ids and
assumptions a stranger cannot follow.

The export is the app: the core package, the app and rehearsal packages
with the Xcode project, the preview apps, the lane runner and its tests,
and the Maestro lanes. Private: `docs/` (the plan, specs, design, research
and log), `NOTES.md`, `ARCHITECTURE.md`, `AGENTS.md`, the landing page,
`ios/scripts/generate-tokens.py` with its test and
`ios/Tests/DesignSystemTests/TokensTests.swift`, since they read the private
design file, and `maestro/runs/`, whose reports name private commits.

Screenshots come from real devices, since the simulator has no Bluetooth:
the host on an iPad (advertising, paid) and the client on an iPhone (a
host in range, the review, the wait for the result). Take them in one
payment, in dark mode, and convert each to WebP, iPad at 1200 px wide and
iPhone at 600 (`cwebp -q 82 -resize 1200 0`), into `public/screenshots/`.
Look at every one before committing it; an advertised name such as
`MIZAN-D1CD` is random per session and fine to show.

Rewrite the public README when the flow, the GATT layout, the encryption,
setup commands or screenshots no longer match the app. The owner approves
each rewrite before it is pushed. Point `homepage` in `showcase.toml` at
the v0.0.1 blog post once it is published.

From the ai-labs repository root, after committing the intended snapshot:

```sh
node scripts/showcase/export.js mizan-ble
node scripts/showcase/export.js mizan-ble --push
```

The first command is a dry run: it prints a temporary directory after the
marker and secret scans and the check pass (the lane runner's Python tests,
then `swift build` and `swift test` in `ios/` and `swift test` in
`ios/App`). Inspect that directory before publishing. Both commands need
macOS with Xcode 26, Node with `path.matchesGlob`, git and gitleaks, run
outside the sandbox. The push also needs an existing `igor1309/mizan-ble`
repository, an authenticated `gh` and git credentials, and a clean ai-labs
worktree; the exporter never creates repositories. After the first sync,
pinning the repo on the owner's GitHub profile is the owner's.
