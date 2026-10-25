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
authenticated `gh` and git credentials. The owner decides when to create
the public repository and authorizes publication; the exporter never
creates repositories. Pinning the repository on the owner's profile is
also the owner's action.

The public README is a placeholder; LAB-564 supplies the visitor guide.
The HTML pages and Pages setup follow in later issues. The owner approves
the public README and pages before publication. Review their prose for
private context, home paths and assumptions a visitor cannot follow.
This is public to read, all rights reserved: do not add a licence, rename
the Go modules or publish gokit separately.
