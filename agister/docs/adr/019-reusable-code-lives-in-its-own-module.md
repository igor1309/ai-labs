# ADR-019: Reusable code lives in its own module

- **Status:** Proposed
- **Date:** 2026-10-03
- **Scope:** where Agister's generic Go code lives, so another Go module
  can import it
- **Decision type:** Architecture

## Context

All of Agister's Go code is under `agister/internal/`. Go refuses an
import of an `internal/` package from another module, so another
repository that wants Agister's process supervisor or its test seams can
only copy them, and the copies drift.

Some of that code knows nothing of Agister: the process supervisor
(`adapters/runtime/supervisor`), the manual clock
(`adapters/system/systemtest`), the fake program and its in-process
starter (`runtimetest/fakeproc`, `runtimetest.InProcess`), the fake shell
(`runtimetest/fakebash`) and the test-discipline check of
[ADR-017](017-tests-fake-at-seams.md) (`internal/archtest/tests_test.go`).
None of them imports another Agister package, except `InProcess`, which
names Agister's fake runtimes, and the check, which names Agister's
module path in its list of real machinery.

The repository is private, and Agister is its only Go module.

## Decision drivers

- Another module imports the code; nobody copies it.
- Agister keeps one copy, the one it imports, and its full check covers
  it.
- The extracted code takes nothing of Agister's along: no type, no path,
  no name of a runtime.
- No release step for Agister: building it from a checkout keeps working.

## Decision

The generic code moves to a new Go module, `gokit/` at the repository
root, with module path `github.com/igor1309/ai-labs/gokit`. Agister
requires it and points at the directory next to it with a `replace`
directive. Another module imports a version of it by a `gokit/v<x.y.z>`
tag, with the repository in its `GOPRIVATE`.

## Rules

### 1. What moves

| From `agister/internal/`                     | To `gokit/`                 |
|----------------------------------------------|-----------------------------|
| `adapters/runtime/supervisor`                | `supervisor`                |
| `adapters/system/systemtest` (the `Clock`)   | `clocktest`                 |
| `adapters/runtime/runtimetest/fakeproc`      | `fakeproc`                  |
| `adapters/runtime/runtimetest/fakebash`      | `fakebash`                  |
| `runtimetest.InProcess`, `Fake`, `Report`    | `supervisor/supervisortest` |
| the test-discipline check of `archtest`      | `testdiscipline`            |

Each package moves with its tests. Agister's packages import the new
paths; no copy and no forwarding alias stays behind.

### 2. `gokit` knows nothing of Agister

No `gokit` package imports Agister, and none names it, its module path or
a runtime of it. `gokit` depends on the standard library only. A test in
`gokit` checks both over its import graph.

### 3. What Agister adds stays in Agister

The in-process starter takes the fakes it runs as configuration: by
command, as given or by base name. Agister's `runtimetest` provides the
starter over its fake runtimes (`claude`, `codex`, `opencode`, `pi`, their
`fake<name>` builds) and `fakebash` as `bash`, so its tests start the same
fakes as before.

### 4. The test-discipline check is configured

`testdiscipline` exports the check over a directory of test files. Its
configuration is the real machinery, by import path and name; the
markers (`Contract test:`, `Serial:`) and the rules of ADR-017 are fixed.
It ships with the standard library's machinery as a default the caller
extends. Agister's `archtest` calls it with its own additions
(`runtimetest.Binary` and `Build`) over its module, and `gokit` calls it
over itself. `archtest`'s dependency rules stay in Agister: they are
Agister's.

### 5. One check covers both

Agister's full check and its CI also check `gokit`: format, vet, and the
tests, with `-race`. A change under `gokit/` triggers Agister's CI.

## Consequences

- Another module imports the supervisor, the manual clock, the in-process
  starter and the test-discipline check, at a tagged version.
- A change to `gokit` reaches Agister at once through `replace`; another
  module sees it only at a new tag. A change that breaks another module is
  not caught here.
- `go install` of Agister by module path does not work while the
  `replace` stands; Agister is built from a checkout, as now.
- ADR-017's rules apply to `gokit`'s own tests.

## Alternatives considered

- **Public `pkg/` inside Agister's module.** Least work, but an importer
  takes Agister's whole module and its dependencies.
- **A separate public repository.** Importable by anyone, but every change
  to the code Agister runs needs a release and a version bump before
  Agister sees it.

## Explicit non-decisions

The crash-safe run store, the agent CLI drivers and their fakes, the
logging decorators, the atomic installer and the git fake stay in
Agister until a second module needs them. Publishing `gokit` outside this
repository; a tagging or release process for it.
