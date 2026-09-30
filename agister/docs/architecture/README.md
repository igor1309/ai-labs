# Agister architecture diagram

**Scope: module view.** Go packages and their imports, plus what each
package reaches outside the process. Two drawings of the same facts:

- `overview.svg`: one node per directory, listing its packages. An arrow
  means some package in the source imports some package in the target;
  its label names the importing packages when not all of them do. Start
  here.
- `modules.svg`: one node per package; the reference.

Both are rendered from their `.dot` sources, and every arrow in both is
checked against `go list`.

Drawn with the architecture-diagramming skill. Sources: `go list`, the
non-test files of each package, `internal/archtest/architecture_test.go`
(which passes) and `docs/adr/001-agister-cli-architecture.md`.

## Legend

```text
solid + standard arrow      uses: imports
dashed + hollow triangle    realization (none: Go packages do not realize one another)
solid + hollow triangle     platform: an effect outside the process (files, exec, processes, signals)
```

Third-party modules are ordinary imports and use the solid, standard arrow.

Fill color is the package's class in `internal/archtest`'s dependency rule;
the legend in the diagram lists what each class may import. Boxes are
directories. "composition root" and "client contract" are ADR-001's terms
(rules 14 and 15); `archtest` also calls `cmd/agister` the composition root.

Layout only, no meaning: the adapter packages share a row, and the legend
sits under `internal/contract`. Two sets of arrows are drawn as one
labelled arrow to a box: `cmd/agister` imports all 12 adapter packages, and
`internal/app` imports all 7 domain packages. The table below lists each
of those imports.

## Relation table

Imports, from `go list -f '{{.ImportPath}} {{.Imports}}' ./...`.
Standard-library imports are not shown.

| Package | Imports |
|---|---|
| `cmd/agister` | `examples`, `internal/cli`, `internal/contract`, `internal/app`; adapters `fsdefs`, `fsprovenance`, `fsruns`, `git`, `inputs`, `logging`, `schema`, `system`, `runtime`, `runtime/claudecode`, `runtime/codex`, `runtime/supervisor` (all 12) |
| `examples` | — |
| `internal/cli` | `internal/contract` |
| `internal/contract` | — |
| `internal/app` | `internal/contract`; domain `constraint`, `definition`, `enforce`, `policy`, `prompt`, `run`, `settings` (all 7) |
| `internal/domain/settings` | `definition`, `enforce`, `policy` |
| `internal/domain/run` | `definition`, `enforce`, `policy` |
| `internal/domain/prompt` | `run` |
| `internal/domain/constraint` | `definition` |
| `internal/domain/enforce` | `definition` |
| `internal/domain/policy` | `definition` |
| `internal/domain/definition` | `github.com/BurntSushi/toml`, `gopkg.in/yaml.v3` |
| `internal/adapters/fsdefs` | `domain/definition` |
| `internal/adapters/fsprovenance` | `domain/constraint` |
| `internal/adapters/fsruns` | `internal/app`, `internal/contract`, `domain/run` |
| `internal/adapters/git` | `internal/app` |
| `internal/adapters/inputs` | `internal/app` |
| `internal/adapters/logging` | `internal/app`, `domain/run` |
| `internal/adapters/runtime` | `internal/app` |
| `internal/adapters/runtime/claudecode` | `runtime/supervisor`, `internal/app`, `domain/run` |
| `internal/adapters/runtime/codex` | `runtime/supervisor`, `internal/app`, `domain/run` |
| `internal/adapters/runtime/supervisor` | `internal/app`, `domain/run` |
| `internal/adapters/schema` | `github.com/santhosh-tekuri/jsonschema/v6`, `golang.org/x/text` |
| `internal/adapters/system` | — |

Effects outside the process, found by scanning every package's non-test
files for `os` file calls, `filepath.EvalSymlinks`, `exec`, `syscall` and
`signal` (`io/fs` reads of the embedded `examples` files are in memory):

| Package | Effect | Evidence |
|---|---|---|
| `cmd/agister` | filesystem | log file (`os.OpenFile`, `os.MkdirAll`), `os.Stat` of `.agister` |
| `cmd/agister` | OS signals | `signal.NotifyContext` on SIGINT, SIGTERM, SIGHUP |
| `internal/app` | filesystem | `filepath.EvalSymlinks` when checking that workspaces do not overlap (`calls.go`) |
| `fsdefs` | filesystem | reads, writes, renames; `syscall.Flock` |
| `fsruns` | filesystem | reads, writes, renames; `syscall.Flock` |
| `fsprovenance` | filesystem | `os.ReadFile` |
| `inputs` | filesystem | `os.ReadFile` (the `file` input source) |
| `git` | exec `git` | `exec.CommandContext(ctx, "git", ...)` |
| `git` | filesystem | temporary checkout directories (`os.MkdirTemp`, `os.RemoveAll`) |
| `codex` | filesystem | temporary output-schema file (`os.MkdirTemp`, `os.WriteFile`) |
| `supervisor` | exec the agent's runtime command | `exec.Command(spec.Command, ...)` and `--version`; the command comes from the agent definition (e.g. `claude`, `codex`) |
| `supervisor` | OS processes | `exec` `ps`; `syscall.Kill` with SIGTERM, SIGKILL |

## Left out

- Test-only packages: `internal/archtest`, `runtime/runtimetest` and its fakes.
- Standard-library imports that are not effects outside the process (e.g. `log/slog`).
- Reading the environment (`os.Getenv` in `cmd/agister`, `os.UserHomeDir` in `internal/cli`) and the standard streams, which `cmd/agister` hands to `internal/cli`.
- `examples` embeds its files at build time (`//go:embed`); nothing at run time.

## Known limits

- Two arrow sets are collapsed (`cmd/agister` to the 12 adapters,
  `internal/app` to the 7 domain packages); the relation table itemizes
  them. Drawing all 19 made the diagram unreadable.
- The diagram is about 1930 pt wide. It is legible at 100% and scrolls
  sideways; fitted to a narrow window its labels get small. The adapter
  row sets the width.

## Regenerate

```sh
cd agister/docs/architecture
dot -Tsvg overview.dot -o overview.svg
dot -Tsvg modules.dot -o modules.svg
```
