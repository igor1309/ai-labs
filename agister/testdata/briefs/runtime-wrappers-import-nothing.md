# Runtime wrappers and the supervisor import nothing; main composes them

The owner's layout for the runtime side (it replaces the earlier seam
briefs where they differ):

- **A CLI** (`codex`, `claude`, `pi`, `opencode`) is reached only through
  a dependency the composition root (`cmd/agister`) builds and injects.
- **A runtime wrapper** (`internal/adapters/runtime/{codex,claudecode,pi,opencode}`)
  is a separate module that imports nothing from this repository: no
  `app`, no `domain/run`, no `supervisor`, no `outcome`, no shared
  package. Standard library only. It speaks two languages, both its own:
  the CLI's (arguments, JSON events) towards the dependency it declares
  for running the CLI, and its own domain (its request, its turn result,
  its events, its identity) towards its caller.
- **The supervisor** (`internal/adapters/runtime/supervisor`) has its own
  domain language and imports nothing from this repository.
- **The composition root** builds the CLI dependency on the supervisor
  and creates each wrapper with it, then adapts the wrapper to what
  Agister's core takes (`app.TurnRunner`: `app.TurnRequest`,
  `app.EventSink`, `run.Turn`, `app.RuntimeIdentity`). These translations
  are the only code that knows both sides.

## Change

- Remove every repository import from the four wrappers and from the
  supervisor; delete `runtime/outcome`. What they used from `app`,
  `domain/run` and `outcome` becomes their own types and their own
  logic, or moves into the composition root's translation, whichever
  keeps the wrapper's behaviour in the wrapper.
- Put the translations (wrapper ↔ supervisor, wrapper ↔ app) in a package
  imported only by `cmd/agister`, so tests exercise the code that ships.
  Delete the `supervised_test.go` copies and the Codex `run` hook in
  `cmd/agister/transports.go`; no test keeps its own copy of a
  translation.
- `runtimetest` conformance and the CLI tests run each wrapper as the
  composition root composes it. `logging.Runner` stays at the app level,
  wrapping the adapted runner.
- Behaviour is unchanged: same command lines, events, classifications,
  usage and cost, sessions, refusals, timeouts and cleanup. Existing
  tests keep their intent.

## Tests

- A normal test that fails if any of the four wrappers or the supervisor
  imports a package of this module (`go list -deps` or `go/build`, from
  a test).
- Tests of the translations through the real code, not copies: the spec
  a wrapper's run becomes on the supervisor, and a wrapper's result,
  events and failures as `app` receives them.

ADR-001 rule 13 is not edited; if a note is needed, say so in your report.
Run the full check from `agister/` (its AGENTS.md) and `node --test
pages/tests/*.test.js` from `agister/`. Report each command with its exit
code and final line, and list every file you changed.
