# Publishing FolioTell's showcase

Read `../README.md` for private project context before writing for visitors.
The public README lives in `public/README.md`; never copy the private README
or other prose docs into it. Read the public README for private context,
internal tools, home paths and assumptions a stranger cannot follow.

The export is the iOS app only: its code, tests, Xcode project and Maestro
flows, under `ios/`. `ios/Config/`, `ios/scripts/` and `ios/release.toml` are
TestFlight release tooling and stay private. Android joins the allowlist when
it is more than a skeleton.

Retake the screenshots when the screens change. Use a simulator of its own
(`xcrun simctl create "FolioTell Showcase" "iPhone 17 Pro"
com.apple.CoreSimulator.SimRuntime.iOS-26-3`), boot it, build and install the
app as `ios/docs/maestro-simulator-runbook.md` says, and copy
`flows/samples/*.md` into the app container's `Documents/`. Set the status
bar with `xcrun simctl status_bar <udid> override --time 9:41
--batteryState charged --batteryLevel 100`. Run the flows in `flows/` in
order with `maestro --device <udid> test <flow>`, and after each take
`xcrun simctl io <udid> screenshot <file>.png`:

1. `1-open-folder.yaml`: browser (the FolioTell folder)
2. `2-open-alice.yaml`: reader (Alice, with the voice hint)
3. `3-play.yaml`: playing
4. `4-speed-menu.yaml`: speed
5. `xcrun simctl ui <udid> appearance dark`, then `5-open-poem.yaml`:
   ru-dark

The simulator only has novelty voices, so the voice menu is left out.
Convert each to WebP (`cwebp -q 82 -resize 600 0`) into
`public/screenshots/`, and look at every one before committing it.

Rewrite the public README when the features, setup commands or screenshots
no longer match the app, and keep its test count current. The owner
approves each rewrite before it is pushed.

From the ai-labs repository root, after committing the intended snapshot:

```sh
node scripts/showcase/export.js foliotell
node scripts/showcase/export.js foliotell --push
```

The first command is a dry run: it prints a temporary directory after marker
and secret scans and `swift build && swift test` pass in `ios/`. Inspect
that directory before publishing. Both commands need macOS with Xcode 26,
Node with `path.matchesGlob`, git and gitleaks. The push also needs an
existing `igor1309/foliotell` GitHub repository, an authenticated `gh` and
git credentials, and a clean ai-labs worktree. Create the public repo
manually before the first push; the exporter never creates repositories.

Commit `showcase/public/` along with each intended change. The exporter reads
HEAD, so edits and untracked screenshots are not published. After the first
sync, pin `igor1309/foliotell` on the owner's GitHub profile manually, and
point the landing page's source link (`landing/index.html`, now the private
ai-labs tree) at the public repo.
