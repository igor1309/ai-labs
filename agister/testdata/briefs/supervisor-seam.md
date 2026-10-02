# Runtime adapters take their process transport as a declared interface

Deferred item 3 (`docs/deferred.md`): the `claudecode`, `codex`, `pi` and
`opencode` runners call `supervisor.Run` and `supervisor.Version`
themselves; `cmd/agister/main.go` passes them only a command. ADR-001
rule 13 asks each component to declare the interfaces it requires at its
own boundary, with only the capabilities it uses, no interface shared
between components; rule 14 keeps instantiation in the composition root.

## Change

- Each of the four adapter packages declares its own interface for what
  it uses of the supervisor (running a process with a spec, sink and line
  callback, and reading a version), in that package, not shared. The
  `supervisor` package satisfies all four with one implementation.
- Each runner takes it as a field or constructor argument; `main.go`
  wires the real supervisor. Keep behaviour identical: same arguments,
  environment, timeouts, kill grace, evidence.
- Keep the existing fake-binary and conformance tests passing unchanged in
  intent; they now go through the wired supervisor.

## Tests

The point of the seam is behaviour a fake binary cannot make fail. For
each adapter, add at least one test through a spy transport: e.g. the spec
the runner hands it (command, args, dir, stdin, env, timeout, kill grace)
for a fresh and a resumed turn, and a turn reconciled from evidence the
spy returns (a timeout, a signal exit) without starting a process.

## Docs

Remove item 3 from `docs/deferred.md` once done. If an ADR note is
needed, say so in your report rather than editing an accepted ADR.

Run the full check from `agister/` (its AGENTS.md) and `node --test
pages/tests/*.test.js` from `agister/`. Report each command with its exit
code and final line, and list every file you changed.
