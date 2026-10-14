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

gokit's check is `gokit/scripts/test.sh`: format, vet and race tests.

```bash
gokit/scripts/test.sh
```

The `agister-core` CI job runs it on every change under `gokit/`.
