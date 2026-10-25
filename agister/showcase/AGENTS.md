# Publishing Agister's showcase

The export contains Agister's Go packages, tests, feature files, shipped
`home/` settings and `skills/`, with gokit mounted under `gokit/`. The
owner's installer and its `install_test.go` stay private, along with
archive, research, backlog, project settings and prose docs. The root
workspace redirects the private module's sibling replacements to the
mounted dependency; keep the private `go.mod` unchanged.

From the ai-labs repository root, after committing the intended snapshot:

```sh
node scripts/showcase/export.js agister
node scripts/showcase/export.js agister --push
```

The first command is a dry run: it prints a temporary directory after the
marker scan, gitleaks and `sh scripts/check-public.sh` pass. Inspect that
directory before publishing. Both commands need Node with
`path.matchesGlob`, git, gitleaks, a Go toolchain satisfying `go.mod` and
`go.work`, and access to any uncached Go dependencies. The check runs
gokit's checks, Agister's format and size limits, build, vet and race
tests. Model end-to-end tests stay skipped, even if `AGISTER_E2E` is set
in the caller's environment.

Commit `showcase/public/` with the intended source changes. The exporter
reads HEAD, so uncommitted files are not published. The push requires a
clean ai-labs worktree, an existing `igor1309/agister` repository,
authenticated `gh` and git credentials; the exporter never creates
repositories.

The public README is the visitor's guide; the check runs its first run on
bash as written, so a change to that example must still print
`Hello, world` without warnings. The Pages site is `docs/index.html` and
the two architecture pages. Review the README and pages for private
context, home paths and assumptions a visitor cannot follow before
publishing. This is public to read, all rights reserved: do not add a
licence, rename the Go modules or publish gokit separately.

## Pages

GitHub Pages serves the public repo's `docs/` folder on its default
branch. The owner's user site sets the custom domain `igor1309.dev`, so
the site is at <https://igor1309.dev/agister/>, with the pages at
`run-architecture/` and `settings-architecture/` under it. It was turned
on once, after the first push:

```sh
gh api -X POST repos/igor1309/agister/pages \
  -f 'source[branch]=main' -f 'source[path]=/docs'
```

After a push that changes the README or pages, open the site and every
README link from a logged-out browser. Pinning the repository on the
owner's profile has no API; the owner does it on github.com.
