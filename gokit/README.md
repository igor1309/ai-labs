# gokit

Reusable Go code, standard library only, module
`github.com/igor1309/ai-labs/gokit`.

- `supervisor`: runs a process as the leader of a process group of its
  own: a CLI's run with its timeout, termination and leftovers, `bash -c`
  commands, and the reaping of a recorded group. It starts processes
  through a `Starter`.
- `supervisor/supervisortest`: `InProcess`, a `Starter` that runs fake
  programs, picked by command, in goroutines instead of processes, and
  reports their progress.
- `fakeproc`: the process a fake program runs as, so a fake built as a
  binary (`Run`) and a fake run in process are the same code.
- `fakebash`: a fake `bash -c` for the small part of the shell that test
  commands use.
- `clocktest`: a manual clock (`Now`, `Timer`, `Advance`) that reports each
  timer started.
- `testdiscipline`: checks a module's tests: real machinery only with a
  `Contract test:` line, and `t.Parallel()` first or a `Serial:` reason.
- `testreport` (and `cmd/testreport`): turns `go test -json` into a report
  of what ran: tests and subtests per package, passed, failed and skipped,
  each skip with its reason and each failure in full.
- `tree`: a value tree whose every node keeps its origin, decoded from
  YAML or TOML bytes, and merged one tree over another. It is a module of
  its own, `github.com/igor1309/ai-labs/gokit/tree`, so that gokit keeps
  to the standard library: tree requires its parsers, `gopkg.in/yaml.v3`
  and `github.com/BurntSushi/toml`, and gokit by a replace.

## Use from another module

The repository is private. Tell Go so, then require a tagged version:

```bash
go env -w GOPRIVATE=github.com/igor1309/ai-labs
go get github.com/igor1309/ai-labs/gokit@v0.1.0
```

A version is a tag `gokit/v<x.y.z>` on the repository (here `gokit/v0.1.0`).

Inside this repository, a module points at the directory instead, as
Agister does:

```
require github.com/igor1309/ai-labs/gokit v0.0.0

replace github.com/igor1309/ai-labs/gokit => ../gokit
```

## Test

gokit's check is `gokit/scripts/test.sh`: format, vet and race tests, each
saying what it ran; the tests are reported by `testreport`. It runs the
same check in `gokit/tree`, its stages headed `== gokit/tree`. Its own test
(`scripts/test_test.go`) runs a copy of it with spies for `go` and `gofmt`,
and proves it fails when either module's tests or their report fail.

```bash
gokit/scripts/test.sh
```

Agister's check (`agister/scripts/test.sh`) ends by running it, and Agister's
CI runs that on every change under `gokit/`.
